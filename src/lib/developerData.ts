import "server-only";

import { asc, desc, eq, inArray } from "drizzle-orm";
import { revalidatePath, revalidateTag } from "next/cache";

import { db } from "@/db";
import {
  featureFlags,
  globalBanners,
  serviceFeeConfigs,
  serviceSystemOptions,
  systemSettingsKeyValue,
  type LocalizedServiceText,
} from "@/db/schema";
import { recordAuditEventBestEffort } from "@/lib/auditLog";
import { locales } from "@/i18n/locales";
import {
  getGlobalBannerFallbackMessage,
  normalizeGlobalBannerTranslations,
  parseGlobalBannerDate,
  validateGlobalBannerSchedule,
} from "@/lib/globalBanner";

export type DeveloperDataFieldKind = "text" | "textarea" | "number" | "boolean" | "json";

export type DeveloperDataField = {
  key: string;
  label: string;
  kind: DeveloperDataFieldKind;
  required?: boolean;
};

export type DeveloperDataResource =
  | "feature_flags"
  | "system_settings"
  | "service_system_options"
  | "service_fee_configs"
  | "global_banners";

export type DeveloperDataResourceDefinition = {
  id: DeveloperDataResource;
  label: string;
  description: string;
  fields: readonly DeveloperDataField[];
};

export const DEVELOPER_DATA_RESOURCES: readonly DeveloperDataResourceDefinition[] = [
  {
    id: "feature_flags",
    label: "Feature flags",
    description: "Runtime modules that can be enabled or placed into maintenance mode.",
    fields: [
      { key: "key", label: "Key", kind: "text", required: true },
      { key: "name", label: "Name", kind: "text", required: true },
      { key: "description", label: "Description", kind: "textarea" },
      { key: "isActive", label: "Active", kind: "boolean" },
    ],
  },
  {
    id: "system_settings",
    label: "System settings",
    description: "Key/value configuration consumed by server integrations and runtime behavior.",
    fields: [
      { key: "key", label: "Key", kind: "text", required: true },
      { key: "value", label: "Value", kind: "textarea", required: true },
    ],
  },
  {
    id: "service_system_options",
    label: "Service options",
    description: "Localized inverter brands and roof types used by the service configurator.",
    fields: [
      { key: "kind", label: "Kind", kind: "text", required: true },
      { key: "code", label: "Code", kind: "text", required: true },
      { key: "label", label: "Localized label JSON", kind: "json", required: true },
      { key: "sortOrder", label: "Sort order", kind: "number" },
      { key: "isActive", label: "Active", kind: "boolean" },
      { key: "metadata", label: "Metadata JSON", kind: "json" },
    ],
  },
  {
    id: "service_fee_configs",
    label: "Service fees",
    description: "Service fee rows used when creating service quotations.",
    fields: [
      { key: "name", label: "Name", kind: "text", required: true },
      { key: "erpItemCode", label: "ERPNext item code", kind: "text", required: true },
      { key: "basePrice", label: "Base price", kind: "number", required: true },
      { key: "isActive", label: "Active", kind: "boolean" },
    ],
  },
  {
    id: "global_banners",
    label: "Global banners",
    description: "Announcement banners shown across the customer-facing application.",
    fields: [
      { key: "message", label: "Message", kind: "textarea", required: true },
      { key: "type", label: "Type", kind: "text", required: true },
      { key: "linkUrl", label: "Link URL", kind: "text" },
      { key: "translations", label: "Localized content JSON", kind: "json" },
      { key: "startsAt", label: "Starts at (ISO date)", kind: "text" },
      { key: "endsAt", label: "Ends at (ISO date)", kind: "text" },
      { key: "sortOrder", label: "Sort order", kind: "number" },
      { key: "isActive", label: "Active", kind: "boolean" },
    ],
  },
];

export type DeveloperDataPrimitive = string | number | boolean | null;
export type DeveloperDataValue = DeveloperDataPrimitive | DeveloperDataValue[] | { [key: string]: DeveloperDataValue };
export type DeveloperDataRow = { id: string; values: Record<string, DeveloperDataValue>; updatedAt: string | null };

type DataInput = Record<string, unknown>;

export class DeveloperDataValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeveloperDataValidationError";
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asText(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function asBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  const result = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(result) ? result : fallback;
}

function asJsonObject(value: unknown) {
  const record = asRecord(value);
  return Object.fromEntries(Object.entries(record).map(([key, item]) => [key, toDeveloperDataValue(item)]));
}

function toDeveloperDataValue(value: unknown): DeveloperDataValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toDeveloperDataValue);
  if (typeof value === "object") return asJsonObject(value);
  return String(value);
}

