"use server";

import { createAdminClient } from "@/utils/supabase/server";
import { checkAdmin } from "@/app/actions/auth";
import { revalidatePath, revalidateTag } from "next/cache";
import {
  ANALYTICS_CONFIG_SETTING_KEYS,
  ANALYTICS_FLAG_KEYS,
  isAnalyticsConfigSettingKey,
  parseAnalyticsBooleanSetting,
  type AnalyticsConfig,
  type AnalyticsFlagKey,
} from "@/lib/analyticsConfig";
import { syncErpnextMasterData } from "@/lib/erpnext-sync";
import {
  DEFAULT_LOCALIZATION_CONFIG,
  normalizeLocalizationConfig,
  type LocalizationConfig,
} from "@/lib/localization/content";
import { isLocale, locales, type Locale } from "@/i18n/locales";
import {
  ANALYTICS_CONFIG_CACHE_TAG,
  LOCALIZATION_CONFIG_CACHE_TAG,
  NAVIGATION_CACHE_TAG,
} from "@/lib/public-content-cache";
import {
  flattenMessageEntries,
  getMessageEntry,
  getRuntimeMessageOverrides,
  mergeRuntimeMessageOverrides,
  RUNTIME_MESSAGE_OVERRIDES_KEY,
  RUNTIME_MESSAGES_CACHE_TAG,
  setMessageEntry,
  type MessageEntries,
  type MessageTree,
} from "@/lib/localization/runtimeMessages";

type ProductCtaType = "REQUEST_QUOTE" | "CHECK_STOCK" | "CONTACT_SALES";
type SyncChangeType = "new" | "updated" | "deleted";
type CatalogPreviewItem = {
  id: string;
  brand: string;
  model: string;
  price: number;
  categoryName: string;
  imageUrl: string;
  description: string;
  metadata: Record<string, unknown>;
  changeType: SyncChangeType;
  changes?: string[];
  stock?: number;
  stockStatus?: string;
  ctaType?: ProductCtaType;
};
type CatalogSyncResult = {
  newItems: CatalogPreviewItem[];
  updatedItems: CatalogPreviewItem[];
  archivedItems: CatalogPreviewItem[];
};
type CatalogSyncResponse = {
  success: boolean;
  results?: CatalogSyncResult;
  allSheets?: Record<string, unknown[]>;
  omittedProducts?: unknown[];
  logs?: string[];
  message?: string;
  paused?: boolean;
  summary?: {
    totalRowsFound: number;
    insertedCount: number;
    updatedCount: number;
    omittedCount: number;
  };
  taxonomy?: {
    categories: { fetched: number };
    brands: { fetched: number };
  } | null;
  activeItemCount?: number;
  error?: string;
};

function getPublicSettingsError(error: unknown, fallback: string) {
  console.error("[System Settings Action]", error);
  return fallback;
}

/**
 * Retrieves a system setting by key.
 */
export async function getSystemSetting(key: string): Promise<string | null> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();

    if (error || !data) return null;
    return data.value;
  } catch (err) {
    console.error(`[System Settings Action] Failed to get setting for key ${key}:`, err);
    return null;
  }
}

async function readAnalyticsSettings() {
  try {
    const { data, error } = await createAdminClient()
      .from("system_settings")
      .select("key, value")
      .in("key", [...ANALYTICS_CONFIG_SETTING_KEYS]);

    if (error) throw error;

    return new Map(
      (data ?? []).map((row) => [row.key, typeof row.value === "string" ? row.value : null]),
    );
  } catch (error) {
    console.error("[System Settings Action] Failed to read analytics settings:", error);
    return new Map<string, string | null>();
  }
}

export async function getLocalizationConfig(): Promise<LocalizationConfig> {
  const savedConfig = await getSystemSetting("localization_config");
  if (!savedConfig) return DEFAULT_LOCALIZATION_CONFIG;

  try {
    return normalizeLocalizationConfig(JSON.parse(savedConfig));
  } catch {
    return DEFAULT_LOCALIZATION_CONFIG;
  }
}

