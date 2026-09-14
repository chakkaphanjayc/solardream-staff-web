import "server-only";

import type { SolarAddonConfig } from "@/lib/solarAddonConfig";
import { assertNoLegacyPublicErpSecrets } from "@/lib/serverEnv";
import { erpNextGateway } from "@/server/services/integrations/erpnext-gateway";

export type ErpnextResourceRecord = Record<string, unknown>;

export type ErpnextCatalogCategory = {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  displayOrder: number;
  isRequired: boolean;
  allowMultiple: boolean;
  dependsOnCategoryId: string | null;
  dependsOnProductId: string | null;
  blueprintId: string | null;
  parentId: string | null;
  createdAt: Date;
  updatedAt: Date;
  parent: { id: string; name: string } | null;
};

export type ErpnextCatalogProduct = {
  id: string;
  erpnextItemCode: string;
  brand: string;
  model: string;
  price: number;
  imageUrl: string;
  description: string | null;
  stock: number;
  stockStatus: string;
  ctaType: "REQUEST_QUOTE" | "CHECK_STOCK" | "CONTACT_SALES";
  isAvailable: boolean;
  isActive: boolean;
  categoryId: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  seoTitle: string | null;
  seoDescription: string | null;
  seoKeywords: string | null;
  seoImage: string | null;
  physicalWidth: number | null;
  physicalLength: number | null;
  wattageCapacity: number | null;
  useInRecommendation: boolean;
  recommendTier: string | null;
  recommendPriority: number;
  category: ErpnextCatalogCategory;
};

export type ErpnextCatalogBrand = {
  id: string;
  name: string;
  logoUrl: string | null;
};

export type ErpnextCatalogBundleItem = {
  id: string;
  productId: string;
  quantity: number;
  product: {
    id: string;
    brand: string;
    model: string;
    price: number;
    name: string;
  };
};

export type ErpnextCatalogBundle = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  price: number;
  isActive: boolean;
  discountType: string;
  discountValue: number;
  promoText: string | null;
  labels: string[];
  validFrom: Date | null;
  validUntil: Date | null;
  items: ErpnextCatalogBundleItem[];
};

type CatalogQuery = {
  search?: string;
  categoryId?: string;
  sort?: string;
  brand?: string;
  skip?: number;
  take?: number;
  itemCodes?: string[];
};

type InventorySnapshot = { stockQty: number; cost: number | null };

const SELLING_PRICE_LIST = process.env.ERPNEXT_SELLING_PRICE_LIST || "Standard Selling";
const ERP_BASE_URL = (
  process.env.ERPNEXT_URL || process.env.ERPNEXT_BASE_URL || ""
).replace(/\/$/, "");
const DEFAULT_IMAGE = "/asset/solarcell-icon.webp";
const REQUEST_TIMEOUT_MS = 15_000;

async function credentials() {
  // Resolve settings lazily. This module is used by system settings itself;
  // keeping the import dynamic avoids a module-cycle during the App Router
  // server build.
  const { getSystemSetting } = await import("@/app/actions/systemSettings");
  const [endpoint, apiKey, apiSecret] = await Promise.all([
    getSystemSetting("erpnext_site_endpoint"),
    getSystemSetting("erpnext_api_key"),
    getSystemSetting("erpnext_api_secret"),
  ]);
  const baseUrl = (endpoint || ERP_BASE_URL).trim().replace(/\/$/, "");
  const key = (apiKey || process.env.ERPNEXT_API_KEY || "").trim();
  const secret = (apiSecret || process.env.ERPNEXT_API_SECRET || "").trim();
  if (!baseUrl || !key || !secret) throw new Error("ERPNext integration is not configured.");
  return { baseUrl, authorization: `token ${key}:${secret}` };
}

