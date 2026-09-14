"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FiActivity, FiSun } from "react-icons/fi";
import { useTranslations } from "next-intl";
import { useSolarHome } from "../solar-home-context";
import styles from "./home-landing.module.css";

type HomeDayStoryProps = Readonly<{
  locale: string;
}>;

const STORY_HOURS = [6, 9, 12, 15, 18] as const;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function formatNumber(value: number, locale: string, maximumFractionDigits = 0) {
  return new Intl.NumberFormat(locale === "th" ? "th-TH" : "en-US", {
    maximumFractionDigits,
  }).format(value);
}

function productionAtHour(hour: number, dailyKwh: number) {
  if (hour < 6 || hour > 18) return 0;
  return Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI)) * dailyKwh * 0.42;
}

export function HomeDayStory({ locale }: HomeDayStoryProps) {
  const t = useTranslations("HomeLanding");
  const { estimate, solarSizeKwp, weather } = useSolarHome();
  const sectionRef = useRef<HTMLElement | null>(null);
  const [activeHour, setActiveHour] = useState(12);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const updateFromScroll = () => {
      const rect = section.getBoundingClientRect();
      const focusLine = window.innerHeight * 0.58;
      const progress = clamp((focusLine - rect.top) / Math.max(rect.height, 1), 0, 1);
      setActiveHour(Math.round(6 + progress * 12));
    };

    updateFromScroll();
    window.addEventListener("scroll", updateFromScroll, { passive: true });
    window.addEventListener("resize", updateFromScroll);
    return () => {
      window.removeEventListener("scroll", updateFromScroll);
      window.removeEventListener("resize", updateFromScroll);
    };
  }, []);

  const chart = useMemo(() => {
    const width = 1000;
    const baseY = 248;
    const amplitude = 160;
    const points = Array.from({ length: 13 }, (_, index) => 6 + index);
    const productionPoints = points.map((hour) => {
      const value = productionAtHour(hour, estimate.dailyKwh);
      const x = 64 + ((hour - 6) / 12) * 872;
      const y = baseY - (value / Math.max(estimate.dailyKwh * 0.42, 1)) * amplitude;
      return `${x},${y}`;
    });
    const homePoints = points.map((hour) => {
      const middayLift = hour >= 9 && hour <= 16 ? 0.16 : 0.04;
      const value = estimate.dailyKwh * (0.18 + middayLift);
      const x = 64 + ((hour - 6) / 12) * 872;
      const y = baseY - (value / Math.max(estimate.dailyKwh * 0.42, 1)) * amplitude;
      return `${x},${y}`;
    });
    const markerX = 64 + ((activeHour - 6) / 12) * 872;
    const markerValue = productionAtHour(activeHour, estimate.dailyKwh);
    const markerY = baseY - (markerValue / Math.max(estimate.dailyKwh * 0.42, 1)) * amplitude;

    return {
      width,
      productionPoints: productionPoints.join(" "),
      homePoints: homePoints.join(" "),
      markerX,
      markerY,
      markerValue,
    };
  }, [activeHour, estimate.dailyKwh]);

  return (
    <section
      ref={sectionRef}
      id="energy-day"
      className={`${styles.section} ${styles.daySection}`}
      aria-labelledby="energy-day-title"
    >
      <div className={`${styles.container} ${styles.dayGrid}`}>
        <div className={styles.dayCopy}>
          <p className={styles.eyebrow}>{t("day.eyebrow")}</p>
          <h2 id="energy-day-title" className={styles.sectionTitle}>{t("day.title")}</h2>
          <p className={styles.sectionDescription}>{t("day.description")}</p>
          <div className={styles.dayStats} aria-live="polite">
            <div className={styles.dayStat}>
              <span>{t("day.typicalDay")}</span>
              <strong>{formatNumber(estimate.dailyKwh, locale, 1)} kWh</strong>
            </div>
            <div className={styles.dayStat}>
              <span>{t("day.marker")}</span>
              <strong>{formatNumber(productionAtHour(activeHour, estimate.dailyKwh), locale, 1)} kWh</strong>
            </div>
            <div className={styles.dayStat}>
              <span>{t("estimator.sizeLabel")}</span>
              <strong>{formatNumber(solarSizeKwp, locale, 1)} kWp</strong>
            </div>
          </div>
        </div>

        <div className={styles.dayChartCard}>
          <div className={styles.chartHeader}>
            <div>
              <h3>{t("day.typicalDay")}</h3>
              <p>{t("day.note")}</p>
            </div>
            <div className={styles.chartLegend} aria-hidden="true">
              <span className={styles.legendItem}>
                <span className={styles.legendSwatch} /> {t("day.production")}
              </span>
              <span className={styles.legendItem}>
                <span className={`${styles.legendSwatch} ${styles.legendSwatchHome}`} /> {t("day.homeUse")}
              </span>
            </div>
          </div>

          <div className={styles.chart}>
            <svg
              className={styles.chartSvg}
              viewBox="0 0 1000 320"
              role="img"
              aria-labelledby="energy-day-chart-label"
            >
              <title id="energy-day-chart-label">{t("day.chartAria")}</title>
              {[78, 138, 198, 248].map((y) => (
                <line key={y} x1="64" x2="936" y1={y} y2={y} className={styles.chartGridLine} />
              ))}
              <polyline points={chart.homePoints} className={styles.chartHomeUse} />
              <polyline points={chart.productionPoints} className={styles.chartProduction} />
              <line x1={chart.markerX} x2={chart.markerX} y1="50" y2="258" className={styles.chartMarkerLine} />
              <circle cx={chart.markerX} cy={chart.markerY} r="8" className={styles.chartMarkerDot} />
              <text x={chart.markerX} y={Math.max(chart.markerY - 18, 25)} textAnchor="middle" className={styles.chartMarkerLabel}>
                {formatNumber(chart.markerValue, locale, 1)} kWh
              </text>
              {STORY_HOURS.map((hour) => (
                <text
                  key={hour}
                  x={64 + ((hour - 6) / 12) * 872}
                  y="286"
                  textAnchor="middle"
                  className={styles.chartAxis}
                >
                  {t(`day.times.${hour === 6 ? "six" : hour === 9 ? "nine" : hour === 12 ? "twelve" : hour === 15 ? "fifteen" : "eighteen"}`)}
                </text>
              ))}
            </svg>
            <div className={styles.chartControl}>
              <FiSun aria-hidden="true" />
              <label htmlFor="day-story-hour" className="sr-only">{t("day.marker")}</label>
              <input
                id="day-story-hour"
                className={styles.chartRange}
                type="range"
                min="6"
                max="18"
                step="1"
                value={activeHour}
                onChange={(event) => setActiveHour(Number(event.target.value))}
                aria-valuetext={`${activeHour}:00`}
              />
              <span>{activeHour}:00</span>
            </div>
          </div>
          <p className={styles.storyNote}>
            <FiActivity aria-hidden="true" /> {t("day.note")} · {formatNumber(weather.sunlightIndexPercent, locale)}%
          </p>
        </div>
      </div>
    </section>
  );
}
