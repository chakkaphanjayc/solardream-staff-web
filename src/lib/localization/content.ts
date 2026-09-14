import { defaultLocale, isLocale, locales, type Locale } from "@/i18n/locales";

export type LocalizedText = Partial<Record<Locale, string>>;

export type LocalizedContent<T extends Record<string, string | null>> = Partial<
  Record<Locale, Partial<T>>
>;

export type LocalizationConfig = {
  defaultLocale: Locale;
  supportedLocales: readonly Locale[];
};

export const DEFAULT_LOCALIZATION_CONFIG: LocalizationConfig = {
  defaultLocale,
  supportedLocales: [defaultLocale, "en"],
};

export function isLocalizedContent<T extends Record<string, string | null>>(
  value: unknown,
): value is LocalizedContent<T> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function normalizeLocalizationConfig(value: unknown): LocalizationConfig {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_LOCALIZATION_CONFIG;
  }

  const config = value as Record<string, unknown>;
  const supportedLocales = Array.isArray(config.supportedLocales)
    ? config.supportedLocales.filter(isLocale)
    : [];
  const defaultCandidate = typeof config.defaultLocale === "string" ? config.defaultLocale : null;
  const configuredDefault = isLocale(defaultCandidate) ? defaultCandidate : defaultLocale;
  const normalizedSupported = supportedLocales.length > 0
    ? Array.from(new Set(supportedLocales))
    : [...locales];

  return {
    defaultLocale: normalizedSupported.includes(configuredDefault)
      ? configuredDefault
      : normalizedSupported[0] ?? defaultLocale,
    supportedLocales: normalizedSupported,
  };
}

export function getLocalizedValue<T extends Record<string, string | null>, K extends keyof T>(
  translations: LocalizedContent<T> | null | undefined,
  locale: Locale,
  key: K,
  fallback: T[K],
  fallbackLocale: Locale = defaultLocale,
): T[K] {
  const translated = translations?.[locale]?.[key];
  if (typeof translated === "string" && translated.trim()) return translated as T[K];

  const fallbackTranslated = translations?.[fallbackLocale]?.[key];
  if (typeof fallbackTranslated === "string" && fallbackTranslated.trim()) {
    return fallbackTranslated as T[K];
  }

  return fallback;
}

export function mergeLocalizedContent<T extends Record<string, string | null>>(
  existing: LocalizedContent<T> | null | undefined,
  locale: Locale,
  content: T,
): LocalizedContent<T> {
  return {
    ...(existing ?? {}),
    [locale]: content,
  };
}
