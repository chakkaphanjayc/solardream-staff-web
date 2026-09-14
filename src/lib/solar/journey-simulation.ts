/**
 * Small, deliberately illustrative model used by the Solar Journey homepage.
 *
 * This is not an engineering calculator or a quotation source. Keeping the
 * model pure makes the educational numbers deterministic, easy to test, and
 * safe to reuse from multiple client islands without duplicating formulas.
 */

export type JourneyDirection = "north" | "east" | "south" | "west";
export type JourneyTilt = 0 | 15 | 30 | 45;
export type JourneyShade = "clear" | "partial";

export type JourneyAppliances = Readonly<{
  airConditioner: boolean;
  evCharger: boolean;
  waterHeater: boolean;
  poolPump: boolean;
}>;

export type JourneyDaySnapshot = Readonly<{
  time: string;
  hour: number;
  kw: number;
  sunX: number;
}>;

export type JourneySimulationInput = Readonly<{
  systemSizeKwp: number;
  sunlightIndexPercent: number;
  hour: number;
  direction: JourneyDirection;
  tilt: JourneyTilt;
  shade: JourneyShade;
  batteryEnabled: boolean;
  appliances: JourneyAppliances;
}>;

export type JourneySimulationResult = Readonly<{
  solarKw: number;
  homeLoadKw: number;
  directUseKw: number;
  surplusKw: number;
  deficitKw: number;
  batteryFlowKw: number;
  gridFlowKw: number;
  netKw: number;
  relativePotentialPercent: number;
  status: "charging" | "discharging" | "exporting" | "importing" | "balanced";
}>;

const DIRECTION_FACTOR: Readonly<Record<JourneyDirection, number>> = {
  north: 0.76,
  east: 0.9,
  south: 1,
  west: 0.88,
};

const TILT_FACTOR: Readonly<Record<JourneyTilt, number>> = {
  0: 0.82,
  15: 0.95,
  30: 1,
  45: 0.86,
};

const APPLIANCE_LOAD_KW: Readonly<Record<keyof JourneyAppliances, number>> = {
  airConditioner: 2.2,
  evCharger: 5.5,
  waterHeater: 2.4,
  poolPump: 1.1,
};

const DAY_POINTS = [
  { time: "06:00", hour: 6, kw: 0.5 },
  { time: "09:00", hour: 9, kw: 3.8 },
  { time: "12:00", hour: 12, kw: 5 },
  { time: "15:00", hour: 15, kw: 3.1 },
  { time: "18:00", hour: 18, kw: 0.4 },
] as const;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, decimals = 1): number {
  return Number(value.toFixed(decimals));
}

/** Returns the relative roof output used by the interactive roof scene. */
export function calculateJourneyRoofPotential(
  direction: JourneyDirection,
  tilt: JourneyTilt,
  shade: JourneyShade,
): number {
  const shadeFactor = shade === "partial" ? 0.84 : 1;
  return Math.round(
    DIRECTION_FACTOR[direction] * TILT_FACTOR[tilt] * shadeFactor * 100,
  );
}

/**
 * Interpolates the scroll-controlled day without involving React state.
 * `progress` is normalized to the 06:00–18:00 teaching window.
 */
export function getJourneyDaySnapshot(progress: number): JourneyDaySnapshot {
  const safeProgress = clamp(progress, 0, 1);
  const position = safeProgress * (DAY_POINTS.length - 1);
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.min(DAY_POINTS.length - 1, lowerIndex + 1);
  const localProgress = position - lowerIndex;
  const lower = DAY_POINTS[lowerIndex];
  const upper = DAY_POINTS[upperIndex];
  const hour = lower.hour + (upper.hour - lower.hour) * localProgress;
  const totalMinutes = Math.round(hour * 60 / 5) * 5;
  const displayHour = Math.floor(totalMinutes / 60);
  const displayMinutes = totalMinutes % 60;

  return {
    time: `${String(displayHour).padStart(2, "0")}:${String(displayMinutes).padStart(2, "0")}`,
    hour,
    kw: round(lower.kw + (upper.kw - lower.kw) * localProgress),
    sunX: 11 + safeProgress * 78,
  };
}

/** Calculates the page's illustrative energy balance from explicit inputs. */
export function calculateJourneySimulation(
  input: JourneySimulationInput,
): JourneySimulationResult {
  const systemSizeKwp = clamp(input.systemSizeKwp, 3, 20);
  const hour = clamp(input.hour, 6, 18);
  const sunlightIndexPercent = clamp(input.sunlightIndexPercent, 35, 100);
  const daylight = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI));
  const regionalSunlight = 0.62 + (sunlightIndexPercent / 100) * 0.38;
  const roofFactor =
    DIRECTION_FACTOR[input.direction] * TILT_FACTOR[input.tilt] *
    (input.shade === "partial" ? 0.84 : 1);
  const solarKw = round(
    systemSizeKwp * 0.92 * daylight * regionalSunlight * roofFactor,
  );

  const homeLoadKw = round(
    0.6 +
      (input.appliances.airConditioner ? APPLIANCE_LOAD_KW.airConditioner : 0) +
      (input.appliances.evCharger ? APPLIANCE_LOAD_KW.evCharger : 0) +
      (input.appliances.waterHeater ? APPLIANCE_LOAD_KW.waterHeater : 0) +
      (input.appliances.poolPump ? APPLIANCE_LOAD_KW.poolPump : 0),
  );
  const netKw = round(solarKw - homeLoadKw);
  const directUseKw = round(Math.min(solarKw, homeLoadKw));
  const surplusKw = round(Math.max(0, netKw));
  const deficitKw = round(Math.max(0, -netKw));
  const batteryLimitKw = input.batteryEnabled ? 2.5 : 0;
  const batteryFlowKw =
    netKw >= 0
      ? round(Math.min(surplusKw, batteryLimitKw))
      : round(-Math.min(deficitKw, batteryLimitKw));
  const gridFlowKw = round(netKw - batteryFlowKw);
  const status =
    batteryFlowKw > 0
      ? "charging"
      : batteryFlowKw < 0
        ? "discharging"
        : gridFlowKw > 0
          ? "exporting"
          : gridFlowKw < 0
            ? "importing"
            : "balanced";

  return {
    solarKw,
    homeLoadKw,
    directUseKw,
    surplusKw,
    deficitKw,
    batteryFlowKw,
    gridFlowKw,
    netKw,
    relativePotentialPercent: Math.round(roofFactor * 100),
    status,
  };
}

export { APPLIANCE_LOAD_KW };
