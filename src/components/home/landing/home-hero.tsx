"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "motion/react";
import {
  FiArrowUpRight,
  FiCheckCircle,
  FiMapPin,
  FiSun,
} from "react-icons/fi";
import { useTranslations } from "next-intl";
import { useSolarHome } from "../solar-home-context";
import type { HomeWeatherId } from "@/types/home";
import styles from "./home-landing.module.css";

type HomeHeroProps = Readonly<{
  locale: string;
}>;

const HERO_IMAGES: Record<HomeWeatherId, string> = {
  sunny: "/asset/home-manga/hero-solar-home-sunny.png",
  cloudy: "/asset/home-manga/hero-solar-home-cloudy.png",
  rainy: "/asset/home-manga/hero-solar-home-rainy.png",
  night: "/asset/home-manga/hero-solar-home-night.png",
};

function formatNumber(value: number, locale: string, maximumFractionDigits = 0) {
  return new Intl.NumberFormat(locale === "th" ? "th-TH" : "en-US", {
    maximumFractionDigits,
  }).format(value);
}

export function HomeHero({ locale }: HomeHeroProps) {
  const t = useTranslations("HomeLanding");
  const { estimate, location, solarSizeKwp, weather } = useSolarHome();
  const imageSource = HERO_IMAGES[weather.weatherId];
  const imageAlt = t("hero.imageAlt");

  return (
    <motion.section
      id="solar"
      className={`${styles.section} ${styles.hero}`}
      aria-labelledby="solar-hero-title"
      initial={false}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.55, ease: "easeOut" }}
    >
      <div className={`${styles.container} ${styles.heroGrid}`}>
        <motion.div
          className={styles.heroCopy}
          initial={false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, delay: 0.08, ease: "easeOut" }}
        >
          <p className={styles.eyebrow}>{t("hero.eyebrow")}</p>
          <h1 id="solar-hero-title" className={styles.heroTitle}>
            <span className={styles.heroTitleLine}>{t("hero.titleLineOne")}</span>
            <span className={`${styles.heroTitleLine} ${styles.heroTitleLineAccent}`}>
              {t("hero.titleLineTwo")}
            </span>
          </h1>
          <p className={styles.heroDescription}>{t("hero.description")}</p>

          <div className={styles.heroActions}>
            <Link
              href={`/${locale}/build?kw=${solarSizeKwp}`}
              className={styles.primaryCta}
            >
              {t("hero.primaryCta")}
              <FiArrowUpRight aria-hidden="true" />
            </Link>
            <a href="#solar-lab" className={styles.secondaryCta}>
              {t("hero.secondaryCta")}
              <FiArrowUpRight aria-hidden="true" />
            </a>
          </div>

          <ul className={styles.trustList} aria-label={t("hero.eyebrow")}>
            <li className={styles.trustItem}>
              <FiCheckCircle aria-hidden="true" />
              {t("hero.trust.engineer")}
            </li>
            <li className={styles.trustItem}>
              <FiCheckCircle aria-hidden="true" />
              {t("hero.trust.estimate")}
            </li>
            <li className={styles.trustItem}>
              <FiCheckCircle aria-hidden="true" />
              {t("hero.trust.planning")}
            </li>
          </ul>
        </motion.div>

        <motion.div
          className={styles.heroVisual}
          initial={false}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.18, ease: "easeOut" }}
        >
          <div className={styles.heroVisualFrame}>
            <Image
              key={imageSource}
              src={imageSource}
              alt={imageAlt}
              fill
              priority
              sizes="(max-width: 820px) 100vw, 56vw"
              className={styles.heroImage}
            />
            <span className={styles.heroVisualLabel}>
              <FiSun aria-hidden="true" />
              {t("hero.visualLabel")}
            </span>
          </div>

          <div className={styles.heroMetrics} aria-label={t("hero.visualLabel")}>
            <div className={styles.heroMetric}>
              <span className={styles.heroMetricValue}>
                {formatNumber(solarSizeKwp, locale, 1)} kWp
              </span>
              <span className={styles.heroMetricLabel}>{t("hero.metrics.system")}</span>
            </div>
            <div className={styles.heroMetric}>
              <span className={styles.heroMetricValue}>
                ฿{formatNumber(estimate.monthlySavingsThb, locale)}
              </span>
              <span className={styles.heroMetricLabel}>{t("hero.metrics.saving")}</span>
            </div>
            <div className={styles.heroMetric}>
              <span className={styles.heroMetricValue}>
                {formatNumber(estimate.avoidedCo2Tons, locale, 1)} t
              </span>
              <span className={styles.heroMetricLabel}>{t("hero.metrics.co2")}</span>
            </div>
            <div className={styles.heroMetric}>
              <span className={styles.heroMetricValue}>
                {formatNumber(estimate.annualKwh, locale)} kWh
              </span>
              <span className={styles.heroMetricLabel}>{t("hero.metrics.energy")}</span>
            </div>
          </div>

          <div className="sr-only">
            <span>{location.label}</span>
            <span>{weather.source}</span>
            <FiMapPin aria-hidden="true" />
          </div>
        </motion.div>
      </div>
    </motion.section>
  );
}
