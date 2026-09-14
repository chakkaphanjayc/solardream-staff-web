"use client";

import { useState } from "react";
import { ChevronDown, Languages } from "@/components/ui/icons";
import { useTranslations } from "next-intl";
import { localeLabels, locales, type Locale } from "@/i18n/locales";
import { useSupportedLocales } from "@/components/providers/SupportedLocalesProvider";
import { cn } from "@/lib/utils";

export function ContentLocaleTabs({
  locale,
  onChange,
  className,
  availableLocales,
}: {
  locale: Locale;
  onChange: (locale: Locale) => void;
  className?: string;
  availableLocales?: readonly Locale[];
}) {
  const t = useTranslations("AdminLocalization");
  const [isOpen, setIsOpen] = useState(false);
  const supportedLocales = useSupportedLocales();
  const visibleLocales = availableLocales ?? supportedLocales ?? locales;

  return (
    <div className={cn("relative shrink-0", className)}>
      <button type="button" onClick={() => setIsOpen((current) => !current)} aria-expanded={isOpen} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#B7D1EA]/40 bg-[#0B1121] px-3 text-xs font-bold text-white shadow-lg shadow-black/20 transition hover:border-[#B7D1EA]">
        <Languages className="size-4 text-[#B7D1EA]" />
        {localeLabels[locale]}
        <ChevronDown className={cn("size-4 text-slate-400 transition-transform", isOpen && "rotate-180")} />
      </button>
      {isOpen && (
        <div className="absolute right-0 top-[calc(100%+0.5rem)] z-30 grid w-64 gap-1 rounded-xl border border-slate-700 bg-[#0B1121] p-2 shadow-xl" aria-label={t("contentLanguage")}>
          {visibleLocales.map((item) => (
            <button key={item} type="button" onClick={() => { onChange(item); setIsOpen(false); }} aria-pressed={locale === item} className={cn("flex min-h-10 items-center justify-between rounded-lg px-3 text-left text-sm font-bold transition-colors", locale === item ? "bg-[#B7D1EA] text-slate-950" : "text-slate-200 hover:bg-slate-800")}>
              {localeLabels[item]}
              <span className="text-xs font-medium opacity-70">{item.toUpperCase()}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
