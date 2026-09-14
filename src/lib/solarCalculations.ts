import type {
  HomeSolarCalculationResult,
  HomeSolarSizeKw,
  HomeWeatherId,
  SolarWeatherData,
} from "@/types/home";

export const THAILAND_AVERAGE_PEAK_SUN_HOURS = 4.2;
export const SYSTEM_EFFICIENCY_FACTOR = 0.85;
export const THAILAND_ELECTRICITY_RATE_THB = 4.2;
export const THAILAND_GRID_EMISSION_FACTOR_KG_PER_KWH = 0.475;
export const TREE_CO2_ABSORPTION_KG_PER_YEAR = 21;

export type WeatherCondition = "sunny" | "cloudy" | "rainy" | "night";

export const WEATHER_MODIFIER: Record<WeatherCondition, number> = {
  sunny: 1.0,
  cloudy: 0.6,
  rainy: 0.2,
  night: 0.0,
};

export const SOLAR_CONSTANTS = {
  averagePeakSunHours: THAILAND_AVERAGE_PEAK_SUN_HOURS,
  performanceRatio: SYSTEM_EFFICIENCY_FACTOR,
  gridRateThb: THAILAND_ELECTRICITY_RATE_THB,
  co2FactorKgPerKwh: THAILAND_GRID_EMISSION_FACTOR_KG_PER_KWH,
  treeFactorKgPerYear: TREE_CO2_ABSORPTION_KG_PER_YEAR,
};

/**
 * Returns orientation efficiency factor based on roof azimuth angle in degrees.
 * 180° (South) = 1.00 (optimal in Thailand/Northern Hemisphere)
 * 90° (East) / 270° (West) = 0.90
 * 0° / 360° (North) = 0.80
 */
export function getOrientationModifier(orientationDegrees: number): number {
  const normalized = ((orientationDegrees % 360) + 360) % 360;
  const radians = (normalized * Math.PI) / 180;
  // Peaks at 180 degrees (South) with 1.0, dips to 0.80 at 0/360 (North)
  return 0.9 - 0.1 * Math.cos(radians);
}

export type CalculateSolarOutputInput = {
  panelQuantity: number;
  productWattage: number;
  orientationDegrees?: number;
  weather?: WeatherCondition;
  adjustedSunHours?: number;
};

export type CalculateSolarOutputResult = {
  P_kW: number;
  dailyEnergyKwh: number;
  orientationFactor: number;
  weatherFactor: number;
  performanceRatio: number;
};

/**
 * Standard IEC 61724 calculation: E = P × T × PR
 */
export function calculateSolarOutput(input: CalculateSolarOutputInput): CalculateSolarOutputResult {
  const P_kW = (input.panelQuantity * input.productWattage) / 1000;
  const orientationFactor = getOrientationModifier(input.orientationDegrees ?? 180);
  const weatherFactor = input.weather ? WEATHER_MODIFIER[input.weather] : 1.0;
  const sunHours = input.adjustedSunHours ?? THAILAND_AVERAGE_PEAK_SUN_HOURS;
  const performanceRatio = SYSTEM_EFFICIENCY_FACTOR;

  const dailyEnergyKwh = P_kW * sunHours * performanceRatio * orientationFactor * weatherFactor;

  return {
    P_kW: Number(P_kW.toFixed(2)),
    dailyEnergyKwh: Number(dailyEnergyKwh.toFixed(2)),
    orientationFactor: Number(orientationFactor.toFixed(3)),
    weatherFactor,
    performanceRatio,
  };
}

export type CalculateFinancialsInput = {
  monthlyEnergyKwh: number;
  tariffRate: number;
  daytimeUsagePct: number;
  P_kW: number;
};

export type CalculateFinancialsResult = {
  monthlySavings: number;
  annualSavings: number;
  paybackYears: number;
};

export function calculateFinancials(input: CalculateFinancialsInput): CalculateFinancialsResult {
  const effectiveDaytimePct = Math.min(100, Math.max(0, input.daytimeUsagePct)) / 100;
  const monthlySavings = Math.round(input.monthlyEnergyKwh * input.tariffRate * (0.5 + effectiveDaytimePct * 0.5));
  const annualSavings = monthlySavings * 12;

  // Estimated system cost: ~35,000 THB per kWp
  const estimatedCost = input.P_kW * 35000;
  const paybackYears = annualSavings > 0 ? Number((estimatedCost / annualSavings).toFixed(1)) : 0;

  return {
    monthlySavings,
    annualSavings,
    paybackYears,
  };
}

