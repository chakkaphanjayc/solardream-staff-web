import {
  calculateFinancials,
  calculateSolarOutput,
  getOrientationModifier,
} from "@/lib/solarCalculations";

import type { RoofSection } from "./types";

export interface RoofAnalytics {
  id: string;
  name: string;
  panelCount: number;
  kwp: number;
  efficiency: number;
  dailyKwh: number;
}

export interface AggregateAnalytics {
  totalPanels: number;
  totalKwp: number;
  totalDailyKwh: number;
  totalMonthlyKwh: number;
  estMonthlySavings: number;
  perRoof: RoofAnalytics[];
}

export function getAggregateAnalytics(
  roofs: RoofSection[],
  panelPowerW: number,
  daytimeUsagePct: number,
  ratePerKwh: number,
  _sunHours = 5.0,
): AggregateAnalytics {
  // Retained for call-site compatibility with the legacy analytics helper.
  void _sunHours;

  const perRoof: RoofAnalytics[] = roofs.map((roof) => {
    const panelCount = (roof.panels ?? []).length;
    const solarOutput = calculateSolarOutput({
      panelQuantity: panelCount,
      productWattage: panelPowerW,
      orientationDegrees: roof.roofOrientation ?? 180,
      weather: "sunny",
    });

    return {
      id: roof.id,
      name: roof.name,
      panelCount,
      kwp: solarOutput.P_kW,
      efficiency: getOrientationModifier(roof.roofOrientation ?? 180) * 100,
      dailyKwh: solarOutput.dailyEnergyKwh,
    };
  });

  const totalPanels = perRoof.reduce(
    (sum, roof) => sum + roof.panelCount,
    0,
  );
  const totalKwp = perRoof.reduce((sum, roof) => sum + roof.kwp, 0);
  const totalDailyKwh = perRoof.reduce(
    (sum, roof) => sum + roof.dailyKwh,
    0,
  );
  const totalMonthlyKwh = totalDailyKwh * 30;
  const financials = calculateFinancials({
    monthlyEnergyKwh: totalMonthlyKwh,
    tariffRate: ratePerKwh,
    daytimeUsagePct,
    P_kW: totalKwp,
  });

  return {
    totalPanels,
    totalKwp,
    totalDailyKwh,
    totalMonthlyKwh,
    estMonthlySavings: financials.monthlySavings,
    perRoof,
  };
}
