"use client";

import { useCallback, useState } from "react";
import HomeMangaMotion from "@/components/features/home/HomeMangaMotion";
import MangaBackdrop from "@/components/features/home/MangaBackdrop";
import { MangaChapter } from "@/components/features/home/MangaChapter";
import HeroSection from "@/components/agency/sections/HeroSection";
import HomeGatewaySection from "@/components/agency/sections/HomeGatewaySection";
import SolarCellDataSection from "@/components/agency/sections/SolarCellDataSection";
import EcoImpactSection from "@/components/agency/sections/EcoImpactSection";
import CoreValuesTechnologySection from "@/components/agency/sections/CoreValuesTechnologySection";
import FloatingSystemSizeSelector from "@/components/agency/FloatingSystemSizeSelector";
import PortfolioShowcaseSection from "@/components/agency/sections/PortfolioShowcaseSection";
import { cn } from "@/lib/utils";
import type { WebsiteSettings } from "@/lib/websiteSettingsTypes";
import type { PortfolioProjectListItem } from "@/types/portfolio";
import styles from "@/components/features/home/HomeMangaExperience.module.css";

type HomeSolarExperienceProps = Readonly<{
  locale: string;
  latestNewsTitle?: string;
  showAdminSimulator: boolean;
  websiteSettings: WebsiteSettings;
  initialShowcaseProjects: readonly PortfolioProjectListItem[];
}>;

export default function HomeSolarExperience({
  locale,
  latestNewsTitle,
  showAdminSimulator,
  websiteSettings,
  initialShowcaseProjects,
}: HomeSolarExperienceProps) {
  const [solarSizeKw, setSolarSizeKw] = useState(5);
  const [activeSection, setActiveSection] = useState(0);
  const [storyProgress, setStoryProgress] = useState(0);
  const handleActiveSectionChange = useCallback((index: number) => setActiveSection(index), []);
  const handleProgressChange = useCallback((progress: number) => setStoryProgress(progress), []);

  return (
    <div data-bagui="home-experience" className={cn("bagui-page relative isolate w-full", styles.experience)}>
      <MangaBackdrop />
      <div className="relative z-10">
        <HomeMangaMotion onActiveSectionChange={handleActiveSectionChange} onProgressChange={handleProgressChange}>
          <FloatingSystemSizeSelector
            solarSizeKw={solarSizeKw}
            onSolarSizeChange={setSolarSizeKw}
            activeSection={activeSection}
            progress={storyProgress}
          />

          <section data-home-snap-section className={cn(styles.chapterSection, styles.heroSection)}>
            <div className={cn(styles.chapterFrame, styles.heroFrame)}>
              <MangaChapter chapter="sunlight" variant="light">
                <div className={styles.chapterContent}>
                  <HeroSection
                    showAdminSimulator={showAdminSimulator}
                    solarSizeKw={solarSizeKw}
                    onSolarSizeChange={setSolarSizeKw}
                    hideInlineSelector
                  />
                </div>
                <span aria-hidden="true" data-manga-accent className={cn(styles.chapterAccent, styles.chapterAccentTop)} />
                <span aria-hidden="true" data-manga-accent className={cn(styles.chapterAccent, styles.chapterAccentBottom)} />
              </MangaChapter>
            </div>
          </section>

          <section data-home-snap-section className={styles.chapterSection}>
            <div className={styles.chapterFrame}>
              <MangaChapter chapter="sizing" variant="blue">
                <div className={styles.chapterContent}>
                  <SolarCellDataSection
                    locale={locale}
                    solarSizeKw={solarSizeKw}
                    onSolarSizeChange={setSolarSizeKw}
                    isActive={activeSection === 1}
                  />
                </div>
                <span aria-hidden="true" data-manga-accent className={cn(styles.chapterAccent, styles.chapterAccentTop)} />
              </MangaChapter>
            </div>
          </section>

          <section data-home-snap-section className={styles.chapterSection}>
            <div className={styles.chapterFrame}>
              <MangaChapter chapter="technology" variant="light">
                <div className={styles.chapterContent}>
                  <CoreValuesTechnologySection />
                </div>
                <span aria-hidden="true" data-manga-accent className={cn(styles.chapterAccent, styles.chapterAccentBottom)} />
              </MangaChapter>
            </div>
          </section>

          <section data-home-snap-section className={styles.chapterSection}>
            <div className={styles.chapterFrame}>
              <MangaChapter chapter="impact" variant="sun">
                <div className={styles.chapterContent}>
                  <EcoImpactSection solarSizeKw={solarSizeKw} isActive={activeSection === 3} />
                </div>
              </MangaChapter>
            </div>
          </section>

          <section data-home-snap-section className={cn(styles.chapterSection, "py-0")}>
            <div className={styles.portfolioFrame}>
              <MangaChapter chapter="works" variant="ink">
                <div className={styles.chapterContent}>
                  <PortfolioShowcaseSection locale={locale} initialProjects={initialShowcaseProjects} />
                </div>
              </MangaChapter>
            </div>
          </section>

          <section data-home-snap-section className={cn(styles.chapterSection, styles.finalSection)}>
            <div className={styles.chapterFrame}>
              <MangaChapter chapter="next-step" variant="light">
                <div className={styles.chapterContent}>
                  <HomeGatewaySection
                    locale={locale}
                    latestNewsTitle={latestNewsTitle}
                    solarSizeKw={solarSizeKw}
                    websiteSettings={websiteSettings}
                  />
                </div>
              </MangaChapter>
            </div>
          </section>
        </HomeMangaMotion>
      </div>
    </div>
  );
}
