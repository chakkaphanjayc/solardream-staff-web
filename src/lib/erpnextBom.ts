export interface ErpnextBomItem {
  item_code: string;
  item_name: string;
  qty: number;
  uom: string;
  stock_uom: string;
  conversion_factor: number;
  rate?: number;
  amount?: number;
  description?: string;
  product_id?: string | null;
}

export interface SegmentedBom {
  materials: ErpnextBomItem[];
  operations: ErpnextBomItem[];
}

type ProductsById = Map<string, {
  id: string;
  brand?: string | null;
  model?: string | null;
  price?: number | null;
  description?: string | null;
  category?: {
    name?: string | null;
  } | null;
}>;
type ProductLookup = ProductsById extends Map<string, infer T> ? T : never;
type BomSourceItem = Record<string, unknown>;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function toNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function normalizeUom(item: BomSourceItem) {
  return getString(item.uom || item.stock_uom || item.unit || item.unitOfMeasure)
    || process.env.ERPNEXT_DEFAULT_UOM
    || "Nos";
}

function normalizeConversionFactor(item: BomSourceItem) {
  const value = toNumber(item.conversion_factor ?? item.conversionFactor, 1);
  return value > 0 ? value : 1;
}

function normalizeItemCode(item: BomSourceItem, product?: ProductLookup) {
  const explicit = item.item_code || item.itemCode || item.erpItemCode || item.erp_item_code || item.sku || item.code;
  const model = item.model || product?.model;
  const explicitString = getString(explicit);
  const modelString = getString(model);
  if (explicitString) return explicitString;
  if (modelString) return modelString;
  return "SOLAR-GENERIC";
}

function normalizeItemName(item: BomSourceItem, product?: ProductLookup) {
  const brand = getString(item.brand) || getString(product?.brand);
  const model = getString(item.model) || getString(product?.model) || getString(item.productName) || getString(item.name);
  const direct = getString(item.item_name) || getString(item.productName) || getString(item.name);
  const brandModel = [brand, model].filter(Boolean).join(" - ");
  return direct || brandModel || model || brand || "Solar hardware component";
}

function normalizeDescription(item: BomSourceItem, product?: ProductLookup) {
  const brand = getString(item.brand) || getString(product?.brand);
  const model = getString(item.model) || getString(product?.model) || getString(item.productName) || getString(item.name);
  const direct = getString(item.description) || getString(item.serviceDescription) || getString(item.name) || getString(product?.description);
  const title = [brand, model].filter(Boolean).join(" - ");
  if (direct && title) {
    return `${title} — ${direct}`;
  }
  return direct || title || "Solar hardware component";
}

export function extractConfigurationItems(configurationData: unknown): BomSourceItem[] {
  const config = asRecord(configurationData);
  const candidates = [
    config.items,
    config.products,
    config.components,
    config.bom,
    config.serviceFees,
    config.service_fees,
    asRecord(config.configuration).items,
  ];

  return candidates.flatMap((candidate) => {
    if (!Array.isArray(candidate)) return [];
    return candidate.filter((item) => item && typeof item === "object") as BomSourceItem[];
  });
}

export function buildErpnextBomItems(configurationData: unknown, productsById: ProductsById = new Map()): ErpnextBomItem[] {
  const items = extractConfigurationItems(configurationData);

  return items.map((item) => {
    const product = item.productId ? productsById.get(String(item.productId)) : undefined;
    const qty = Math.max(1, toNumber(item.qty ?? item.quantity ?? item.count, 1));
    const rate = toNumber(
      item.rate ?? item.unitPrice ?? item.basePrice ?? item.price ?? product?.price,
      0
    );
    const amount = toNumber(item.amount ?? item.totalPrice, rate * qty);
    const uom = normalizeUom(item);

    return {
      item_code: normalizeItemCode(item, product),
      item_name: normalizeItemName(item, product),
      qty,
      uom,
      stock_uom: uom,
      conversion_factor: normalizeConversionFactor(item),
      ...(rate > 0 ? { rate } : {}),
      ...(amount > 0 ? { amount } : {}),
      description: normalizeDescription(item, product),
      product_id: getString(item.productId) || null,
    };
  });
}

export function buildFallbackSystemItem(proposal: {
  systemSizeKwp?: number | null;
  panelCount?: number | null;
  totalPrice?: number | null;
}): ErpnextBomItem {
  const systemSize = toNumber(proposal.systemSizeKwp, 0);
  return {
    item_code: `SOLAR-SYSTEM-${systemSize || "CUSTOM"}KW`,
    item_name: `Solar system ${systemSize || "Custom"} kWp`,
    qty: 1,
    uom: process.env.ERPNEXT_DEFAULT_UOM || "Nos",
    stock_uom: process.env.ERPNEXT_DEFAULT_UOM || "Nos",
    conversion_factor: 1,
    rate: toNumber(proposal.totalPrice, 0),
    amount: toNumber(proposal.totalPrice, 0),
    description: `Solar system ${systemSize} kWp (${toNumber(proposal.panelCount, 0)} panels)`,
  };
}

export function segmentBomItems(items: ErpnextBomItem[]): SegmentedBom {
  const operationsPattern = /labor|installation|service|survey|maintenance|commission|permit|operation/i;

  return items.reduce<SegmentedBom>((acc, item) => {
    const haystack = `${item.item_code} ${item.item_name || ""} ${item.description || ""}`;
    if (operationsPattern.test(haystack)) {
      acc.operations.push(item);
    } else {
      acc.materials.push(item);
    }
    return acc;
  }, { materials: [], operations: [] });
}
