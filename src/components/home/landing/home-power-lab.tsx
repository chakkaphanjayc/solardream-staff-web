"use client";

import { FiBattery, FiGrid, FiHome, FiSun, FiZap } from "react-icons/fi";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { useSolarSimulation } from "@/hooks/use-solar-simulation";
import type {
  SolarSimulationAppliances,
  SolarSimulationBattery,
  SolarSimulationTilt,
} from "@/lib/solar/home-simulation";
import styles from "./home-landing.module.css";

type HomePowerLabProps = Readonly<{
  locale: string;
}>;

const TILT_OPTIONS: readonly SolarSimulationTilt[] = [0, 15, 30, 45];
const BATTERY_OPTIONS: readonly SolarSimulationBattery[] = [0, 5, 10];
const APPLIANCES: readonly (Readonly<{
  key: keyof SolarSimulationAppliances;
  icon: typeof FiZap;
  labelKey: "airConditioner" | "evCharger" | "waterHeater";
}>)[] = [
  { key: "airConditioner", icon: FiHome, labelKey: "airConditioner" },
  { key: "evCharger", icon: FiZap, labelKey: "evCharger" },
  { key: "waterHeater", icon: FiSun, labelKey: "waterHeater" },
];

function formatNumber(value: number, locale: string, maximumFractionDigits = 1) {
  return new Intl.NumberFormat(locale === "th" ? "th-TH" : "en-US", {
    maximumFractionDigits,
    signDisplay: "exceptZero",
  }).format(value);
}

function signedKw(value: number, locale: string) {
  return `${formatNumber(value, locale)} kW`;
}

