import "server-only";

import { unstable_cache } from "next/cache";

import { getSystemSetting } from "@/app/actions/systemSettings";
import { frappeRequest } from "@/lib/erpnext";
import {
  DEFAULT_WEBSITE_SETTINGS,
  websiteSettingsSchema,
  type WebsiteSettings,
} from "@/lib/websiteSettingsTypes";
import type { Locale } from "@/i18n/locales";

export const WEBSITE_SETTINGS_CACHE_TAG = "website-settings";
export const WEBSITE_SETTINGS_KEY = "website_settings";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseJson(value: string | null) {
  if (!value?.trim()) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

const ERP_WEBSITE_SETTING_FIELDS = [
  "company_name",
  "company_description",
  "tax_id",
  "address",
  "phone",
  "email",
  "social_links",
  "footer_navigation",
  "cookie_title",
  "cookie_message",
  "essential_btn_text",
  "accept_all_btn_text",
  "manage_preferences_text",
] as const;

function hasRecognizedWebsiteSettingsField(value: JsonRecord) {
  return ERP_WEBSITE_SETTING_FIELDS.some((field) => field in value);
}

function normalizeWebsiteSettings(value: unknown, options: { requireRecognizedFields?: boolean } = {}): WebsiteSettings | null {
  const direct = websiteSettingsSchema.safeParse(value);
  if (direct.success) return direct.data;
  if (!isRecord(value)) return null;
  if (options.requireRecognizedFields && !hasRecognizedWebsiteSettingsField(value)) return null;

  const mapped = {
    company: {
      companyName: text(value.company_name) || DEFAULT_WEBSITE_SETTINGS.company.companyName,
      companyDescription: text(value.company_description) || DEFAULT_WEBSITE_SETTINGS.company.companyDescription,
      taxId: text(value.tax_id),
      address: text(value.address),
      phone: text(value.phone),
      email: text(value.email),
    },
    socialLinks: Array.isArray(value.social_links)
      ? value.social_links.map((item) => {
          const row = isRecord(item) ? item : {};
          return {
            platform: text(row.platform),
            label: text(row.label) || text(row.platform),
            url: text(row.url),
            imageUrl: text(row.image_url) || text(row.imageUrl) || undefined,
            isActive: row.is_active !== false && row.isActive !== false,
          };
        })
      : DEFAULT_WEBSITE_SETTINGS.socialLinks,
    footerNavigation: Array.isArray(value.footer_navigation)
      ? value.footer_navigation.map((item) => {
          const row = isRecord(item) ? item : {};
          return {
            title: text(row.title),
            links: Array.isArray(row.links)
              ? row.links.map((link) => {
                  const linkRow = isRecord(link) ? link : {};
                  return { label: text(linkRow.label), href: text(linkRow.href) };
                })
              : [],
          };
        })
      : DEFAULT_WEBSITE_SETTINGS.footerNavigation,
    cookieConsent: {
      cookieTitle: text(value.cookie_title) || DEFAULT_WEBSITE_SETTINGS.cookieConsent.cookieTitle,
      cookieMessage: text(value.cookie_message) || DEFAULT_WEBSITE_SETTINGS.cookieConsent.cookieMessage,
      essentialButtonText: text(value.essential_btn_text) || DEFAULT_WEBSITE_SETTINGS.cookieConsent.essentialButtonText,
      acceptAllButtonText: text(value.accept_all_btn_text) || DEFAULT_WEBSITE_SETTINGS.cookieConsent.acceptAllButtonText,
      managePreferencesText: text(value.manage_preferences_text) || DEFAULT_WEBSITE_SETTINGS.cookieConsent.managePreferencesText,
    },
  };

  const parsed = websiteSettingsSchema.safeParse(mapped);
  return parsed.success ? parsed.data : null;
}

async function getErpnextWebsiteSettings() {
  try {
    const result = await frappeRequest("GET", "/api/resource/Website%20Settings/Website%20Settings");
    const root = isRecord(result.data) ? result.data : {};
    return normalizeWebsiteSettings(root.data, { requireRecognizedFields: true });
  } catch {
    // Silently fall back if ERPNext Website Settings is restricted (403) or unavailable
    return null;
  }
}

export async function getWebsiteSettings(): Promise<WebsiteSettings> {
  // First prioritize local database settings managed by Admin Console
  const localRaw = await getSystemSetting(WEBSITE_SETTINGS_KEY);
  const localParsed = normalizeWebsiteSettings(parseJson(localRaw));

  if (localParsed) {
    return localParsed;
  }

  // Fallback to ERPNext or default settings
  const erpnextSettings = await getErpnextWebsiteSettings();
  return erpnextSettings || DEFAULT_WEBSITE_SETTINGS;
}

export function getLocalizedWebsiteSettings(settings: WebsiteSettings, locale: Locale): WebsiteSettings {
  const localized = settings.localizedContent[locale];
  if (!localized) return settings;
  return { ...settings, ...localized };
}

export const getCachedWebsiteSettings = unstable_cache(
  getWebsiteSettings,
  ["website-settings-v1"],
  { revalidate: 300, tags: [WEBSITE_SETTINGS_CACHE_TAG] },
);
