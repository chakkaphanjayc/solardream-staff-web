import type { FinancingOptionSource } from "@/lib/financialPlan";
import type { BuildConfig } from "@/lib/buildConfig";
import type {
  RecommendCategory,
} from "@/lib/wizardRecommendation";
import type { WizardRecommendationConfig } from "@/lib/wizardRecommendationConfig";
import type {
  WizardOptionScoringMap,
  WizardRecommendationRule,
} from "@/lib/wizardRules";

export type WizardAnswerValue = string | number | boolean;
export type WizardAnswers = Record<string, WizardAnswerValue>;

export interface WizardOption {
  id: string;
  order: number;
  label: string;
  value: string;
  description: string;
  icon: string;
  isRecommended: boolean;
  tooltipText?: string | null;
  tooltipImageUrl?: string | null;
}

export interface WizardQuestion {
  id: string;
  order: number;
  type: string;
  questionText: string;
  helperText: string;
  stateKey: string;
  tooltipText?: string | null;
  tooltipImageUrl?: string | null;
  options: WizardOption[];
}

export interface WizardStep {
  id: string;
  order: number;
  title: string;
  description: string;
  questions: WizardQuestion[];
}

export interface WizardDefinition {
  id: string;
  title: string;
  description: string;
  steps: WizardStep[];
}

export interface WizardClientProps {
  wizard: WizardDefinition;
  buildConfig?: BuildConfig;
}

export interface WizardSummaryClientProps {
  categories: RecommendCategory[];
  recommendationConfig: WizardRecommendationConfig;
  optionScoringMap: WizardOptionScoringMap;
  recommendationRules: WizardRecommendationRule[];
  financingOptions: FinancingOptionSource[];
  buildConfig?: BuildConfig;
}

export type WizardElectricityTariff = "flat" | "tou";
export type WizardRoofFacing = "south" | "east" | "west" | "north";
export type WizardRoofTilt = "tilt_10_15" | "tilt_30" | "tilt_45";
export type WizardInquiryPanelState =
  | "impact-only"
  | "auth-prompt"
  | "inquiry-form";

export type WizardSystemPackageSize = 3 | 5 | 10 | 15 | 20;

export interface WizardSystemPackageContent {
  title: string;
  description: string;
}

export interface WizardSystemPackage {
  sizeKwp: WizardSystemPackageSize;
  packageId: string;
  label: string;
  standardPrice: number;
  contents: WizardSystemPackageContent[];
}
