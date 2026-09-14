"use client";

import Link from "next/link";
import NextImage from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { BriefcaseBusiness, Camera, CircleDot, type IconType } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

type SocialLink = Readonly<{ label: string; href: string; icon: IconType }>;

const socialLinks: readonly SocialLink[] = [
  { label: "Instagram", href: "https://instagram.com", icon: Camera },
  { label: "Dribbble", href: "https://dribbble.com", icon: CircleDot },
  { label: "LinkedIn", href: "https://linkedin.com", icon: BriefcaseBusiness },
];

type AgencyFooterProps = { isDark?: boolean };

export default function AgencyFooter({ isDark = false }: AgencyFooterProps) {
  const locale = useLocale();
  const t = useTranslations("AgencyFooter");
  const basePath = `/${locale}`;
  const sitemapGroups = [
    {
      title: t("solutions"),
      links: [
        { label: t("home"), href: "" },
        { label: t("calculator"), href: "/build" },
        { label: t("wizard"), href: "/wizard" },
      ],
    },
    {
      title: t("resources"),
      links: [
        { label: t("news"), href: "/news" },
        { label: t("forum"), href: "/forum" },
        { label: t("support"), href: "/support" },
      ],
    },
  ] as const;

  return (
    <footer className={cn(
      "relative overflow-hidden border-t transition-colors duration-300 ease-expo-out",
      isDark ? "border-slate-800 bg-[#0F172A] text-white" : "border-[#B7D1EA]/35 bg-[#F0EEE9] text-[#0F172A]",
    )}>
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-12 sm:grid-cols-2 sm:px-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(10rem,0.55fr)_minmax(10rem,0.55fr)] lg:gap-14 lg:py-16">
        <div className="sm:col-span-2 lg:col-span-1">
          <Link href={basePath} className="flex items-center gap-3 active:scale-[0.98]">
            <NextImage
              src="/asset/sd-logo.png"
              alt="SolarDream logo"
              width={1254}
              height={1254}
              sizes="48px"
              className="h-12 w-12 object-contain"
            />
            <div>
              <span className={cn("text-base font-black tracking-tight transition-colors", isDark ? "text-white hover:text-slate-200" : "text-[#0F172A] hover:text-[#0369a1]")}>
                SolarDream
              </span>
              <p className={cn("text-[9px] font-black uppercase tracking-[0.2em] mt-0.5", isDark ? "text-slate-500" : "text-[#475569]/60")}>
                {t("companyName")}
              </p>
            </div>
          </Link>
          <p className={cn("mt-3 max-w-md text-xs leading-6 font-medium", isDark ? "text-slate-300" : "text-[#475569]")}>
            {t("description")}
          </p>
          
          {/* E-Commerce Corporate Compliance Info */}
          <div className={cn("mt-4 text-[11px] space-y-1.5 font-sans leading-relaxed", isDark ? "text-slate-400" : "text-[#475569]")}>
            <p className="font-bold">{t("legalCompanyName")}</p>
            <p><span className="font-semibold uppercase tracking-wider text-[10px]">{t("taxId")}:</span> 0105569000123</p>
            <p className="leading-relaxed"><span className="font-semibold uppercase tracking-wider text-[10px]">{t("address")}:</span> 123 Sukhumvit Road, Khlong Toei, Bangkok 10110, Thailand</p>
            <p><span className="font-semibold uppercase tracking-wider text-[10px]">{t("telephone")}:</span> +66 2 123 4567 | <span className="font-semibold uppercase tracking-wider text-[10px]">{t("email")}:</span> support@solardream.com</p>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            {socialLinks.map(({ label, href, icon: SocialIcon }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t("externalLinkLabel", { name: label })}
                className={cn(
                  "grid h-11 w-11 place-items-center rounded-full border transition-colors duration-300 ease-expo-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA] focus-visible:ring-offset-2",
                  isDark
                    ? "border-slate-700 text-slate-300 hover:border-slate-500 hover:bg-slate-800 hover:text-white focus-visible:ring-offset-[#0F172A]"
                    : "border-slate-300 text-[#475569] hover:border-[#0F172A] hover:bg-white hover:text-[#0F172A] focus-visible:ring-offset-[#F0EEE9]",
                )}
              >
                <SocialIcon className="h-4.5 w-4.5" aria-hidden="true" />
              </a>
            ))}
          </div>
        </div>

        {sitemapGroups.map((group) => (
          <nav key={group.title} aria-label={group.title}>
            <h2 className={cn("text-sm font-black", isDark ? "text-white" : "text-[#0F172A]")}>{group.title}</h2>
            <ul className="mt-4 space-y-1">
              {group.links.map((link) => (
                <li key={link.label}>
                  <Link
                    href={`${basePath}${link.href}`}
                    className={cn("inline-flex min-h-11 items-center text-sm font-semibold transition-colors duration-300 ease-expo-out", isDark ? "text-slate-300 hover:text-white" : "text-[#475569] hover:text-[#0F172A]")}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className={cn(
        "mx-auto flex max-w-7xl flex-col gap-3 border-t px-5 pb-24 pt-6 text-xs font-semibold sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-6",
        isDark ? "border-slate-800 text-slate-400" : "border-[#B7D1EA]/35 text-[#475569]",
      )}>
        <p>{t("copyright", { year: 2026 })}</p>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href={`${basePath}/privacy`} className={cn("inline-flex min-h-11 items-center transition-colors duration-300 ease-expo-out", isDark ? "hover:text-white" : "hover:text-[#0F172A]")}>{t("privacy")}</Link>
          <Link href={`${basePath}/terms`} className={cn("inline-flex min-h-11 items-center transition-colors duration-300 ease-expo-out", isDark ? "hover:text-white" : "hover:text-[#0F172A]")}>{t("terms")}</Link>
        </div>
      </div>
    </footer>
  );
}
