"use client";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";

import { isLocale } from "@/i18n/locales";

const rightToLeftLocales = new Set(["ar", "fa", "he", "ur"]);

export default function LocaleDocumentLanguage() {
  const pathname = usePathname();

  useLayoutEffect(() => {
    const locale = pathname.split("/").filter(Boolean)[0];
    const activeLocale = isLocale(locale) ? locale : "th";

    document.documentElement.lang = activeLocale;
    document.documentElement.dir = rightToLeftLocales.has(activeLocale) ? "rtl" : "ltr";
  }, [pathname]);

  return null;
}
