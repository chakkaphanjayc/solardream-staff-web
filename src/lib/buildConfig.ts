import type { SolarAddonConfig } from "@/lib/solarAddonConfig";
import { getLocalizedValue, type LocalizedContent } from "@/lib/localization/content";
import { isLocale, type Locale } from "@/i18n/locales";

export const BUILD_CONFIG_SETTING_KEY = "admin_build_current_config";

export type BuildStepConfig = {
  id: string;
  title: string;
  description: string;
  route: string;
  displayOrder: number;
  isEnabled: boolean;
  isRequired: boolean;
  translations?: LocalizedContent<{
    title: string;
    description: string;
    helperText: string;
    validationMessage: string;
  }>;
  settings: {
    inputMode: "choice" | "number" | "text" | "map" | "summary";
    helperText: string;
    allowSkip: boolean;
    minKw: number;
    maxKw: number;
    defaultValue: string;
    validationMessage: string;
  };
};

export type DesignProfileConfig = {
  id: string;
  name: string;
  tone: "premium" | "technical" | "friendly" | "minimal";
  primaryColor: string;
  accentColor: string;
  mascotAsset: string;
  summaryCopy: string;
  isDefault: boolean;
  translations?: LocalizedContent<{ name: string; summaryCopy: string }>;
};

export type EstimatedBudgetBand = {
  id: string;
  label: string;
  min: number;
  max: number;
  currency: "THB";
  recommendedKw: number;
  notes: string;
  isActive: boolean;
  translations?: LocalizedContent<{ label: string; notes: string }>;
};

export type CustomCapacityConfig = {
  isEnabled: boolean;
  minKw: number;
  maxKw: number;
  stepKw: number;
  startingPriceMinKw: number;
  startingPriceMaxKw: number;
  ticks: number[];
  unit: string;
};

export const DEFAULT_CUSTOM_CAPACITY_CONFIG: CustomCapacityConfig = {
  isEnabled: true,
  minKw: 5,
  maxKw: 30,
  stepKw: 0.5,
  startingPriceMinKw: 5,
  startingPriceMaxKw: 20,
  ticks: [5, 10, 15, 20, 30],
  unit: "kWp",
};

export type BuildConfigData = {
  version: 1;
  updatedAt: string | null;
  steps: BuildStepConfig[];
  designProfiles: DesignProfileConfig[];
  estimatedBudgets: EstimatedBudgetBand[];
  smartAddons: SolarAddonConfig[];
  customCapacity?: CustomCapacityConfig;
  globalSettings: {
    defaultLocale: Locale;
    requirePostalCode: boolean;
    requireCustomerNotes: boolean;
    enableSmartAddons: boolean;
    defaultLeadStatus: string;
    defaultProposalStatus: string;
    enableErpnextSync: boolean;
    staffReviewSlaHours: number;
    monthlySavingsRatePerKwh: number;
  };
};

export type BuildConfig = BuildConfigData & {
  localeConfigs?: Partial<Record<Locale, BuildConfigData>>;
};

const EMPTY_ADDON: SolarAddonConfig = {
  id: "",
  name: "",
  shortLabel: "",
  description: "",
  category: "SAFETY",
  inputType: "TOGGLE",
  isRecommended: false,
  isVisible: false,
  price: 0,
};

