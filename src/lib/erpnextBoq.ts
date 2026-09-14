import "server-only";

import { getSystemSetting } from "@/app/actions/systemSettings";
import type { BoqLine, BoqTemplate, ErpnextQuotationPayload } from "@/types/boq";

export type ErpnextResourceRecord = Record<string, unknown>;
type ErpRecord = ErpnextResourceRecord;

const REQUEST_TIMEOUT_MS = 15_000;
const BUNDLE_CACHE_TTL_MS = 5 * 60 * 1000;
let bundleListCache: { expiresAt: number; bundles: Array<{ itemCode: string; label: string }> } | null = null;
const bundleTemplateCache = new Map<string, { expiresAt: number; template: BoqTemplate }>();

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function number(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function record(value: unknown): ErpRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as ErpRecord
    : {};
}

async function credentials() {
  const [endpoint, apiKey, apiSecret] = await Promise.all([
    getSystemSetting("erpnext_site_endpoint"),
    getSystemSetting("erpnext_api_key"),
    getSystemSetting("erpnext_api_secret"),
  ]);
  const baseUrl = (endpoint || process.env.ERPNEXT_BASE_URL || "").trim().replace(/\/$/, "");
  const key = (apiKey || process.env.ERPNEXT_API_KEY || "").trim();
  const secret = (apiSecret || process.env.ERPNEXT_API_SECRET || "").trim();
  if (!baseUrl || !key || !secret) throw new Error("ERPNext integration is not configured.");
  return { baseUrl, authorization: `token ${key}:${secret}` };
}