export async function updateLocalizationConfig(input: {
  defaultLocale: Locale;
  supportedLocales?: readonly Locale[];
}): Promise<{ success: boolean; error?: string }> {
  const supportedLocales = input.supportedLocales?.filter(isLocale) ?? [...locales];
  const config = normalizeLocalizationConfig({
    defaultLocale: input.defaultLocale,
    supportedLocales,
  });

  if (!config.supportedLocales.includes(config.defaultLocale)) {
    return { success: false, error: "The default locale must be enabled." };
  }

  const result = await saveSystemSetting("localization_config", JSON.stringify(config));
  if (result.success) {
    revalidateTag(LOCALIZATION_CONFIG_CACHE_TAG, "max");
    try {
      revalidatePath("/en", "layout");
      revalidatePath("/th", "layout");
      revalidatePath("/en/admin/settings");
      revalidatePath("/th/admin/settings");
    } catch (err) {
      console.warn("[System Settings] Layout revalidation warning:", err);
    }
  }
  return result;
}

async function loadBaseMessageCatalog(locale: Locale): Promise<MessageTree> {
  const catalog = locale === "th"
    ? (await import("../../../messages/th.json")).default
    : (await import("../../../messages/en.json")).default;

  return catalog as unknown as MessageTree;
}

export type RuntimeMessageEditorData = Record<Locale, {
  base: MessageEntries;
  resolved: MessageEntries;
}>;

export type RuntimeMessageImport = Partial<Record<Locale, Record<string, string>>>;

export async function getRuntimeMessageEditorData(): Promise<RuntimeMessageEditorData> {
  await checkAdmin();
  const overrides = await getRuntimeMessageOverrides();
  const result = {} as RuntimeMessageEditorData;

  for (const locale of locales) {
    const base = await loadBaseMessageCatalog(locale);
    result[locale] = {
      base: flattenMessageEntries(base),
      resolved: flattenMessageEntries(mergeRuntimeMessageOverrides(base, overrides[locale])),
    };
  }

  return result;
}

export async function updateRuntimeMessageOverrides(input: {
  locale: Locale;
  changes: Record<string, string | null>;
}): Promise<{ success: boolean; error?: string }> {
  try {
    await checkAdmin();
    if (!isLocale(input.locale)) return { success: false, error: "Unsupported language." };

    const entries = Object.entries(input.changes);
    if (entries.length === 0) return { success: true };
    if (entries.length > 500) return { success: false, error: "Save no more than 500 text changes at once." };

    const base = await loadBaseMessageCatalog(input.locale);
    let localeOverrides = (await getRuntimeMessageOverrides())[input.locale] ?? {};

    for (const [path, value] of entries) {
      if (!path || getMessageEntry(base, path) === undefined) {
        return { success: false, error: `Unknown message key: ${path}` };
      }
      if (value !== null && typeof value !== "string") {
        return { success: false, error: `Invalid text for ${path}` };
      }
      localeOverrides = setMessageEntry(localeOverrides, path, value);
    }

    const existing = await getRuntimeMessageOverrides();
    const payload = JSON.stringify({ ...existing, [input.locale]: localeOverrides });
    const supabase = createAdminClient();
    const { error } = await supabase
      .from("system_settings")
      .upsert(
        { key: RUNTIME_MESSAGE_OVERRIDES_KEY, value: payload, updated_at: new Date().toISOString() },
        { onConflict: "key" },
      );

    if (error) throw new Error("Failed to save runtime message overrides.");

    try {
      revalidateTag(RUNTIME_MESSAGES_CACHE_TAG, "max");
      revalidatePath("/", "layout");
      revalidatePath(`/${input.locale}/admin/settings/localization`);
    } catch (err) {
      console.warn("[Runtime messages] Revalidation warning:", err);
    }
    return { success: true };
  } catch (error) {
    console.error("[Runtime messages] Failed to save overrides:", error);
    return { success: false, error: getPublicSettingsError(error, "Failed to save localized text.") };
  }
}