function row(id: string, values: Record<string, unknown>, updatedAt: Date | null | undefined): DeveloperDataRow {
  return { id, values: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, toDeveloperDataValue(value)])), updatedAt: updatedAt?.toISOString() || null };
}

export function getDeveloperDataResourceDefinitions() {
  return DEVELOPER_DATA_RESOURCES;
}

export async function getDeveloperDataRows(resource: DeveloperDataResource, search = "") {
  const query = search.trim().toLowerCase();
  const filterRows = (rows: DeveloperDataRow[]) => query.length === 0
    ? rows
    : rows.filter((item) => JSON.stringify(item.values).toLowerCase().includes(query));

  switch (resource) {
    case "feature_flags": {
      const rows = await db.query.featureFlags.findMany({ orderBy: [asc(featureFlags.key)], limit: 250 });
      return filterRows(rows.map((item) => row(item.key, { key: item.key, name: item.name, description: item.description, isActive: item.isActive }, item.updatedAt)));
    }
    case "system_settings": {
      const rows = await db.query.systemSettingsKeyValue.findMany({ orderBy: [asc(systemSettingsKeyValue.key)], limit: 250 });
      return filterRows(rows.map((item) => row(item.key, { key: item.key, value: item.value }, item.updatedAt)));
    }
    case "service_system_options": {
      const rows = await db.query.serviceSystemOptions.findMany({ orderBy: [asc(serviceSystemOptions.kind), asc(serviceSystemOptions.sortOrder)], limit: 250 });
      return filterRows(rows.map((item) => row(item.id, { kind: item.kind, code: item.code, label: item.label, sortOrder: item.sortOrder, isActive: item.isActive, metadata: item.metadata }, item.updatedAt)));
    }
    case "service_fee_configs": {
      const rows = await db.query.serviceFeeConfigs.findMany({ orderBy: [desc(serviceFeeConfigs.isActive), desc(serviceFeeConfigs.createdAt)], limit: 250 });
      return filterRows(rows.map((item) => row(item.id, { name: item.name, erpItemCode: item.erpItemCode, basePrice: item.basePrice, isActive: item.isActive }, item.createdAt)));
    }
    case "global_banners": {
      const rows = await db.query.globalBanners.findMany({ orderBy: [desc(globalBanners.createdAt)], limit: 250 });
      return filterRows(rows.map((item) => row(item.id, {
        message: item.message,
        type: item.type,
        linkUrl: item.linkUrl,
        translations: item.translations,
        startsAt: item.startsAt,
        endsAt: item.endsAt,
        sortOrder: item.sortOrder,
        isActive: item.isActive,
      }, item.createdAt)));
    }
  }
}

function requireValue(input: DataInput, key: string) {
  const value = input[key];
  if (typeof value === "string" && value.trim()) return value.trim();
  throw new DeveloperDataValidationError(`${key} is required.`);
}

function parseJsonField(input: DataInput, key: string) {
  const value = input[key];
  if (value === undefined || value === null || value === "") return {};
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string") throw new DeveloperDataValidationError(`${key} must be a JSON object.`);
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new DeveloperDataValidationError(`${key} must contain a JSON object.`);
    return parsed as Record<string, unknown>;
  } catch {
    throw new DeveloperDataValidationError(`${key} must contain valid JSON.`);
  }
}

function normalizeKey(value: string) {
  const key = value.trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,119}$/.test(key)) throw new DeveloperDataValidationError("Keys may contain letters, numbers, dots, underscores, colons, and hyphens.");
  return key;
}

const PROTECTED_SYSTEM_KEYS = new Set([
  "portal_token_secret",
  "cron_secret",
  "erp_installation_webhook_secret",
  "erp_lifecycle_webhook_secret",
]);

const GLOBAL_BANNER_TYPES = new Set(["INFO", "PROMO", "NEW", "WARNING", "ALERT"]);

function revalidateAdminPath(path: string) {
  for (const locale of locales) {
    revalidatePath(`/${locale}${path}`);
  }
}

function revalidateDeveloperDataResource(resource: DeveloperDataResource) {
  revalidateAdminPath("/admin/settings/data");

  switch (resource) {
    case "feature_flags":
      revalidatePath("/", "layout");
      revalidateAdminPath("/admin/settings/feature-toggles");
      return;
    case "system_settings":
      revalidatePath("/", "layout");
      revalidateAdminPath("/admin/settings");
      return;
    case "service_system_options":
      revalidateAdminPath("/admin/services");
      revalidateAdminPath("/admin/settings");
      revalidateAdminPath("/services");
      return;
    case "service_fee_configs":
      revalidateAdminPath("/admin/settings");
      revalidateAdminPath("/admin/settings/quotation");
      revalidateAdminPath("/admin/crm");
      return;
    case "global_banners":
      revalidatePath("/", "layout");
      revalidateTag("global-banner", "max");
      revalidateAdminPath("/admin/notifications");
      return;
  }
}

