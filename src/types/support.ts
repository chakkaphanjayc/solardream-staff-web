export interface SupportDashboardUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

export interface SupportDashboardArticle {
  id: string;
  title: string;
  content: string;
  coverImage: string | null;
  createdAt: string;
}

export interface SupportDashboardProps {
  user: SupportDashboardUser;
  articles: SupportDashboardArticle[];
}

export interface SupportLocalizedText {
  en: string;
  th: string;
}

export interface PublicOffering {
  id: string;
  slug: string;
  code: string;
  name: SupportLocalizedText;
  description: SupportLocalizedText;
  externalPrice: number;
  solarDreamCustomerPrice: number;
  durationMinutes: number;
  currency: "THB";
}

export interface SupportInstalledAsset {
  id: string;
  productName: string;
  serialNumber: string;
}

export type SupportSystemSource = "SOLARDREAM" | "EXTERNAL";

export interface PreventiveMaintenanceBookingProps {
  locale: string;
  assets: SupportInstalledAsset[];
  offerings: PublicOffering[];
  isAuthenticated: boolean;
  initialError: string;
}
