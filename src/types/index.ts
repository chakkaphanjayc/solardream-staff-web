export type Category = string;

export interface Component {
  id: string;
  name: string;
  category: Category;
  price: number;
  imageUrl: string;
  description: string;
  specs?: Record<string, string>;
  metadata?: unknown;
}

export interface Configuration {
  selectedComponents: Record<Category, Component | null>;
  totalPrice: number;
}

export type {
  HomeChapter,
  HomeChapterId,
  HomeMangaAsset,
  HomeMangaAssetManifest,
  HomeMangaAssetManifestItem,
  HomeMangaAssetRole,
  HomeSolarMetric,
  HomeSolarSizeKw,
  HomeWeatherId,
} from "./home";

export { HOME_SOLAR_SIZE_OPTIONS } from "./home";

export type { AuthClaimPrefill, AuthModalState, AuthMode } from "./auth";
export type {
  BuildAddOnOption,
  BuildArchitectureId,
  BuildArchitectureOption,
  BuildCapacityTier,
  BuildConfiguratorProps,
  BuildPanelState,
} from "./build";
export type {
  CommunicationPreferenceKey,
  CommunicationPreferences,
  CommunicationPreferencesResponse,
  GeneralInfoUser,
  ProfileLineBotInfo,
  ProfileUser,
  SavedBuildConfiguration,
  SavedBuildProduct,
} from "./profile";
export type {
  PreventiveMaintenanceBookingProps,
  PublicOffering,
  SupportDashboardArticle,
  SupportDashboardProps,
  SupportDashboardUser,
  SupportInstalledAsset,
  SupportLocalizedText,
  SupportSystemSource,
} from "./support";
export type {
  WizardAnswers,
  WizardAnswerValue,
  WizardClientProps,
  WizardDefinition,
  WizardElectricityTariff,
  WizardInquiryPanelState,
  WizardOption,
  WizardQuestion,
  WizardRoofFacing,
  WizardRoofTilt,
  WizardStep,
  WizardSummaryClientProps,
  WizardSystemPackage,
  WizardSystemPackageContent,
  WizardSystemPackageSize,
} from "./wizard";
