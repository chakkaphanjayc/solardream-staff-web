import { getRequestConfig } from "next-intl/server";
import { notFound } from "next/navigation";
import type enMessages from "../../messages/en.json";
import { isLocale, type Locale, routing } from "./locales";
import { getRuntimeMessages, type MessageTree } from "@/lib/localization/runtimeMessages";

type Messages = typeof enMessages;

async function loadMessages(locale: Locale): Promise<Messages> {
  return locale === "th"
    ? (await import("../../messages/th.json")).default
    : (await import("../../messages/en.json")).default;
}

export default getRequestConfig(async ({ requestLocale }) => {
  const reqLocale = await requestLocale;
  const locale: Locale = isLocale(reqLocale) ? reqLocale : routing.defaultLocale;

  if (reqLocale && !isLocale(reqLocale)) {
    notFound();
  }

  return {
    locale,
    messages: await getRuntimeMessages(locale, (await loadMessages(locale)) as unknown as MessageTree),
  };
});

export { routing };
