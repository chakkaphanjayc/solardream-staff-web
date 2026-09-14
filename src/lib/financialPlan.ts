export type FinanceType = "CASH" | "BANK_LOAN" | "PPA" | "LEASING";

export type FinancingOptionSource = {
  id: string;
  providerName: string;
  financeType: FinanceType;
  interestRate: string | null;
  maxTermMonths: number | null;
  minSystemCost: string | null;
  eligibilityRules: unknown;
  marketingTag: string | null;
  isActive: boolean;
  createdAt: Date;
};

export type CalculatedFinancingOption = FinancingOptionSource & {
  calculatedMonthlyPayment: number | null;
};

export interface FinancialsPayload {
  paybackPeriodYears: number;
  lifetimeSavings25Years: number;
  financingOptions: CalculatedFinancingOption[];
}

function matchesPropertyType(eligibilityRules: unknown, propertyType: string) {
  const rules = eligibilityRules as { propertyTypes?: string[] } | null;
  if (!rules || !Array.isArray(rules.propertyTypes)) return true;
  return rules.propertyTypes.includes(propertyType);
}

function calculateMonthlyPayment(
  systemCost: number,
  option: FinancingOptionSource,
): number | null {
  if (option.financeType !== "BANK_LOAN") return null;

  const annualRate = option.interestRate ? Number.parseFloat(option.interestRate) : 0;
  const n = option.maxTermMonths || 12;

  if (n <= 0) return null;
  if (annualRate === 0) return systemCost / n;

  const monthlyRate = annualRate / 12 / 100;
  return (systemCost * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -n));
}

export function calculateFinancialPlan(
  systemCost: number,
  monthlyBill: number,
  estimatedSavingsPerMonth: number,
  propertyType: string,
  financingOptions: FinancingOptionSource[],
): FinancialsPayload {
  const annualSavings = estimatedSavingsPerMonth * 12;
  const paybackPeriodYears = annualSavings > 0 ? systemCost / annualSavings : 0;
  const lifetimeSavings25Years = annualSavings * 25 - systemCost;

  const eligibleOptions = financingOptions
    .filter((option) => option.isActive)
    .filter((option) => {
      const minCost = option.minSystemCost ? Number.parseFloat(option.minSystemCost) : 0;
      if (systemCost < minCost) return false;
      return matchesPropertyType(option.eligibilityRules, propertyType);
    })
    .map((option) => ({
      ...option,
      calculatedMonthlyPayment: calculateMonthlyPayment(systemCost, option),
    }));

  void monthlyBill;

  return {
    paybackPeriodYears: Math.round(paybackPeriodYears * 100) / 100,
    lifetimeSavings25Years: Math.round(lifetimeSavings25Years * 100) / 100,
    financingOptions: eligibleOptions,
  };
}
