"use client";

import type { WebsiteSettings } from "@/lib/websiteSettingsTypes";
import type { LiveSolarData } from "@/lib/weather";
import type { HeaderNavigationItem } from "@/lib/header-navigation";
import type { PortfolioProjectListItem } from "@/types/portfolio";
import { useTranslations } from "next-intl";
import FloatingNavbar from "./floating-navbar";
import Footer from "@/components/layout/Footer";
import { SolarHomeStateProvider, useSolarHome } from "./solar-home-context";
import SolarJourneyHome from "./journey/solar-journey-home";
import journeyStyles from "./journey/solar-journey.module.css";

export type SolarDreamHomeProps = Readonly<{
  locale: string;
  websiteSettings: WebsiteSettings;
  initialShowcaseProjects: readonly PortfolioProjectListItem[];
  liveSolarData: LiveSolarData | null;
  navigationItems: readonly HeaderNavigationItem[];
  forumUrl: string;
}>;

export default function SolarDreamHome({
  locale,
  websiteSettings,
  initialShowcaseProjects,
  liveSolarData,
  navigationItems,
  forumUrl,
}: SolarDreamHomeProps) {
  return (
    <SolarHomeStateProvider
      locale={locale}
      initialLiveSolarData={liveSolarData}
    >
      <SolarDreamHomeSurface
        locale={locale}
        websiteSettings={websiteSettings}
        initialShowcaseProjects={initialShowcaseProjects}
        navigationItems={navigationItems}
        forumUrl={forumUrl}
      />
    </SolarHomeStateProvider>
  );
}

function SolarDreamHomeSurface({
  locale,
  websiteSettings,
  initialShowcaseProjects,
  navigationItems,
  forumUrl,
}: Omit<SolarDreamHomeProps, "liveSolarData">) {
  const t = useTranslations("HomeLanding");
  const { weather } = useSolarHome();
  const homeSectionLinks = [
    { id: "product", label: t("nav.product"), href: "#journey-sun" },
    { id: "how-it-works", label: t("nav.howItWorks"), href: "#journey-energy" },
    { id: "projects", label: t("nav.projects"), href: "#journey-projects" },
    { id: "knowledge", label: t("nav.knowledge"), href: `/${locale}/news` },
  ] as const;

  return (
    <div
      data-bagui="solar-dream-home"
      data-weather={weather.weatherId}
      className="min-h-dvh"
    >
      <FloatingNavbar
        locale={locale}
        navigationItems={navigationItems}
        forumUrl={forumUrl}
        homeSectionLinks={homeSectionLinks}
      />
      <div>
        <SolarJourneyHome
          locale={locale}
          initialShowcaseProjects={initialShowcaseProjects}
        />
      </div>
      <Footer settings={websiteSettings} compact className={journeyStyles.journeyFooter} />
    </div>
  );
}
