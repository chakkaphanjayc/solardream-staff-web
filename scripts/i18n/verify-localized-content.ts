import assert from "node:assert/strict";

import {
  getLocalizedValue,
  mergeLocalizedContent,
  normalizeLocalizationConfig,
  type LocalizedContent,
} from "../../src/lib/localization/content";

type Copy = { title: string; description: string | null };

const translations: LocalizedContent<Copy> = {
  th: { title: "ระบบบ้าน", description: "คำอธิบายภาษาไทย" },
  en: { title: "Home system" },
};

assert.equal(getLocalizedValue(translations, "en", "title", "Legacy", "th"), "Home system");
assert.equal(getLocalizedValue(translations, "en", "description", "Legacy description", "th"), "คำอธิบายภาษาไทย");
assert.equal(getLocalizedValue({}, "en", "title", "Legacy", "th"), "Legacy");

const merged = mergeLocalizedContent(translations, "en", {
  title: "Updated home system",
  description: "English description",
});
assert.equal(merged.en?.title, "Updated home system");
assert.equal(merged.th?.title, "ระบบบ้าน");

assert.deepEqual(normalizeLocalizationConfig({ defaultLocale: "en", supportedLocales: ["en", "th"] }), {
  defaultLocale: "en",
  supportedLocales: ["en", "th"],
});
assert.equal(normalizeLocalizationConfig({ defaultLocale: "fr", supportedLocales: ["fr"] }).defaultLocale, "th");

console.log("Localized content fallback and configuration checks pass.");
