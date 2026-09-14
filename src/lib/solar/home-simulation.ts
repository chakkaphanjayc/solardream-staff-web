export type SolarSimulationTilt = 0 | 15 | 30 | 45;
export type SolarSimulationBattery = 0 | 5 | 10;
export type SolarSimulationCondition = "clean" | "dusty";

export type SolarSimulationAppliances = Readonly<{
  airConditioner: boolean;
  evCharger: boolean;
  waterHeater: boolean;
}>;

export type SolarSimulationInput = Readonly<{
  systemSizeKwp: number;
  sunlightIndexPercent: number;
  hour: number;
  roofTilt: SolarSimulationTilt;
  panelCondition: SolarSimulationCondition;
  batteryCapacityKwh: SolarSimulationBattery;
  appliances: SolarSimulationAppliances;
}>;

export type SolarSimulationStatus =
  | "charging"
  | "discharging"
  | "exporting"
  | "importing"
  | "balanced";

export type SolarSimulationResult = Readonly<{
  hour: number;
  solarKw: number;
  homeLoadKw: number;
  batteryFlowKw: number;
  gridFlowKw: number;
  netKw: number;
  estimatedSavingThb: number;
  sunAltitudePercent: number;
  sunlightFactor: number;
  status: SolarSimulationStatus;
}>;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, decimals = 1) {
  return Number(value.toFixed(decimals));
}

/**
 * Calculates the homepage lab from explicit inputs. This is a planning
 * simulation, not a live telemetry feed or a quotation calculation.
 */
export function calculateHomeSolarSimulation(
  input: SolarSimulationInput,
): SolarSimulationResult {
  const systemSizeKwp = clamp(input.systemSizeKwp, 3, 20);
  const hour = clamp(input.hour, 6, 21);
  const regionalSunlight = clamp(
    input.sunlightIndexPercent > 0 ? input.sunlightIndexPercent : 82,
    35,
    100,
  );
  const daylight = hour >= 6 && hour <= 18
    ? Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI))
    : 0;
  const sunlightFactor = 0.62 + regionalSunlight / 100 * 0.38;
  const tiltFactor: Record<SolarSimulationTilt, number> = {
    0: 0.84,
    15: 1,
    30: 0.96,
    45: 0.82,
  };
  const conditionFactor = input.panelCondition === "clean" ? 1 : 0.72;
  const solarKw = round(
    systemSizeKwp * 0.92 * daylight * sunlightFactor * tiltFactor[input.roofTilt] * conditionFactor,
  );

  const homeLoadKw = round(
    0.6 +
      (input.appliances.airConditioner ? 2.2 : 0) +
      (input.appliances.evCharger ? 7 : 0) +
      (input.appliances.waterHeater ? 3 : 0),
  );
  const netKw = round(solarKw - homeLoadKw);
  const batteryCapacity = input.batteryCapacityKwh;
  const batteryLimit = batteryCapacity > 0 ? Math.max(0.5, batteryCapacity / 2) : 0;
  const batteryFlowKw = netKw >= 0
    ? round(Math.min(netKw, batteryLimit))
    : round(-Math.min(Math.abs(netKw), batteryLimit));
  const gridFlowKw = netKw >= 0
    ? round(netKw - batteryFlowKw)
    : round(netKw - batteryFlowKw);
  const coveredLoadKw = Math.min(solarKw, homeLoadKw);
  const estimatedSavingThb = Math.round(coveredLoadKw * 4.2);
  const status: SolarSimulationStatus =
    netKw > 0 && batteryFlowKw > 0
      ? "charging"
      : netKw < 0 && batteryFlowKw < 0
        ? "discharging"
        : netKw > 0
          ? "exporting"
          : netKw < 0
            ? "importing"
            : "balanced";

  return {
    hour,
    solarKw,
    homeLoadKw,
    batteryFlowKw,
    gridFlowKw,
    netKw,
    estimatedSavingThb,
    sunAltitudePercent: round(daylight * 100, 0),
    sunlightFactor: round(sunlightFactor, 2),
    status,
  };
}