function normalizeBannerType(value: unknown) {
  const type = requireValue({ type: value }, "type").toUpperCase();
  if (!GLOBAL_BANNER_TYPES.has(type)) {
    throw new DeveloperDataValidationError("Banner type is not supported.");
  }
  return type;
}

export async function saveDeveloperData(input: { resource: DeveloperDataResource; id?: string; values: DataInput; actorUserId: string }) {
  const values = input.values;
  const existingId = input.id?.trim() || null;
  let id = existingId;

  switch (input.resource) {
    case "feature_flags": {
      const key = normalizeKey(requireValue(values, "key"));
      const payload = {
        key,
        name: requireValue(values, "name").slice(0, 160),
        description: asText(values.description).slice(0, 1000) || null,
        isActive: asBoolean(values.isActive, true),
        updatedAt: new Date(),
      };
      if (existingId) {
        const [updated] = await db
          .update(featureFlags)
          .set(payload)
          .where(eq(featureFlags.key, existingId))
          .returning({ key: featureFlags.key });
        if (!updated) throw new DeveloperDataValidationError("Feature flag row was not found.");
      } else {
        const [created] = await db.insert(featureFlags).values(payload).returning({ key: featureFlags.key });
        if (!created) throw new Error("Feature flag row could not be created.");
      }
      id = key;
      break;
    }
    case "system_settings": {
      const key = normalizeKey(requireValue(values, "key"));
      if (existingId && existingId !== key) {
        throw new DeveloperDataValidationError("System setting keys cannot be changed. Create a new key instead.");
      }
      const value = requireValue(values, "value");
      const [saved] = await db
        .insert(systemSettingsKeyValue)
        .values({ key, value, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: systemSettingsKeyValue.key,
          set: { value, updatedAt: new Date() },
        })
        .returning({ key: systemSettingsKeyValue.key });
      if (!saved) throw new Error("System setting could not be saved.");
      id = saved.key;
      break;
    }
    case "service_system_options": {
      const kind = requireValue(values, "kind").toUpperCase();
      if (kind !== "INVERTER_BRAND" && kind !== "ROOF_TYPE") {
        throw new DeveloperDataValidationError("Service option kind must be INVERTER_BRAND or ROOF_TYPE.");
      }
      const code = normalizeKey(requireValue(values, "code")).toUpperCase();
      const rawLabel = parseJsonField(values, "label");
      if (typeof rawLabel.en !== "string" || typeof rawLabel.th !== "string") {
        throw new DeveloperDataValidationError("Localized label JSON must include en and th strings.");
      }
      const label: LocalizedServiceText = {
        en: rawLabel.en.slice(0, 500),
        th: rawLabel.th.slice(0, 500),
      };
      const payload = {
        kind,
        code,
        label,
        sortOrder: Math.trunc(asNumber(values.sortOrder)),
        isActive: asBoolean(values.isActive, true),
        metadata: parseJsonField(values, "metadata"),
        updatedAt: new Date(),
      };
      if (existingId) {
        const [updated] = await db
          .update(serviceSystemOptions)
          .set(payload)
          .where(eq(serviceSystemOptions.id, existingId))
          .returning({ id: serviceSystemOptions.id });
        if (!updated) throw new DeveloperDataValidationError("Service option row was not found.");
        id = updated.id;
      } else {
        const [created] = await db
          .insert(serviceSystemOptions)
          .values(payload)
          .returning({ id: serviceSystemOptions.id });
        id = created?.id || null;
      }
      break;
    }
    case "service_fee_configs": {
      const payload = {
        name: requireValue(values, "name").slice(0, 160),
        erpItemCode: requireValue(values, "erpItemCode").slice(0, 120),
        basePrice: Math.max(0, asNumber(values.basePrice)),
        isActive: asBoolean(values.isActive, true),
      };
      if (existingId) {
        const [updated] = await db
          .update(serviceFeeConfigs)
          .set(payload)
          .where(eq(serviceFeeConfigs.id, existingId))
          .returning({ id: serviceFeeConfigs.id });
        if (!updated) throw new DeveloperDataValidationError("Service fee row was not found.");
        id = updated.id;
      } else {
        const [created] = await db
          .insert(serviceFeeConfigs)
          .values(payload)
          .returning({ id: serviceFeeConfigs.id });
        id = created?.id || null;
      }
      break;
    }
    case "global_banners": {
      const translations = normalizeGlobalBannerTranslations(parseJsonField(values, "translations"));
      const message = getGlobalBannerFallbackMessage(asText(values.message), translations);
      if (!message) throw new DeveloperDataValidationError("message or a localized message is required.");
      const startsAt = parseGlobalBannerDate(values.startsAt, "startsAt");
      const endsAt = parseGlobalBannerDate(values.endsAt, "endsAt");
      validateGlobalBannerSchedule(startsAt, endsAt);
      const payload = {
        message: message.slice(0, 1000),
        type: normalizeBannerType(values.type),
        linkUrl: asText(values.linkUrl).slice(0, 2048) || null,
        translations,
        startsAt,
        endsAt,
        sortOrder: Math.trunc(asNumber(values.sortOrder)),
        isActive: asBoolean(values.isActive, false),
      };
      if (existingId) {
        const [updated] = await db
          .update(globalBanners)
          .set(payload)
          .where(eq(globalBanners.id, existingId))
          .returning({ id: globalBanners.id });
        if (!updated) throw new DeveloperDataValidationError("Global banner row was not found.");
        id = updated.id;
      } else {
        const [created] = await db
          .insert(globalBanners)
          .values(payload)
          .returning({ id: globalBanners.id });
        id = created?.id || null;
      }
      break;
    }
  }

  if (!id) throw new Error("Data row could not be saved.");
  revalidateDeveloperDataResource(input.resource);
  await recordAuditEventBestEffort({
    actorUserId: input.actorUserId,
    actorType: "ADMIN",
    action: existingId ? "DEVELOPER_DATA_UPDATED" : "DEVELOPER_DATA_CREATED",
    resourceType: input.resource,
    resourceId: id,
  });
  return id;
}