export const DEFAULT_BUILD_CONFIG: BuildConfig = {
  version: 1,
  updatedAt: null,
  steps: [
    {
      id: "capacity-choice",
      title: "System Capacity Choice",
      description: "Choose a raw system size tier (3kW, 5kW, 10kW, 15kW+).",
      route: "/build#capacity",
      displayOrder: 1,
      isEnabled: true,
      isRequired: true,
      settings: {
        inputMode: "choice",
        helperText: "Choose a raw system size tier. Panel quantity is shown as a planning range.",
        allowSkip: false,
        minKw: 3,
        maxKw: 20,
        defaultValue: "5kw",
        validationMessage: "Please select a capacity tier to proceed.",
      },
    },
    {
      id: "inverter-architecture",
      title: "Inverter Architecture",
      description: "Select solar system inverter architecture (On-Grid or Hybrid).",
      route: "/build#architecture",
      displayOrder: 2,
      isEnabled: true,
      isRequired: true,
      settings: {
        inputMode: "choice",
        helperText: "On-grid focuses on daytime savings, hybrid includes energy storage/backup.",
        allowSkip: false,
        minKw: 3,
        maxKw: 30,
        defaultValue: "on-grid",
        validationMessage: "Please select an inverter architecture.",
      },
    },
    {
      id: "smart-addons",
      title: "Smart Add-Ons",
      description: "Select optional add-on equipment (monitoring, EV chargers, etc).",
      route: "/build#addons",
      displayOrder: 3,
      isEnabled: true,
      isRequired: false,
      settings: {
        inputMode: "choice",
        helperText: "Pick from smart monitoring solutions, EV charging docks, or extended warranty packs.",
        allowSkip: true,
        minKw: 3,
        maxKw: 50,
        defaultValue: "monitoring",
        validationMessage: "Select add-ons or skip to consultation.",
      },
    },
    {
      id: "lead-consultation",
      title: "Lead Consultation",
      description: "Confirm sizing calculations, budget estimate, and submit lead contact form.",
      route: "/build#consultation",
      displayOrder: 4,
      isEnabled: true,
      isRequired: true,
      settings: {
        inputMode: "summary",
        helperText: "Provide name, email, phone, and postal code to book a professional staff review.",
        allowSkip: false,
        minKw: 3,
        maxKw: 50,
        defaultValue: "PENDING_STAFF_REVIEW",
        validationMessage: "Please complete contact information before submitting.",
      },
    },
  ],
  designProfiles: [
    {
      id: "premium-residential",
      name: "Premium Residential",
      tone: "premium",
      primaryColor: "#0369a1",
      accentColor: "#B7D1EA",
      mascotAsset: "solia-blueprint.webp",
      summaryCopy: "A high-touch recommendation for modern Thai homes and official staff quotation review.",
      isDefault: true,
    },
    {
      id: "engineering-clear",
      name: "Engineering Clear",
      tone: "technical",
      primaryColor: "#0F172A",
      accentColor: "#D8A87B",
      mascotAsset: "solia-greeting.webp",
      summaryCopy: "A specification-led profile for customers who want technical clarity and precise itemization.",
      isDefault: false,
    },
  ],
  estimatedBudgets: [
    {
      id: "starter-home",
      label: "Starter Home",
      min: 120000,
      max: 220000,
      currency: "THB",
      recommendedKw: 3,
      notes: "Entry system for smaller homes with essential on-grid equipment.",
      isActive: true,
    },
    {
      id: "balanced-home",
      label: "Balanced Home",
      min: 220001,
      max: 420000,
      currency: "THB",
      recommendedKw: 5,
      notes: "Default package band for residential savings and future-ready upgrades.",
      isActive: true,
    },
    {
      id: "premium-smart-home",
      label: "Premium Smart Home",
      min: 420001,
      max: 850000,
      currency: "THB",
      recommendedKw: 10,
      notes: "Larger system with smart add-ons, premium inverter, and staff-led equipment review.",
      isActive: true,
    },
  ],
  // Product and add-on identity/pricing is loaded from ERPNext at runtime.
  smartAddons: [],
  globalSettings: {
    defaultLocale: "th",
    requirePostalCode: true,
    requireCustomerNotes: false,
    enableSmartAddons: true,
    defaultLeadStatus: "PENDING_STAFF_REVIEW",
    defaultProposalStatus: "AWAITING_SIGNATURE",
    enableErpnextSync: true,
    staffReviewSlaHours: 24,
    monthlySavingsRatePerKwh: 4.5,
  },
};

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asNumber(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function asBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function parseTranslations(value: unknown): Record<string, Record<string, string | null>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([locale, content]) => {
    if (content === null || typeof content !== "object" || Array.isArray(content)) return [];
    const fields = Object.fromEntries(Object.entries(content).flatMap(([key, fieldValue]) =>
      typeof fieldValue === "string" || fieldValue === null ? [[key, fieldValue]] : [],
    ));
    return Object.keys(fields).length > 0 ? [[locale, fields]] : [];
  }));
}

