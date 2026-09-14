import { generateFinancialReportPdf } from "../../src/lib/financialReportPdf";
import { parseEstimateDraftRequest, parseFinancialReportRequest } from "../../src/lib/estimateDraftBridge";

async function main() {
  const flows = Array.from({ length: 26 }, (_, year) => ({
    year, yearSavings: year === 0 ? 0 : 36_000, degradationFactor: 1, inflationFactor: 1,
    cumulativeSavings: year * 36_000, yearInstallment: year > 0 && year <= 5 ? 60_000 : 0,
    cumulativeInstallments: Math.min(year, 5) * 60_000, netCashBenefit: year * 36_000 - Math.min(year, 5) * 60_000,
  }));
  const estimate = {
    wizardAnswers: { monthlyBill: 5_000, electricityTariff: "flat", roofFacing: "south" },
    selectedAddonIds: ["monitoring"], selectedFinancingId: null, downPaymentPct: 20, loanTermMonths: 60, productOverrides: {},
    summary: {
      systemPackageId: "SD-HOME-5", systemPackageLabel: "SolarDream Home 5kW", systemPackageSizeKwp: 5,
      proposalTier: "Balance", proposalTierEquipment: "Reliability-focused solar solution with durable conversion technology",
      systemSizeKwp: 5, panelCount: 10, totalPrice: 300_000, monthlySavings: 3_000, paybackPeriod: "8.3", paybackPeriodYears: 8.3,
      estimatedInstallment: 5_000, roofFacing: "south", roofMaterial: "cpac", electricalPhase: "1-Phase", monthlyBill: 5_000,
      daytimeUsagePct: 60, electricityTariff: "flat" as const, futureLoad: 0, isManualSize: false, adjustedSunHours: 4.2,
      daytimeDemandKwh: 10, selfConsumedDailyKwh: 9, wastedExcessDailyKwh: 1, monthlySelfConsumptionSavings: 3_000,
      cashFlow10Years: { flows, breakevenYear: 9, fixedLoanInstallment: 5_000 },
      ecoImpact: { co2TonsPerYear: 3.2, treeEquivalent: 145, carDistanceAvoidedKm: 12_000 }, activeFinancing: null,
    },
    configurationData: { exportSource: "wizard-summary", pricingModel: "SYSTEM_PACKAGE", items: [] },
  };
  const saved = parseEstimateDraftRequest({ version: 1, intent: "SAVE", estimate });
  const report = parseFinancialReportRequest({ version: 1, estimate });
  if (saved.estimate.summary.proposalTierEquipment !== estimate.summary.proposalTierEquipment || saved.estimate.summary.electricityTariff !== "flat") throw new Error("SAVE contract shape changed.");
  const pdf = await generateFinancialReportPdf(report, new Date("2026-07-17T00:00:00Z"));
  if (pdf.length < 1_000 || pdf.subarray(0, 5).toString() !== "%PDF-") throw new Error("Financial report PDF fixture failed.");
  let rejectedLegacyShape = false;
  try { parseFinancialReportRequest({ version: 1, estimate: { ...estimate, summary: { ...estimate.summary, proposalTierEquipment: {}, electricityTariff: 4.2 } } }); } catch { rejectedLegacyShape = true; }
  if (!rejectedLegacyShape) throw new Error("Mismatched summary contract was accepted.");
  process.stdout.write(`Estimate SAVE/report contract and 26-row PDF fixture passed (${pdf.length} bytes).\n`);
}

main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : "Estimate contract fixture failed."}\n`); process.exitCode = 1; });
