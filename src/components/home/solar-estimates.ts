import {
  SYSTEM_EFFICIENCY_FACTOR,
  THAILAND_AVERAGE_PEAK_SUN_HOURS,
  THAILAND_ELECTRICITY_RATE_THB,
  THAILAND_GRID_EMISSION_FACTOR_KG_PER_KWH,
  TREE_CO2_ABSORPTION_KG_PER_YEAR,
} from "@/lib/solarCalculations";

export const SOLAR_SIZE_MIN_KWP = 3;
export const SOLAR_SIZE_MAX_KWP = 20;
export const SOLAR_SIZE_STEP_KWP = 0.5;
export const SOLAR_SIZE_QUICK_PICKS = [3, 5, 10, 20] as const;
export const DEFAULT_SOLAR_SIZE_KWP = 5;

/**
 * Bounds for the lightweight homepage bill-impact estimator. These values are
 * deliberately conservative and only describe a planning range; the full
 * configurator remains responsible for site-specific sizing and quotations.
 */
export const BILL_IMPACT_MIN_MONTHLY_BILL_THB = 1_000;
export const BILL_IMPACT_MAX_MONTHLY_BILL_THB = 100_000;
export const BILL_IMPACT_DEFAULT_MONTHLY_BILL_THB = 5_000;

/** Share of generated energy used directly on site in the homepage estimate. */
export const BILL_IMPACT_SELF_CONSUMPTION_FACTOR = 0.82;

export type SolarSizeQuickPick = (typeof SOLAR_SIZE_QUICK_PICKS)[number];

export type SolarEstimate = Readonly<{
  solarSizeKwp: number;
  typicalSunHours: number;
  dailyKwh: number;
  monthlyKwh: number;
  annualKwh: number;
  monthlySavingsThb: number;
  annualSavingsThb: number;
  avoidedCo2Kg: number;
  avoidedCo2Tons: number;
  treeEquivalent: number;
  panelCount: number;
}>;

/**
 * Typed output for a bill-led homepage planning estimate.
 *
 * The numbers are intentionally explicit so a presentation layer can animate
 * savings and environmental impact without having to repeat any formulas.
 */
export type BillImpactEstimate = Readonly<{
  monthlyBillThb: number;
  solarSizeKwp: number;
  monthlySavingsThb: number;
  annualSavingsThb: number;
  annualKwh: number;
  avoidedCo2Kg: number;
  avoidedCo2Tons: number;
  treeEquivalent: number;
}>;

export function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function normalizeSolarSize(value: number) {
  const safeValue = Number.isFinite(value) ? value : DEFAULT_SOLAR_SIZE_KWP;
  const steppedValue = Math.round(safeValue / SOLAR_SIZE_STEP_KWP) * SOLAR_SIZE_STEP_KWP;

  return Number(
    clamp(steppedValue, SOLAR_SIZE_MIN_KWP, SOLAR_SIZE_MAX_KWP).toFixed(1),
  );
}

/**
 * Produces a transparent planning estimate for the homepage simulator.
 * It is intentionally separate from quotation pricing, which remains owned
 * by the existing configurator and backend contracts.
 */
export function calculateSolarEstimate(
  solarSizeKwp: number,
  typicalSunHours = THAILAND_AVERAGE_PEAK_SUN_HOURS,
): SolarEstimate {
  const safeSize = normalizeSolarSize(solarSizeKwp);
  const safeSunHours = Number(
    clamp(
      Number.isFinite(typicalSunHours)
        ? typicalSunHours
        : THAILAND_AVERAGE_PEAK_SUN_HOURS,
      3.7,
      5.4,
    ).toFixed(2),
  );
  const dailyKwh = Number(
    (safeSize * safeSunHours * SYSTEM_EFFICIENCY_FACTOR).toFixed(1),
  );
  const monthlyKwh = Math.round(dailyKwh * 30);
  const annualKwh = Math.round(dailyKwh * 365);
  const monthlySavingsThb = Math.round(
    monthlyKwh * THAILAND_ELECTRICITY_RATE_THB * BILL_IMPACT_SELF_CONSUMPTION_FACTOR,
  );
  const annualSavingsThb = monthlySavingsThb * 12;
  const avoidedCo2Kg = Math.round(
    annualKwh * THAILAND_GRID_EMISSION_FACTOR_KG_PER_KWH,
  );

  return {
    solarSizeKwp: safeSize,
    typicalSunHours: safeSunHours,
    dailyKwh,
    monthlyKwh,
    annualKwh,
    monthlySavingsThb,
    annualSavingsThb,
    avoidedCo2Kg,
    avoidedCo2Tons: Number((avoidedCo2Kg / 1_000).toFixed(1)),
    treeEquivalent: Math.max(
      1,
      Math.round(avoidedCo2Kg / TREE_CO2_ABSORPTION_KG_PER_YEAR),
    ),
    panelCount: Math.ceil((safeSize * 1_000) / 550),
  };
}

/**
 * Converts a monthly electricity bill into a bounded planning estimate.
 *
 * This is intentionally pure and does not represent a quote. The suggested
 * system size is derived from the Thai tariff, average peak sun hours, system
 * efficiency, and the homepage's self-consumption assumption, then passed
 * through the existing kWp normalizer. Savings are capped at the normalized
 * bill so the summary can never imply a negative electricity bill.
 */
export function calculateBillImpactEstimate(
  monthlyBillThb: number,
): BillImpactEstimate {
  const billValue = Number.isFinite(monthlyBillThb)
    ? monthlyBillThb
    : BILL_IMPACT_DEFAULT_MONTHLY_BILL_THB;
  const safeMonthlyBillThb = Math.round(
    clamp(
      billValue,
      BILL_IMPACT_MIN_MONTHLY_BILL_THB,
      BILL_IMPACT_MAX_MONTHLY_BILL_THB,
    ),
  );

  const monthlyConsumptionKwh =
    safeMonthlyBillThb / THAILAND_ELECTRICITY_RATE_THB;
  const targetMonthlySolarKwh =
    monthlyConsumptionKwh / BILL_IMPACT_SELF_CONSUMPTION_FACTOR;
  const monthlyKwhPerKwp =
    THAILAND_AVERAGE_PEAK_SUN_HOURS * 30 * SYSTEM_EFFICIENCY_FACTOR;
  const rawSuggestedKwp = targetMonthlySolarKwh / monthlyKwhPerKwp;
  const solarSizeKwp = normalizeSolarSize(rawSuggestedKwp);
  const solarEstimate = calculateSolarEstimate(
    solarSizeKwp,
    THAILAND_AVERAGE_PEAK_SUN_HOURS,
  );
  const monthlySavingsThb = Math.min(
    safeMonthlyBillThb,
    solarEstimate.monthlySavingsThb,
  );

  return {
    monthlyBillThb: safeMonthlyBillThb,
    solarSizeKwp,
    monthlySavingsThb,
    annualSavingsThb: monthlySavingsThb * 12,
    annualKwh: solarEstimate.annualKwh,
    avoidedCo2Kg: solarEstimate.avoidedCo2Kg,
    avoidedCo2Tons: solarEstimate.avoidedCo2Tons,
    treeEquivalent: solarEstimate.treeEquivalent,
  };
}
