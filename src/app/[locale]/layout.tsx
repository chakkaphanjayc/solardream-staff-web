import type { Metadata } from "next";
import { Noto_Sans_Thai, Geist_Mono, Roboto } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";

import AuthProvider from "@/components/providers/AuthProvider";
import RuntimeMessageRefresh from "@/components/providers/RuntimeMessageRefresh";
import { SupportedLocalesProvider } from "@/components/providers/SupportedLocalesProvider";
import { getCachedLocalizationConfig } from "@/lib/public-content-cache";
import { isLocale, type Locale } from "@/i18n/locales";
import { getConfiguredAdminSiteUrl } from "@/lib/siteUrl";

const roboto = Roboto({ variable: "--font-roboto", subsets: ["latin"], weight: ["400", "500", "700"], display: "swap" });
const notoSansThai = Noto_Sans_Thai({ variable: "--font-noto-sans-thai", subsets: ["thai", "latin"], weight: ["400", "500", "600", "700", "800", "900"], display: "swap" });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap" });

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return {
    metadataBase: new URL(getConfiguredAdminSiteUrl()),
    title: "SolarDream Staff",
    description: "Secure SolarDream staff workspace.",
    robots: { index: false, follow: false },
    alternates: {
      canonical: `/${locale}`,
      languages: { th: "/th", en: "/en" },
    },
  };
}

export default async function StaffLocaleLayout({
  children,
  params,
}: Readonly<{ children: React.ReactNode; params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  const activeLocale: Locale = isLocale(locale) ? locale : "th";
  setRequestLocale(activeLocale);
  const [messages, localizationConfig] = await Promise.all([
    getMessages({ locale: activeLocale }),
    getCachedLocalizationConfig(),
  ]);

  return (
    <html lang={activeLocale} data-scroll-behavior="smooth" suppressHydrationWarning>
      <body
        data-solar-ui="staff"
        className={`${notoSansThai.variable} ${geistMono.variable} ${roboto.variable} min-h-dvh bg-[#0d1117] text-[#c9d1d9] antialiased`}
        style={{ fontFamily: "var(--font-roboto), var(--font-noto-sans-thai), sans-serif" }}
        suppressHydrationWarning
      >
        <AuthProvider>
          <RuntimeMessageRefresh />
          <NextIntlClientProvider messages={messages}>
            <SupportedLocalesProvider supportedLocales={localizationConfig.supportedLocales}>
              {children}
            </SupportedLocalesProvider>
          </NextIntlClientProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