export async function importRuntimeMessageOverrides(input: {
  messages: RuntimeMessageImport;
}): Promise<{ success: boolean; error?: string }> {
  try {
    await checkAdmin();

    const localesToImport = Object.entries(input.messages).filter(
      (entry): entry is [Locale, Record<string, string>] => isLocale(entry[0]) && typeof entry[1] === "object" && entry[1] !== null,
    );
    if (localesToImport.length === 0) {
      return { success: false, error: "The import does not contain any supported language packs." };
    }

    const totalEntries = localesToImport.reduce((total, [, entries]) => total + Object.keys(entries).length, 0);
    if (totalEntries > 20_000) {
      return { success: false, error: "Import no more than 20,000 text entries at once." };
    }

    const existing = await getRuntimeMessageOverrides();
    const nextOverrides = { ...existing };

    for (const [locale, entries] of localesToImport) {
      const base = await loadBaseMessageCatalog(locale);
      let localeOverrides: MessageTree = {};

      for (const [path, value] of Object.entries(entries)) {
        if (!path || typeof value !== "string" || getMessageEntry(base, path) === undefined) {
          return { success: false, error: `Invalid message entry: ${path}` };
        }
        if (value !== getMessageEntry(base, path)) {
          localeOverrides = setMessageEntry(localeOverrides, path, value);
        }
      }

      nextOverrides[locale] = localeOverrides;
    }

    const supabase = createAdminClient();
    const { error } = await supabase
      .from("system_settings")
      .upsert(
        { key: RUNTIME_MESSAGE_OVERRIDES_KEY, value: JSON.stringify(nextOverrides), updated_at: new Date().toISOString() },
        { onConflict: "key" },
      );

    if (error) throw new Error("Failed to import runtime message overrides.");

    try {
      revalidateTag(RUNTIME_MESSAGES_CACHE_TAG, "max");
      revalidatePath("/", "layout");
      revalidatePath("/en/admin/settings/localization");
      revalidatePath("/th/admin/settings/localization");
    } catch (err) {
      console.warn("[Runtime messages] Revalidation warning:", err);
    }
    return { success: true };
  } catch (error) {
    console.error("[Runtime messages] Failed to import overrides:", error);
    return { success: false, error: getPublicSettingsError(error, "Failed to import localized text.") };
  }
}

export type SystemConfig = {
  erpnextUrl: string;
};

async function getFirstSystemSetting(keys: string[], fallback?: string) {
  for (const key of keys) {
    const value = (await getSystemSetting(key))?.trim();
    if (value) return value;
  }

  return fallback?.trim() || "";
}

/**
 * Retrieves live integration credentials from global system settings.
 */
export async function getSystemConfig(): Promise<SystemConfig> {
  const erpnextUrl = await getFirstSystemSetting(["erpnextUrl", "erpnext_url", "erpnext_site_endpoint"], process.env.ERPNEXT_BASE_URL);

  return {
    erpnextUrl: erpnextUrl.replace(/\/$/, ""),
  };
}

export async function getAnalyticsConfig(): Promise<AnalyticsConfig> {
  const settings = await readAnalyticsSettings();
  const read = (key: string, fallback = "") => settings.get(key)?.trim() || fallback;

  return {
    analytics_enabled: parseAnalyticsBooleanSetting(read("analytics_enabled"), true),
    track_acquisition_engagement: parseAnalyticsBooleanSetting(read("track_acquisition_engagement"), true),
    track_user_registration: parseAnalyticsBooleanSetting(read("track_user_registration"), true),
    track_wizard_engagement: parseAnalyticsBooleanSetting(read("track_wizard_engagement"), true),
    track_catalog_commerce: parseAnalyticsBooleanSetting(read("track_catalog_commerce"), true),
    track_proposal_lifecycle: parseAnalyticsBooleanSetting(read("track_proposal_lifecycle"), true),
    track_service_commerce: parseAnalyticsBooleanSetting(read("track_service_commerce"), true),
    track_support_engagement: parseAnalyticsBooleanSetting(read("track_support_engagement"), true),
    umamiUrl: read(
      "umami_url",
      process.env.NEXT_PUBLIC_UMAMI_URL || process.env.UMAMI_URL || "https://umami.solar-dream.org",
    ).replace(/\/$/, ""),
    umamiWebsiteId: read(
      "umami_website_id",
      process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID || process.env.UMAMI_WEBSITE_ID || "",
    ),
  };
}

export async function updateAnalyticsFlag(
  key: AnalyticsFlagKey,
  value: boolean,
): Promise<{ success: boolean; error?: string }> {
  if (!ANALYTICS_FLAG_KEYS.includes(key)) {
    return { success: false, error: "Unsupported analytics flag." };
  }

  const result = await saveSystemSetting(key, String(value));
  if (result.success) {
    revalidateTag(ANALYTICS_CONFIG_CACHE_TAG, "max");
    revalidatePath("/admin/settings/analytics");
    revalidatePath("/", "layout");
  }
  return result;
}

