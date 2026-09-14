/**
 * Wizard summary BOM recommendation — picks products and quantities from
 * calculated kWp / kWh, admin product flags, and wizard recommendation config.
 */

import type { WizardRecommendationConfig } from "./wizardRecommendationConfig";
import {
  getMatchedWizardActions,
  getSelectedScoringImpacts,
  type WizardOptionScoringMap,
  type WizardRecommendationRule,
} from "./wizardRules";

export interface RecommendProduct {
  id: string;
  name: string;
  brand?: string;
  model?: string;
  erpnextItemCode?: string;
  price: number;
  imageUrl: string;
  description: string | null;
  categoryId: string;
  metadata: Record<string, unknown>;
  useInRecommendation: boolean;
  recommendTier: string | null;
  recommendPriority: number;
}

export interface RecommendCategory {
  id: string;
  name: string;
  slug: string;
  displayOrder: number;
  isRequired: boolean;
  products: RecommendProduct[];
}

export interface RecommendedLineItem {
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  product: RecommendProduct;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  detailSummary: string;
}

export interface RecommendationInput {
  recommendedSolarKwp: number;
  recommendedBatteryKwh: number;
  roofMaterial?: string;
  systemGoal?: string;
  budgetTier?: string;
}

export type ProductOverrides = Record<string, string>;

export interface RecommendationScoringContext {
  answers: Record<string, unknown>;
  optionScoringMap: WizardOptionScoringMap;
  rules: WizardRecommendationRule[];
}

const ROOF_CATEGORY = "Roof Type";
const PANEL_CATEGORY = "Solar Panels Selection";
const BATTERY_CATEGORY = "Energy Storage / Battery";

const INVERTER_CATEGORY = "Inverter Selection";

const CATEGORY_SLUG_MAP: Record<string, string> = {
  [ROOF_CATEGORY]: "roof-type",
  [PANEL_CATEGORY]: "solar-panels",
  [BATTERY_CATEGORY]: "battery-storage",
  [INVERTER_CATEGORY]: "inverters",
};

function parseMetadata(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") return {};
  return raw as Record<string, unknown>;
}

