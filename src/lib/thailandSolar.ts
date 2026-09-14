export const THAILAND_SOLAR_DEFAULTS = {
  bangkokLatitude: 13.7563,
  chiangMaiLatitude: 18.7883,
  minLatitude: 13,
  maxLatitude: 18.7,
  performanceRatio: 0.78,
  peakSunHours: 4.75,
  installedCostPerKwp: 25_000,
} as const;

export function clampThailandLatitude(latitude?: number | null) {
  if (typeof latitude !== "number" || Number.isNaN(latitude)) {
    return THAILAND_SOLAR_DEFAULTS.bangkokLatitude;
  }

  return Math.min(
    THAILAND_SOLAR_DEFAULTS.maxLatitude,
    Math.max(THAILAND_SOLAR_DEFAULTS.minLatitude, latitude),
  );
}

export function estimatePeakSunHours(latitude?: number | null) {
  const clampedLatitude = clampThailandLatitude(latitude);
  const northwardRatio =
    (clampedLatitude - THAILAND_SOLAR_DEFAULTS.minLatitude) /
    (THAILAND_SOLAR_DEFAULTS.maxLatitude - THAILAND_SOLAR_DEFAULTS.minLatitude);

  return 5 - northwardRatio * 0.5;
}

export function calculateThailandSolarYield(input: {
  systemKwp: number;
  latitude?: number | null;
  performanceRatio?: number;
  peakSunHours?: number;
}) {
  const performanceRatio = input.performanceRatio ?? THAILAND_SOLAR_DEFAULTS.performanceRatio;
  const peakSunHours = input.peakSunHours ?? estimatePeakSunHours(input.latitude);
  const dailyKwh = input.systemKwp * performanceRatio * peakSunHours;
  const monthlyKwh = dailyKwh * 30;
  const annualKwh = dailyKwh * 365;

  return {
    systemKwp: input.systemKwp,
    performanceRatio,
    peakSunHours,
    dailyKwh,
    monthlyKwh,
    annualKwh,
  };
}

export function calculateThailandRoi(input: {
  annualKwh: number;
  tariffRate: number;
  daytimeUsagePercent: number;
  installCost: number;
}) {
  const selfUseRatio = Math.min(1, Math.max(0, input.daytimeUsagePercent / 100));
  const annualSavings = input.annualKwh * selfUseRatio * input.tariffRate;
  const paybackYears = annualSavings > 0 ? input.installCost / annualSavings : 0;

  return {
    annualSavings,
    monthlySavings: annualSavings / 12,
    paybackYears,
  };
}

export function calculateIrradiancePercentage(dotProduct: number, sunAltitude: number) {
  if (sunAltitude <= 0) return 0;
  return Math.max(0, Math.min(100, dotProduct * 100));
}