function parseStep(value: unknown, fallback: BuildStepConfig, index: number): BuildStepConfig {
  const record = asRecord(value);
  const settings = asRecord(record.settings);
  const fallbackSettings = fallback.settings;
  const inputMode = asString(settings.inputMode, fallbackSettings.inputMode);

  return {
    id: asString(record.id, fallback.id || `step-${index + 1}`),
    title: asString(record.title, fallback.title),
    description: asString(record.description, fallback.description),
    route: asString(record.route, fallback.route),
    displayOrder: asNumber(record.displayOrder, index + 1),
    isEnabled: asBoolean(record.isEnabled, fallback.isEnabled),
    isRequired: asBoolean(record.isRequired, fallback.isRequired),
    translations: parseTranslations(record.translations),
    settings: {
      inputMode: ["choice", "number", "text", "map", "summary"].includes(inputMode)
        ? inputMode as BuildStepConfig["settings"]["inputMode"]
        : fallbackSettings.inputMode,
      helperText: asString(settings.helperText, fallbackSettings.helperText),
      allowSkip: asBoolean(settings.allowSkip, fallbackSettings.allowSkip),
      minKw: asNumber(settings.minKw, fallbackSettings.minKw),
      maxKw: asNumber(settings.maxKw, fallbackSettings.maxKw),
      defaultValue: asString(settings.defaultValue, fallbackSettings.defaultValue),
      validationMessage: asString(settings.validationMessage, fallbackSettings.validationMessage),
    },
  };
}

function parseProfile(value: unknown, fallback: DesignProfileConfig, index: number): DesignProfileConfig {
  const record = asRecord(value);
  const tone = asString(record.tone, fallback.tone);

  return {
    id: asString(record.id, fallback.id || `profile-${index + 1}`),
    name: asString(record.name, fallback.name),
    tone: ["premium", "technical", "friendly", "minimal"].includes(tone)
      ? tone as DesignProfileConfig["tone"]
      : fallback.tone,
    primaryColor: asString(record.primaryColor, fallback.primaryColor),
    accentColor: asString(record.accentColor, fallback.accentColor),
    mascotAsset: asString(record.mascotAsset, fallback.mascotAsset),
    summaryCopy: asString(record.summaryCopy, fallback.summaryCopy),
    isDefault: asBoolean(record.isDefault, fallback.isDefault),
    translations: parseTranslations(record.translations),
  };
}

function parseBudget(value: unknown, fallback: EstimatedBudgetBand, index: number): EstimatedBudgetBand {
  const record = asRecord(value);

  return {
    id: asString(record.id, fallback.id || `budget-${index + 1}`),
    label: asString(record.label, fallback.label),
    min: asNumber(record.min, fallback.min),
    max: asNumber(record.max, fallback.max),
    currency: "THB",
    recommendedKw: asNumber(record.recommendedKw, fallback.recommendedKw),
    notes: asString(record.notes, fallback.notes),
    isActive: asBoolean(record.isActive, fallback.isActive),
    translations: parseTranslations(record.translations),
  };
}