export function parsePowerW(metadata: Record<string, unknown>): number {
  const raw =
    metadata.powerRating ??
    metadata.power ??
    metadata.panelPower ??
    metadata.wattage;
  if (typeof raw === "number" && raw > 0) return raw;
  const str = String(raw ?? "");
  const match = str.match(/(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : 550;
}

export function parseBatteryKwh(metadata: Record<string, unknown>): number {
  const raw = metadata.usableCapacity ?? metadata.capacity;
  if (typeof raw === "number" && raw > 0) return raw;
  const match = String(raw ?? "").match(/(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : 5;
}

function eligibleProducts(products: RecommendProduct[]): RecommendProduct[] {
  return products.filter((p) => p.useInRecommendation !== false);
}

function pickByTier(
  products: RecommendProduct[],
  tier: string | undefined,
  category?: RecommendCategory,
  scoring?: RecommendationScoringContext,
): RecommendProduct {
  const pool = eligibleProducts(products);
  if (pool.length === 0) throw new Error("No recommendation-eligible products");

  const tierNorm = tier ?? "standard";
  const tierMatches = pool.filter(
    (p) => (p.recommendTier ?? "standard") === tierNorm
  );
  const candidates = tierMatches.length > 0 ? tierMatches : pool;

  const sorted = [...candidates].sort((a, b) => {
    if (category && scoring) {
      const scoreDifference = getProductRuleScore(b, category, scoring) - getProductRuleScore(a, category, scoring);
      if (scoreDifference !== 0) return scoreDifference;
    }
    if (b.recommendPriority !== a.recommendPriority) {
      return b.recommendPriority - a.recommendPriority;
    }
    return a.price - b.price;
  });
  return sorted[0];
}

function matchRoofProduct(
  products: RecommendProduct[],
  roofMaterial?: string,
  category?: RecommendCategory,
  scoring?: RecommendationScoringContext,
): RecommendProduct {
  const pool = eligibleProducts(products);
  if (pool.length === 0) throw new Error("No roof products");

  const key = String(roofMaterial ?? "cpac").toLowerCase();
  let target = "cpac";
  if (key.includes("metal")) target = "metal";
  else if (key.includes("flat")) target = "flat";

  const matches = pool.filter((p) => {
    const meta = parseMetadata(p.metadata);
    const matchStr = String(meta.roofTypeMatch ?? p.name).toLowerCase();
    if (target === "metal") return /metal|sheet/i.test(matchStr);
    if (target === "flat") return /flat|slab|ballast/i.test(matchStr);
    return /cpac|concrete|tile/i.test(matchStr);
  });
  return pickByTier(matches.length ? matches : pool, undefined, category, scoring);
}

function normalizeTarget(value: string | undefined) {
  return String(value || "").trim().toLowerCase();
}

function getProductRuleScore(
  product: RecommendProduct,
  category: RecommendCategory,
  scoring: RecommendationScoringContext,
) {
  const impacts = getSelectedScoringImpacts(scoring.optionScoringMap, scoring.answers);
  const actions = getMatchedWizardActions(scoring.rules, scoring.answers);
  const productBrand = normalizeTarget(product.brand);
  const categoryTargets = new Set([
    normalizeTarget(category.id),
    normalizeTarget(category.slug),
    normalizeTarget(category.name),
  ]);
  let score = 0;

  for (const impact of impacts) {
    const target = normalizeTarget(impact.target);
    if (impact.targetType === "BRAND" && target === productBrand) score += impact.weight;
    if (impact.targetType === "CATEGORY" && categoryTargets.has(target)) score += impact.weight;
  }

  const requiredProductIds = actions
    .filter((action) => action.actionType === "REQUIRE_PRODUCT")
    .map((action) => action.target);
  if (requiredProductIds.includes(product.id)) score += 1_000_000;
  if (requiredProductIds.some((id) => category.products.some((candidate) => candidate.id === id))) {
    if (!requiredProductIds.includes(product.id)) score -= 1_000_000;
  }

  for (const action of actions) {
    const target = normalizeTarget(action.target);
    if (action.actionType === "BOOST_BRAND" && target === productBrand) score += action.weight;
    if (action.actionType === "BOOST_CATEGORY" && categoryTargets.has(target)) score += action.weight;
  }

  return score;
}

function formatDetailSummary(
  categoryName: string,
  product: RecommendProduct,
  quantity: number
): string {
  const meta = parseMetadata(product.metadata);
  if (categoryName === PANEL_CATEGORY) {
    const power = parsePowerW(meta);
    const eff = meta.efficiency ?? meta.panelBrand;
    return `${power}W · ${eff} · ×${quantity} แผง`;
  }
  if (categoryName === BATTERY_CATEGORY) {
    const cap = parseBatteryKwh(meta);
    return `${cap} kWh/ชุด · ×${quantity} ชุด`;
  }
  if (categoryName === ROOF_CATEGORY) {
    return String(meta.roofTypeMatch ?? meta.material ?? product.description?.slice(0, 40) ?? "");
  }
  if (categoryName === INVERTER_CATEGORY) {
    const cap = meta.capacity ?? meta.powerRating ?? meta.phase ?? "";
    return `${cap} · ×${quantity} เครื่อง`;
  }
  const first = Object.entries(meta).slice(0, 2).map(([, v]) => String(v)).join(" · ");
  return first || product.description?.slice(0, 50) || "";
}

function findCategory(
  categories: RecommendCategory[],
  name: string
): RecommendCategory | undefined {
  return categories.find((c) => c.name === name);
}

function isCategoryEnabled(
  category: RecommendCategory,
  enabledSlugs: string[]
): boolean {
  if (enabledSlugs.length === 0) return true;
  if (category.slug === 'inverters') {
    return enabledSlugs.includes('inverters') || enabledSlugs.includes('solar-panels');
  }
  return enabledSlugs.includes(category.slug);
}

function resolveProduct(
  category: RecommendCategory,
  overrides: ProductOverrides,
  configProductIds: Record<string, string>,
  picker: (products: RecommendProduct[]) => RecommendProduct
): RecommendProduct {
  const overrideId = overrides[category.id] ?? configProductIds[category.slug];
  if (overrideId) {
    const found = category.products.find((p) => p.id === overrideId);
    if (found && found.useInRecommendation !== false) return found;
  }
  return picker(category.products);
}

export function buildRecommendedBOM(
  categories: RecommendCategory[],
  input: RecommendationInput,
  overrides: ProductOverrides = {},
  config?: Pick<
    WizardRecommendationConfig,
    "enabledCategorySlugs" | "recommendedProductIdsByCategorySlug"
  >,
  scoring?: RecommendationScoringContext,
): RecommendedLineItem[] {
  const enabledSlugs = config?.enabledCategorySlugs ?? [];
  const configProductIds = config?.recommendedProductIdsByCategorySlug ?? {};
  const items: RecommendedLineItem[] = [];
  const tier = input.budgetTier ?? "standard";
  const needsBattery =
    input.recommendedBatteryKwh > 0 && input.systemGoal !== "roi_max";

  const roofCat = findCategory(categories, ROOF_CATEGORY);
  if (
    roofCat?.products.length &&
    isCategoryEnabled(roofCat, enabledSlugs)
  ) {
    try {
      const product = resolveProduct(roofCat, overrides, configProductIds, (prods) =>
        matchRoofProduct(prods, input.roofMaterial, roofCat, scoring)
      );
      items.push({
        categoryId: roofCat.id,
        categoryName: roofCat.name,
        categorySlug: roofCat.slug,
        product,
        quantity: 1,
        unitPrice: product.price,
        lineTotal: product.price,
        detailSummary: formatDetailSummary(roofCat.name, product, 1),
      });
    } catch {
      /* skip if no eligible products */
    }
  }

  const panelCat = findCategory(categories, PANEL_CATEGORY);
  if (
    panelCat?.products.length &&
    input.recommendedSolarKwp > 0 &&
    isCategoryEnabled(panelCat, enabledSlugs)
  ) {
    try {
      const product = resolveProduct(panelCat, overrides, configProductIds, (prods) =>
        pickByTier(prods, tier, panelCat, scoring)
      );
      const panelW = parsePowerW(parseMetadata(product.metadata));
      const quantity = Math.max(
        1,
        Math.ceil((input.recommendedSolarKwp * 1000) / panelW)
      );
      items.push({
        categoryId: panelCat.id,
        categoryName: panelCat.name,
        categorySlug: panelCat.slug,
        product,
        quantity,
        unitPrice: product.price,
        lineTotal: product.price * quantity,
        detailSummary: formatDetailSummary(panelCat.name, product, quantity),
      });
    } catch {
      /* skip */
    }
  }

  // Recommendation support for Inverter Selection
  const inverterCat = findCategory(categories, INVERTER_CATEGORY);
  if (
    inverterCat?.products.length &&
    isCategoryEnabled(inverterCat, enabledSlugs)
  ) {
    try {
      const product = resolveProduct(inverterCat, overrides, configProductIds, (prods) =>
        pickByTier(prods, tier, inverterCat, scoring)
      );
      items.push({
        categoryId: inverterCat.id,
        categoryName: inverterCat.name,
        categorySlug: inverterCat.slug,
        product,
        quantity: 1,
        unitPrice: product.price,
        lineTotal: product.price,
        detailSummary: formatDetailSummary(inverterCat.name, product, 1),
      });
    } catch {
      /* skip */
    }
  }

  const batteryCat = findCategory(categories, BATTERY_CATEGORY);
  if (
    needsBattery &&
    batteryCat?.products.length &&
    isCategoryEnabled(batteryCat, enabledSlugs)
  ) {
    try {
      const product = resolveProduct(batteryCat, overrides, configProductIds, (prods) =>
        pickByTier(prods, tier, batteryCat, scoring)
      );
      const unitKwh = parseBatteryKwh(parseMetadata(product.metadata));
      const quantity = Math.max(
        1,
        Math.ceil(input.recommendedBatteryKwh / unitKwh)
      );
      items.push({
        categoryId: batteryCat.id,
        categoryName: batteryCat.name,
        categorySlug: batteryCat.slug,
        product,
        quantity,
        unitPrice: product.price,
        lineTotal: product.price * quantity,
        detailSummary: formatDetailSummary(batteryCat.name, product, quantity),
      });
    } catch {
      /* skip */
    }
  }

  return items;
}

export function getBOMTotalPrice(items: RecommendedLineItem[]): number {
  return items.reduce((sum, line) => sum + line.lineTotal, 0);
}

/** Derive live chart/metric specs from the actual recommended BOM. */
export function deriveChartSpecsFromBOM(items: RecommendedLineItem[]): {
  solarKwp: number;
  batteryKwh: number;
  panelCount: number;
} {
  let solarKwp = 0;
  let batteryKwh = 0;
  let panelCount = 0;

  for (const line of items) {
    const meta = parseMetadata(line.product.metadata);
    if (line.categoryName === PANEL_CATEGORY) {
      const panelW = parsePowerW(meta);
      panelCount = line.quantity;
      solarKwp = (line.quantity * panelW) / 1000;
    } else if (line.categoryName === BATTERY_CATEGORY) {
      const unitKwh = parseBatteryKwh(meta);
      batteryKwh = line.quantity * unitKwh;
    }
  }

  return { solarKwp, batteryKwh, panelCount };
}

export { CATEGORY_SLUG_MAP };