/**
 * Saves or updates a system setting by key. Secured with admin role check.
 */
export async function saveSystemSetting(
  key: string,
  value: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Enforce admin role check
    await checkAdmin();

    // 2. Upsert key-value pair in Supabase system_settings
    const supabase = createAdminClient();
    const { error } = await supabase
      .from("system_settings")
      .upsert(
        { 
          key, 
          value, 
          updated_at: new Date().toISOString() 
        }, 
        { onConflict: "key" }
      );

    if (error) {
      console.error("[System Settings Action] Supabase setting upsert failed:", error);
      throw new Error("Failed to save setting");
    }

    // 3. Revalidate path to refresh cache
    revalidatePath("/admin/settings");
    if (key === "website_settings") {
      revalidateTag("website-settings", "max");
      revalidatePath("/", "layout");
    }
    if (key === "localization_config") {
      revalidateTag(LOCALIZATION_CONFIG_CACHE_TAG, "max");
    }
    if (isAnalyticsConfigSettingKey(key)) {
      revalidateTag(ANALYTICS_CONFIG_CACHE_TAG, "max");
    }
    if (key === "navigation_translations" || key === "navigation_locale_templates") {
      revalidateTag(NAVIGATION_CACHE_TAG, "max");
    }
    
    return { success: true };
  } catch (err: unknown) {
    console.error(`[System Settings Action] Failed to save setting for key ${key}:`, err);
    return { success: false, error: getPublicSettingsError(err, "Failed to save setting") };
  }
}

/**
 * Saves or updates multiple system settings in one admin-guarded operation.
 */
export async function saveSystemSettings(
  entries: { key: string; value: string }[]
): Promise<{ success: boolean; error?: string }> {
  try {
    await checkAdmin();

    const payload = entries
      .map((entry) => ({
        key: entry.key,
        value: entry.value,
        updated_at: new Date().toISOString(),
      }))
      .filter((entry) => entry.key.trim().length > 0);

    if (payload.length === 0) {
      return { success: true };
    }

    const supabase = createAdminClient();
    const { error } = await supabase
      .from("system_settings")
      .upsert(payload, { onConflict: "key" });

    if (error) {
      console.error("[System Settings Action] Supabase settings batch upsert failed:", error);
      throw new Error("Failed to save system settings");
    }

    revalidatePath("/admin/settings");
    revalidatePath("/admin/crm");
    revalidatePath("/proposals");
    if (payload.some((entry) => entry.key === "website_settings")) {
      revalidateTag("website-settings", "max");
      revalidatePath("/", "layout");
    }
    if (payload.some((entry) => entry.key === "localization_config")) {
      revalidateTag(LOCALIZATION_CONFIG_CACHE_TAG, "max");
    }
    if (payload.some((entry) => isAnalyticsConfigSettingKey(entry.key))) {
      revalidateTag(ANALYTICS_CONFIG_CACHE_TAG, "max");
    }
    if (payload.some((entry) => entry.key === "navigation_translations" || entry.key === "navigation_locale_templates")) {
      revalidateTag(NAVIGATION_CACHE_TAG, "max");
    }

    return { success: true };
  } catch (err: unknown) {
    console.error("[System Settings Action] Failed to save system settings batch:", err);
    return { success: false, error: getPublicSettingsError(err, "Failed to save system settings") };
  }
}

/**
 * Trigger a catalog sync by calling the API endpoint locally.
 * Secured with admin role check.
 */
export async function triggerCatalogSync(): Promise<CatalogSyncResponse> {
  try {
    await checkAdmin();
    const result = await syncErpnextMasterData();
    revalidatePath("/wizard");
    revalidatePath("/build");
    revalidatePath("/catalog");
    revalidatePath("/admin/bundles");
    return {
      success: true,
      message: `Synced ${result.itemCount} ERPNext items and prices at ${new Date(result.syncedAt).toLocaleString()}.`,
      results: {
        newItems: [],
        updatedItems: [],
        archivedItems: [],
      },
      omittedProducts: [],
      logs: [
        `ERPNext catalog availability checked: ${result.itemCount} items (${result.activeItemCount} active).`,
        `Categories available in ERPNext: ${result.taxonomy?.categories.fetched ?? 0}.`,
        `Brands available in ERPNext: ${result.taxonomy?.brands.fetched ?? 0}.`,
        "No local catalog rows were written; ERPNext remains the source of truth.",
      ],
      summary: {
        totalRowsFound: result.itemCount,
        insertedCount: result.itemCount,
        updatedCount: 0,
        omittedCount: 0,
      },
      taxonomy: result.taxonomy,
      activeItemCount: result.activeItemCount,
    };

  } catch (err: unknown) {
    console.error("[System Settings Action] Failed to trigger catalog sync:", err);
    return { success: false, error: getPublicSettingsError(err, "Failed to trigger catalog sync") };
  }
}

