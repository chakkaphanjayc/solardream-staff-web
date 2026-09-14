"use client";

import Link from "next/link";
import { FiArrowUpRight, FiClock, FiMessageCircle } from "react-icons/fi";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import Footer from "@/components/layout/Footer";
import type { WebsiteSettings } from "@/lib/websiteSettingsTypes";
import styles from "./home-landing.module.css";

type HomeCtaProps = Readonly<{
  locale: string;
  latestNewsTitle?: string;
  websiteSettings: WebsiteSettings;
}>;

export function HomeCta({ locale, latestNewsTitle, websiteSettings }: HomeCtaProps) {
  const t = useTranslations("HomeLanding");

  return (
    <section id="home-cta" className={styles.ctaSection} aria-labelledby="home-cta-title">
      <div className={styles.ctaInner}>
        <div>
          <p className={styles.eyebrow}>{t("cta.eyebrow")}</p>
          <h2 id="home-cta-title" className={styles.ctaTitle}>
            <span className="block">{t("cta.titleLineOne")}</span>
            <span className="block text-[#B7D1EA]">{t("cta.titleLineTwo")}</span>
          </h2>
          <p className={styles.ctaDescription}>{t("cta.description")}</p>
          <div className={styles.ctaActions}>
            <Button asChild size="lg">
              <Link href={`/${locale}/build`}>
                {t("cta.primary")} <FiArrowUpRight aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href={`/${locale}/contact`}>
                {t("cta.secondary")} <FiMessageCircle aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>

        <div>
          <p className={styles.ctaNote}><FiClock aria-hidden="true" /> {t("cta.time")}</p>
          {latestNewsTitle ? (
            <Link href={`/${locale}/news`} className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-[#B7D1EA] underline-offset-4 hover:underline">
              <span>{t("cta.news")}</span>
              <FiArrowUpRight aria-hidden="true" />
            </Link>
          ) : null}
          {latestNewsTitle ? <p className="mt-2 max-w-sm text-sm leading-6 text-white/60">{latestNewsTitle}</p> : null}
        </div>
      </div>
      <Footer settings={websiteSettings} />
    </section>
  );
}
