"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ArrowRight,
  BookOpen,
  Calculator,
  Compass,
  MessageSquare,
  Sparkles,
  WandSparkles,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { MangaPanel, MangaCaption } from "@/components/features/home/MangaPanel";
import { MangaChapter } from "@/components/features/home/MangaChapter";
import Footer from "@/components/layout/Footer";
import { useHomeSolar } from "@/components/features/home/HomeSolarStateProvider";
import type { WebsiteSettings } from "@/lib/websiteSettingsTypes";

type GatewayItem = Readonly<{
  id: string;
  titleKey: string;
  descKey: string;
  actionKey: string;
  href: string;
  icon: typeof Calculator;
  accentTone: "sun" | "blue" | "paper";
  featured?: boolean;
}>;

export default function HomeGatewaySection({
  locale,
  latestNewsTitle,
  websiteSettings,
}: {
  locale: string;
  latestNewsTitle?: string;
  websiteSettings: WebsiteSettings;
}) {
  const t = useTranslations("HomeGatewaySection");
  const { solarSizeKw } = useHomeSolar();

  const gateways: readonly GatewayItem[] = [
    {
      id: "wizard",
      titleKey: "wizardTitle",
      descKey: "wizardDesc",
      actionKey: "wizardAction",
      href: `/${locale}/wizard`,
      icon: WandSparkles,
      accentTone: "sun",
      featured: true,
    },
    {
      id: "build",
      titleKey: "buildTitle",
      descKey: "buildDesc",
      actionKey: "buildAction",
      href: `/${locale}/build?kw=${solarSizeKw}`,
      icon: Calculator,
      accentTone: "blue",
      featured: true,
    },
    {
      id: "news",
      titleKey: "newsTitle",
      descKey: "newsDesc",
      actionKey: "newsAction",
      href: `/${locale}/news`,
      icon: BookOpen,
      accentTone: "paper",
    },
    {
      id: "forum",
      titleKey: "forumTitle",
      descKey: "forumDesc",
      actionKey: "forumAction",
      href: `/${locale}/forum`,
      icon: MessageSquare,
      accentTone: "paper",
    },
  ];

  return (
    <MangaChapter
      chapter="next-step"
      chapterNumber={6}
      chapterTitle={locale === "th" ? "เลือกก้าวต่อไปสู่ระบบโซลาร์" : "Next Steps"}
      variant="light"
      className="pb-0 pt-16 sm:pt-20 lg:pt-24"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="max-w-3xl">
          <MangaCaption tone="paper" className="mb-3">
            <Compass className="h-3.5 w-3.5 text-[#0F172A]" />
            <span>{t("subtitle")}</span>
          </MangaCaption>
          <h2 className="text-balance text-[clamp(1.85rem,3.8vw,3.4rem)] font-black leading-tight tracking-tight text-[#0F172A]">
            {t("title")}
          </h2>
          <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-700 sm:text-base">
            {t("description")}
          </p>
        </div>

        {/* Asymmetric BagUI Action Cards */}
        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {gateways.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.id}
                href={item.href}
                data-analytics-event="primary_cta_clicked"
                data-analytics-cta={`home_gateway_${item.id}`}
                className="group block cursor-pointer"
              >
                <MangaPanel
                  tone={item.accentTone}
                  cutCorner="top-right"
                  interactive
                  className={cn(
                    "flex h-full flex-col justify-between p-6 transition-all border-2 border-[#0F172A] shadow-[4px_4px_0_#0F172A] hover:-translate-y-1.5 hover:shadow-[6px_6px_0_#0F172A]",
                    item.featured && "ring-2 ring-[#0F172A] manga-nb-featured-pulse"
                  )}
                >
                  <div>
                    {/* Header Icon & Tag */}
                    <div className="flex items-center justify-between">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-[#0F172A] bg-white text-[#0F172A] shadow-[3px_3px_0_#0F172A] transition-transform duration-200 group-hover:scale-105">
                        <Icon className="h-5 w-5" />
                      </div>
                      {item.featured ? (
                        <span className="rounded-full border-2 border-[#0F172A] bg-[#0F172A] px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white shadow-[2px_2px_0_rgba(15,23,42,0.2)]">
                          POPULAR
                        </span>
                      ) : null}
                    </div>

                    {/* Title & Desc */}
                    <h3 className="mt-5 text-xl font-black text-[#0F172A]">
                      {t(item.titleKey)}
                    </h3>
                    <p className="mt-2 text-xs font-semibold leading-relaxed text-[#0F172A]/80">
                      {item.id === "news" && latestNewsTitle
                        ? t("newsDescLatest", { title: latestNewsTitle })
                        : t(item.descKey)}
                    </p>
                  </div>

                  {/* Action Link Row */}
                  <div className="mt-6 flex items-center justify-between border-t-2 border-[#0F172A]/15 pt-3 text-xs font-black text-[#0F172A]">
                    <span>
                      {item.id === "build"
                        ? t(item.actionKey, { kw: solarSizeKw })
                        : t(item.actionKey)}
                    </span>
                    <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                  </div>
                </MangaPanel>
              </Link>
            );
          })}
        </div>

      </div>

      {/* Embedded Compact Footer */}
      <div className="mt-16 w-full border-t-2 border-[#0F172A]">
        <Footer settings={websiteSettings} compact />
      </div>
    </MangaChapter>
  );
}

