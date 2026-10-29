import { Suspense } from "react";
import type { Metadata } from "next";
import { Noto_Sans_Thai, Geist_Mono, Roboto } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";

import AuthProvider from "@/components/providers/AuthProvider";
import LocaleDocumentLanguage from "@/components/providers/LocaleDocumentLanguage";
import RuntimeMessageRefresh from "@/components/providers/RuntimeMessageRefresh";
import { SupportedLocalesProvider } from "@/components/providers/SupportedLocalesProvider";
import { getCachedLocalizationConfig } from "@/lib/public-content-cache";
import { isLocale, locales, type Locale } from "@/i18n/locales";
import { getConfiguredAdminSiteUrl } from "@/lib/siteUrl";
import { SolarRouteShell } from "@/components/ui/solar-route-shell";

const roboto = Roboto({ variable: "--font-roboto", subsets: ["latin"], weight: ["400", "500", "700"], display: "swap" });
const notoSansThai = Noto_Sans_Thai({ variable: "--font-noto-sans-thai", subsets: ["thai", "latin"], weight: ["400", "500", "600", "700", "800", "900"], display: "swap" });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap" });
const localeBootstrapScript = `(()=>{const locale=window.location.pathname.split("/").filter(Boolean)[0];const activeLocale=${JSON.stringify(locales)}.includes(locale)?locale:"th";document.documentElement.lang=activeLocale;document.documentElement.dir=${JSON.stringify(["ar", "fa", "he", "ur"])}.includes(activeLocale)?"rtl":"ltr"})()`;

export const metadata: Metadata = {
  metadataBase: new URL(getConfiguredAdminSiteUrl()),
  title: "SolarDream Staff",
  description: "Secure SolarDream staff workspace.",
  robots: { index: false, follow: false },
  openGraph: {
    title: "SolarDream Staff",
    description: "Secure SolarDream staff workspace.",
    siteName: "SolarDream Staff",
    type: "website",
  },
};

export default function StaffLocaleLayout({
  children,
  params,
}: Readonly<{ children: React.ReactNode; params: Promise<{ locale: string }> }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <script
          type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: localeBootstrapScript }}
        />
      </head>
      <body
        data-solar-ui="staff"
        className={`${notoSansThai.variable} ${geistMono.variable} ${roboto.variable} min-h-dvh bg-[#0d1117] text-[#c9d1d9] antialiased`}
        style={{ fontFamily: "var(--font-roboto), var(--font-noto-sans-thai), sans-serif" }}
        suppressHydrationWarning
      >
        <Suspense fallback={<StaffLocaleLoading />}>
          <StaffLocaleProviders params={params}>
            <LocaleDocumentLanguage />
            {children}
          </StaffLocaleProviders>
        </Suspense>
      </body>
    </html>
  );
}

async function StaffLocaleProviders({
  children,
  params,
}: Readonly<{ children: React.ReactNode; params: Promise<{ locale: string }> }>) {
  const { locale: requestedLocale } = await params;
  const locale: Locale = isLocale(requestedLocale) ? requestedLocale : "th";
  const [messages, localizationConfig] = await Promise.all([
    getMessages({ locale }),
    getCachedLocalizationConfig(),
  ]);

  return (
    <AuthProvider>
      <RuntimeMessageRefresh />
      <NextIntlClientProvider locale={locale} messages={messages}>
        <SupportedLocalesProvider supportedLocales={localizationConfig.supportedLocales}>
          {children}
        </SupportedLocalesProvider>
      </NextIntlClientProvider>
    </AuthProvider>
  );
}

function StaffLocaleLoading() {
  return (
    <SolarRouteShell className="flex min-h-dvh items-center justify-center bg-[#0d1117] px-6 text-[#c9d1d9]">
      <div role="status" aria-label="Preparing SolarDream staff workspace" className="flex items-center gap-3">
        <span aria-hidden="true" className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#B7D1EA]" />
        <span className="text-sm font-semibold">SolarDream Staff</span>
      </div>
    </SolarRouteShell>
  );
}