function parseAddon(value: unknown, fallback: SolarAddonConfig, index: number): SolarAddonConfig {
  const record = asRecord(value);
  const category = asString(record.category, fallback.category);
  const inputType = asString(record.inputType, fallback.inputType);
  const rawOptionsList = Array.isArray(record.optionsList) ? record.optionsList : fallback.optionsList;

  const parsedOptionsList = rawOptionsList?.map((opt, optIdx) => {
    const optRec = asRecord(opt);
    const optType = asString(optRec.type, "TOGGLE");
    return {
      id: asString(optRec.id, `opt-${optIdx + 1}`),
      label: asString(optRec.label, "Option Choice"),
      price: asNumber(optRec.price, 0),
      description: asString(optRec.description, ""),
      isDefault: asBoolean(optRec.isDefault, false),
      type: (["TOGGLE", "SELECT"].includes(optType) ? optType : "TOGGLE") as "TOGGLE" | "SELECT",
    };
  });

  const resolvedInputType = ["TOGGLE", "SELECT"].includes(inputType)
    ? (inputType as SolarAddonConfig["inputType"])
    : fallback.inputType;

  return {
    id: asString(record.id, fallback.id || `addon-${index + 1}`),
    name: asString(record.name, fallback.name),
    shortLabel: asString(record.shortLabel, fallback.shortLabel),
    description: asString(record.description, fallback.description),
    category: ["SAFETY", "GRID_COMPLIANCE", "PROTECTION", "EV_READY", "CABLING", "BATTERY"].includes(category)
      ? (category as SolarAddonConfig["category"])
      : fallback.category,
    inputType: resolvedInputType,
    optionsList: resolvedInputType === "SELECT" ? parsedOptionsList : undefined,
    isRecommended: asBoolean(record.isRecommended, fallback.isRecommended),
    isVisible: asBoolean(record.isVisible, fallback.isVisible ?? true),
    price: asNumber(record.price, fallback.price ?? 0),
  };
}

function parseCustomCapacity(value: unknown, fallback: CustomCapacityConfig): CustomCapacityConfig {
  const record = asRecord(value);
  const rawTicks = Array.isArray(record.ticks)
    ? record.ticks.map((t) => asNumber(t, 0)).filter((n) => n > 0)
    : fallback.ticks;

  return {
    isEnabled: asBoolean(record.isEnabled, fallback.isEnabled),
    minKw: asNumber(record.minKw, fallback.minKw),
    maxKw: asNumber(record.maxKw, fallback.maxKw),
    stepKw: asNumber(record.stepKw, fallback.stepKw),
    startingPriceMinKw: asNumber(record.startingPriceMinKw, fallback.startingPriceMinKw),
    startingPriceMaxKw: asNumber(record.startingPriceMaxKw, fallback.startingPriceMaxKw),
    ticks: rawTicks.length > 0 ? rawTicks : fallback.ticks,
    unit: asString(record.unit, fallback.unit),
  };
}

export function getCustomCapacityConfig(config?: BuildConfig): CustomCapacityConfig {
  if (!config) return DEFAULT_CUSTOM_CAPACITY_CONFIG;
  return config.customCapacity ? parseCustomCapacity(config.customCapacity, DEFAULT_CUSTOM_CAPACITY_CONFIG) : DEFAULT_CUSTOM_CAPACITY_CONFIG;
}

