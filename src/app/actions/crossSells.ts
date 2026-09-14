"use server";

import { db } from "@/db";
import { crossSellRules } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { matchesWizardCondition, type WizardRuleCondition } from "@/lib/wizardRules";
import { getCatalogProductsByIds, listCatalogBundles } from "@/lib/erpnextCatalog";

type WizardAnswerValue = string | number | boolean;
type WizardAnswers = Record<string, WizardAnswerValue>;

export interface AddonItem {
  productId: string;
  name: string;
  price: number;
  promotionalTag: string | null;
  imageUrl: string | null;
}

export async function evaluateCrossSells(
  wizardAnswers: WizardAnswers,
  mainBundleId: string,
): Promise<AddonItem[]> {
  void mainBundleId;

  try {
    // 1. Fetch active cross sell rules ordered by priority descending
    const rules = await db.query.crossSellRules.findMany({
      where: eq(crossSellRules.isActive, true),
      orderBy: [desc(crossSellRules.priority)],
    });

    const matchedAddonIds: Array<{ id: string; type: string; promoTag: string | null }> = [];

    // 2. Evaluate rules against wizard answers
    for (const rule of rules) {
      const conditions = normalizeRuleConditions(rule.triggerConditions);
      const isMatch = conditions.every((cond) =>
        matchesWizardCondition(cond, wizardAnswers)
      );

      if (isMatch) {
        matchedAddonIds.push({
          id: rule.addonProductId,
          type: rule.addonTargetType, // "PRODUCT" | "BUNDLE"
          promoTag: rule.promotionalTag || null,
        });

        // Limit rule matching early to optimize database queries, but fetch details first
        if (matchedAddonIds.length >= 10) break;
      }
    }

    if (matchedAddonIds.length === 0) {
      return [];
    }

    // 3. Fetch underlying products & bundles details
    const productIds = matchedAddonIds
      .filter((item) => item.type === "PRODUCT")
      .map((item) => item.id);
    const bundleIds = matchedAddonIds
      .filter((item) => item.type === "BUNDLE")
      .map((item) => item.id);

    const [fetchedProducts, allBundles] = await Promise.all([
      getCatalogProductsByIds(productIds),
      listCatalogBundles(),
    ]);
    const fetchedBundles = allBundles.filter((bundle) => bundleIds.includes(bundle.id));

    // Create lookup maps
    const productMap = new Map(fetchedProducts.map((p) => [p.id, p]));
    const bundleMap = new Map(fetchedBundles.map((b) => [b.id, b]));

    const addons: AddonItem[] = [];

    // 4. Map the resolved addon products/bundles in priority order of matching rules
    for (const matched of matchedAddonIds) {
      if (matched.type === "PRODUCT") {
        const prod = productMap.get(matched.id);
        if (prod) {
          addons.push({
            productId: prod.id,
            name: `${prod.brand} ${prod.model}`.trim(),
            price: prod.price,
            promotionalTag: matched.promoTag,
            imageUrl: prod.imageUrl,
          });
        }
      } else if (matched.type === "BUNDLE") {
        const bundle = bundleMap.get(matched.id);
        if (bundle) {
          addons.push({
            productId: bundle.id,
            name: bundle.name,
            price: bundle.price,
            promotionalTag: matched.promoTag,
            imageUrl: bundle.imageUrl || null,
          });
        }
      }

      // Limit the output to a maximum of 3 highly relevant add-ons
      if (addons.length >= 3) {
        break;
      }
    }

    return addons;
  } catch (error) {
    console.error("Error evaluating cross sells:", error);
    return [];
  }
}

function normalizeRuleConditions(value: unknown): WizardRuleCondition[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item): WizardRuleCondition | null => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const record = item as Record<string, unknown>;
      const stateKey = typeof record.stateKey === "string" ? record.stateKey.trim() : "";
      const operator = record.operator;
      const conditionValue = record.value;
      const validOperator = operator === "==" ||
        operator === "!=" ||
        operator === "<=" ||
        operator === ">=" ||
        operator === "<" ||
        operator === ">";
      const validValue = typeof conditionValue === "string" ||
        typeof conditionValue === "number" ||
        typeof conditionValue === "boolean";

      if (!stateKey || !validOperator || !validValue) return null;
      return {
        stateKey,
        operator,
        value: conditionValue,
      };
    })
    .filter((condition): condition is WizardRuleCondition => Boolean(condition));
}
