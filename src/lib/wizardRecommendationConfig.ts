/**
 * Wizard summary recommendation algorithm — editable in Admin → Wizards.
 */
export interface SummaryAddonConfig {
  productId: string;
  name: string;
  price: number;
  description: string;
}

export interface WizardRecommendationConfig {
  tariffRate: number;
  peakSunHours: number;
  sizingDivisor: number;
  minSolarKwp: number;
  maxSolarKwp: number;
  hybridBatteryRatio: number;
  offgridBatteryRatio: number;
  maxBatteryKwh: number;
  chartSunHours: number;
  chartEfficiencyPct: number;
  solarFormula: string;
  batteryFormulaSolarOnly: string;
  batteryFormulaHybrid: string;
  batteryFormulaOffgrid: string;
  /** Category slugs included in BOM (e.g. roof-type, solar-panels, battery-storage) */
  enabledCategorySlugs: string[];
  /** Preferred product id per category slug. Empty means auto-pick by tier/priority. */
  recommendedProductIdsByCategorySlug: Record<string, string>;
  /** System capacity size threshold (in kW) above which the estimate changes to contact sales */
  estimateThresholdKw: number;
  /** Configurable add-ons for summary page */
  summaryAddons: SummaryAddonConfig[];
}

export const DEFAULT_SOLAR_FORMULA =
  "((monthlyBill / tariffRate / daysPerMonth) * (daytimeUsagePct / 100)) / sizingDivisor";
export const DEFAULT_BATTERY_FORMULA_SOLAR_ONLY = "0";
export const DEFAULT_BATTERY_FORMULA_HYBRID =
  "round(solarKwp * hybridBatteryRatio) * 2";
export const DEFAULT_BATTERY_FORMULA_OFFGRID =
  "round(solarKwp * offgridBatteryRatio) * 2";

export const DEFAULT_WIZARD_RECOMMENDATION_CONFIG: WizardRecommendationConfig = {
  tariffRate: 4.5,
  peakSunHours: 5,
  sizingDivisor: 4.2,
  minSolarKwp: 1.5,
  maxSolarKwp: 500,
  hybridBatteryRatio: 0.5,
  offgridBatteryRatio: 1,
  maxBatteryKwh: 40,
  chartSunHours: 5,
  chartEfficiencyPct: 95,
  solarFormula: DEFAULT_SOLAR_FORMULA,
  batteryFormulaSolarOnly: DEFAULT_BATTERY_FORMULA_SOLAR_ONLY,
  batteryFormulaHybrid: DEFAULT_BATTERY_FORMULA_HYBRID,
  batteryFormulaOffgrid: DEFAULT_BATTERY_FORMULA_OFFGRID,
  enabledCategorySlugs: ["roof-type", "solar-panels", "battery-storage"],
  recommendedProductIdsByCategorySlug: {},
  estimateThresholdKw: 20,
  summaryAddons: [
    {
      productId: "rapidshutdown",
      name: "Rapid Shutdown Devices / Optimizers",
      price: 15000,
      description: "Roof-level circuit breaker for maximum solar safety compliance."
    },
    {
      productId: "zeroexport",
      name: "Smart Meter / Zero Export",
      price: 12000,
      description: "Prevent electricity from returning to the grid (Utility mandated)."
    },
    {
      productId: "combinerbox",
      name: "Combiner Box AC-DC",
      price: 8500,
      description: "Organized electrical distribution and circuit breaker controls."
    },
    {
      productId: "evcharger",
      name: "EV Charger",
      price: 35000,
      description: "Integrated residential electric vehicle charging station capability."
    },
    {
      productId: "solarcable",
      name: "Solar Cable",
      price: 5000,
      description: "High-grade photovoltaic cabling for safe transmission."
    }
  ]
};

