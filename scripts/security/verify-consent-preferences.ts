import {
  applyConsentPreferencePatch,
  buildConsentListIds,
  DEFAULT_USER_CONSENT_PREFERENCES,
  normalizeUserConsentPreferences,
} from "../../src/lib/consentPreferences";

const enabled = applyConsentPreferencePatch(DEFAULT_USER_CONSENT_PREFERENCES, {
  news: true,
  promotions: true,
  systemUpdates: true,
});
if (!enabled.systemUpdates || enabled.revision !== 2) throw new Error("Consent revision contract failed.");
if (!normalizeUserConsentPreferences({ systemUpdates: false }).systemUpdates) throw new Error("System updates were disabled.");
const lists = buildConsentListIds(enabled, { systemUpdates: 1, news: 2, promotions: 3 });
if (![1, 2, 3].every((id) => lists.includes(id))) throw new Error("Listmonk list mapping failed.");
process.stdout.write("Consent preference and mandatory system-update contracts passed.\n");
