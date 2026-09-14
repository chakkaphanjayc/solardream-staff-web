"use client";

import { useEffect, useRef, useState } from "react";
import { FiArrowUpRight, FiCheckCircle } from "react-icons/fi";
import { useTranslations } from "next-intl";
import { useSolarHome } from "../solar-home-context";
import styles from "./home-landing.module.css";

const STEP_KEYS = ["discover", "design", "review", "install", "generate"] as const;

export function HomeProcess() {
  const t = useTranslations("HomeLanding");
  const sectionRef = useRef<HTMLElement | null>(null);
  const [activeStep, setActiveStep] = useState(0);
  const { solarSizeKwp } = useSolarHome();

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const updateFromScroll = () => {
      const rect = section.getBoundingClientRect();
      const progress = Math.min(0.999, Math.max(0, (window.innerHeight * 0.62 - rect.top) / Math.max(rect.height, 1)));
      setActiveStep(Math.min(STEP_KEYS.length - 1, Math.floor(progress * STEP_KEYS.length)));
    };

    updateFromScroll();
    window.addEventListener("scroll", updateFromScroll, { passive: true });
    window.addEventListener("resize", updateFromScroll);
    return () => {
      window.removeEventListener("scroll", updateFromScroll);
      window.removeEventListener("resize", updateFromScroll);
    };
  }, []);

  const activeKey = STEP_KEYS[activeStep];

  return (
    <section ref={sectionRef} id="process" className={`${styles.section} ${styles.processSection}`} aria-labelledby="process-title">
      <div className={styles.container}>
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.eyebrow}>{t("process.eyebrow")}</p>
            <h2 id="process-title" className={styles.sectionTitle}>{t("process.title")}</h2>
          </div>
          <p className={styles.sectionDescription}>{t("process.description")}</p>
        </div>

        <div className={styles.processTrack} role="list" aria-label={t("process.activeStep")}>
          {STEP_KEYS.map((key, index) => {
            const isActive = index === activeStep;
            return (
              <div className={`${styles.processStep} ${isActive ? styles.processStepActive : ""}`} key={key} role="listitem">
                <button
                  type="button"
                  className={styles.processStepButton}
                  onClick={() => setActiveStep(index)}
                  onMouseEnter={() => setActiveStep(index)}
                  onFocus={() => setActiveStep(index)}
                  aria-current={isActive ? "step" : undefined}
                >
                  <span className={styles.processStepNumber}>{String(index + 1).padStart(2, "0")}</span>
                  <span className={styles.processStepCopy}>
                    <span className={styles.processStepTitle}>{t(`process.steps.${key}.title`)}</span>
                    <span className={styles.processStepDescription}>{t(`process.steps.${key}.description`)}</span>
                  </span>
                </button>
              </div>
            );
          })}
        </div>

        <div className={styles.processDetail} aria-live="polite">
          <FiCheckCircle aria-hidden="true" /> <strong>{t("process.activeStep")}:</strong>{" "}
          {t(`process.steps.${activeKey}.description`)} · {solarSizeKwp} kWp
          <a href="#simulator" className="ml-2 inline-flex min-h-11 items-center gap-1 align-middle font-extrabold text-[#3E6685] underline-offset-4 hover:underline">
            {t("estimator.advanced")} <FiArrowUpRight aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  );
}
