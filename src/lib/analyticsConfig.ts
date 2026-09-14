export const ANALYTICS_FLAG_KEYS = [
  "analytics_enabled",
  "track_acquisition_engagement",
  "track_user_registration",
  "track_wizard_engagement",
  "track_catalog_commerce",
  "track_proposal_lifecycle",
  "track_service_commerce",
  "track_support_engagement",
] as const;

export const ANALYTICS_CONFIG_SETTING_KEYS = [
  ...ANALYTICS_FLAG_KEYS,
  "umami_url",
  "umami_website_id",
] as const;

export type AnalyticsFlagKey = (typeof ANALYTICS_FLAG_KEYS)[number];

export function isAnalyticsConfigSettingKey(value: string): boolean {
  return ANALYTICS_CONFIG_SETTING_KEYS.includes(
    value as (typeof ANALYTICS_CONFIG_SETTING_KEYS)[number],
  );
}

export type AnalyticsConfig = Record<AnalyticsFlagKey, boolean> & {
  umamiUrl: string;
  umamiWebsiteId: string;
};

export function parseAnalyticsBooleanSetting(value: string | null, fallback = true) {
  if (value === null) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on", "enabled"].includes(normalized)) return true;
  if (["false", "0", "no", "off", "disabled"].includes(normalized)) return false;
  return fallback;
}