async function request(method: "GET", endpoint: string): Promise<ErpnextResourceRecord> {
  return erpNextGateway.compatibilityRequestUsing(async () => {
    assertNoLegacyPublicErpSecrets();
    const auth = await credentials();
    const response = await fetch(`${auth.baseUrl}${endpoint}`, {
      method, headers: { Accept: "application/json", Authorization: auth.authorization },
      cache: "no-store", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const payload = await response.json().catch(() => ({})) as ErpnextResourceRecord;
    if (!response.ok) {
      const message = text(payload.exception) || text(payload.message);
      throw new Error(message || `ERPNext responded with ${response.status}.`);
    }
    return payload;
  });
}

function resourceQuery(doctype: string, fields: string[], filters?: unknown[], limit = 1000): string {
  const query = new URLSearchParams({
    fields: JSON.stringify(fields),
    limit_page_length: String(limit),
  });
  if (filters) query.set("filters", JSON.stringify(filters));
  return `/api/resource/${encodeURIComponent(doctype)}?${query.toString()}`;
}

async function listErpnextResource(doctype: string, fields: string[], filters?: unknown[], limit = 1000): Promise<ErpnextResourceRecord[]> {
  const payload = await request("GET", resourceQuery(doctype, fields, filters, limit));
  return Array.isArray(payload.data)
    ? payload.data.filter((row): row is ErpnextResourceRecord => Boolean(row) && typeof row === "object" && !Array.isArray(row))
    : [];
}

async function getErpnextResource(doctype: string, name: string): Promise<ErpnextResourceRecord> {
  const payload = await request("GET", `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
  return payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)
    ? payload.data as ErpnextResourceRecord
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function number(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nullableText(value: unknown): string | null {
  const valueText = text(value);
  return valueText || null;
}

function boolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;
  return fallback;
}

function date(value: unknown): Date {
  const parsed = value instanceof Date ? value : new Date(String(value || ""));
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || `erpnext-${Buffer.from(value).toString("hex").slice(0, 12)}`;
}

function assetUrl(value: unknown): string {
  const path = text(value);
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return ERP_BASE_URL ? `${ERP_BASE_URL}${path.startsWith("/") ? "" : "/"}${path}` : path;
}

function metadataForItem(item: ErpnextResourceRecord, input: {
  itemGroup: string;
  stockUom: string;
  currency: string;
}): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    itemCode: text(item.item_code),
    itemName: text(item.item_name),
    itemGroup: input.itemGroup,
    stockUom: input.stockUom,
    currency: input.currency,
  };

  const knownSpecificationFields = [
    "power",
    "power_rating",
    "panel_power",
    "wattage",
    "capacity",
    "usable_capacity",
    "efficiency",
    "phase",
    "warranty",
    "roof_type_match",
    "material",
    "features",
    "highlights",
    "bullets",
    "gallery",
    "images",
    "image_urls",
    "sales_url",
    "addon_category",
    "addon_input_type",
    "use_in_recommendation",
    "recommend_tier",
    "recommend_priority",
  ];

  for (const [key, value] of Object.entries(item)) {
    if (key.startsWith("custom_") || knownSpecificationFields.includes(key)) {
      metadata[key] = value;
    }
  }

  return metadata;
}

function customValue(item: ErpnextResourceRecord, names: string[]): unknown {
  for (const name of names) {
    if (item[name] !== undefined && item[name] !== null && item[name] !== "") return item[name];
    const customName = name.startsWith("custom_") ? name : `custom_${name}`;
    if (item[customName] !== undefined && item[customName] !== null && item[customName] !== "") {
      return item[customName];
    }
  }
  return undefined;
}

function mapCategory(row: ErpnextResourceRecord, index: number, parentByName: Map<string, ErpnextResourceRecord>): ErpnextCatalogCategory | null {
  const name = text(row.name);
  if (!name) return null;
  const parentName = text(row.parent_item_group);
  const parent = parentName && parentName !== "All Item Groups" ? parentByName.get(parentName) : undefined;
  return {
    id: name,
    name,
    description: parentName && parentName !== "All Item Groups" ? `ERPNext Item Group: ${name}. Parent: ${parentName}.` : `ERPNext Item Group: ${name}.`,
    slug: slugify(name),
    displayOrder: index,
    isRequired: false,
    allowMultiple: true,
    dependsOnCategoryId: null,
    dependsOnProductId: null,
    blueprintId: null,
    parentId: parent ? text(parent.name) || null : null,
    createdAt: date(row.creation),
    updatedAt: date(row.modified),
    parent: parent ? { id: text(parent.name), name: text(parent.name) } : null,
  };
}

export async function listCatalogCategories(): Promise<ErpnextCatalogCategory[]> {
  const rows = await listErpnextResource(
    "Item Group",
    ["name", "parent_item_group", "is_group", "creation", "modified"],
  );
  const parentByName = new Map(rows.map((row) => [text(row.name), row]));
  return rows
    .map((row, index) => mapCategory(row, index, parentByName))
    .filter((category): category is ErpnextCatalogCategory => Boolean(category));
}

export async function listCatalogBrands(): Promise<ErpnextCatalogBrand[]> {
  const rows = await listErpnextResource("Brand", ["name", "image"], undefined, 1000);
  return rows
    .map((row) => {
      const name = text(row.name);
      return name ? { id: name, name, logoUrl: assetUrl(row.image) || null } : null;
    })
    .filter((brand): brand is ErpnextCatalogBrand => Boolean(brand))
    .sort((left, right) => left.name.localeCompare(right.name));
}

async function loadInventory(itemCodes: string[]): Promise<Map<string, InventorySnapshot>> {
  if (itemCodes.length === 0) return new Map();
  const rows = await listErpnextResource(
    "Bin",
    ["item_code", "actual_qty", "valuation_rate"],
    [["Bin", "item_code", "in", itemCodes]],
    Math.max(itemCodes.length * 4, 1000),
  );
  const totals = new Map<string, { qty: number; valuationTotal: number; valuationQty: number; fallbackCost: number | null }>();
  for (const row of rows) {
    const code = text(row.item_code);
    if (!code) continue;
    const qty = number(row.actual_qty);
    const valuationRate = number(row.valuation_rate);
    const current = totals.get(code) || { qty: 0, valuationTotal: 0, valuationQty: 0, fallbackCost: null };
    current.qty += qty;
    if (valuationRate > 0 && current.fallbackCost === null) current.fallbackCost = valuationRate;
    if (qty > 0 && valuationRate > 0) {
      current.valuationTotal += qty * valuationRate;
      current.valuationQty += qty;
    }
    totals.set(code, current);
  }
  return new Map([...totals].map(([code, value]) => [code, {
    stockQty: value.qty,
    cost: value.valuationQty > 0 ? value.valuationTotal / value.valuationQty : value.fallbackCost,
  }]));
}

async function loadSellingPrices(itemCodes: string[]): Promise<Map<string, { price: number; currency: string }>> {
  if (itemCodes.length === 0) return new Map();
  const rows = await listErpnextResource(
    "Item Price",
    ["item_code", "price_list_rate", "currency", "valid_from", "valid_upto"],
    [["Item Price", "price_list", "=", SELLING_PRICE_LIST], ["Item Price", "item_code", "in", itemCodes]],
    Math.max(itemCodes.length * 2, 1000),
  );
  const prices = new Map<string, { price: number; currency: string }>();
  for (const row of rows) {
    const code = text(row.item_code);
    if (!code || prices.has(code)) continue;
    prices.set(code, { price: Math.max(0, number(row.price_list_rate)), currency: text(row.currency) || "THB" });
  }
  return prices;
}

function categoryForItem(item: ErpnextResourceRecord, categories: ErpnextCatalogCategory[]): ErpnextCatalogCategory {
  const itemGroup = text(item.item_group) || "ERPNext Items";
  return categories.find((category) => category.id === itemGroup) || {
    id: itemGroup,
    name: itemGroup,
    description: `ERPNext Item Group: ${itemGroup}.`,
    slug: slugify(itemGroup),
    displayOrder: categories.length,
    isRequired: false,
    allowMultiple: true,
    dependsOnCategoryId: null,
    dependsOnProductId: null,
    blueprintId: null,
    parentId: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    parent: null,
  };
}

function mapProduct(item: ErpnextResourceRecord, category: ErpnextCatalogCategory, price: { price: number; currency: string } | undefined, inventory: InventorySnapshot | undefined): ErpnextCatalogProduct | null {
  const itemCode = text(item.item_code);
  if (!itemCode) return null;
  const stock = inventory?.stockQty || 0;
  const active = !boolean(item.disabled);
  const itemName = text(item.item_name) || itemCode;
  const brand = text(item.brand) || "ERPNext";
  const metadata = metadataForItem(item, {
    itemGroup: category.name,
    stockUom: text(item.stock_uom) || "Nos",
    currency: price?.currency || "THB",
  });
  const customRecommendation = customValue(item, ["use_in_recommendation"]);
  const customTier = text(customValue(item, ["recommend_tier", "tier"]));
  const customPriority = number(customValue(item, ["recommend_priority", "priority"]));
  const wattage = number(customValue(item, ["wattage", "power_rating", "panel_power"]), 0);
  const width = number(customValue(item, ["physical_width", "width"]), 0);
  const length = number(customValue(item, ["physical_length", "length"]), 0);
  return {
    id: itemCode,
    erpnextItemCode: itemCode,
    brand,
    model: itemName,
    price: price?.price || Math.max(0, number(item.standard_rate)),
    imageUrl: assetUrl(item.image) || DEFAULT_IMAGE,
    description: nullableText(item.description),
    stock,
    stockStatus: !active ? "ARCHIVED" : stock > 0 ? "IN_STOCK" : "OUT_OF_STOCK",
    ctaType: !active ? "CONTACT_SALES" : stock > 0 ? "CHECK_STOCK" : "REQUEST_QUOTE",
    isAvailable: active,
    isActive: active,
    categoryId: category.id,
    metadata,
    createdAt: date(item.creation),
    updatedAt: date(item.modified),
    seoTitle: nullableText(customValue(item, ["seo_title"])),
    seoDescription: nullableText(customValue(item, ["seo_description"])),
    seoKeywords: nullableText(customValue(item, ["seo_keywords"])),
    seoImage: assetUrl(customValue(item, ["seo_image"])) || null,
    physicalWidth: width > 0 ? width : null,
    physicalLength: length > 0 ? length : null,
    wattageCapacity: wattage > 0 ? wattage : null,
    useInRecommendation: customRecommendation === undefined ? true : boolean(customRecommendation, true),
    recommendTier: customTier || null,
    recommendPriority: customPriority,
    category,
  };
}

export async function listCatalogProducts(query: CatalogQuery = {}): Promise<{
  products: ErpnextCatalogProduct[];
  total: number;
  hasMore: boolean;
}> {
  const normalizedCodes = Array.from(new Set((query.itemCodes || []).map(text).filter(Boolean)));
  const filters: unknown[] = [
    ["Item", "disabled", "=", 0],
    ["Item", "is_sales_item", "=", 1],
  ];
  if (query.categoryId?.trim()) filters.push(["Item", "item_group", "=", query.categoryId.trim()]);
  if (normalizedCodes.length > 0) filters.push(["Item", "item_code", "in", normalizedCodes]);
  if (query.brand?.trim() && !query.brand.includes(",")) filters.push(["Item", "brand", "=", query.brand.trim()]);

  const [itemRows, categories] = await Promise.all([
    listErpnextResource("Item", ["*"], filters, 1000),
    listCatalogCategories(),
  ]);
  const itemCodes = itemRows.map((row) => text(row.item_code)).filter(Boolean);
  const [prices, inventory] = await Promise.all([loadSellingPrices(itemCodes), loadInventory(itemCodes)]);
  const search = query.search?.trim().toLowerCase() || "";
  const selectedBrands = new Set((query.brand || "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean));
  let products = itemRows
    .map((item) => mapProduct(item, categoryForItem(item, categories), prices.get(text(item.item_code)), inventory.get(text(item.item_code))))
    .filter((product): product is ErpnextCatalogProduct => Boolean(product))
    .filter((product) => selectedBrands.size === 0 || selectedBrands.has(product.brand.toLowerCase()))
    .filter((product) => !search || [product.id, product.model, product.brand, product.description || ""].some((value) => value.toLowerCase().includes(search)));

  products.sort((left, right) => {
    if (query.sort === "price_asc") return left.price - right.price;
    if (query.sort === "price_desc") return right.price - left.price;
    if (query.sort === "newest") return right.updatedAt.getTime() - left.updatedAt.getTime();
    return left.category.displayOrder - right.category.displayOrder || left.model.localeCompare(right.model);
  });

  const total = products.length;
  const skip = Math.max(0, query.skip || 0);
  const take = Math.max(1, Math.min(1000, query.take || 12));
  products = products.slice(skip, skip + take);
  return { products, total, hasMore: skip + products.length < total };
}

export async function getCatalogProduct(itemCode: string): Promise<ErpnextCatalogProduct | null> {
  const result = await listCatalogProducts({ itemCodes: [itemCode], take: 1 });
  return result.products[0] || null;
}

export async function getCatalogProductsByIds(itemCodes: string[]): Promise<ErpnextCatalogProduct[]> {
  if (itemCodes.length === 0) return [];
  const result = await listCatalogProducts({ itemCodes, take: Math.min(1000, itemCodes.length) });
  return result.products;
}

function addonCategory(value: unknown, itemGroup: string): SolarAddonConfig["category"] {
  const normalized = `${text(value)} ${itemGroup}`.toUpperCase();
  if (normalized.includes("EV")) return "EV_READY";
  if (normalized.includes("BATTERY")) return "BATTERY";
  if (normalized.includes("CABLE")) return "CABLING";
  if (normalized.includes("GRID") || normalized.includes("METER") || normalized.includes("EXPORT")) return "GRID_COMPLIANCE";
  if (normalized.includes("PROTECT") || normalized.includes("COMBINER")) return "PROTECTION";
  return "SAFETY";
}

export async function listErpnextAddonConfigs(): Promise<SolarAddonConfig[]> {
  const products = await listCatalogProducts({ take: 1000 });
  const configuredGroup = (process.env.ERPNEXT_ADDON_ITEM_GROUP || "").trim().toLowerCase();
  return products.products
    .filter((product) => {
      const itemGroup = String(product.metadata.itemGroup || "").toLowerCase();
      const catalogRole = String(product.metadata.custom_catalog_role || product.metadata.catalogRole || "").toLowerCase();
      return (configuredGroup && itemGroup === configuredGroup) || catalogRole === "addon" || catalogRole === "add-on";
    })
    .map((product) => ({
      id: product.erpnextItemCode,
      name: `${product.brand} ${product.model}`.trim(),
      shortLabel: product.model,
      description: product.description || "ERPNext catalog add-on",
      category: addonCategory(product.metadata.custom_addon_category, String(product.metadata.itemGroup || "")),
      inputType: "TOGGLE",
      price: product.price,
      isRecommended: product.useInRecommendation,
      isVisible: product.isActive,
    }));
}

async function mapBundle(bundle: ErpnextResourceRecord, index: number, itemByCode: Map<string, ErpnextResourceRecord>, priceByCode: Map<string, { price: number; currency: string }>): Promise<ErpnextCatalogBundle | null> {
  const bundleName = text(bundle.name);
  const parentCode = text(bundle.new_item_code);
  if (!bundleName || !parentCode) return null;
  const rows = Array.isArray(bundle.items) ? bundle.items.filter((item): item is ErpnextResourceRecord => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
  const parent = itemByCode.get(parentCode);
  const items = rows.map((row, itemIndex) => {
    const code = text(row.item_code);
    const item = itemByCode.get(code) || {};
    const itemName = text(item.item_name) || code;
    return {
      id: `${bundleName}-${itemIndex}-${code}`,
      productId: code,
      quantity: Math.max(0.0001, number(row.qty, 1)),
      product: {
        id: code,
        brand: text(item.brand) || "ERPNext",
        model: itemName,
        price: priceByCode.get(code)?.price || Math.max(0, number(item.standard_rate)),
        name: `${text(item.brand)} ${itemName}`.trim(),
      },
    };
  }).filter((item) => item.productId);
  return {
    id: bundleName,
    name: text(bundle.description) || parentCode,
    description: nullableText(bundle.description),
    imageUrl: assetUrl(parent?.image) || null,
    price: priceByCode.get(parentCode)?.price || Math.max(0, number(parent?.standard_rate)),
    isActive: !boolean(parent?.disabled),
    discountType: "FIXED",
    discountValue: 0,
    promoText: null,
    labels: ["ERPNext Product Bundle"],
    validFrom: null,
    validUntil: null,
    items,
  };
}

export async function listCatalogBundles(): Promise<ErpnextCatalogBundle[]> {
  const bundleRows = await listErpnextResource("Product Bundle", ["name", "new_item_code", "description"], undefined, 100);
  const fullBundles = await Promise.all(bundleRows.map((row) => getErpnextResource("Product Bundle", text(row.name))));
  const itemCodes = Array.from(new Set(fullBundles.flatMap((bundle) => {
    const rows = Array.isArray(bundle.items) ? bundle.items : [];
    return [text(bundle.new_item_code), ...rows.map((item) => text((item as ErpnextResourceRecord).item_code))];
  }).filter(Boolean)));
  const [items, prices] = await Promise.all([
    itemCodes.length > 0 ? listErpnextResource("Item", ["item_code", "item_name", "brand", "image", "standard_rate", "disabled"], [["Item", "item_code", "in", itemCodes]], Math.max(itemCodes.length, 1000)) : Promise.resolve([] as ErpnextResourceRecord[]),
    loadSellingPrices(itemCodes),
  ]);
  const itemByCode = new Map(items.map((item) => [text(item.item_code), item]));
  return (await Promise.all(fullBundles.map((bundle, index) => mapBundle(bundle, index, itemByCode, prices))))
    .filter((bundle): bundle is ErpnextCatalogBundle => Boolean(bundle && bundle.isActive && bundle.items.length > 0));
}

export const fetchCatalogProductsFromErpnext = listCatalogProducts;
export const fetchCatalogBundlesFromErpnext = listCatalogBundles;
