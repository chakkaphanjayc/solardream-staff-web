"use client";

import { localeLabels, type Locale } from "@/i18n/locales";
import { useTranslations } from "next-intl";

export function LocalizedFieldMarker({ locale }: { locale: Locale }) {
  const t = useTranslations("AdminLocalization");

  return <p className="text-right text-[10px] font-bold text-[#B7D1EA]">{t("editing", { language: localeLabels[locale] })}</p>;
}
