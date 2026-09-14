import type { GlobalBannerTranslations } from "@/types/globalBanner";

const MAX_MESSAGE_LENGTH = 1000;
const MAX_LINK_LENGTH = 2048;

export function normalizeGlobalBannerTranslations(value: unknown): GlobalBannerTranslations {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const translations: GlobalBannerTranslations = {};
  for (const [locale, rawTranslation] of Object.entries(value)) {
    if (!rawTranslation || typeof rawTranslation !== "object" || Array.isArray(rawTranslation)) continue;

    const translation = rawTranslation as Record<string, unknown>;
    const message = typeof translation.message === "string"
      ? translation.message.trim().slice(0, MAX_MESSAGE_LENGTH)
      : "";
    const linkUrl = typeof translation.linkUrl === "string"
      ? translation.linkUrl.trim().slice(0, MAX_LINK_LENGTH) || null
      : translation.linkUrl === null
        ? null
        : undefined;

    if (message || linkUrl !== undefined) {
      translations[locale.trim().slice(0, 32)] = {
        ...(message ? { message } : {}),
        ...(linkUrl !== undefined ? { linkUrl } : {}),
      };
    }
  }

  return translations;
}

export function getGlobalBannerFallbackMessage(
  message: string | null | undefined,
  translations: GlobalBannerTranslations,
) {
  const baseMessage = typeof message === "string" ? message.trim().slice(0, MAX_MESSAGE_LENGTH) : "";
  if (baseMessage) return baseMessage;

  for (const locale of ["en", "th", ...Object.keys(translations)]) {
    const localizedMessage = translations[locale]?.message?.trim();
    if (localizedMessage) return localizedMessage.slice(0, MAX_MESSAGE_LENGTH);
  }

  return "";
}

export function parseGlobalBannerDate(value: unknown, fieldLabel: string): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) {
    if (!Number.isNaN(value.getTime())) return value;
    throw new Error(`${fieldLabel} must be a valid date.`);
  }
  if (typeof value !== "string" || !value.trim()) return null;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${fieldLabel} must be a valid date.`);
  return parsed;
}

export function validateGlobalBannerSchedule(startsAt: Date | null, endsAt: Date | null) {
  if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) {
    throw new Error("The end time must be later than the start time.");
  }
}
