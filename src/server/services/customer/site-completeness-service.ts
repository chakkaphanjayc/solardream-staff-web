import "server-only";

export const SITE_HANDOFF_FIELDS = ["label", "addressLine1", "city", "province", "postalCode", "country", "latitude", "longitude"] as const;
export type SiteHandoffField = (typeof SITE_HANDOFF_FIELDS)[number];
export type SiteCompletenessClassification = "COMPLETE" | "INCOMPLETE" | "PLACEHOLDER" | "INVALID";

export interface SiteCompletenessInput {
  label: string | null; addressLine1: string | null; city: string | null; province: string | null;
  postalCode: string | null; country: string | null; latitude: number | null; longitude: number | null;
}

const DEFAULT_REQUIRED_FIELDS: SiteHandoffField[] = ["label", "addressLine1", "city", "province", "postalCode", "country"];
const PLACEHOLDERS = new Set(["address pending site review", "site details pending", "installation site", "pending", "unknown", "n/a", "na", "tbd", "-"]);

function isField(value: string): value is SiteHandoffField {
  return (SITE_HANDOFF_FIELDS as readonly string[]).includes(value);
}

export function configuredSiteHandoffFields(value = process.env.SITE_PROJECT_REQUIRED_FIELDS): SiteHandoffField[] {
  if (!value?.trim()) return [...DEFAULT_REQUIRED_FIELDS];
  const fields = [...new Set(value.split(",").map((field) => field.trim()).filter(Boolean))];
  const unknown = fields.filter((field) => !isField(field));
  if (unknown.length) throw new Error(`Unknown SITE_PROJECT_REQUIRED_FIELDS: ${unknown.join(", ")}`);
  if (!fields.length) throw new Error("SITE_PROJECT_REQUIRED_FIELDS must contain at least one field.");
  return fields as SiteHandoffField[];
}

export function classifySiteCompleteness(site: SiteCompletenessInput, requiredFields = configuredSiteHandoffFields()) {
  const missingFields = requiredFields.filter((field) => site[field] === null || (typeof site[field] === "string" && !site[field].trim()));
  const placeholderFields = requiredFields.filter((field) => typeof site[field] === "string" && PLACEHOLDERS.has(String(site[field]).trim().toLowerCase()));
  const invalidFields: SiteHandoffField[] = [];
  if (site.latitude !== null && (!Number.isFinite(site.latitude) || site.latitude < -90 || site.latitude > 90)) invalidFields.push("latitude");
  if (site.longitude !== null && (!Number.isFinite(site.longitude) || site.longitude < -180 || site.longitude > 180)) invalidFields.push("longitude");
  if ((requiredFields.includes("latitude") || requiredFields.includes("longitude")) && (site.latitude === null) !== (site.longitude === null)) {
    if (site.latitude === null) invalidFields.push("latitude");
    if (site.longitude === null) invalidFields.push("longitude");
  }
  const classification: SiteCompletenessClassification = invalidFields.length ? "INVALID" : placeholderFields.length ? "PLACEHOLDER" : missingFields.length ? "INCOMPLETE" : "COMPLETE";
  return { classification, readyForProjectCreation: classification === "COMPLETE", requiredFields: [...requiredFields], missingFields, placeholderFields, invalidFields };
}
