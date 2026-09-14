"use server";

import { asc, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import {
  crossSellRules,
  wizardOptions,
  wizardQuestions,
  wizardSteps,
  wizards,
} from "@/db/schema";
import { requireStaff } from "@/lib/auth-guard";
import { getCatalogProduct, listCatalogProducts } from "@/lib/erpnextCatalog";
import { locales } from "@/i18n/locales";

const crossSellOperators = ["==", "!="] as const;

export type CrossSellCondition = {
  questionKey: string;
  questionLabel: string;
  operator: (typeof crossSellOperators)[number];
  value: string;
};

export type CrossSellRuleRow = {
  id: string;
  ruleName: string;
  triggerConditions: CrossSellCondition[];
  addonTargetType: "PRODUCT";
  addonProductId: string;
  addonProductName: string | null;
  addonProductMeta: string | null;
  promotionalTag: string | null;
  priority: number;
  isActive: boolean;
  createdAt: string;
};

export type CrossSellProductOption = {
  id: string;
  label: string;
  description: string;
};

export type CrossSellQuestionOption = {
  id: string;
  label: string;
  stateKey: string;
  wizardTitle: string;
  values: Array<{
    value: string;
    label: string;
  }>;
};

const conditionSchema = z.object({
  questionKey: z.string().trim().min(1),
  questionLabel: z.string().trim().min(1),
  operator: z.enum(crossSellOperators),
  value: z.string().trim().min(1),
});

const saveCrossSellRuleSchema = z.object({
  id: z.string().uuid().optional(),
  ruleName: z.string().trim().min(2).max(160),
  addonProductId: z.string().trim().min(1),
  promotionalTag: z.string().trim().max(240).optional().nullable(),
  priority: z.coerce.number().int().min(-999).max(999).default(0),
  isActive: z.boolean().default(true),
  triggerConditions: z.array(conditionSchema).min(1).max(5),
});

function parseConditions(value: unknown): CrossSellCondition[] {
  const parsed = z.array(conditionSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
}

export async function getCrossSellRuleBuilderData() {
  await requireStaff();

  try {
    const [rules, activeProducts, wizardList] = await Promise.all([
      db.query.crossSellRules.findMany({
        orderBy: [desc(crossSellRules.isActive), desc(crossSellRules.priority), desc(crossSellRules.createdAt)],
      }),
      listCatalogProducts({ sort: "newest", take: 100 }).then((result) =>
        result.products.sort((left, right) => left.brand.localeCompare(right.brand) || left.model.localeCompare(right.model)),
      ),
      db.query.wizards.findMany({
        orderBy: [desc(wizards.isActive), asc(wizards.title)],
        with: {
          steps: {
            orderBy: [asc(wizardSteps.order)],
            with: {
              questions: {
                orderBy: [asc(wizardQuestions.order)],
                with: {
                  options: {
                    orderBy: [asc(wizardOptions.order)],
                  },
                },
              },
            },
          },
        },
      }),
    ]);

  const productOptions: CrossSellProductOption[] = activeProducts.map((product) => ({
    id: product.id,
    label: `${product.brand} ${product.model}`.trim(),
    description: [product.category?.name, product.erpnextItemCode].filter(Boolean).join(" · "),
  }));

  const productLookup = new Map(productOptions.map((product) => [product.id, product]));

  const questionOptions: CrossSellQuestionOption[] = wizardList.flatMap((wizard) =>
    wizard.steps.flatMap((step) =>
      step.questions.map((question) => ({
        id: question.id,
        label: question.questionText,
        stateKey: question.stateKey,
        wizardTitle: wizard.title,
        values: question.options.map((option) => ({
          value: option.value,
          label: option.label,
        })),
      })),
    ),
  );

  const rows: CrossSellRuleRow[] = rules.map((rule) => {
    const product = productLookup.get(rule.addonProductId);
    return {
      id: rule.id,
      ruleName: rule.ruleName,
      triggerConditions: parseConditions(rule.triggerConditions),
      addonTargetType: "PRODUCT",
      addonProductId: rule.addonProductId,
      addonProductName: product?.label || null,
      addonProductMeta: product?.description || null,
      promotionalTag: rule.promotionalTag,
      priority: rule.priority,
      isActive: rule.isActive,
      createdAt: rule.createdAt.toISOString(),
    };
  });

    return {
      rules: rows,
      products: productOptions,
      questions: questionOptions,
    };
  } catch (error) {
    console.error("Failed to load cross-sell rule builder data:", error);
    return { rules: [], products: [], questions: [] };
  }
}

function revalidateCrossSellSurfaces() {
  for (const locale of locales) {
    revalidatePath(`/${locale}/admin/wizards/cross-sells`);
    revalidatePath(`/${locale}/wizard/summary`);
  }
}

export async function saveCrossSellRule(input: z.input<typeof saveCrossSellRuleSchema>) {
  await requireStaff();
  try {
    const parsed = saveCrossSellRuleSchema.parse(input);

    const activeProduct = await getCatalogProduct(parsed.addonProductId);

    if (!activeProduct || !activeProduct.isActive || !activeProduct.isAvailable) {
      return { success: false, error: "Selected add-on product is not active or available." };
    }

    if (parsed.id) {
      const [updated] = await db
        .update(crossSellRules)
        .set({
          ruleName: parsed.ruleName,
          addonTargetType: "PRODUCT",
          addonProductId: parsed.addonProductId,
          promotionalTag: parsed.promotionalTag || null,
          priority: parsed.priority,
          isActive: parsed.isActive,
          triggerConditions: parsed.triggerConditions,
        })
        .where(eq(crossSellRules.id, parsed.id))
        .returning({ id: crossSellRules.id });
      if (!updated) return { success: false, error: "The cross-sell rule no longer exists. Refresh the page and try again." };
    } else {
      const [created] = await db.insert(crossSellRules).values({
        ruleName: parsed.ruleName,
        addonTargetType: "PRODUCT",
        addonProductId: parsed.addonProductId,
        promotionalTag: parsed.promotionalTag || null,
        priority: parsed.priority,
        isActive: parsed.isActive,
        triggerConditions: parsed.triggerConditions,
      }).returning({ id: crossSellRules.id });
      if (!created) return { success: false, error: "The cross-sell rule could not be created." };
    }

    revalidateCrossSellSurfaces();
    return { success: true };
  } catch (error) {
    console.error("Failed to save cross-sell rule:", error);
    return {
      success: false,
      error: error instanceof z.ZodError ? "Please check the rule fields." : "Failed to save cross-sell rule.",
    };
  }
}

export async function deleteCrossSellRule(ruleId: string) {
  await requireStaff();
  try {
    const parsedId = z.string().uuid().parse(ruleId);
    const [deleted] = await db.delete(crossSellRules).where(eq(crossSellRules.id, parsedId)).returning({ id: crossSellRules.id });
    if (!deleted) return { success: false, error: "The cross-sell rule no longer exists. Refresh the page and try again." };
    revalidateCrossSellSurfaces();
    return { success: true };
  } catch (error) {
    console.error("Failed to delete cross-sell rule:", error);
    return { success: false, error: "Failed to delete cross-sell rule." };
  }
}

export async function setCrossSellRuleActive(ruleId: string, isActive: boolean) {
  await requireStaff();
  try {
    const parsedId = z.string().uuid().parse(ruleId);
    if (typeof isActive !== "boolean") return { success: false, error: "Rule status is invalid." };
    const [updated] = await db
      .update(crossSellRules)
      .set({ isActive })
      .where(eq(crossSellRules.id, parsedId))
      .returning({ id: crossSellRules.id });
    if (!updated) return { success: false, error: "The cross-sell rule no longer exists. Refresh the page and try again." };
    revalidateCrossSellSurfaces();
    return { success: true };
  } catch (error) {
    console.error("Failed to update cross-sell rule status:", error);
    return { success: false, error: "Failed to update cross-sell rule status." };
  }
}