export function HomePowerLab({ locale }: HomePowerLabProps) {
  const t = useTranslations("HomeLanding");
  const simulation = useSolarSimulation();
  const { result } = simulation;
  const flowClass = result.status === "importing" || result.status === "discharging"
    ? styles.flowLineImport
    : styles.flowLineExport;

  const metricItems = [
    { label: t("lab.solar"), value: signedKw(result.solarKw, locale), icon: FiSun },
    { label: t("lab.home"), value: signedKw(result.homeLoadKw, locale), icon: FiHome },
    { label: t("lab.batteryFlow"), value: signedKw(result.batteryFlowKw, locale), icon: FiBattery },
    { label: t("lab.gridFlow"), value: signedKw(result.gridFlowKw, locale), icon: FiGrid },
    { label: t("lab.net"), value: signedKw(result.netKw, locale), icon: FiZap },
    { label: t("lab.saving"), value: `฿${new Intl.NumberFormat(locale === "th" ? "th-TH" : "en-US").format(result.estimatedSavingThb)}`, icon: FiZap },
  ] as const;

  return (
    <section id="solar-lab" className={`${styles.section} ${styles.labSection}`} aria-labelledby="solar-lab-title">
      <div className={styles.container}>
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.eyebrow}>{t("lab.eyebrow")}</p>
            <h2 id="solar-lab-title" className={styles.sectionTitle}>{t("lab.title")}</h2>
          </div>
          <p className={styles.sectionDescription}>{t("lab.description")}</p>
        </div>

        <div className={styles.labGrid}>
          <Card tone="dark" className={styles.labStage}>
            <div className={styles.labStageTop}>
              <div>
                <h3>{t("lab.simulated")}</h3>
                <p>{result.hour}:00 · {formatNumber(result.sunlightFactor * 100, locale)}% {t("lab.sunlightFactor")}</p>
              </div>
              <span className={styles.labBadge}>{t(`lab.${result.status}`)}</span>
            </div>

            <div className={styles.houseVisual} role="img" aria-label={t("lab.houseAria")}>
              <span className={`${styles.flowLine} ${styles.flowLineLeft} ${flowClass}`} aria-hidden="true" />
              <span className={`${styles.flowLine} ${styles.flowLineRight} ${flowClass}`} aria-hidden="true" />
              <div className={styles.houseShape}>
                <div className={styles.houseRoof}>
                  <div className={styles.panelGroup} aria-hidden="true">
                    {Array.from({ length: 16 }, (_, index) => <span key={index} />)}
                  </div>
                </div>
                <div className={styles.houseBody}>
                  <span className={styles.houseWindow} aria-hidden="true" />
                </div>
                <span className={styles.houseBattery} aria-hidden="true"><FiBattery /></span>
                <span className={styles.houseGrid} aria-hidden="true"><FiGrid /></span>
              </div>
            </div>

            <p className={styles.labFlowHint}>{t("lab.flowHint")}</p>

            <div className={styles.labMetrics} aria-live="polite">
              {metricItems.map(({ icon: Icon, label, value }) => (
                <div className={styles.labMetric} key={label}>
                  <span className={styles.labMetricIcon}><Icon aria-hidden="true" /></span>
                  <span className={styles.labMetricValue}>{value}</span>
                  <span className={styles.labMetricLabel}>{label}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className={styles.labDock}>
            <div className={styles.controlGroup}>
              <div className={styles.controlGroupHeader}>
                <h4>{t("lab.time")}</h4>
                <span>{result.hour}:00</span>
              </div>
              <label htmlFor="lab-hour" className="sr-only">{t("lab.time")}</label>
              <input
                id="lab-hour"
                className={styles.range}
                type="range"
                min="6"
                max="21"
                step="1"
                value={simulation.hour}
                onChange={(event) => simulation.setHour(Number(event.target.value))}
              />
            </div>

            <div className={styles.controlGroup}>
              <div className={styles.controlGroupHeader}><h4>{t("lab.tilt")}</h4><span>{simulation.roofTilt}°</span></div>
              <div className={styles.segmented} role="group" aria-label={t("lab.tilt")}>
                {TILT_OPTIONS.map((tilt) => (
                  <button
                    type="button"
                    key={tilt}
                    className={`${styles.segment} ${simulation.roofTilt === tilt ? styles.segmentActive : ""}`}
                    aria-pressed={simulation.roofTilt === tilt}
                    onClick={() => simulation.setRoofTilt(tilt)}
                  >
                    {tilt}°
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.controlGroup}>
              <div className={styles.controlGroupHeader}><h4>{t("lab.condition")}</h4><span>{t(`lab.${simulation.panelCondition}`)}</span></div>
              <div className={`${styles.segmented} ${styles.segmentedThree}`} role="group" aria-label={t("lab.condition")}>
                {(["clean", "dusty"] as const).map((condition) => (
                  <button
                    type="button"
                    key={condition}
                    className={`${styles.segment} ${simulation.panelCondition === condition ? styles.segmentActive : ""}`}
                    aria-pressed={simulation.panelCondition === condition}
                    onClick={() => simulation.setPanelCondition(condition)}
                  >
                    {t(`lab.${condition}`)}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.controlGroup}>
              <div className={styles.controlGroupHeader}><h4>{t("lab.battery")}</h4><span>{simulation.batteryCapacityKwh === 0 ? t("lab.none") : `${simulation.batteryCapacityKwh} kWh`}</span></div>
              <div className={`${styles.segmented} ${styles.segmentedThree}`} role="group" aria-label={t("lab.battery")}>
                {BATTERY_OPTIONS.map((battery) => (
                  <button
                    type="button"
                    key={battery}
                    className={`${styles.segment} ${simulation.batteryCapacityKwh === battery ? styles.segmentActive : ""}`}
                    aria-pressed={simulation.batteryCapacityKwh === battery}
                    onClick={() => simulation.setBatteryCapacityKwh(battery)}
                  >
                    {battery === 0 ? t("lab.none") : `${battery} kWh`}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.controlGroup}>
              <div className={styles.controlGroupHeader}><h4>{t("lab.appliances")}</h4><span>{formatNumber(result.homeLoadKw, locale)} kW {t("lab.load")}</span></div>
              <div className={styles.toggleGrid}>
                {APPLIANCES.map(({ icon: Icon, key, labelKey }) => {
                  const isActive = simulation.appliances[key];
                  return (
                    <button
                      type="button"
                      key={key}
                      className={`${styles.applianceToggle} ${isActive ? styles.toggleActive : ""}`}
                      aria-pressed={isActive}
                      onClick={() => simulation.toggleAppliance(key)}
                    >
                      <span><span className={styles.applianceIcon}><Icon aria-hidden="true" /></span>{t(`lab.${labelKey}`)}</span>
                      <span className={styles.togglePill} aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={styles.labStatus} role="status">
              <span className={styles.labStatusDot} aria-hidden="true" />
              {t(`lab.${result.status}`)} · {result.hour}:00
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
}