export function parseWizardRecommendationConfig(
  raw: unknown
): WizardRecommendationConfig {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_WIZARD_RECOMMENDATION_CONFIG };
  }
  const o = raw as Record<string, unknown>;
  return {
    tariffRate: num(o.tariffRate, DEFAULT_WIZARD_RECOMMENDATION_CONFIG.tariffRate),
    peakSunHours: num(o.peakSunHours, DEFAULT_WIZARD_RECOMMENDATION_CONFIG.peakSunHours),
    sizingDivisor: num(o.sizingDivisor, DEFAULT_WIZARD_RECOMMENDATION_CONFIG.sizingDivisor),
    minSolarKwp: num(o.minSolarKwp, DEFAULT_WIZARD_RECOMMENDATION_CONFIG.minSolarKwp),
    maxSolarKwp: num(o.maxSolarKwp, DEFAULT_WIZARD_RECOMMENDATION_CONFIG.maxSolarKwp),
    hybridBatteryRatio: num(
      o.hybridBatteryRatio,
      DEFAULT_WIZARD_RECOMMENDATION_CONFIG.hybridBatteryRatio
    ),
    offgridBatteryRatio: num(
      o.offgridBatteryRatio,
      DEFAULT_WIZARD_RECOMMENDATION_CONFIG.offgridBatteryRatio
    ),
    maxBatteryKwh: num(o.maxBatteryKwh, DEFAULT_WIZARD_RECOMMENDATION_CONFIG.maxBatteryKwh),
    chartSunHours: num(o.chartSunHours, DEFAULT_WIZARD_RECOMMENDATION_CONFIG.chartSunHours),
    chartEfficiencyPct: num(
      o.chartEfficiencyPct,
      DEFAULT_WIZARD_RECOMMENDATION_CONFIG.chartEfficiencyPct
    ),
    solarFormula: str(o.solarFormula, DEFAULT_SOLAR_FORMULA),
    batteryFormulaSolarOnly: str(
      o.batteryFormulaSolarOnly,
      DEFAULT_BATTERY_FORMULA_SOLAR_ONLY
    ),
    batteryFormulaHybrid: str(
      o.batteryFormulaHybrid,
      DEFAULT_BATTERY_FORMULA_HYBRID
    ),
    batteryFormulaOffgrid: str(
      o.batteryFormulaOffgrid,
      DEFAULT_BATTERY_FORMULA_OFFGRID
    ),
    enabledCategorySlugs: Array.isArray(o.enabledCategorySlugs)
      ? (o.enabledCategorySlugs as string[])
      : DEFAULT_WIZARD_RECOMMENDATION_CONFIG.enabledCategorySlugs,
    recommendedProductIdsByCategorySlug: stringRecord(
      o.recommendedProductIdsByCategorySlug
    ),
    estimateThresholdKw: num(o.estimateThresholdKw, DEFAULT_WIZARD_RECOMMENDATION_CONFIG.estimateThresholdKw),
    summaryAddons: Array.isArray(o.summaryAddons)
      ? (o.summaryAddons as SummaryAddonConfig[])
      : DEFAULT_WIZARD_RECOMMENDATION_CONFIG.summaryAddons,
  };
}

function num(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function str(v: unknown, fallback: string): string {
  return typeof v === "string" && v.trim() ? v.trim() : fallback;
}

function stringRecord(v: unknown): Record<string, string> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  return Object.fromEntries(
    Object.entries(v as Record<string, unknown>).filter(
      ([key, value]) => key.trim() && typeof value === "string" && value.trim()
    )
  ) as Record<string, string>;
}

export interface SolarSizingCalculation {
  variables: {
    monthlyBill: number;
    tariffRate: number;
    daysPerMonth: number;
    daytimeUsagePct: number;
    sizingDivisor: number;
    minSolarKwp: number;
    maxSolarKwp: number;
  };
  rawSolarKwp: number;
  solarKwp: number;
  formula: string;
  substitutedFormula: string;
  clampFormula: string;
  formulaError?: string;
}

export interface BatterySizingCalculation {
  variables: {
    solarKwp: number;
    systemGoal: string;
    hybridBatteryRatio: number;
    offgridBatteryRatio: number;
    maxBatteryKwh: number;
  };
  rawBatteryKwh: number;
  batteryKwh: number;
  formula: string;
  substitutedFormula: string;
  clampFormula: string;
  formulaError?: string;
}

type FormulaVariables = Record<string, number>;

const FUNCTION_ARITY: Record<string, { min: number; max: number }> = {
  abs: { min: 1, max: 1 },
  ceil: { min: 1, max: 1 },
  clamp: { min: 3, max: 3 },
  floor: { min: 1, max: 1 },
  max: { min: 1, max: Infinity },
  min: { min: 1, max: Infinity },
  round: { min: 1, max: 1 },
};

class FormulaParser {
  private index = 0;

  constructor(
    private readonly input: string,
    private readonly variables: FormulaVariables
  ) {}

