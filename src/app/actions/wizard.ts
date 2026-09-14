"use server";

import { db } from "@/db";
import { wizards, wizardSteps, wizardQuestions, wizardOptions, wizardRules } from "@/db/schema";
import { eq, desc, asc, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth-guard";
import type { LocalizedContent } from "@/lib/localization/content";
import { getLocalizedValue } from "@/lib/localization/content";
import { locales, type Locale } from "@/i18n/locales";
import { parseWizardRecommendationConfig } from "@/lib/wizardRecommendationConfig";
import type {
  WizardRecommendationRule,
  WizardRuleAction,
  WizardRuleCondition,
  WizardScoringImpact,
} from "@/lib/wizardRules";

export type WizardWithRelations = {
  id: string;
  title: string;
  description: string | null;
  slug: string;
  isActive: boolean;
  recommendationConfig: unknown;
  translations?: LocalizedContent<{ title: string; description: string | null }>;
  createdAt: Date;
  updatedAt: Date;
  steps: {
    id: string;
    wizardId: string;
    order: number;
    title: string;
    description: string | null;
    translations?: LocalizedContent<{ title: string; description: string | null }>;
    questions: {
      id: string;
      stepId: string;
      order: number;
      type: string;
      questionText: string;
      helperText: string | null;
      stateKey: string;
      tooltipText: string | null;
      tooltipImageUrl: string | null;
      translations?: LocalizedContent<{
        questionText: string;
        helperText: string | null;
        tooltipText: string | null;
      }>;
      options: {
        id: string;
        questionId: string;
        order: number;
        label: string;
        description: string | null;
        icon: string | null;
        value: string;
        isRecommended: boolean;
        tooltipText: string | null;
        tooltipImageUrl: string | null;
        scoringImpacts: WizardScoringImpact[];
        translations?: LocalizedContent<{
          label: string;
          description: string | null;
          tooltipText: string | null;
        }>;
      }[];
    }[];
  }[];
  rules: (WizardRecommendationRule & {
    translations?: LocalizedContent<{ ruleName: string }>;
  })[];
};

export async function getWizards() {
  try {
    const wizardsList = await db.query.wizards.findMany({
      orderBy: [desc(wizards.createdAt)],
    });
    return wizardsList;
  } catch (error) {
    console.error("Error fetching wizards:", error);
    return [];
  }
}

export async function getWizardsForExchange(): Promise<WizardWithRelations[]> {
  try {
    const wizardsList = await db.query.wizards.findMany({
      orderBy: [desc(wizards.updatedAt)],
      with: {
        rules: {
          orderBy: [asc(wizardRules.createdAt)],
        },
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
    });
    return wizardsList as unknown as WizardWithRelations[];
  } catch (error) {
    console.error("Error fetching wizards for exchange:", error);
    return [];
  }
}

export async function getWizardById(id: string): Promise<WizardWithRelations | null> {
  try {
    if (!id || id === "new") return null;
    
    const wizard = await db.query.wizards.findFirst({
      where: eq(wizards.id, id),
      with: {
        rules: {
          orderBy: [asc(wizardRules.createdAt)],
        },
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
    });
    return (wizard as unknown as WizardWithRelations) || null;
  } catch (error) {
    console.error(`Error fetching wizard ${id}:`, error);
    return null;
  }
}

function localizeWizard(wizard: WizardWithRelations, locale: Locale, fallbackLocale: Locale): WizardWithRelations {
  const rawRecommendationConfig = wizard.recommendationConfig;
  const recommendationRecord = rawRecommendationConfig !== null && typeof rawRecommendationConfig === "object"
    ? rawRecommendationConfig as { localeConfigs?: Record<string, unknown> }
    : null;
  const localePreset = recommendationRecord?.localeConfigs?.[locale];

  return {
    ...wizard,
    recommendationConfig: localePreset ? parseWizardRecommendationConfig(localePreset) : rawRecommendationConfig,
    title: getLocalizedValue(wizard.translations, locale, "title", wizard.title, fallbackLocale),
    description: getLocalizedValue(wizard.translations, locale, "description", wizard.description, fallbackLocale),
    rules: wizard.rules.map((rule) => ({
      ...rule,
      ruleName: getLocalizedValue(rule.translations, locale, "ruleName", rule.ruleName, fallbackLocale),
    })),
    steps: wizard.steps.map((step) => ({
      ...step,
      title: getLocalizedValue(step.translations, locale, "title", step.title, fallbackLocale),
      description: getLocalizedValue(step.translations, locale, "description", step.description, fallbackLocale),
      questions: step.questions.map((question) => ({
        ...question,
        questionText: getLocalizedValue(question.translations, locale, "questionText", question.questionText, fallbackLocale),
        helperText: getLocalizedValue(question.translations, locale, "helperText", question.helperText, fallbackLocale),
        tooltipText: getLocalizedValue(question.translations, locale, "tooltipText", question.tooltipText, fallbackLocale),
        options: question.options.map((option) => ({
          ...option,
          label: getLocalizedValue(option.translations, locale, "label", option.label, fallbackLocale),
          description: getLocalizedValue(option.translations, locale, "description", option.description, fallbackLocale),
          tooltipText: getLocalizedValue(option.translations, locale, "tooltipText", option.tooltipText, fallbackLocale),
        })),
      })),
    })),
  };
}

export async function getActiveWizardForSummary(locale?: Locale) {
  try {
    const wizard = await db.query.wizards.findFirst({
      where: eq(wizards.isActive, true),
      orderBy: [desc(wizards.updatedAt)],
      with: {
        rules: {
          where: eq(wizardRules.isActive, true),
          orderBy: [asc(wizardRules.createdAt)],
        },
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
    });
    if (!wizard) return null;
    const typedWizard = wizard as unknown as WizardWithRelations;
    if (!locale) return typedWizard;
    const { getLocalizationConfig } = await import("@/app/actions/systemSettings");
    const { defaultLocale: fallbackLocale } = await getLocalizationConfig();
    return localizeWizard(typedWizard, locale, fallbackLocale);
  } catch (error) {
    console.error("Error fetching active wizard for summary:", error);
    return null;
  }
}

export async function upsertWizard(data: Partial<WizardWithRelations> & {
  recommendationConfig?: unknown;
  rules?: WizardWithRelations["rules"];
}) {
  await requireStaff();
  try {
    if (!data || typeof data !== "object") return { success: false, error: "Wizard data is required." };
    const { id, title, description, slug, isActive, steps, recommendationConfig, rules } = data;
    
    // Using a transaction to ensure complete data integrity
    const result = await db.transaction(async (tx) => {
      // 1. Create or update the root Wizard
      let wizardId = id;
      
      if (!wizardId || wizardId === "new") {
        const [newWizard] = await tx.insert(wizards)
          .values({
            title: title || "New Wizard",
            description: description || null,
            slug: slug || `wizard-${Date.now()}`,
            isActive: isActive ?? false,
            recommendationConfig: recommendationConfig ?? null,
            translations: data.translations ?? {},
          })
          .returning();
        if (!newWizard) throw new Error("Wizard could not be created.");
        wizardId = newWizard.id;
      } else {
        const [updatedWizard] = await tx.update(wizards)
          .set({
            title,
            description: description !== undefined ? description : undefined,
            slug,
            isActive,
            recommendationConfig: recommendationConfig !== undefined ? recommendationConfig : undefined,
            translations: data.translations ?? undefined,
          })
          .where(eq(wizards.id, wizardId))
          .returning({ id: wizards.id });
        if (!updatedWizard) throw new Error("Wizard no longer exists. Refresh the page and try again.");
        
        // 2. Delete existing nested data to recreate (simpler than complex diffing for now)
        // Since we have Cascade deletes on the schema, deleting steps deletes questions and options.
        await tx.delete(wizardSteps).where(eq(wizardSteps.wizardId, wizardId));
        await tx.delete(wizardRules).where(eq(wizardRules.wizardId, wizardId));
      }

      // 3. Recreate the nested structure
      if (steps && steps.length > 0) {
        for (const [stepIndex, step] of steps.entries()) {
          const [newStep] = await tx.insert(wizardSteps)
            .values({
              wizardId,
              order: stepIndex,
              title: step.title,
              description: step.description || null,
              translations: step.translations ?? {},
            })
            .returning();
          
          if (step.questions && step.questions.length > 0) {
            for (const [qIndex, question] of step.questions.entries()) {
              const [newQuestion] = await tx.insert(wizardQuestions)
                .values({
                  stepId: newStep.id,
                  order: qIndex,
                  type: question.type || "RADIO_CARD",
                  questionText: question.questionText,
                  helperText: question.helperText || null,
                  stateKey: question.stateKey,
                  tooltipText: question.tooltipText || null,
                  tooltipImageUrl: question.tooltipImageUrl || null,
                  translations: question.translations ?? {},
                })
                .returning();
              
              if (question.options && question.options.length > 0) {
                for (const [oIndex, option] of question.options.entries()) {
                  await tx.insert(wizardOptions)
                    .values({
                      questionId: newQuestion.id,
                      order: oIndex,
                      label: option.label,
                      description: option.description || null,
                      icon: option.icon || null,
                      value: option.value,
                      isRecommended: option.isRecommended ?? false,
                      tooltipText: option.tooltipText || null,
                      tooltipImageUrl: option.tooltipImageUrl || null,
                      scoringImpacts: normalizeScoringImpacts(option.scoringImpacts),
                      translations: option.translations ?? {},
                    });
                }
              }
            }
          }
        }
      }

      if (rules?.length) {
        await tx.insert(wizardRules).values(
          rules.map((rule, index) => ({
            wizardId,
            ruleName: rule.ruleName.trim() || `Recommendation rule ${index + 1}`,
            conditions: normalizeRuleConditions(rule.conditions),
            actions: normalizeRuleActions(rule.actions),
            isActive: rule.isActive ?? true,
            translations: rule.translations ?? {},
          })),
        );
      }
      
      return wizardId;
    });

    for (const locale of locales) {
      revalidatePath(`/${locale}/admin/wizards`);
      revalidatePath(`/${locale}/admin/wizards/${result}`);
      revalidatePath(`/${locale}/wizard`);
    }
    return { success: true, id: result };
  } catch (error) {
    console.error("Error upserting wizard:", error);
    return { success: false, error: "Failed to save wizard." };
  }
}

export async function deleteWizard(id: string) {
  await requireStaff();
  try {
    if (!id.trim()) return { success: false, error: "Wizard ID is required." };
    const [deleted] = await db.delete(wizards).where(eq(wizards.id, id)).returning({ id: wizards.id });
    if (!deleted) return { success: false, error: "Wizard no longer exists. Refresh the page and try again." };
    for (const locale of locales) {
      revalidatePath(`/${locale}/admin/wizards`);
      revalidatePath(`/${locale}/wizard`);
      revalidatePath(`/${locale}/wizard/summary`);
    }
    return { success: true };
  } catch (error) {
    console.error(`Error deleting wizard ${id}:`, error);
    return { success: false, error: "Failed to delete wizard." };
  }
}

export async function deleteWizards(ids: string[]) {
  await requireStaff();
  try {
    if (!Array.isArray(ids)) return { success: false, error: "No wizards selected." };
    const cleanIds = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
    if (cleanIds.length === 0) {
      return { success: false, error: "No wizards selected." };
    }
    if (cleanIds.length > 100) return { success: false, error: "Select no more than 100 wizards at a time." };

    const deleted = await db.delete(wizards).where(inArray(wizards.id, cleanIds)).returning({ id: wizards.id });
    if (deleted.length === 0) return { success: false, error: "The selected wizards no longer exist." };
    for (const locale of locales) {
      revalidatePath(`/${locale}/admin/wizards`);
      revalidatePath(`/${locale}/wizard`);
      revalidatePath(`/${locale}/wizard/summary`);
    }
    return {
      success: true,
      count: deleted.length,
      message: `${deleted.length} wizard${deleted.length === 1 ? "" : "s"} deleted.`,
    };
  } catch (error) {
    console.error("Error deleting wizards:", error);
    return { success: false, error: "Failed to delete wizards." };
  }
}

export async function importWizards(rows: unknown[]) {
  await requireStaff();
  try {
    if (!Array.isArray(rows) || rows.length === 0) {
      return { success: false, error: "Import file has no wizard rows." };
    }
    if (rows.length > 100) return { success: false, error: "Import no more than 100 wizards at a time." };

    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const [index, row] of rows.entries()) {
      try {
        const data = normalizeWizardImportRow(row);
        const exists = data.id
          ? await db.query.wizards.findFirst({ where: eq(wizards.id, data.id) })
          : null;
        const result = await upsertWizard(data);
        if (!result.success) throw new Error(result.error || "Failed to save wizard.");
        if (exists) updated += 1;
        else created += 1;
      } catch (error) {
        errors.push(
          `Row ${index + 2}: ${
            error instanceof Error ? error.message : "Invalid wizard row"
          }`
        );
      }
    }

    revalidatePath("/admin/wizards");
    revalidatePath("/wizard");
    revalidatePath("/wizard/summary");

    return {
      success: errors.length === 0,
      message: `Import finished: ${created} created, ${updated} updated${
        errors.length ? `, ${errors.length} failed.` : "."
      }`,
      errors,
    };
  } catch (error) {
    console.error("Error importing wizards:", error);
    return { success: false, error: "Failed to import wizards." };
  }
}

function normalizeWizardImportRow(row: unknown): Partial<WizardWithRelations> & {
  recommendationConfig?: unknown;
} {
  if (!row || typeof row !== "object") {
    throw new Error("Row is empty.");
  }
  const data = row as Record<string, unknown>;
  const title = String(data.title ?? "").trim();
  const slug = String(data.slug ?? "").trim();
  if (!title) throw new Error("Title is required.");
  if (!slug) throw new Error("Slug is required.");

  return {
    id: emptyStringToUndefined(data.id),
    title,
    slug,
    description: emptyStringToNull(data.description),
    translations: parseImportJson(data.translations, {}),
    isActive: parseImportBool(data.isActive, false),
    recommendationConfig: parseImportJson(data.recommendationConfig, undefined),
    steps: parseImportJson(data.steps, []),
    rules: parseImportJson(data.rules, []),
  } as Partial<WizardWithRelations>;
}

function emptyStringToUndefined(value: unknown): string | undefined {
  const str = String(value ?? "").trim();
  return str || undefined;
}

function emptyStringToNull(value: unknown): string | null {
  const str = String(value ?? "").trim();
  return str || null;
}

function parseImportBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  const str = String(value ?? "").trim().toLowerCase();
  if (!str) return fallback;
  return ["true", "1", "yes", "y", "active"].includes(str);
}

function parseImportJson(value: unknown, fallback: unknown) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

function normalizeScoringImpacts(value: unknown): WizardScoringImpact[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((impact) => {
    if (!impact || typeof impact !== "object") return [];
    const record = impact as Record<string, unknown>;
    const targetType = record.targetType === "CATEGORY" ? "CATEGORY" : "BRAND";
    const target = String(record.target ?? "").trim();
    const weight = Number(record.weight);
    if (!target || !Number.isFinite(weight)) return [];
    return [{ targetType, target, weight }];
  });
}

function normalizeRuleConditions(value: unknown): WizardRuleCondition[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((condition) => {
    if (!condition || typeof condition !== "object") return [];
    const record = condition as Record<string, unknown>;
    const stateKey = String(record.stateKey ?? "").trim();
    const operator = ["==", "!=", "<=", ">=", "<", ">"].includes(String(record.operator))
      ? record.operator as WizardRuleCondition["operator"]
      : "==";
    if (!stateKey) return [];
    return [{
      stateKey,
      operator,
      value: record.value as string | number | boolean,
    }];
  });
}

function normalizeRuleActions(value: unknown): WizardRuleAction[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((action) => {
    if (!action || typeof action !== "object") return [];
    const record = action as Record<string, unknown>;
    const actionType = ["BOOST_BRAND", "BOOST_CATEGORY", "REQUIRE_PRODUCT"].includes(String(record.actionType))
      ? record.actionType as WizardRuleAction["actionType"]
      : "BOOST_BRAND";
    const target = String(record.target ?? "").trim();
    const weight = Number(record.weight);
    if (!target) return [];
    return [{
      actionType,
      target,
      weight: Number.isFinite(weight) ? weight : 0,
    }];
  });
}