const DIURNAL_FACTORS = [
  { time: "06:00", factor: 0.05 },
  { time: "08:00", factor: 0.28 },
  { time: "10:00", factor: 0.72 },
  { time: "12:00", factor: 1.0 },
  { time: "14:00", factor: 0.82 },
  { time: "16:00", factor: 0.42 },
  { time: "18:00", factor: 0.08 },
] as const;

/**
 * Calculates deterministic solar production, savings, and environmental metrics
 * based on kW system size for the homepage manga experience.
 */
export function calculateSolarMetrics(sizeKw: HomeSolarSizeKw): HomeSolarCalculationResult {
  const panelCount550w = Math.ceil((sizeKw * 1000) / 550);
  const panelCount450w = Math.ceil((sizeKw * 1000) / 450);
  const dailyOutputKwh = Number((sizeKw * THAILAND_AVERAGE_PEAK_SUN_HOURS * SYSTEM_EFFICIENCY_FACTOR).toFixed(1));
  const monthlySavingsThb = Math.round(dailyOutputKwh * 30 * THAILAND_ELECTRICITY_RATE_THB);
  const annualOutputKwh = Math.round(dailyOutputKwh * 365);
  const avoidedCo2Kg = Math.round(annualOutputKwh * THAILAND_GRID_EMISSION_FACTOR_KG_PER_KWH);
  const treeEquivalent = Math.max(1, Math.round(avoidedCo2Kg / TREE_CO2_ABSORPTION_KG_PER_YEAR));

  const diurnalTrend = DIURNAL_FACTORS.map((point) => ({
    label: point.time,
    value: Number((sizeKw * point.factor * SYSTEM_EFFICIENCY_FACTOR).toFixed(2)),
  }));

  return {
    solarSizeKw: sizeKw,
    panelCount550w,
    panelCount450w,
    dailyOutputKwh,
    monthlySavingsThb,
    annualOutputKwh,
    avoidedCo2Kg,
    treeEquivalent,
    diurnalTrend,
  };
}

export const WEATHER_PRESET_METRICS: Record<
  HomeWeatherId,
  {
    multiplier: number;
    sunHours: number;
    mascotImage: `/asset/${string}`;
    labelKey: string;
    skyLabelKey: string;
    dialogueKey: string;
  }
> = {
  sunny: {
    multiplier: 1.0,
    sunHours: 5.2,
    mascotImage: "/asset/solia-sunny.webp",
    labelKey: "presets.sunny.label",
    skyLabelKey: "presets.sunny.skyLabel",
    dialogueKey: "presets.sunny.dialogue",
  },
  cloudy: {
    multiplier: 0.6,
    sunHours: 3.6,
    mascotImage: "/asset/solia-cloudy.webp",
    labelKey: "presets.cloudy.label",
    skyLabelKey: "presets.cloudy.skyLabel",
    dialogueKey: "presets.cloudy.dialogue",
  },
  rainy: {
    multiplier: 0.2,
    sunHours: 1.8,
    mascotImage: "/asset/solia-rainy.webp",
    labelKey: "presets.rainy.label",
    skyLabelKey: "presets.rainy.skyLabel",
    dialogueKey: "presets.rainy.dialogue",
  },
  night: {
    multiplier: 0.0,
    sunHours: 0.0,
    mascotImage: "/asset/solia-sleepy.webp",
    labelKey: "presets.night.label",
    skyLabelKey: "presets.night.skyLabel",
    dialogueKey: "presets.night.dialogue",
  },
};

export function createPresetSolarWeatherData(weather: HomeWeatherId): SolarWeatherData {
  const preset = WEATHER_PRESET_METRICS[weather];
  const peakIrradiance = Math.round(preset.multiplier * 850);
  const clearSkyPeak = weather === "night" ? 0 : 850;

  const trend = [
    { time: "06:00", factor: 0.08 },
    { time: "09:00", factor: 0.58 },
    { time: "12:00", factor: 1.0 },
    { time: "15:00", factor: 0.64 },
    { time: "18:00", factor: 0.12 },
  ].map((point) => ({
    time: point.time,
    irradianceWm2: Math.round(peakIrradiance * point.factor),
    clearSkyIrradianceWm2: Math.round(clearSkyPeak * point.factor),
  }));

  return {
    source: "fallback",
    weatherId: weather,
    irradianceWm2: peakIrradiance,
    clearSkyIrradianceWm2: clearSkyPeak,
    weatherImpactPct: Math.round(preset.multiplier * 100),
    sunHours: preset.sunHours,
    dailyIrradiationKwhM2: Number((preset.sunHours * preset.multiplier).toFixed(2)),
    cloudCoverPct: weather === "sunny" ? 12 : weather === "cloudy" ? 62 : weather === "rainy" ? 88 : 0,
    trend,
  };
}
