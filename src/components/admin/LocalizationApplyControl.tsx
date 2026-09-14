"use client";

import { Save } from "@/components/ui/icons";
import { useTranslations } from "next-intl";
import { ContentLocaleTabs } from "@/components/admin/ContentLocaleTabs";
import type { Locale } from "@/i18n/locales";

export function LocalizationApplyControl({ locale, onLocaleChange, onApply, isPending = false, isDisabled = false, label }: {
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  onApply: () => void;
  isPending?: boolean;
  isDisabled?: boolean;
  label?: string;
}) {
  const t = useTranslations("AdminLocalization");

  return <div className="flex flex-wrap items-center gap-2"><ContentLocaleTabs locale={locale} onChange={onLocaleChange} /><button type="button" onClick={onApply} disabled={isPending || isDisabled} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[#B7D1EA] px-4 text-xs font-black text-slate-950 transition hover:bg-[#99BFE3] disabled:cursor-not-allowed disabled:opacity-55"><Save className="size-4" />{isPending ? t("applying") : (label ?? t("applyChanges"))}</button></div>;
}
