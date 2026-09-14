import { z } from "zod";

export const SYSTEM_UPDATES_REQUIRED = true as const;

export const userConsentPreferencesSchema = z.object({
  news: z.boolean(),
  promotions: z.boolean(),
  systemUpdates: z.literal(SYSTEM_UPDATES_REQUIRED),
  revision: z.number().int().positive(),
}).strict();

export const consentPreferencePatchSchema = z.object({
  news: z.boolean(),
  promotions: z.boolean(),
  systemUpdates: z.literal(SYSTEM_UPDATES_REQUIRED).optional(),
}).strict();

export type UserConsentPreferences = z.infer<typeof userConsentPreferencesSchema>;
export type ConsentPreferencePatch = z.infer<typeof consentPreferencePatchSchema>;

export const DEFAULT_USER_CONSENT_PREFERENCES: UserConsentPreferences = Object.freeze({
  news: false,
  promotions: false,
  systemUpdates: SYSTEM_UPDATES_REQUIRED,
  revision: 1,
});

export function normalizeUserConsentPreferences(value: unknown): UserConsentPreferences {
  const parsed = userConsentPreferencesSchema.safeParse(value);
  return parsed.success ? parsed.data : { ...DEFAULT_USER_CONSENT_PREFERENCES };
}

export function registrationConsentPreferences(formData: FormData): ConsentPreferencePatch {
  const isEnabled = (value: FormDataEntryValue | null) =>
    typeof value === "string" && ["1", "true", "on", "yes"].includes(value.toLowerCase());

  return {
    news: isEnabled(formData.get("news")),
    promotions: isEnabled(formData.get("promotions")),
    systemUpdates: SYSTEM_UPDATES_REQUIRED,
  };
}

export function applyConsentPreferencePatch(
  currentValue: unknown,
  patch: ConsentPreferencePatch,
): UserConsentPreferences {
  const current = normalizeUserConsentPreferences(currentValue);
  const changed = current.news !== patch.news || current.promotions !== patch.promotions;
  return {
    news: patch.news,
    promotions: patch.promotions,
    systemUpdates: SYSTEM_UPDATES_REQUIRED,
    revision: changed ? current.revision + 1 : current.revision,
  };
}

export function buildConsentListIds(
  preferences: UserConsentPreferences,
  lists: Readonly<{ systemUpdates: number; news: number; promotions: number }>,
) {
  return [...new Set([
    lists.systemUpdates,
    ...(preferences.news ? [lists.news] : []),
    ...(preferences.promotions ? [lists.promotions] : []),
  ])];
}
