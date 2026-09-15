import assert from "node:assert/strict";

import {
  SOLAR_FORMULA_VERSION,
  calculateFinancials,
  calculateSolarMetrics,
  calculateSolarOutput,
  calculateSunIncidence,
  createPresetSolarWeatherData,
  createSolarCalculationSnapshot,
  getSystemPriceQuote,
} from "@solar-dream/solar-domain";
import {
  calculateSolarMetrics as calculateAdapterMetrics,
  createPresetSolarWeatherData as createAdapterWeather,
} from "../../src/lib/solarCalculations";

assert.equal(SOLAR_FORMULA_VERSION, "solar-domain-v1");

const output = calculateSolarOutput({
  panelQuantity: 20,
  productWattage: 450,
  orientationDegrees: 180,
  weather: "sunny",
});
assert.equal(output.P_kW, 9);
assert.equal(output.orientationFactor, 1);
assert.equal(output.weatherFactor, 1);
assert.ok(output.dailyEnergyKwh > 0);

const financials = calculateFinancials({
  monthlyEnergyKwh: 1_000,
  tariffRate: 4.2,
  daytimeUsagePct: 120,
  P_kW: 9,
});
assert.equal(financials.annualSavings, financials.monthlySavings * 12);
assert.ok(financials.paybackYears > 0);

const metrics = calculateSolarMetrics(5);
assert.deepEqual(calculateAdapterMetrics(5), metrics);
assert.equal(metrics.solarSizeKw, 5);
assert.equal(metrics.diurnalTrend.length, 7);

const weather = createPresetSolarWeatherData("rainy");
assert.deepEqual(createAdapterWeather("rainy"), weather);
assert.equal(weather.weatherImpactPct, 20);
assert.equal(weather.trend.length, 5);

const quote = getSystemPriceQuote(5, 3, "balanced");
assert.equal(quote.amount, 167_000);
assert.equal(getSystemPriceQuote(4, 3, "balanced").isContactRequired, true);

const incidence = calculateSunIncidence(20, 180);
assert.ok(incidence.cosTheta <= 1 && incidence.cosTheta >= -1);
assert.ok(incidence.efficiency >= 0);

const snapshot = createSolarCalculationSnapshot(8);
assert.equal(snapshot.formulaVersion, SOLAR_FORMULA_VERSION);
assert.equal(snapshot.inputs.solarSizeKw, 8);
assert.deepEqual(snapshot.result, calculateSolarMetrics(8));

process.stdout.write("Solar domain fixtures passed.\n");