  parse(): number {
    const value = this.parseExpression();
    this.skipSpaces();
    if (this.index < this.input.length) {
      throw new Error(`Unexpected token "${this.input[this.index]}"`);
    }
    return value;
  }

  private parseExpression(): number {
    let value = this.parseTerm();
    while (true) {
      this.skipSpaces();
      if (this.match("+")) value += this.parseTerm();
      else if (this.match("-")) value -= this.parseTerm();
      else return value;
    }
  }

  private parseTerm(): number {
    let value = this.parseFactor();
    while (true) {
      this.skipSpaces();
      if (this.match("*")) value *= this.parseFactor();
      else if (this.match("/")) value /= this.parseFactor();
      else return value;
    }
  }

  private parseFactor(): number {
    this.skipSpaces();
    if (this.match("+")) return this.parseFactor();
    if (this.match("-")) return -this.parseFactor();
    return this.parsePrimary();
  }

  private parsePrimary(): number {
    this.skipSpaces();
    if (this.match("(")) {
      const value = this.parseExpression();
      this.expect(")");
      return value;
    }

    const numberValue = this.readNumber();
    if (numberValue !== null) return numberValue;

    const identifier = this.readIdentifier();
    if (identifier) {
      this.skipSpaces();
      if (this.match("(")) {
        const args: number[] = [];
        this.skipSpaces();
        if (!this.match(")")) {
          do {
            args.push(this.parseExpression());
            this.skipSpaces();
          } while (this.match(","));
          this.expect(")");
        }
        return this.callFunction(identifier, args);
      }

      const value = this.variables[identifier];
      if (value === undefined) throw new Error(`Unknown variable "${identifier}"`);
      return value;
    }

    throw new Error("Expected number, variable, or function");
  }

  private callFunction(name: string, args: number[]): number {
    const normalized = name.toLowerCase();
    const arity = FUNCTION_ARITY[normalized];
    if (!arity) throw new Error(`Unknown function "${name}"`);
    if (args.length < arity.min || args.length > arity.max) {
      throw new Error(`Function "${name}" received ${args.length} argument(s)`);
    }

    switch (normalized) {
      case "abs":
        return Math.abs(args[0]);
      case "ceil":
        return Math.ceil(args[0]);
      case "clamp":
        return Math.max(args[1], Math.min(args[2], args[0]));
      case "floor":
        return Math.floor(args[0]);
      case "max":
        return Math.max(...args);
      case "min":
        return Math.min(...args);
      case "round":
        return Math.round(args[0]);
      default:
        throw new Error(`Unknown function "${name}"`);
    }
  }

  private readNumber(): number | null {
    const match = /^\d+(?:\.\d+)?/.exec(this.input.slice(this.index));
    if (!match) return null;
    this.index += match[0].length;
    return Number(match[0]);
  }

  private readIdentifier(): string | null {
    const match = /^[A-Za-z_][A-Za-z0-9_]*/.exec(this.input.slice(this.index));
    if (!match) return null;
    this.index += match[0].length;
    return match[0];
  }

  private match(token: string): boolean {
    if (this.input.slice(this.index, this.index + token.length) !== token) return false;
    this.index += token.length;
    return true;
  }

  private expect(token: string) {
    if (!this.match(token)) throw new Error(`Expected "${token}"`);
  }

  private skipSpaces() {
    while (/\s/.test(this.input[this.index] ?? "")) this.index += 1;
  }
}

function evaluateFormula(
  formula: string,
  variables: FormulaVariables,
  fallbackFormula: string
): { value: number; substitutedFormula: string; error?: string } {
  try {
    const value = new FormulaParser(formula, variables).parse();
    if (!Number.isFinite(value)) throw new Error("Formula returned a non-finite value");
    return {
      value,
      substitutedFormula: substituteFormulaVariables(formula, variables),
    };
  } catch (error) {
    const fallbackValue = new FormulaParser(fallbackFormula, variables).parse();
    return {
      value: fallbackValue,
      substitutedFormula: substituteFormulaVariables(formula, variables),
      error: error instanceof Error ? error.message : "Invalid formula",
    };
  }
}

function substituteFormulaVariables(
  formula: string,
  variables: FormulaVariables
): string {
  return formula.replace(/\b[A-Za-z_][A-Za-z0-9_]*\b/g, (token) => {
    if (!(token in variables)) return token;
    return Number.isInteger(variables[token])
      ? String(variables[token])
      : variables[token].toFixed(2);
  });
}

