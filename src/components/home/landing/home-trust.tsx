"use client";

import { FiCheckCircle } from "react-icons/fi";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import styles from "./home-landing.module.css";

const TRUST_KEYS = ["engineering", "estimates", "tracking", "documents", "warranty", "support"] as const;

export function HomeTrust() {
  const t = useTranslations("HomeLanding");

  return (
    <section id="trust" className={`${styles.section} ${styles.trustSection}`} aria-labelledby="trust-title">
      <div className={styles.container}>
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.eyebrow}>{t("trust.eyebrow")}</p>
            <h2 id="trust-title" className={styles.sectionTitle}>{t("trust.title")}</h2>
          </div>
          <p className={styles.sectionDescription}>{t("trust.description")}</p>
        </div>

        <div className={styles.trustGrid}>
          {TRUST_KEYS.map((key, index) => (
            <Card key={key} className={styles.trustCard}>
              <span className={styles.trustNumber}>{String(index + 1).padStart(2, "0")}</span>
              <h3><FiCheckCircle aria-hidden="true" /> {t(`trust.items.${key}.title`)}</h3>
              <p>{t(`trust.items.${key}.description`)}</p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
