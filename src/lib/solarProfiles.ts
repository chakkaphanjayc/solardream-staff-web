import {
  getSystemPriceQuote,
  normalizePricingTier,
  type SupportedPhase,
} from "@/lib/pricing";

export type SolarProfileId = "value" | "balanced" | "premium";

export type SolarProfileEcoImpact = {
  annualGenerationKwh: number;
  co2TonsPerYear: number;
  treeEquivalent: number;
  carDistanceAvoidedKm: number;
};

export type SolarProfile = {
  id: SolarProfileId;
  label: string;
  displayName: string;
  helper: string;
  tag: string;
  phase: "Phase 1";
  baselineSystemSizeKw: 5;
  baselinePriceThb: number;
  costMultiplier: number;
  simulatorMultiplier: number;
  savingsMultiplier: number;
  inverterTech: string;
  technologyFocus: string;
  equipment: string;
  panelSpec: string;
  inverterSpec: string;
  warranty: string;
  ecoImpact: SolarProfileEcoImpact;
};

export const SOLAR_PROFILE_BASELINE = {
  systemSizeKw: 5,
  phase: "Phase 1",
  averagePeakSunHours: 4.2,
  gridCo2KgPerKwh: 0.5,
  co2KgPerTreePerYear: 9.5,
  co2KgPerCarKm: 0.12,
} as const;

const BALANCED_BASELINE_PRICE_THB = 157_000;

function roundToNearestThousand(value: number) {
  return Math.round(value / 1000) * 1000;
}

export function calculateSolarProfileEcoImpact(
  annualGenerationKwh: number,
  simulatorMultiplier: number,
): SolarProfileEcoImpact {
  const scaledAnnualGenerationKwh = annualGenerationKwh * simulatorMultiplier;
  const annualCo2ReducedKg =
    scaledAnnualGenerationKwh * SOLAR_PROFILE_BASELINE.gridCo2KgPerKwh;

  return {
    annualGenerationKwh: scaledAnnualGenerationKwh,
    co2TonsPerYear: annualCo2ReducedKg / 1000,
    treeEquivalent:
      annualCo2ReducedKg / SOLAR_PROFILE_BASELINE.co2KgPerTreePerYear,
    carDistanceAvoidedKm:
      annualCo2ReducedKg / SOLAR_PROFILE_BASELINE.co2KgPerCarKm,
  };
}

function createBaselineEcoImpact(simulatorMultiplier: number) {
  return calculateSolarProfileEcoImpact(
    SOLAR_PROFILE_BASELINE.systemSizeKw *
      SOLAR_PROFILE_BASELINE.averagePeakSunHours *
      365,
    simulatorMultiplier,
  );
}

export const SOLAR_PROFILES: Record<SolarProfileId, SolarProfile> = {
  value: {
    id: "value",
    label: "Value",
    displayName: "Value Efficiency Plan",
    helper: "Lean solar solution for essential daytime savings",
    tag: "Essential",
    phase: "Phase 1",
    baselineSystemSizeKw: 5,
    baselinePriceThb: 150_000,
    costMultiplier: 150_000 / BALANCED_BASELINE_PRICE_THB,
    simulatorMultiplier: 0.95,
    savingsMultiplier: 0.95,
    inverterTech: "Essential String Conversion",
    technologyFocus:
      "A simplified on-grid architecture for practical savings with core safety protections.",
    equipment: "Essential solar conversion package with standard monitoring readiness",
    panelSpec: "Standard high-efficiency solar module technology",
    inverterSpec: "Essential string conversion architecture",
    warranty: "Standard warranty and workmanship coverage",
    ecoImpact: createBaselineEcoImpact(0.95),
  },
  balanced: {
    id: "balanced",
    label: "Balanced",
    displayName: "Balanced Normal Budget Plan",
    helper: "Normal budget profile with dependable long-term operation",
    tag: "Popular",
    phase: "Phase 1",
    baselineSystemSizeKw: 5,
    baselinePriceThb: BALANCED_BASELINE_PRICE_THB,
    costMultiplier: 1,
    simulatorMultiplier: 1,
    savingsMultiplier: 1,
    inverterTech: "Market-Leading Reliability",
    technologyFocus:
      "Focused on durability, broad market adoption, and industrial-grade operating standards.",
    equipment: "Reliability-focused solar solution with durable conversion technology",
    panelSpec: "High-efficiency residential solar module technology",
    inverterSpec: "Market-leading reliability conversion platform",
    warranty: "Enhanced workmanship and equipment support coverage",
    ecoImpact: createBaselineEcoImpact(1),
  },
  premium: {
    id: "premium",
    label: "Premium",
    displayName: "Premium Smart Optimization Plan",
    helper: "Smart monitoring and optimization for stronger long-term yield",
    tag: "Smart",
    phase: "Phase 1",
    baselineSystemSizeKw: 5,
    baselinePriceThb: 165_000,
    costMultiplier: 165_000 / BALANCED_BASELINE_PRICE_THB,
    simulatorMultiplier: 1.05,
    savingsMultiplier: 1.05,
    inverterTech: "Architectural-Grade & Smart Monitoring",
    technologyFocus:
      "Focused on IP68 outdoor readiness, premium aesthetics, and panel-level performance data.",
    equipment: "Architectural-grade smart solar solution with panel-level monitoring",
    panelSpec: "Premium high-efficiency solar module technology",
    inverterSpec: "Architectural-grade smart monitoring conversion platform",
    warranty: "Premium warranty and monitoring support package",
    ecoImpact: createBaselineEcoImpact(1.05),
  },
};

export const SOLAR_PROFILE_ORDER: SolarProfileId[] = [
  "value",
  "balanced",
  "premium",
];

export function getSolarProfile(profileId: SolarProfileId) {
  return SOLAR_PROFILES[profileId];
}

export function getSolarProfilePrice(
  profileId: SolarProfileId,
  systemSizeKw: number,
  phase: SupportedPhase = 1,
) {
  const quote = getSystemPriceQuote(
    systemSizeKw,
    phase,
    normalizePricingTier(profileId),
  );

  return quote.amount === null ? null : roundToNearestThousand(quote.amount);
}
