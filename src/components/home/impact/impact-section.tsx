"use client";

import {
  FiCloud,
  FiDollarSign,
  FiFeather,
  FiMap,
  FiZap,
} from "react-icons/fi";
import { AnimatedNumber } from "../animated-number";
import { Reveal } from "../solar-motion";
import { useSolarHome } from "../solar-home-context";
import styles from "../solar-home.module.css";

type ImpactSectionProps = Readonly<{
  locale: string;
}>;

export default function ImpactSection({ locale }: ImpactSectionProps) {
  const isThai = locale === "th";
  const { solarSizeKwp, estimate } = useSolarHome();
  const numberLocale = isThai ? "th-TH" : "en-US";
  const impactRows = [
    {
      label: isThai ? "พลังงานสะอาดต่อปี" : "Clean energy each year",
      detail: isThai ? "ไฟฟ้าที่ผลิตได้จากหลังคาของคุณ" : "Electricity made on your roof",
      value: estimate.annualKwh,
      decimals: 0,
      prefix: "",
      suffix: " kWh",
      icon: FiZap,
    },
    {
      label: isThai ? "ลดการปล่อย CO₂" : "CO₂ avoided",
      detail: isThai ? "เมื่อเทียบกับไฟฟ้าจากโครงข่าย" : "Compared with grid electricity",
      value: estimate.avoidedCo2Tons,
      decimals: 1,
      prefix: "",
      suffix: " t",
      icon: FiCloud,
    },
    {
      label: isThai ? "เทียบเท่าต้นไม้" : "Equivalent to trees",
      detail: isThai ? "ปริมาณ CO₂ ที่ต้นไม้ช่วยดูดซับ" : "The same annual CO₂ absorption",
      value: estimate.treeEquivalent,
      decimals: 0,
      prefix: "",
      suffix: "",
      icon: FiMap,
    },
    {
      label: isThai ? "ประหยัดค่าไฟต่อปี" : "Estimated yearly saving",
      detail: isThai ? "จากการใช้พลังงานแสงอาทิตย์ช่วงกลางวัน" : "From using solar power in the day",
      value: estimate.annualSavingsThb,
      decimals: 0,
      prefix: "฿",
      suffix: "",
      icon: FiDollarSign,
    },
  ] as const;

  return (
    <section id="solutions" className={`${styles.sectionShell} ${styles.impactSection}`} aria-labelledby="impact-title">
      <div className={styles.contentWidth}>
        <div className={styles.impactGrid}>
          <Reveal className={styles.impactCopy}>
            <p className={styles.sectionKicker}>
              <FiFeather aria-hidden="true" /> {isThai ? "พลังงานที่มองเห็นได้" : "A visible difference"}
            </p>
            <h2 id="impact-title" className={styles.impactStatement}>
              {isThai ? "พลังงานที่คุณสร้าง ไม่ได้ลดแค่ค่าไฟ" : "The energy you make changes more than the bill."}
            </h2>
            <p className={styles.sectionDescription}>
              {isThai
                ? `เมื่อเลือก ${solarSizeKwp} kWp บ้านของคุณจะมีพลังงานสะอาดที่วัดผลได้ทุกปี และลดการพึ่งพาไฟฟ้าจากโครงข่ายในช่วงกลางวัน`
                : `With ${solarSizeKwp} kWp on your roof, your home makes measurable clean energy every year and leans less on the grid while the sun is up.`}
            </p>
          </Reveal>

          <Reveal className={styles.impactVisual} transition={{ duration: 0.9, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}>
            <div className={styles.impactRing} aria-label={`${estimate.avoidedCo2Tons} tonnes of CO2 avoided each year`}>
              <div className={styles.impactRingCore}>
                <div className={styles.impactRingValue}>
                  <strong>
                    <AnimatedNumber value={estimate.avoidedCo2Tons} decimals={1} locale={numberLocale} />
                  </strong>
                  <span>{isThai ? "ตัน CO₂ ที่เลี่ยงได้ / ปี" : "tonnes CO₂ avoided / year"}</span>
                </div>
              </div>
              <div className={styles.impactRingMeta}>
                <AnimatedNumber value={solarSizeKwp} decimals={solarSizeKwp % 1 ? 1 : 0} locale={numberLocale} suffix=" kWp" />
                <span>{isThai ? "ขนาดระบบที่เลือก" : "selected system"}</span>
              </div>
            </div>
          </Reveal>
        </div>

        <Reveal className={styles.impactList} transition={{ duration: 0.75, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}>
          {impactRows.map(({ label, detail, value, decimals, prefix, suffix, icon: Icon }) => (
            <div className={styles.impactRow} key={label}>
              <span className={styles.impactIcon}><Icon aria-hidden="true" /></span>
              <span className={styles.impactRowText}>
                <strong>{label}</strong>
                <span>{detail}</span>
              </span>
              <span className={styles.impactValue}>
                <AnimatedNumber value={value} decimals={decimals} prefix={prefix} suffix={suffix} locale={numberLocale} />
              </span>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
