"use client";

import { FiActivity, FiCloud, FiDollarSign, FiSun, FiZap } from "react-icons/fi";
import { AnimatedNumber } from "../animated-number";
import { useSolarHome } from "../solar-home-context";
import styles from "../solar-home.module.css";

type SolarEstimateProps = Readonly<{
  locale: string;
}>;

export default function SolarEstimate({ locale }: SolarEstimateProps) {
  const isThai = locale === "th";
  const { estimate } = useSolarHome();
  const numberLocale = isThai ? "th-TH" : "en-US";
  const metrics = [
    {
      id: "day",
      label: isThai ? "ผลิตได้ต่อวัน" : "Generated per day",
      value: estimate.dailyKwh,
      decimals: 1,
      prefix: "",
      suffix: " kWh",
      icon: FiSun,
    },
    {
      id: "month",
      label: isThai ? "ผลิตได้ต่อเดือน" : "Generated per month",
      value: estimate.monthlyKwh,
      decimals: 0,
      prefix: "",
      suffix: " kWh",
      icon: FiActivity,
    },
    {
      id: "year",
      label: isThai ? "ผลิตได้ต่อปี" : "Generated per year",
      value: estimate.annualKwh,
      decimals: 0,
      prefix: "",
      suffix: " kWh",
      icon: FiZap,
    },
    {
      id: "saving",
      label: isThai ? "ลดค่าไฟต่อเดือน" : "Estimated monthly saving",
      value: estimate.monthlySavingsThb,
      decimals: 0,
      prefix: "฿",
      suffix: "",
      icon: FiDollarSign,
    },
    {
      id: "co2",
      label: isThai ? "ลด CO₂ ต่อปี" : "CO₂ avoided per year",
      value: estimate.avoidedCo2Tons,
      decimals: 1,
      prefix: "",
      suffix: " t",
      icon: FiCloud,
    },
  ] as const;

  return (
    <div className={styles.estimateBlock}>
      <div className={styles.estimateHeader}>
        <div>
          <p className={styles.fieldLabel}>{isThai ? "ภาพรวมพลังงานของบ้านคุณ" : "Your home energy picture"}</p>
          <p className={styles.estimateSummary}>
            {isThai
              ? `ระบบ ${estimate.solarSizeKwp} kWp จากแสงแดดเฉลี่ย ${estimate.typicalSunHours} ชั่วโมงต่อวัน`
              : `${estimate.solarSizeKwp} kWp system, based on ${estimate.typicalSunHours} typical sun hours per day`}
          </p>
        </div>
        <p className={styles.estimateStatus}>
          <span aria-hidden="true" />
          {isThai ? "ประมาณการเบื้องต้น" : "First estimate"}
        </p>
      </div>

      <dl className={styles.metricGrid}>
        {metrics.map(({ id, label, value, decimals, prefix, suffix, icon: Icon }) => (
          <div className={styles.metric} key={id}>
            <dt>
              <Icon aria-hidden="true" />
              <span>{label}</span>
            </dt>
            <dd>
              <AnimatedNumber
                value={value}
                decimals={decimals}
                prefix={prefix}
                suffix={suffix}
                locale={numberLocale}
              />
            </dd>
          </div>
        ))}
      </dl>

      <p className={styles.disclaimer}>
        {isThai
          ? "ค่าประมาณนี้อิงจากค่าเฉลี่ยแสงแดดและประสิทธิภาพระบบ อาจเปลี่ยนแปลงตามทิศทางและองศาหลังคา เงาบัง อุปกรณ์ และสภาพอากาศจริง"
          : "Estimates use regional sunlight and system efficiency. Your result will vary with roof direction, tilt, shading, equipment, and weather."}
      </p>
    </div>
  );
}
