"use server";

import "server-only";

import { frappeRequest } from "@/lib/erpnext";

type ErpnextRow = Record<string, unknown>;

function asRecord(value: unknown): ErpnextRow {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as ErpnextRow
    : {};
}

function rows(value: unknown): ErpnextRow[] {
  const root = asRecord(value);
  return Array.isArray(root.data)
    ? root.data.filter((row): row is ErpnextRow => Boolean(row) && typeof row === "object" && !Array.isArray(row))
    : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function listResource(doctype: string, fields: string[], filters?: unknown[]) {
  const query = new URLSearchParams({
    fields: JSON.stringify(fields),
    limit_page_length: "1000",
  });
  if (filters) query.set("filters", JSON.stringify(filters));
  const response = await frappeRequest(
    "GET",
    `/api/resource/${encodeURIComponent(doctype)}?${query.toString()}`,
  );
  return rows(response.data);
}

/**
 * Compatibility read/check endpoint. ERPNext is the catalog source of truth;
 * this function deliberately does not upsert local Category/Product rows.
 * Webhooks and scheduled jobs call it to validate connectivity and invalidate
 * the request-time catalog cache at the application boundary.
 */
export async function syncCategoryTree() {
  const itemGroups = await listResource(
    "Item Group",
    ["name", "parent_item_group", "is_group"],
  );
  return {
    success: true,
    fetched: itemGroups.filter((row) => text(row.name)).length,
    upserted: 0,
    sourceOfTruth: "ERPNext",
  };
}

export async function syncBrands() {
  const brands = await listResource("Brand", ["name"]);
  return {
    success: true,
    fetched: brands.filter((row) => text(row.name)).length,
    upserted: 0,
    sourceOfTruth: "ERPNext",
  };
}

export async function syncItemCategories() {
  return syncCategoryTree();
}

export async function syncErpnextCatalogTaxonomy() {
  const [categories, brands] = await Promise.all([syncCategoryTree(), syncBrands()]);
  return {
    success: true,
    categories,
    brands,
    sourceOfTruth: "ERPNext",
  };
}

export async function syncCategoriesAndAssignToProducts() {
  const taxonomy = await syncCategoryTree();
  return {
    success: true,
    categoriesSynced: taxonomy.fetched,
    productsUpdated: 0,
    sourceOfTruth: "ERPNext",
  };
}

export async function syncErpnextMasterData(itemCodes?: string[]) {
  const normalizedCodes = Array.from(new Set((itemCodes || []).map(text).filter(Boolean)));
  const filters: unknown[] = normalizedCodes.length
    ? [["Item", "item_code", "in", normalizedCodes]]
    : [["Item", "disabled", "in", [0, 1]]];
  const [items, taxonomy] = await Promise.all([
    listResource("Item", ["item_code", "item_name", "item_group", "brand", "disabled"], filters),
    normalizedCodes.length ? Promise.resolve(null) : syncErpnextCatalogTaxonomy(),
  ]);
  const validItems = items.filter((item) => text(item.item_code));

  return {
    success: true,
    syncedAt: new Date().toISOString(),
    itemCount: validItems.length,
    activeItemCount: validItems.filter((item) => item.disabled !== 1 && item.disabled !== "1" && item.disabled !== true).length,
    taxonomy,
    sourceOfTruth: "ERPNext",
    localWrites: 0,
  };
}
