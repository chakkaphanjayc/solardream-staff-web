"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter, usePathname } from "next/navigation";
import React, { startTransition } from "react";
import { localeLabels, locales } from "@/i18n/locales";
import { useSupportedLocales } from "@/components/providers/SupportedLocalesProvider";

export default function LanguageSwitcher() {
    const t = useTranslations("LanguageSwitcher");
    const locale = useLocale();
    const router = useRouter();
    const pathname = usePathname();
    const supportedLocales = useSupportedLocales();

    const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const nextLocale = e.target.value;

        const segments = pathname.split("/");
        segments[1] = nextLocale;
        const nextPathname = segments.join("/");

        startTransition(() => {
            router.replace(nextPathname);
            router.refresh();
        });
    };

    return (
        <div className="relative inline-block text-left">
            <select
                value={locale}
                onChange={handleLanguageChange}
                aria-label={t("ariaLabel")}
                className="block w-full rounded-xl border border-slate-200 bg-brand-surface px-3 py-2 text-xs font-black uppercase tracking-widest text-slate-700 shadow-sm outline-none transition-all hover:border-[#1CBBBB] cursor-pointer"
            >
                {(supportedLocales.length > 0 ? supportedLocales : locales).map((item) => <option key={item} value={item}>{localeLabels[item]}</option>)}
            </select>
        </div>
    );
}
