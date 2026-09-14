import { defineRouting } from "next-intl/routing";

// These are language packs that can be enabled from Admin → Localization.
// A pack falls back to English until its website and template text is translated.
export const locales = [
  "en", "th", "af", "am", "ar", "az", "bg", "bn", "bs", "ca", "cs", "cy", "da", "de", "el", "eo", "es", "et", "eu", "fa",
  "fi", "fil", "fr", "gl", "gu", "he", "hi", "hr", "hu", "hy", "id", "is", "it", "ja", "ka", "kk", "km", "kn", "ko", "lo",
  "lt", "lv", "mk", "ml", "mn", "mr", "ms", "my", "ne", "nl", "no", "pa", "pl", "pt", "ro", "ru", "si", "sk", "sl", "sq",
  "sr", "sv", "sw", "ta", "te", "tr", "uk", "ur", "vi", "zh", "zu",
] as const;
export type Locale = (typeof locales)[number];

export const localeLabels: Record<Locale, string> = {
  en: "English", th: "ไทย (Thai)", af: "Afrikaans", am: "አማርኛ (Amharic)", ar: "العربية (Arabic)", az: "Azərbaycanca (Azerbaijani)",
  bg: "Български (Bulgarian)", bn: "বাংলা (Bengali)", bs: "Bosanski (Bosnian)", ca: "Català (Catalan)", cs: "Čeština (Czech)", cy: "Cymraeg (Welsh)",
  da: "Dansk (Danish)", de: "Deutsch (German)", el: "Ελληνικά (Greek)", eo: "Esperanto", es: "Español (Spanish)", et: "Eesti (Estonian)",
  eu: "Euskara (Basque)", fa: "فارسی (Persian)", fi: "Suomi (Finnish)", fil: "Filipino", fr: "Français (French)", gl: "Galego (Galician)",
  gu: "ગુજરાતી (Gujarati)", he: "עברית (Hebrew)", hi: "हिन्दी (Hindi)", hr: "Hrvatski (Croatian)", hu: "Magyar (Hungarian)", hy: "Հայերեն (Armenian)",
  id: "Bahasa Indonesia", is: "Íslenska (Icelandic)", it: "Italiano (Italian)", ja: "日本語 (Japanese)", ka: "ქართული (Georgian)", kk: "Қазақша (Kazakh)",
  km: "ខ្មែរ (Khmer)", kn: "ಕನ್ನಡ (Kannada)", ko: "한국어 (Korean)", lo: "ລາວ (Lao)", lt: "Lietuvių (Lithuanian)", lv: "Latviešu (Latvian)",
  mk: "Македонски (Macedonian)", ml: "മലയാളം (Malayalam)", mn: "Монгол (Mongolian)", mr: "मराठी (Marathi)", ms: "Bahasa Melayu (Malay)", my: "မြန်မာ (Burmese)",
  ne: "नेपाली (Nepali)", nl: "Nederlands (Dutch)", no: "Norsk (Norwegian)", pa: "ਪੰਜਾਬੀ (Punjabi)", pl: "Polski (Polish)", pt: "Português (Portuguese)",
  ro: "Română (Romanian)", ru: "Русский (Russian)", si: "සිංහල (Sinhala)", sk: "Slovenčina (Slovak)", sl: "Slovenščina (Slovenian)", sq: "Shqip (Albanian)",
  sr: "Српски (Serbian)", sv: "Svenska (Swedish)", sw: "Kiswahili (Swahili)", ta: "தமிழ் (Tamil)", te: "తెలుగు (Telugu)", tr: "Türkçe (Turkish)",
  uk: "Українська (Ukrainian)", ur: "اردو (Urdu)", vi: "Tiếng Việt (Vietnamese)", zh: "中文 (Chinese)", zu: "isiZulu (Zulu)",
};

export const defaultLocale: Locale = "th";

export const routing = defineRouting({
  locales,
  defaultLocale,
  // Keep next-intl from generating one Link header per enabled locale. This
  // catalog is runtime-extensible, and the header can exceed common proxy
  // response-header limits. Page metadata publishes supported alternates.
  alternateLinks: false,
});

export function isLocale(value: string | null | undefined): value is Locale {
  return typeof value === "string" && locales.some((locale) => locale === value);
}

export function toIntlLocale(locale: Locale): string {
  const regionalLocales: Partial<Record<Locale, string>> = {
    en: "en-US",
    th: "th-TH",
    pt: "pt-PT",
    zh: "zh-CN",
  };

  return regionalLocales[locale] ?? locale;
}
