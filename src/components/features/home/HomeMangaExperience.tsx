"use client";

import { useState } from "react";
import { HomeSolarStateProvider } from "./HomeSolarStateProvider";
import HomeMangaMotion from "./HomeMangaMotion";
import HomeChapterRail from "./HomeChapterRail";
import HeroMangaSection from "./sections/HeroMangaSection";
import SolarSizingSection from "./sections/SolarSizingSection";
import TechnologyStorySection from "./sections/TechnologyStorySection";
import EcoImpactSection from "./sections/EcoImpactSection";
import PortfolioMangaSection from "./sections/PortfolioMangaSection";
import HomeGatewaySection from "./sections/HomeGatewaySection";
import type { WebsiteSettings } from "@/lib/websiteSettingsTypes";
import type { PortfolioProjectListItem } from "@/types/portfolio";
import type { LiveSolarData } from "@/lib/weather";

export type HomeMangaExperienceProps = Readonly<{
  locale: string;
  latestNewsTitle?: string;
  showAdminSimulator: boolean;
  websiteSettings: WebsiteSettings;
  initialShowcaseProjects: readonly PortfolioProjectListItem[];
  liveSolarData: LiveSolarData | null;
}>;

export default function HomeMangaExperience({
  locale,
  latestNewsTitle,
  showAdminSimulator,
  websiteSettings,
  initialShowcaseProjects,
  liveSolarData,
}: HomeMangaExperienceProps) {
  const [activeChapter, setActiveChapter] = useState(0);

  return (
    <HomeSolarStateProvider initialSizeKw={5}>
      <HomeMangaMotion onActiveSectionChange={setActiveChapter}>
        <HomeChapterRail activeChapter={activeChapter} locale={locale} />

        <main id="main-content" className="relative w-full overflow-x-clip bg-[#F0EEE9] text-[#0F172A]">
          {/* Chapter 1: Sunlight Arrives (Probe 1 Diagonal Hero Split) */}
          <HeroMangaSection showAdminSimulator={showAdminSimulator} liveSolarData={liveSolarData} />

          {/* Chapter 2: Choose Your System Size (Sequential Sizing & Calculations) */}
          <SolarSizingSection />

          {/* Chapter 3: See How The System Works (Blueprint Engineering Panels) */}
          <TechnologyStorySection locale={locale} />

          {/* Chapter 4: Understand Daily Impact (Clean kWh, Avoided CO2 & Tree Equivalent) */}
          <EcoImpactSection />

          {/* Chapter 5: See Real Installations (Verified Photography & Case Study Modal) */}
          <PortfolioMangaSection
            locale={locale}
            initialProjects={initialShowcaseProjects}
          />

          {/* Chapter 6: Choose The Next Step (Asymmetric BagUI Action Cards + Footer) */}
          <HomeGatewaySection
            locale={locale}
            latestNewsTitle={latestNewsTitle}
            websiteSettings={websiteSettings}
          />
        </main>
      </HomeMangaMotion>
    </HomeSolarStateProvider>
  );
}