type DeleteDeveloperDataInput = {
  resource: DeveloperDataResource;
  ids: string[];
  actorUserId: string;
};

export async function deleteDeveloperDataRows(input: DeleteDeveloperDataInput) {
  const ids = [...new Set(input.ids.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) throw new DeveloperDataValidationError("At least one data row ID is required.");
  if (ids.length > 100) throw new DeveloperDataValidationError("You can delete up to 100 rows at once.");

  if (input.resource === "system_settings") {
    const protectedKey = ids.find((id) => PROTECTED_SYSTEM_KEYS.has(id));
    if (protectedKey) {
      throw new DeveloperDataValidationError(`Security-critical setting '${protectedKey}' cannot be deleted from the console.`);
    }
  }

  let deletedIds: string[] = [];
  switch (input.resource) {
    case "feature_flags": {
      const deleted = await db
        .delete(featureFlags)
        .where(inArray(featureFlags.key, ids))
        .returning({ id: featureFlags.key });
      deletedIds = deleted.map((item) => item.id);
      break;
    }
    case "system_settings": {
      const deleted = await db
        .delete(systemSettingsKeyValue)
        .where(inArray(systemSettingsKeyValue.key, ids))
        .returning({ id: systemSettingsKeyValue.key });
      deletedIds = deleted.map((item) => item.id);
      break;
    }
    case "service_system_options": {
      const deleted = await db
        .delete(serviceSystemOptions)
        .where(inArray(serviceSystemOptions.id, ids))
        .returning({ id: serviceSystemOptions.id });
      deletedIds = deleted.map((item) => item.id);
      break;
    }
    case "service_fee_configs": {
      const deleted = await db
        .delete(serviceFeeConfigs)
        .where(inArray(serviceFeeConfigs.id, ids))
        .returning({ id: serviceFeeConfigs.id });
      deletedIds = deleted.map((item) => item.id);
      break;
    }
    case "global_banners": {
      const deleted = await db
        .delete(globalBanners)
        .where(inArray(globalBanners.id, ids))
        .returning({ id: globalBanners.id });
      deletedIds = deleted.map((item) => item.id);
      break;
    }
  }

  if (deletedIds.length === 0) {
    throw new DeveloperDataValidationError("No matching data rows were found.");
  }

  revalidateDeveloperDataResource(input.resource);
  await recordAuditEventBestEffort({
    actorUserId: input.actorUserId,
    actorType: "ADMIN",
    action: "DEVELOPER_DATA_DELETED",
    resourceType: input.resource,
    resourceId: deletedIds.slice(0, 20).join(","),
    metadata: { requestedCount: ids.length, deletedCount: deletedIds.length },
  });

  return { deletedIds, count: deletedIds.length };
}

export async function deleteDeveloperData(input: { resource: DeveloperDataResource; id: string; actorUserId: string }) {
  return deleteDeveloperDataRows({
    resource: input.resource,
    ids: [input.id],
    actorUserId: input.actorUserId,
  });
}