export async function applyErpnextCatalogChanges(_data: {
  approvedNew: unknown[];
  approvedUpdated: unknown[];
  approvedArchived: unknown[];
}): Promise<{ success: boolean; error?: string; message?: string; paused?: boolean }> {
  void _data;

  try {
    await checkAdmin();
    return {
      success: true,
      paused: true,
      message: "Sync engine is temporarily paused due to business pivot",
    };
  } catch (err: unknown) {
    console.error("[System Settings Action] Failed to apply ERPNext catalog changes:", err);
    return {
      success: false,
      error: getPublicSettingsError(err, "Failed to apply ERPNext catalog changes"),
    };
  }
}

/**
 * Flags omitted products as archived (is_active = false) in Supabase.
 * Secured with admin role check.
 */
export async function archiveOmittedProducts(
  productsList: { id: string; table: string }[]
): Promise<{ success: boolean; error?: string }> {
  void productsList;
  await checkAdmin();
  return {
    success: false,
    error: "Local catalog archival is disabled. Archive the ERPNext Item in ERPNext instead.",
  };

  /*
   * Retained only as historical reference. ERPNext owns catalog state and this
   * implementation is intentionally not part of the executable module.
   *
  try {
    // 1. Enforce admin check
    await checkAdmin();

    if (!productsList || productsList.length === 0) {
      return { success: true };
    }

    const supabase = createAdminClient();

    // 2. Group by table
    const groups: Record<string, string[]> = {};
    for (const p of productsList) {
      const table = p.table.trim();
      const id = p.id.trim();
      if (!id || !isCatalogSourceTable(table)) {
        console.warn("[System Settings Action] Skipped omitted product archive with unsupported table.", {
          table,
          id,
        });
        continue;
      }
      if (!groups[table]) {
        groups[table] = [];
      }
      groups[table].push(id);
    }

    // 3. Update is_active = false for each table group
    for (const [table, ids] of Object.entries(groups)) {
      const { error } = await supabase
        .from(table)
        .update({ is_active: false })
        .in("id", ids);

      if (error) {
        console.error(`[System Settings Action] Supabase archive failed for table "${table}":`, error);
        throw new Error("Failed to archive omitted products");
      }
    }

    // 4. Cascade deactivate affected proposals
    const productIds = Object.values(groups).flat();
    const { deactivateProposalsForProducts } = await import("./proposals");
    await deactivateProposalsForProducts(productIds);

    // 5. Revalidate settings path
    revalidatePath("/admin/settings");

    return { success: true, error: undefined };
  } catch (err: unknown) {
    console.error("[System Settings Action] Failed to archive omitted products:", err);
    return { success: false, error: getPublicSettingsError(err, "Failed to archive omitted products") };
  }
  */
}

/**
 * Commits the approved catalog staging sync changes to both Supabase and PostgreSQL (via Drizzle) databases.
 * Secured with admin role check.
 */
