"use client";

import Link from "next/link";
import { FiArrowRight, FiClock } from "react-icons/fi";
import Footer from "@/components/layout/Footer";
import type { WebsiteSettings } from "@/lib/websiteSettingsTypes";
import { useSolarHome } from "../solar-home-context";
import styles from "../solar-home.module.css";

type FinalCTAProps = Readonly<{
  locale: string;
  latestNewsTitle?: string;
  websiteSettings: WebsiteSettings;
}>;

export default function FinalCTA({
  locale,
  latestNewsTitle,
  websiteSettings,
}: FinalCTAProps) {
  const isThai = locale === "th";
  const { solarSizeKwp } = useSolarHome();
  const buildHref = `/${locale}/build?kw=${solarSizeKwp}`;

  return (
    <>
      <section
        className={`${styles.sectionShell} ${styles.ctaSection} relative overflow-hidden`}
        aria-labelledby="final-cta-title"
      >
        <div className="blob-organic-3 pointer-events-none absolute -bottom-16 -left-16 h-[34rem] w-[34rem] rounded-full bg-[#B7D1EA]/15 blur-3xl" />
        <div className="blob-organic-4 pointer-events-none absolute top-10 -right-20 h-[32rem] w-[32rem] rounded-full bg-[#DCE8F5]/40 blur-3xl" />
        <div className={styles.contentWidth}>
          <div className={styles.ctaGrid}>
            <div className={styles.ctaCopy}>
              <p className={styles.sectionKicker}>
                {isThai ? "บทต่อไปเป็นของคุณ" : "The next chapter is yours"}
              </p>
              <h2 id="final-cta-title" className={styles.ctaTitle}>
                {isThai
                  ? "บ้านของคุณพร้อมหรือยัง ที่จะสร้างพลังงานของตัวเอง?"
                  : "Is your home ready to make its own energy?"}
              </h2>
              <p className={styles.ctaDescription}>
                {isThai
                  ? "เริ่มจากข้อมูลของบ้านคุณ แล้วให้เราออกแบบระบบที่เหมาะกับการใช้ชีวิตจริง"
                  : "Start with the information your home gives us, then shape a solar system around real daily life."}
              </p>
              <div className={styles.ctaActions}>
                <Link href={buildHref} className={styles.primaryButton}>
                  <span>
                    {isThai ? "ออกแบบ Solar ของฉัน" : "Design my solar"}
                  </span>
                  <FiArrowRight aria-hidden="true" />
                </Link>
                <Link
                  href={`/${locale}/wizard`}
                  className={styles.secondaryButton}
                >
                  {isThai
                    ? "เริ่มด้วยคำถามสั้น ๆ"
                    : "Start with a few questions"}
                </Link>
              </div>
            </div>

            <div className={styles.ctaMeta}>
              <FiClock aria-hidden="true" />
              <span>
                {isThai ? "ใช้เวลาประมาณ 2 นาที" : "Takes about 2 minutes"}
              </span>
              {latestNewsTitle ? (
                <span className={styles.ctaMetaDot} aria-hidden="true" />
              ) : null}
              {latestNewsTitle ? (
                <span>
                  {isThai
                    ? "อัปเดตล่าสุดพร้อมให้เรียนรู้"
                    : "Latest solar stories are ready to explore"}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </section>
      <Footer
        settings={websiteSettings}
        compact
        className={styles.homeFooter}
      />
    </>
  );
}
