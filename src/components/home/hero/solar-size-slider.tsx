"use client";

import type { CSSProperties } from "react";
import { FiGrid, FiSun } from "react-icons/fi";
import { useSolarHome } from "../solar-home-context";
import {
  DEFAULT_SOLAR_SIZE_KWP,
  SOLAR_SIZE_MAX_KWP,
  SOLAR_SIZE_MIN_KWP,
  SOLAR_SIZE_QUICK_PICKS,
  SOLAR_SIZE_STEP_KWP,
} from "../solar-estimates";
import styles from "../solar-home.module.css";

type SolarSizeSliderProps = Readonly<{
  locale: string;
}>;

export default function SolarSizeSlider({ locale }: SolarSizeSliderProps) {
  const isThai = locale === "th";
  const { solarSizeKwp, setSolarSizeKwp, estimate } = useSolarHome();
  const progress = ((solarSizeKwp - SOLAR_SIZE_MIN_KWP) / (SOLAR_SIZE_MAX_KWP - SOLAR_SIZE_MIN_KWP)) * 100;
  const rangeStyle = {
    "--slider-progress": `${progress}%`,
  } as CSSProperties;

  return (
    <div className={styles.sizeSelector}>
      <div className={styles.sizeSelectorHeader}>
        <div>
          <p className={styles.fieldLabel}>{isThai ? "ขนาดระบบที่เหมาะกับคุณ" : "System size for your home"}</p>
          <p className={styles.sizeCurrent}>
            <FiSun aria-hidden="true" />
            <strong>{solarSizeKwp.toFixed(1).replace(".0", "")} kWp</strong>
            <span>{isThai ? "กำลังพอดีกับการเริ่มต้น" : "adjusted to your starting point"}</span>
          </p>
        </div>
        <div className={styles.panelCount}>
          <FiGrid aria-hidden="true" />
          <span>{estimate.panelCount} {isThai ? "แผงโดยประมาณ" : "panels estimated"}</span>
        </div>
      </div>

      <label className="sr-only" htmlFor="solar-size-slider">
        {isThai ? "เลื่อนเพื่อเลือกขนาดระบบโซลาร์เป็นกิโลวัตต์พีค" : "Choose a solar system size in kilowatt-peak"}
      </label>
      <input
        id="solar-size-slider"
        className={styles.rangeInput}
        type="range"
        min={SOLAR_SIZE_MIN_KWP}
        max={SOLAR_SIZE_MAX_KWP}
        step={SOLAR_SIZE_STEP_KWP}
        value={solarSizeKwp}
        style={rangeStyle}
        onChange={(event) => setSolarSizeKwp(Number(event.target.value))}
        aria-valuetext={`${solarSizeKwp} kWp`}
      />
      <div className={styles.rangeScale} aria-hidden="true">
        <span>{SOLAR_SIZE_MIN_KWP} kWp</span>
        <span>{DEFAULT_SOLAR_SIZE_KWP} kWp</span>
        <span>{SOLAR_SIZE_MAX_KWP} kWp</span>
      </div>

      <div className={styles.quickPicks} aria-label={isThai ? "ขนาดระบบที่เลือกบ่อย" : "Common system sizes"}>
        <span className={styles.quickPickLabel}>{isThai ? "เลือกเร็ว" : "Quick select"}</span>
        {SOLAR_SIZE_QUICK_PICKS.map((size) => (
          <button
            type="button"
            key={size}
            className={solarSizeKwp === size ? styles.quickPickActive : styles.quickPick}
            aria-pressed={solarSizeKwp === size}
            onClick={() => setSolarSizeKwp(size)}
          >
            {size} kWp
          </button>
        ))}
      </div>
    </div>
  );
}
