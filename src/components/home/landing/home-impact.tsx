"use client";

import { motion } from "motion/react";
import { FiCheckCircle, FiTrendingDown, FiZap } from "react-icons/fi";
import { useTranslations } from "next-intl";
import { useSolarHome } from "../solar-home-context";
import styles from "./home-landing.module.css";

type HomeImpactProps = Readonly<{
  locale: string;
}>;

function formatNumber(value: number, locale: string, maximumFractionDigits = 0) {
  return new Intl.NumberFormat(locale === "th" ? "th-TH" : "en-US", {
    maximumFractionDigits,
  }).format(value);
}

export function HomeImpact({ locale }: HomeImpactProps) {
  const t = useTranslations("HomeLanding");
  const { estimate, solarSizeKwp } = useSolarHome();
  const circumference = 2 * Math.PI * 50;
  const ringProgress = Math.min(96, Math.max(18, (estimate.avoidedCo2Kg / 8_000) * 100));
  const ringOffset = circumference * (1 - ringProgress / 100);

  return (
    <section id="impact" className={`${styles.section} ${styles.impactSection}`} aria-labelledby="impact-title">
      <div className={`${styles.container} ${styles.impactGrid}`}>
        <motion.div
          className={styles.impactVisual}
          initial={false}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        >
          <div className={styles.impactOrbit} aria-hidden="true" />
          <div className={styles.impactRing} role="img" aria-label={`${formatNumber(estimate.avoidedCo2Tons, locale, 1)} t CO₂`}>
            <svg className={styles.impactRingSvg} viewBox="0 0 120 120" aria-hidden="true">
              <circle cx="60" cy="60" r="50" className={styles.impactRingTrack} />
              <circle
                cx="60"
                cy="60"
                r="50"
                className={styles.impactRingValue}
                strokeDasharray={circumference}
                strokeDashoffset={ringOffset}
              />
            </svg>
            <div className={styles.impactRingCenter}>
              <strong>{formatNumber(estimate.avoidedCo2Tons, locale, 1)} t</strong>
              <span>{t("impact.ringLabel")}</span>
            </div>
          </div>
        </motion.div>

        <div>
          <p className={styles.eyebrow}>{t("impact.eyebrow")}</p>
          <h2 id="impact-title" className={styles.sectionTitle}>{t("impact.title")}</h2>
          <p className={styles.sectionDescription}>{t("impact.description")}</p>
          <p className={styles.impactSelected}>
            <FiZap aria-hidden="true" /> {t("impact.selected")} · {formatNumber(solarSizeKwp, locale, 1)} kWp
          </p>

          <div className={styles.impactStats} aria-live="polite">
            <div className={styles.impactStat}>
              <strong>{formatNumber(estimate.annualKwh, locale)}</strong>
              <span><FiZap aria-hidden="true" /> {t("impact.annualEnergy")} · kWh</span>
            </div>
            <div className={styles.impactStat}>
              <strong>{formatNumber(estimate.avoidedCo2Tons, locale, 1)} t</strong>
              <span><FiTrendingDown aria-hidden="true" /> {t("impact.co2")}</span>
            </div>
            <div className={styles.impactStat}>
              <strong>{formatNumber(estimate.treeEquivalent, locale)}</strong>
              <span><FiCheckCircle aria-hidden="true" /> {t("impact.trees")}</span>
            </div>
            <div className={styles.impactStat}>
              <strong>฿{formatNumber(estimate.annualSavingsThb, locale)}</strong>
              <span>{t("impact.saving")} {t("impact.perYear")}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