export async function confirmCatalogSync(data: {
  approvedNew: unknown[];
  approvedUpdated: unknown[];
  approvedOmitted: unknown[];
}): Promise<{ success: boolean; error?: string }> {
  void data;
  await checkAdmin();
  return {
    success: false,
    error: "Local catalog commits are disabled. Create or update Items and Product Bundles in ERPNext instead.",
  };

  /*
   * Retained only as historical reference. ERPNext owns catalog state and this
   * implementation is intentionally not part of the executable module.
   *
  try {
    // 1. Enforce admin role check
    await checkAdmin();

    const approvedNew = normalizeCatalogStagingItems(data.approvedNew);
    const approvedUpdated = normalizeCatalogStagingItems(data.approvedUpdated);
    const approvedOmitted = normalizeCatalogStagingItems(data.approvedOmitted);
    const supabase = createAdminClient();

    // Helper to map tables to category slugs
    function getCategorySlug(table: string): string {
      if (table === 'solar_panels') return 'solar-panels';
      if (table === 'inverters') return 'inverters';
      if (table === 'racking_components') return 'racking-components';
      return 'other';
    }

    function getCategoryName(table: string): string {
      if (table === 'solar_panels') return 'Solar Panels Selection';
      if (table === 'inverters') return 'Inverters Selection';
      if (table === 'racking_components') return 'Racking Components';
      return 'Other Components';
    }

    function slugify(text: string): string {
      return text
        .toLowerCase()
        .trim()
        .replace(/[\s/\\(),.฿$]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
    }

    // Helper to parse dimensions and power from specs
    function extractSpecs(specs: JsonRecord) {
      let physicalWidth: number | null = null;
      let physicalLength: number | null = null;
      let wattageCapacity: number | null = null;

      for (const [k, v] of Object.entries(specs)) {
        const key = k.toLowerCase();
        const numVal = parseFloat(String(v));
        if (!isNaN(numVal)) {
          if (key.includes('width')) {
            physicalWidth = numVal;
          } else if (key.includes('length')) {
            physicalLength = numVal;
          } else if (key.includes('power') || key.includes('watt') || key.includes('capacity')) {
            wattageCapacity = Math.round(numVal);
          }
        }
      }
      return { physicalWidth, physicalLength, wattageCapacity };
    }

    // Group new and updated items by table for bulk/sequential Supabase write
    const itemsToUpsert = [...approvedNew, ...approvedUpdated];
    const supabaseGroups: Partial<Record<(typeof CATALOG_SOURCE_TABLES)[number], JsonRecord[]>> = {};
    for (const item of itemsToUpsert) {
      if (!supabaseGroups[item.table]) {
        supabaseGroups[item.table] = [];
      }
      // Prepare clean payload for Supabase (no table, tab, changes, rowIndex, is_active, etc.)
      const supabasePayload: JsonRecord = {
        id: item.id,
        brand: item.brand ?? "",
        model: item.model ?? "",
        price: item.price ?? 0,
        stock: item.stock ?? 0,
        image_url: item.image_url ?? "",
        tech_specs: item.tech_specs,
      };
      const rows = supabaseGroups[item.table] ?? [];
      rows.push({
        ...supabasePayload,
        is_active: true
      });
      supabaseGroups[item.table] = rows;
    }

    // Upsert into Supabase tables
    for (const [table, rows] of Object.entries(supabaseGroups)) {
      if (rows.length === 0) continue;
      const { error } = await supabase
        .from(table)
        .upsert(rows, { onConflict: 'id' });

      if (error) {
        console.error(`[System Settings Action] Supabase catalog upsert failed for table "${table}":`, error);
        throw new Error("Failed to upsert catalog items");
      }
    }

    // Now upsert into Category and Product models via Drizzle
    for (const item of itemsToUpsert) {
      const specs = item.tech_specs || {};
      
      // Resolve custom category name from Google Sheet, or fallback to default table mapping
      const catName = getText(specs.category) || getCategoryName(item.table);
      const slug = getText(specs.category) ? slugify(catName) : getCategorySlug(item.table);

      // Query category by name or slug first to prevent unique constraint conflicts
      let category = await db.query.categories.findFirst({
        where: or(
          eq(categories.name, catName),
          eq(categories.slug, slug)
        )
      });

      if (!category) {
        const [newCategory] = await db.insert(categories)
          .values({
            name: catName,
            slug,
            description: `Automated synced ${catName}`,
            displayOrder: slug === 'solar-panels' ? 3 : slug === 'inverters' ? 4 : slug === 'racking-components' ? 5 : 10,
          })
          .returning();
        category = newCategory;
      }
      if (!category) {
        throw new Error(`Unable to resolve local legacy category for ${catName}.`);
      }
      const resolvedCategory = category!;

      const { physicalWidth, physicalLength, wattageCapacity } = extractSpecs(specs);

      const useInRec = specs.use_in_recommendation !== undefined ? Boolean(specs.use_in_recommendation) : true;
      const recTier = getText(specs.recommend_tier ?? specs.tier) || null;
      const recPriority = getNumber(specs.recommend_priority ?? specs.priority, 0);

      const existingProduct = await db.query.products.findFirst({
        where: eq(products.id, item.id)
      });

      const productPayload = {
        brand: item.brand || "",
        model: item.model || "",
        price: item.price ?? 0,
        imageUrl: item.image_url || "https://images.unsplash.com/photo-1509391366360-2e959784a276?auto=format&fit=crop&q=80&w=400",
        description: getText(specs.description) || `${item.brand || ""} ${item.model || ""}`.trim(),
        isActive: true,
        categoryId: resolvedCategory.id,
        metadata: specs,
        physicalWidth,
        physicalLength,
        wattageCapacity,
        useInRecommendation: useInRec,
        recommendTier: recTier,
        recommendPriority: recPriority,
        stockStatus: deriveProductStockStatus(item.stock ?? 0, item.stockStatus ?? item.stock_status ?? specs.stockStatus ?? specs.stock_status),
        ctaType: normalizeProductCtaType(item.ctaType ?? item.cta_type ?? specs.ctaType ?? specs.cta_type),
      };

      if (existingProduct) {
        await db.update(products)
          .set(productPayload)
          .where(eq(products.id, item.id));
      } else {
        await db.insert(products)
          .values({
            id: item.id,
            ...productPayload
          });
      }
    }

    // Process approved omitted/archive items
    if (approvedOmitted.length > 0) {
      const omittedGroups: Record<string, string[]> = {};
      for (const p of approvedOmitted) {
        if (!omittedGroups[p.table]) {
          omittedGroups[p.table] = [];
        }
        omittedGroups[p.table].push(p.id);
      }

      // 1. Deactivate in Supabase
      for (const [table, ids] of Object.entries(omittedGroups)) {
        const { error } = await supabase
          .from(table)
          .update({ is_active: false })
          .in("id", ids);

        if (error) {
          console.error(`[System Settings Action] Supabase omitted archive failed for table "${table}":`, error);
          throw new Error("Failed to archive omitted products");
        }
      }

      // 2. Deactivate in PostgreSQL
      const omittedIds = approvedOmitted.map(p => p.id);
      await db.update(products)
        .set({ isActive: false })
        .where(inArray(products.id, omittedIds));

      // 3. Cascade deactivate affected proposals
      const { deactivateProposalsForProducts } = await import("./proposals");
      await deactivateProposalsForProducts(omittedIds);
    }

    // For updated items, we also run cascading proposal deactivation to warn users about altered pricing/specs!
    const updatedIds = approvedUpdated.map(p => p.id);
    if (updatedIds.length > 0) {
      const { deactivateProposalsForProducts } = await import("./proposals");
      await deactivateProposalsForProducts(updatedIds);
    }

    // 3.5 Write back generated IDs and status back to Google Sheets if available
    const { data: settingData } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'catalog_spreadsheet_id')
      .maybeSingle();
    const spreadsheetId = settingData?.value;

    if (spreadsheetId) {
      try {
        const { fetchAllTabsData, updateSheetProducts } = await import("@/lib/googleSheets");
        const rawData = await fetchAllTabsData(spreadsheetId);
        
        // Group updates by tab
        const tabUpdates: Record<string, { rowIndex: number; id: string; isActive: boolean }[]> = {};
        const allApproved = [...approvedNew, ...approvedUpdated];
        
        for (const item of allApproved) {
          const tab = String(item.tab ?? "").trim();
          const rowIndex = Number(item.rowIndex);
          if (!tab || !Number.isInteger(rowIndex)) continue;
          if (!tabUpdates[tab]) {
            tabUpdates[tab] = [];
          }
          tabUpdates[tab].push({
            rowIndex,
            id: item.id,
            isActive: true
          });
        }

        for (const [tab, updates] of Object.entries(tabUpdates)) {
          const rows = rawData[tab];
          if (rows && rows.length > 0) {
            await updateSheetProducts(spreadsheetId, tab, rows, updates);
          }
        }
      } catch (err) {
        console.error("[System Settings Action] Google Sheets write-back failed:", err);
      }
    }

    // 4. Revalidate target paths
    revalidatePath("/admin/settings");
    revalidatePath("/admin/products");
    revalidatePath("/catalog");
    revalidatePath("/build");

    return { success: true };
  } catch (err: unknown) {
    console.error("[System Settings Action] confirmCatalogSync failed:", err);
    return { success: false, error: getPublicSettingsError(err, "Failed to save staging changes") };
  }
  */
}