export function getSolarSizingCalculation(
  monthlyBill: number,
  daytimeUsagePct: number,
  config: WizardRecommendationConfig
): SolarSizingCalculation {
  const variables = {
    monthlyBill,
    tariffRate: config.tariffRate,
    daysPerMonth: 30,
    daytimeUsagePct,
    peakSunHours: config.peakSunHours,
    sizingDivisor: config.sizingDivisor,
    minSolarKwp: config.minSolarKwp,
    maxSolarKwp: config.maxSolarKwp,
  };
  const formulaResult = evaluateFormula(
    config.solarFormula,
    variables,
    DEFAULT_SOLAR_FORMULA
  );
  const rawSolarKwp = formulaResult.value;
  const roundedRaw = Number(rawSolarKwp.toFixed(2));
  const solarKwp = Math.max(
    config.minSolarKwp,
    Math.min(config.maxSolarKwp, roundedRaw)
  );

  return {
    variables: {
      monthlyBill: variables.monthlyBill,
      tariffRate: variables.tariffRate,
      daysPerMonth: variables.daysPerMonth,
      daytimeUsagePct: variables.daytimeUsagePct,
      sizingDivisor: variables.sizingDivisor,
      minSolarKwp: variables.minSolarKwp,
      maxSolarKwp: variables.maxSolarKwp,
    },
    rawSolarKwp,
    solarKwp,
    formula: `solar kWp = ${config.solarFormula}`,
    substitutedFormula: formulaResult.substitutedFormula,
    clampFormula: `clamp(${roundedRaw.toFixed(2)}, ${config.minSolarKwp}, ${config.maxSolarKwp}) = ${solarKwp.toFixed(2)} kWp`,
    formulaError: formulaResult.error,
  };
}

export function getBatterySizingCalculation(
  solarKwp: number,
  systemGoal: string,
  config: WizardRecommendationConfig
): BatterySizingCalculation {
  const formulaByGoal: Record<string, { formula: string; fallback: string }> = {
    hybrid: {
      formula: config.batteryFormulaHybrid,
      fallback: DEFAULT_BATTERY_FORMULA_HYBRID,
    },
    offgrid: {
      formula: config.batteryFormulaOffgrid,
      fallback: DEFAULT_BATTERY_FORMULA_OFFGRID,
    },
    roi_max: {
      formula: config.batteryFormulaSolarOnly,
      fallback: DEFAULT_BATTERY_FORMULA_SOLAR_ONLY,
    },
  };
  const activeFormula =
    formulaByGoal[systemGoal] ?? formulaByGoal.roi_max;
  const variables = {
    solarKwp,
    hybridBatteryRatio: config.hybridBatteryRatio,
    offgridBatteryRatio: config.offgridBatteryRatio,
    maxBatteryKwh: config.maxBatteryKwh,
  };
  const formulaResult = evaluateFormula(
    activeFormula.formula,
    variables,
    activeFormula.fallback
  );
  const rawBatteryKwh = formulaResult.value;

  const batteryKwh = Math.min(config.maxBatteryKwh, Math.max(0, rawBatteryKwh));

  return {
    variables: {
      solarKwp,
      systemGoal,
      hybridBatteryRatio: config.hybridBatteryRatio,
      offgridBatteryRatio: config.offgridBatteryRatio,
      maxBatteryKwh: config.maxBatteryKwh,
    },
    rawBatteryKwh,
    batteryKwh,
    formula: `battery kWh = ${activeFormula.formula}`,
    substitutedFormula: formulaResult.substitutedFormula,
    clampFormula: `clamp(${rawBatteryKwh.toFixed(1)}, 0, ${config.maxBatteryKwh}) = ${batteryKwh.toFixed(1)} kWh`,
    formulaError: formulaResult.error,
  };
}

export function calcRecommendedSolarKwp(
  monthlyBill: number,
  daytimeUsagePct: number,
  config: WizardRecommendationConfig
): number {
  return getSolarSizingCalculation(monthlyBill, daytimeUsagePct, config).solarKwp;
}

export function calcRecommendedBatteryKwh(
  solarKwp: number,
  systemGoal: string,
  config: WizardRecommendationConfig
): number {
  return getBatterySizingCalculation(solarKwp, systemGoal, config).batteryKwh;
}
