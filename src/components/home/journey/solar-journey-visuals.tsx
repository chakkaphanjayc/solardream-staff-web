import Image from "next/image";
import { type CSSProperties, type ReactNode } from "react";
import { FiBatteryCharging, FiHome, FiSun, FiZap } from "react-icons/fi";
import styles from "./solar-journey.module.css";

type SolarHouseIllustrationProps = Readonly<{
  className?: string;
  night?: boolean;
  batteryEnabled?: boolean;
  panelIntensity?: number;
  decorative?: boolean;
}>;

export function SolarHouseIllustration({
  className,
  night = false,
  batteryEnabled = false,
  panelIntensity = 0.7,
  decorative = true,
}: SolarHouseIllustrationProps) {
  const intensity = Math.max(0.25, Math.min(1, panelIntensity));

  return (
    <div className={`${styles.houseIllustration} ${className ?? ""}`} data-house-theme={night ? "night" : "day"}>
      <div
        className={styles.houseGlow}
        style={{ opacity: night ? 0.1 : 0.22 + intensity * 0.24 }}
        aria-hidden="true"
      />
      <Image
        src={night ? "/asset/home-manga/solar-journey-home-dusk-realistic.webp" : "/asset/home-manga/solar-journey-home-midday-realistic.webp"}
        alt={decorative ? "" : "Contemporary home with a rooftop solar array"}
        fill
        quality={82}
        sizes="(max-width: 640px) 100vw, (max-width: 1023px) 70vw, 40vw"
        className={styles.houseImage}
      />
      <span
        className={styles.houseImageTone}
        style={{ opacity: night ? 0.18 : Math.max(0.06, 0.22 - intensity * 0.1) }}
        aria-hidden="true"
      />
      <span
        className={styles.houseImageSheen}
        style={{ opacity: night ? 0.06 : 0.1 + intensity * 0.1 }}
        aria-hidden="true"
      />
      {batteryEnabled ? <span className={styles.houseBatteryBadge} aria-hidden="true"><FiBatteryCharging /></span> : null}
    </div>
  );
}

type EnergyFlowDiagramProps = Readonly<{
  solarKw: number;
  homeLoadKw: number;
  batteryActive: boolean;
  batteryFlowKw: number;
  gridFlowKw: number;
  labels: Readonly<{
    ariaLabel: string;
    sun: string;
    panel: string;
    home: string;
    battery: string;
    grid: string;
    off: string;
    kW: string;
  }>;
}>;

export function EnergyFlowDiagram({
  solarKw,
  homeLoadKw,
  batteryActive,
  batteryFlowKw,
  gridFlowKw,
  labels,
}: EnergyFlowDiagramProps) {
  const flowStyle = (value: number): CSSProperties => ({
    ["--flow-scale" as string]: Math.max(0.35, Math.min(1, Math.abs(value) / 6)),
  });

  return (
    <div className={styles.energyFlowDiagram} role="img" aria-label={labels.ariaLabel}>
      <svg className={styles.energyFlowRoutes} viewBox="0 0 760 360" aria-hidden="true">
        <path d="M380 78V126" className={styles.energyRoute} data-flow-route="sun-panel" />
        <path d="M380 190V238" className={styles.energyRoute} data-flow-route="panel-home" />
        <path d="M380 274H180V304" className={styles.energyRoute} data-flow-route="home-grid-left" />
        <path d="M380 274H580V304" className={styles.energyRoute} data-flow-route="home-grid-right" />
        <path d="M380 274V328" className={styles.energyRoute} data-flow-route="home-battery" />
        <circle cx="380" cy="122" r="4" className={styles.energyParticle} />
        <circle cx="380" cy="234" r="4" className={styles.energyParticle} />
        <circle cx="180" cy="302" r="4" className={styles.energyParticle} />
        <circle cx="580" cy="302" r="4" className={styles.energyParticle} />
      </svg>

      <FlowNode icon={<FiSun aria-hidden="true" />} label={labels.sun} tone="sun" className={styles.flowSun} />
      <FlowNode icon={<FiZap aria-hidden="true" />} label={labels.panel} tone="panel" className={styles.flowPanel} value={`${solarKw.toFixed(1)} ${labels.kW}`} />
      <FlowNode icon={<FiHome aria-hidden="true" />} label={labels.home} tone="home" className={styles.flowHome} value={`${homeLoadKw.toFixed(1)} ${labels.kW}`} />
      <FlowNode icon={<FiBatteryCharging aria-hidden="true" />} label={labels.battery} tone="battery" className={styles.flowBattery} value={batteryActive ? `${Math.abs(batteryFlowKw).toFixed(1)} ${labels.kW}` : labels.off} style={flowStyle(batteryFlowKw)} />
      <FlowNode icon={<FiZap aria-hidden="true" />} label={labels.grid} tone="grid" className={styles.flowGrid} value={`${Math.abs(gridFlowKw).toFixed(1)} ${labels.kW}`} style={flowStyle(gridFlowKw)} />
    </div>
  );
}

type FlowNodeProps = Readonly<{
  icon: ReactNode;
  label: string;
  value?: string;
  tone: "sun" | "panel" | "home" | "battery" | "grid";
  className: string;
  style?: CSSProperties;
}>;

function FlowNode({ icon, label, value, tone, className, style }: FlowNodeProps) {
  return (
    <div className={`${styles.flowNode} ${styles[`flowNode${tone[0].toUpperCase()}${tone.slice(1)}`]} ${className}`} style={style}>
      <span className={styles.flowNodeIcon}>{icon}</span>
      <span className={styles.flowNodeLabel}>{label}</span>
      {value ? <strong className={styles.flowNodeValue}>{value}</strong> : null}
    </div>
  );
}

type SystemAssemblyProps = Readonly<{
  labels: ReadonlyArray<string>;
  ariaLabel: string;
}>;

export function SystemAssembly({ labels, ariaLabel }: SystemAssemblyProps) {
  return (
    <div className={styles.systemAssembly} role="img" aria-label={ariaLabel}>
      <div className={`${styles.assemblyPart} ${styles.assemblyPanel}`} data-assembly-part="panel">
        <span className={styles.assemblyPanelGrid} aria-hidden="true" />
        <span>{labels[0]}</span>
      </div>
      <div className={`${styles.assemblyPart} ${styles.assemblyMounting}`} data-assembly-part="mounting"><span>{labels[1]}</span></div>
      <div className={`${styles.assemblyPart} ${styles.assemblyInverter}`} data-assembly-part="inverter"><FiZap aria-hidden="true" /><span>{labels[2]}</span></div>
      <div className={`${styles.assemblyPart} ${styles.assemblyProtection}`} data-assembly-part="protection"><span>{labels[3]}</span></div>
      <div className={`${styles.assemblyPart} ${styles.assemblyMonitoring}`} data-assembly-part="monitoring"><span>{labels[4]}</span></div>
      <div className={`${styles.assemblyPart} ${styles.assemblyBattery}`} data-assembly-part="battery"><FiBatteryCharging aria-hidden="true" /><span>{labels[5]}</span></div>
      <div className={styles.assemblyCables} data-assembly-part="cables" aria-hidden="true"><i /><i /><i /></div>
      <div className={styles.assemblyCompleteLabel}>{labels[8]}</div>
    </div>
  );
}