function parseBuildConfigData(record: Record<string, unknown>): BuildConfigData {
  const defaults = DEFAULT_BUILD_CONFIG;
  const rawSteps = Array.isArray(record.steps) ? record.steps : defaults.steps;
  const rawProfiles = Array.isArray(record.designProfiles) ? record.designProfiles : defaults.designProfiles;
  const rawBudgets = Array.isArray(record.estimatedBudgets) ? record.estimatedBudgets : defaults.estimatedBudgets;
  const rawAddons = Array.isArray(record.smartAddons) ? record.smartAddons : defaults.smartAddons;
  const rawGlobal = asRecord(record.globalSettings);

  return {
    version: 1,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : defaults.updatedAt,
    steps: rawSteps.map((step, index) =>
      parseStep(step, defaults.steps[index] || defaults.steps[defaults.steps.length - 1], index),
    ),
    designProfiles: rawProfiles.map((profile, index) =>
      parseProfile(profile, defaults.designProfiles[index] || defaults.designProfiles[0], index),
    ),
    estimatedBudgets: rawBudgets.map((budget, index) =>
      parseBudget(budget, defaults.estimatedBudgets[index] || defaults.estimatedBudgets[0], index),
    ),
    smartAddons: rawAddons.map((addon, index) =>
      parseAddon(addon, defaults.smartAddons[index] || EMPTY_ADDON, index),
    ),
    customCapacity: parseCustomCapacity(record.customCapacity, DEFAULT_CUSTOM_CAPACITY_CONFIG),
    globalSettings: {
      defaultLocale: isLocale(asString(rawGlobal.defaultLocale, defaults.globalSettings.defaultLocale))
        ? asString(rawGlobal.defaultLocale, defaults.globalSettings.defaultLocale) as Locale
        : defaults.globalSettings.defaultLocale,
      requirePostalCode: asBoolean(rawGlobal.requirePostalCode, defaults.globalSettings.requirePostalCode),
      requireCustomerNotes: asBoolean(rawGlobal.requireCustomerNotes, defaults.globalSettings.requireCustomerNotes),
      enableSmartAddons: asBoolean(rawGlobal.enableSmartAddons, defaults.globalSettings.enableSmartAddons),
      defaultLeadStatus: asString(rawGlobal.defaultLeadStatus, defaults.globalSettings.defaultLeadStatus),
      defaultProposalStatus: asString(rawGlobal.defaultProposalStatus, defaults.globalSettings.defaultProposalStatus),
      enableErpnextSync: asBoolean(rawGlobal.enableErpnextSync, defaults.globalSettings.enableErpnextSync),
      staffReviewSlaHours: asNumber(rawGlobal.staffReviewSlaHours, defaults.globalSettings.staffReviewSlaHours),
      monthlySavingsRatePerKwh: asNumber(rawGlobal.monthlySavingsRatePerKwh, defaults.globalSettings.monthlySavingsRatePerKwh),
    },
  };
}

export function parseBuildConfig(value: unknown): BuildConfig {
  const record = typeof value === "string"
    ? asRecord(JSON.parse(value))
    : asRecord(value);
  const localeConfigs = asRecord(record.localeConfigs);
  const config = parseBuildConfigData(record);

  const parsedLocaleConfigs = Object.fromEntries(
    Object.entries(localeConfigs).flatMap(([locale, localeConfig]) =>
      isLocale(locale)
        ? [[locale, parseBuildConfigData(asRecord(localeConfig))]]
        : [],
    ),
  ) as Partial<Record<Locale, BuildConfigData>>;

  return Object.keys(parsedLocaleConfigs).length > 0
    ? { ...config, localeConfigs: parsedLocaleConfigs }
    : config;
}

export function localizeBuildConfig(config: BuildConfig, locale: Locale, fallbackLocale: Locale): BuildConfig {
  return {
    ...config,
    steps: config.steps.map((step) => ({
      ...step,
      title: getLocalizedValue(step.translations, locale, "title", step.title, fallbackLocale),
      description: getLocalizedValue(step.translations, locale, "description", step.description, fallbackLocale),
      settings: {
        ...step.settings,
        helperText: getLocalizedValue(step.translations, locale, "helperText", step.settings.helperText, fallbackLocale),
        validationMessage: getLocalizedValue(step.translations, locale, "validationMessage", step.settings.validationMessage, fallbackLocale),
      },
    })),
    designProfiles: config.designProfiles.map((profile) => ({
      ...profile,
      name: getLocalizedValue(profile.translations, locale, "name", profile.name, fallbackLocale),
      summaryCopy: getLocalizedValue(profile.translations, locale, "summaryCopy", profile.summaryCopy, fallbackLocale),
    })),
    estimatedBudgets: config.estimatedBudgets.map((budget) => ({
      ...budget,
      label: getLocalizedValue(budget.translations, locale, "label", budget.label, fallbackLocale),
      notes: getLocalizedValue(budget.translations, locale, "notes", budget.notes, fallbackLocale),
    })),
  };
}