async function request(method: "GET" | "POST", endpoint: string, body?: unknown) {
  const auth = await credentials();
  const response = await fetch(`${auth.baseUrl}${endpoint}`, {
    method,
    headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: auth.authorization },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const json = await response.json().catch(() => ({})) as ErpRecord;
  if (!response.ok) {
    throw new Error(text(json._error_message) || text(json.exception) || text(json.message) || `ERPNext responded with ${response.status}.`);
  }
  return json;
}

function listData(value: unknown) {
  const data = record(value).data;
  return Array.isArray(data) ? data.map(record) : [];
}

function resourceQuery(doctype: string, input: { fields: string[]; filters?: unknown[]; limit?: number }) {
  const params = new URLSearchParams({ fields: JSON.stringify(input.fields), limit_page_length: String(input.limit ?? 100) });
  if (input.filters) params.set("filters", JSON.stringify(input.filters));
  return `/api/resource/${encodeURIComponent(doctype)}?${params.toString()}`;
}

/**
 * Shared read-only ERPNext resource access for catalog consumers.
 *
 * The catalog must not depend on the local Product tables. Keeping this
 * primitive next to the existing ERPNext credentials/request code makes that
 * ownership explicit and prevents individual pages from reimplementing
 * authentication or query encoding.
 */
export async function listErpnextResource(
  doctype: string,
  fields: string[],
  filters?: unknown[],
  limit = 1000,
): Promise<ErpnextResourceRecord[]> {
  return listData(await request("GET", resourceQuery(doctype, { fields, filters, limit })));
}

export async function getErpnextResource(
  doctype: string,
  name: string,
): Promise<ErpnextResourceRecord> {
  const normalizedDoctype = doctype.trim();
  const normalizedName = name.trim();
  if (!normalizedDoctype || !normalizedName) {
    throw new Error("ERPNext resource doctype and name are required.");
  }

  return record((await request(
    "GET",
    `/api/resource/${encodeURIComponent(normalizedDoctype)}/${encodeURIComponent(normalizedName)}`,
  )).data);
}

type InventorySnapshot = { cost: number | null; stockQty: number };

async function loadInventorySnapshots(itemCodes: readonly string[]) {
  if (itemCodes.length === 0) return new Map<string, InventorySnapshot>();
  const bins = listData(await request("GET", resourceQuery("Bin", {
    fields: ["item_code", "actual_qty", "valuation_rate"],
    filters: [["Bin", "item_code", "in", itemCodes]],
    limit: 1_000,
  })));
  const totals = new Map<string, { stockQty: number; valuationTotal: number; valuationQty: number; fallbackCost: number | null }>();
  for (const bin of bins) {
    const itemCode = text(bin.item_code);
    if (!itemCode) continue;
    const stockQty = number(bin.actual_qty);
    const valuationRate = number(bin.valuation_rate);
    const current = totals.get(itemCode) || { stockQty: 0, valuationTotal: 0, valuationQty: 0, fallbackCost: null };
    current.stockQty += stockQty;
    if (valuationRate > 0 && current.fallbackCost === null) current.fallbackCost = valuationRate;
    if (stockQty > 0 && valuationRate > 0) {
      current.valuationTotal += stockQty * valuationRate;
      current.valuationQty += stockQty;
    }
    totals.set(itemCode, current);
  }
  return new Map([...totals].map(([itemCode, value]) => [itemCode, {
    stockQty: value.stockQty,
    cost: value.valuationQty > 0 ? value.valuationTotal / value.valuationQty : value.fallbackCost,
  }]));
}

export function calculateBoqTotals(lines: readonly BoqLine[]) {
  return lines.reduce((totals, line) => {
    const amount = Math.max(0, line.qty) * Math.max(0, line.rate);
    if (line.source === "ADDON") totals.addonPrice += amount;
    else totals.basePackagePrice += amount;
    totals.grandTotal += amount;
    return totals;
  }, { basePackagePrice: 0, addonPrice: 0, grandTotal: 0 });
}

export async function loadBoqTemplate(bundleItemCode: string): Promise<BoqTemplate> {
  const bundleCode = bundleItemCode.trim();
  if (!bundleCode) throw new Error("A base package item code is required.");
  const cached = bundleTemplateCache.get(bundleCode);
  if (cached && cached.expiresAt > Date.now()) return cached.template;
  const matchesByItemCode = listData(await request("GET", resourceQuery("Product Bundle", {
    fields: ["name", "new_item_code", "description"],
    filters: [["Product Bundle", "new_item_code", "=", bundleCode]],
    limit: 1,
  })));
  // Older CRM records stored the bundle description rather than its parent Item
  // code. Retain support for those records while using `new_item_code` for all
  // newly loaded bundles.
  const matches = matchesByItemCode.length > 0
    ? matchesByItemCode
    : listData(await request("GET", resourceQuery("Product Bundle", {
      fields: ["name", "new_item_code", "description"],
      filters: [["Product Bundle", "description", "=", bundleCode]],
      limit: 1,
    })));
  const bundleName = text(matches[0]?.name);
  if (!bundleName) throw new Error(`No ERPNext Product Bundle exists for ${bundleCode}.`);
  const bundleResponse = await request("GET", `/api/resource/Product%20Bundle/${encodeURIComponent(bundleName)}`);
  const bundle = record(bundleResponse.data);
  const items = Array.isArray(bundle.items) ? bundle.items.map(record) : [];
  const itemCodes = items.map((item) => text(item.item_code)).filter(Boolean);
  if (itemCodes.length === 0) throw new Error("The selected Product Bundle has no component items.");
  const [itemRows, prices, inventoryByCode] = await Promise.all([
    request("GET", resourceQuery("Item", { fields: ["item_code", "item_name", "description", "stock_uom"], filters: [["Item", "item_code", "in", itemCodes]], limit: itemCodes.length })).then(listData),
    request("GET", resourceQuery("Item Price", { fields: ["item_code", "price_list_rate", "currency"], filters: [["Item Price", "price_list", "=", process.env.ERPNEXT_SELLING_PRICE_LIST || "Standard Selling"], ["Item Price", "item_code", "in", itemCodes]], limit: itemCodes.length })).then(listData),
    loadInventorySnapshots(itemCodes),
  ]);
  const itemByCode = new Map(itemRows.map((item) => [text(item.item_code), item]));
  const priceByCode = new Map(prices.map((price) => [text(price.item_code), price]));
  const lines = items.map((bundleItem, index): BoqLine => {
    const itemCode = text(bundleItem.item_code);
    const item = itemByCode.get(itemCode) || {};
    const price = priceByCode.get(itemCode) || {};
    const inventory = inventoryByCode.get(itemCode) || { cost: null, stockQty: 0 };
    return {
      id: `bundle-${index}-${itemCode}`,
      source: "BUNDLE",
      itemCode,
      itemName: text(item.item_name) || itemCode,
      description: text(item.description) || null,
      qty: Math.max(0.0001, number(bundleItem.qty, 1)),
      uom: text(bundleItem.uom) || text(item.stock_uom) || "Nos",
      rate: Math.max(0, number(price.price_list_rate)),
      cost: inventory.cost,
      stockQty: inventory.stockQty,
      warehouse: text(bundleItem.warehouse) || null,
    };
  });
  const resolvedBundleItemCode = text(bundle.new_item_code) || text(matches[0]?.new_item_code) || bundleCode;
  const template = { bundleItemCode: resolvedBundleItemCode, bundleName: text(bundle.description) || bundleName, currency: text(prices[0]?.currency) || "THB", sellingPriceList: process.env.ERPNEXT_SELLING_PRICE_LIST || "Standard Selling", lines };
  bundleTemplateCache.set(bundleCode, { template, expiresAt: Date.now() + BUNDLE_CACHE_TTL_MS });
  if (resolvedBundleItemCode !== bundleCode) bundleTemplateCache.set(resolvedBundleItemCode, { template, expiresAt: Date.now() + BUNDLE_CACHE_TTL_MS });
  return template;
}

export async function listErpnextProductBundles(forceRefresh = false) {
  if (!forceRefresh && bundleListCache && bundleListCache.expiresAt > Date.now()) return bundleListCache.bundles;
  const rows = listData(await request("GET", resourceQuery("Product Bundle", {
    fields: ["new_item_code", "description"],
    limit: 100,
  })));
  const bundles = rows.map((row) => ({ itemCode: text(row.new_item_code), label: text(row.description) || text(row.new_item_code) }))
    .filter((bundle) => bundle.itemCode);
  bundleListCache = { bundles, expiresAt: Date.now() + BUNDLE_CACHE_TTL_MS };
  return bundles;
}

export async function resolveErpnextCompany() {
  const rows = listData(await request("GET", resourceQuery("Company", { fields: ["name"], limit: 1 })));
  const company = text(rows[0]?.name);
  if (!company) throw new Error("No ERPNext Company is available to the integration user.");
  return company;
}

export async function searchErpnextItems(query: string) {
  const term = query.trim();
  if (term.length < 2) return [] as BoqLine[];
  const rows = listData(await request("GET", resourceQuery("Item", {
    fields: ["item_code", "item_name", "description", "stock_uom"],
    filters: [["Item", "disabled", "=", 0], ["Item", "item_code", "like", `%${term}%`]],
    limit: 20,
  })));
  const itemCodes = rows.map((item) => text(item.item_code)).filter(Boolean);
  const [prices, inventoryByCode] = await Promise.all([
    itemCodes.length > 0 ? request("GET", resourceQuery("Item Price", {
    fields: ["item_code", "price_list_rate"],
    filters: [["Item Price", "price_list", "=", process.env.ERPNEXT_SELLING_PRICE_LIST || "Standard Selling"], ["Item Price", "item_code", "in", itemCodes]],
    limit: itemCodes.length,
    })).then(listData) : Promise.resolve([] as ErpRecord[]),
    loadInventorySnapshots(itemCodes),
  ]);
  const priceByCode = new Map(prices.map((price) => [text(price.item_code), number(price.price_list_rate)]));
  return rows.map((item): BoqLine => {
    const itemCode = text(item.item_code);
    const inventory = inventoryByCode.get(itemCode) || { cost: null, stockQty: 0 };
    return {
    id: `addon-${text(item.item_code)}`,
    source: "ADDON",
    itemCode, itemName: text(item.item_name) || itemCode, description: text(item.description) || null,
    qty: 1, uom: text(item.stock_uom) || "Nos", rate: Math.max(0, priceByCode.get(itemCode) || 0), cost: inventory.cost, stockQty: inventory.stockQty, warehouse: null,
  };
  }).filter((item) => item.itemCode);
}

export function buildErpnextQuotationPayload(input: { partyName: string; company: string; currency: string; sellingPriceList: string; lines: readonly BoqLine[]; remarks: string; validTill: string; amendedFrom?: string | null }): ErpnextQuotationPayload & { amended_from?: string } {
  const items = input.lines.map((line) => ({ item_code: line.itemCode, qty: line.qty, uom: line.uom, rate: line.rate, ...(line.warehouse ? { warehouse: line.warehouse } : {}) }));
  if (items.length === 0) throw new Error("Add at least one BOQ item.");
  return { quotation_to: "Customer", party_name: input.partyName, company: input.company, transaction_date: new Date().toISOString().slice(0, 10), valid_till: input.validTill, order_type: "Sales", currency: input.currency, selling_price_list: input.sellingPriceList, remarks: input.remarks, items, ...(input.amendedFrom ? { amended_from: input.amendedFrom } : {}) };
}

export async function createErpnextBoqQuotation(payload: ErpnextQuotationPayload) {
  const response = await request("POST", "/api/resource/Quotation", payload);
  const created = record(response.data);
  const name = text(created.name);
  if (!name) throw new Error("ERPNext did not return a Quotation ID.");
  return { name, document: created };
}
