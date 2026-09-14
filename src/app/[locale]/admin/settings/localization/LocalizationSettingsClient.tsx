"use client";

import { useState, useTransition } from "react";
import { Languages, Plus, Save, X } from "@/components/ui/icons";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { updateLocalizationConfig } from "@/app/actions/systemSettings";
import type { LocalizationConfig } from "@/lib/localization/content";
import { localeLabels, locales, type Locale } from "@/i18n/locales";

export default function LocalizationSettingsClient({ initialConfig }: { initialConfig: LocalizationConfig }) {
  const t = useTranslations("AdminLocalization");
  const [defaultLocale, setDefaultLocale] = useState<Locale>(initialConfig.defaultLocale);
  const [supportedLocales, setSupportedLocales] = useState<Locale[]>([...initialConfig.supportedLocales]);
  const availableLocales = locales.filter((locale) => !supportedLocales.includes(locale));
  const [languageToAdd, setLanguageToAdd] = useState<Locale | "">(availableLocales[0] ?? "");
  const [isPending, startTransition] = useTransition();

  const addLanguagePack = () => {
    if (!languageToAdd || supportedLocales.includes(languageToAdd)) return;
    setSupportedLocales((current) => [...current, languageToAdd]);
    const nextAvailable = locales.find((locale) => locale !== languageToAdd && !supportedLocales.includes(locale));
    setLanguageToAdd(nextAvailable ?? "");
  };

  const addAllLanguagePacks = () => {
    setSupportedLocales([...locales]);
    setLanguageToAdd("");
  };

  const removeLanguagePack = (locale: Locale) => {
    if (locale === defaultLocale) return;
    setSupportedLocales((current) => current.filter((item) => item !== locale));
    if (!languageToAdd) setLanguageToAdd(locale);
  };

  const save = () => startTransition(async () => {
    try {
      const result = await updateLocalizationConfig({ defaultLocale, supportedLocales });
      if (result.success) toast.success(t("saved"));
      else toast.error(result.error || t("saveFailed"));
    } catch (error) {
      console.error("Localization settings save error:", error);
      toast.error(t("saveFailed"));
    }
  });

  return (
    <section className="w-full rounded-2xl border border-slate-800 bg-[#0F172A] p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#B7D1EA]/15 text-[#B7D1EA]"><Languages className="size-5" /></span>
        <div>
          <h2 className="text-lg font-black text-white">{t("contentTitle")}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-300">{t("contentDescription")}</p>
        </div>
      </div>
      <fieldset className="mt-6 space-y-3">
        <legend className="text-xs font-bold uppercase tracking-wider text-slate-400">Language packs</legend>
        <p className="text-sm leading-6 text-slate-300">Add a language pack to make it available for translation and configuration. New packs begin with the English source text until you publish their translations.</p>
        <div className="flex flex-wrap gap-2">
          {supportedLocales.map((locale) => (
            <span key={locale} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-slate-700 bg-[#0B1121] py-1 pl-3 pr-1 text-sm font-bold text-slate-100">
              {localeLabels[locale]}
              {locale === defaultLocale ? <span className="rounded-full bg-[#B7D1EA]/15 px-2 py-1 text-[10px] uppercase tracking-wider text-[#B7D1EA]">Default</span> : <button type="button" onClick={() => removeLanguagePack(locale)} className="flex size-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-800 hover:text-white" aria-label={`Remove ${localeLabels[locale]}`}><X className="size-4" /></button>}
            </span>
          ))}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <select value={languageToAdd} onChange={(event) => setLanguageToAdd(event.target.value as Locale)} disabled={availableLocales.length === 0} className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-700 bg-[#0B1121] px-3 text-sm text-white outline-none focus:border-[#B7D1EA] disabled:cursor-not-allowed disabled:opacity-60">
            {availableLocales.length === 0 ? <option value="">All available language packs are enabled</option> : availableLocales.map((locale) => <option key={locale} value={locale}>{localeLabels[locale]}</option>)}
          </select>
          <button type="button" onClick={addLanguagePack} disabled={!languageToAdd} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[#B7D1EA]/50 px-4 text-sm font-bold text-[#B7D1EA] transition hover:bg-[#B7D1EA]/10 disabled:cursor-not-allowed disabled:opacity-60"><Plus className="size-4" /> Add language</button>
          <button type="button" onClick={addAllLanguagePacks} disabled={availableLocales.length === 0} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-700 px-4 text-sm font-bold text-slate-200 transition hover:border-[#B7D1EA] hover:text-white disabled:cursor-not-allowed disabled:opacity-60">Add all languages</button>
        </div>
      </fieldset>
      <fieldset className="mt-6 space-y-3">
        <legend className="text-xs font-bold uppercase tracking-wider text-slate-400">{t("defaultLanguage")}</legend>
        <select value={defaultLocale} onChange={(event) => setDefaultLocale(event.target.value as Locale)} className="min-h-11 w-full rounded-lg border border-slate-700 bg-[#0B1121] px-3 text-sm text-white outline-none focus:border-[#B7D1EA]">
          {supportedLocales.map((locale) => <option key={locale} value={locale}>{localeLabels[locale]}</option>)}
        </select>
      </fieldset>
      <button type="button" disabled={isPending} onClick={save} className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#B7D1EA] px-5 text-sm font-bold text-slate-950 transition hover:bg-[#a5c2de] disabled:cursor-not-allowed disabled:opacity-60">
        <Save className="size-4" /> {isPending ? t("saving") : t("save")}
      </button>
    </section>
  );
}
