import { defaultLocale, isLocale, locales, type Locale } from "@/i18n/locales";

export const PREFERRED_LANGUAGES = locales;

export type PreferredLanguage = Locale;

export const DEFAULT_PREFERRED_LANGUAGE: PreferredLanguage = defaultLocale;

export function normalizePreferredLanguage(
  value: unknown,
  fallback: PreferredLanguage = DEFAULT_PREFERRED_LANGUAGE,
): PreferredLanguage {
  const candidate = typeof value === "string" ? value : null;
  return isLocale(candidate) ? candidate : fallback;
}
