"use client";

import Image from "next/image";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "next/navigation";

import { useSupportedLocales } from "@/components/providers/SupportedLocalesProvider";
import { Globe } from "@/components/ui/icons";
import SmartBackButton from "@/components/ui/SmartBackButton";
import { Button } from "@/components/ui/button";
import { SolarDepth } from "@/components/ui/solar-depth";
import { isLocale, locales } from "@/i18n/locales";

interface AuthSplitLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle: string;
}

export default function AuthSplitLayout({
  children,
  title,
  subtitle,
}: AuthSplitLayoutProps) {
  const t = useTranslations("AuthPage");
  const locale = useLocale();
  const pathname = usePathname();
  const supportedLocales = useSupportedLocales();
  const availableLocales =
    supportedLocales.length > 0 ? supportedLocales : locales;
  const currentLocale = isLocale(locale) ? locale : "th";
  const currentLocaleIndex = Math.max(
    availableLocales.indexOf(currentLocale),
    0,
  );
  const nextLocale =
    availableLocales[(currentLocaleIndex + 1) % availableLocales.length] ??
    "en";
  const pathParts = pathname.split("/").filter(Boolean);
  const pathWithoutLocale = isLocale(pathParts[0])
    ? pathParts.slice(1).join("/")
    : pathParts.join("/");
  const languageHref = `/${nextLocale}${pathWithoutLocale ? `/${pathWithoutLocale}` : ""}`;

  return (
    <div
      data-bagui="auth-shell"
      data-solar-surface="atelier"
      className="solar-auth-shell sd-page-shell min-h-dvh w-full overflow-x-clip font-sans text-foreground lg:flex lg:flex-row"
    >
      {/* ─── LEFT COLUMN (Form) ─── */}
      <section className="solar-auth-panel relative z-10 flex min-h-screen w-full flex-col justify-center px-4 py-8 sm:px-8 lg:w-[44%] lg:px-14">
        {/* Manga Halftone Overlay */}
        <div
          aria-hidden="true"
          className="solar-auth-halftone pointer-events-none absolute inset-0 z-0"
        />

        <header className="solar-auth-header absolute inset-x-0 top-0 z-20 flex min-h-20 items-center justify-between gap-3 px-4 py-4 sm:px-8 lg:px-10">
          <Link
            href={`/${locale}`}
            className="solar-auth-brand inline-flex min-h-11 min-w-0 items-center gap-2 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label={t("homeAriaLabel")}
          >
            <Image
              src="/asset/sd-logo.png"
              alt=""
              width={48}
              height={48}
              className="h-9 w-auto shrink-0 object-contain"
              priority
            />
            <span className="solar-auth-brand-wordmark relative block w-[7.6rem] sm:w-[8.5rem]">
              <Image
                src="/asset/sd-text.png"
                alt="SolarDream"
                width={880}
                height={281}
                priority
                sizes="(min-width: 640px) 136px, 122px"
                className="h-auto w-full object-contain"
              />
            </span>
          </Link>

          <div className="relative z-10 flex shrink-0 items-center gap-2">
            <Button
              asChild
              variant="outline"
              size="sm"
              className="solar-auth-utility min-h-11 px-3"
            >
              <Link
                href={languageHref}
                aria-label={`Switch language to ${nextLocale.toUpperCase()}`}
              >
                <Globe aria-hidden="true" className="h-4 w-4" />
                <span>{nextLocale.toUpperCase()}</span>
              </Link>
            </Button>
            <div className="hidden sm:block">
              <SmartBackButton
                fallbackHref={`/${locale}`}
                label={t("backToHome")}
                className="solar-auth-utility min-h-11 px-3"
              />
            </div>
          </div>
        </header>

        {/* Ambient Organic Blobs */}
        <div className="blob-organic-1 pointer-events-none absolute -top-20 -left-20 h-80 w-80 bg-[#B7D1EA]/15 blur-3xl" />
        <div className="blob-organic-2 pointer-events-none absolute -bottom-20 -right-20 h-80 w-80 bg-[#DCE8F5]/35 blur-3xl" />

        <div className="solar-auth-content relative z-10 mx-auto mt-12 w-full max-w-xl sm:mt-16">
          <div className="solar-auth-heading min-w-0 space-y-3">
            <h1 className="text-balance font-serif text-4xl font-bold leading-[1.1] tracking-[-0.02em] text-[#1C1C1A] sm:text-5xl">
              {title}
            </h1>
            <p className="max-w-[62ch] text-pretty text-sm font-medium leading-7 text-[#4E4B44] sm:text-base">
              {subtitle}
            </p>
          </div>

          <SolarDepth className="solar-auth-depth mt-8" maxTilt={1.1} lift={1}>
            <div
              data-bagui="auth-surface"
              className="solar-auth-form-card rounded-[28px] bg-[#E6E3DC] p-6 sm:p-9 shadow-sm border border-transparent"
            >
              {children}
            </div>
          </SolarDepth>

          <p className="solar-auth-support mt-7 text-center text-sm font-medium leading-6 text-[#4E4B44]">
            {t("havingTrouble")}{" "}
            <Link
              href={`/${locale}/support`}
              className="inline-flex min-h-11 items-center rounded-lg px-1 font-bold text-[#4F7FA8] underline decoration-2 underline-offset-4 hover:text-[#2E2C27] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t("contactSupport")}
            </Link>
          </p>
        </div>
      </section>

      {/* ─── RIGHT COLUMN (Image with Manga Slanted Cut) ─── */}
      <aside className="solar-auth-art relative hidden min-h-screen w-full lg:block lg:w-[56%]">
        <div className="solar-auth-art-frame absolute inset-4 overflow-hidden rounded-[2rem] bg-slate-950 lg:inset-y-4 lg:right-4 lg:left-0">
          <Image
            src="/asset/solia-loginbg.png"
            alt=""
            fill
            sizes="(min-width: 1024px) 60vw, 0px"
            className="object-cover object-[75%_center]"
            priority
          />
          <div className="solar-auth-art-overlay absolute inset-0" />

          <div className="relative flex h-full min-h-screen flex-col justify-end p-8 sm:p-10 xl:p-14">
            <div className="solar-auth-art-copy ml-auto w-full max-w-sm space-y-4 text-right text-white">
              <h2 className="text-balance text-3xl font-black leading-tight tracking-[-0.03em]">
                {t("headerTitle")}
              </h2>
              <p className="ml-auto max-w-[40ch] text-pretty text-base font-semibold leading-7 text-slate-100">
                {t("headerSubtitle")}
              </p>
            </div>
          </div>
        </div>

        {/* Slanted Border Line matching the 10% to 0% cut */}
      </aside>
    </div>
  );
}
