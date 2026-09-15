import type {
  HomeSolarCalculationResult,
  HomeSolarSizeKw,
  HomeWeatherId,
  SolarWeatherData,
} from "@/types/home";
import {
  calculateSolarMetrics as calculateDomainSolarMetrics,
  createPresetSolarWeatherData as createDomainPresetSolarWeatherData,
} from "@solar-dream/solar-domain";

export {
  SOLAR_FORMULA_VERSION,
  SOLAR_CONSTANTS,
  THAILAND_AVERAGE_PEAK_SUN_HOURS,
  SYSTEM_EFFICIENCY_FACTOR,
  THAILAND_ELECTRICITY_RATE_THB,
  THAILAND_GRID_EMISSION_FACTOR_KG_PER_KWH,
  TREE_CO2_ABSORPTION_KG_PER_YEAR,
  WEATHER_MODIFIER,
  getOrientationModifier,
  calculateSolarOutput,
  calculateFinancials,
  WEATHER_PRESET_METRICS,
  type CalculateSolarOutputInput,
  type CalculateSolarOutputResult,
  type CalculateFinancialsInput,
  type CalculateFinancialsResult,
  type WeatherCondition,
  type SolarCalculationSnapshot,
} from "@solar-dream/solar-domain";

export function calculateSolarMetrics(sizeKw: HomeSolarSizeKw): HomeSolarCalculationResult {
  return calculateDomainSolarMetrics(sizeKw);
}

export function createPresetSolarWeatherData(weather: HomeWeatherId): SolarWeatherData {
  return createDomainPresetSolarWeatherData(weather);
}
