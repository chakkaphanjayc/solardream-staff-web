export interface ProfileLineBotInfo {
  basicId?: string | null;
  displayName?: string | null;
  pictureUrl?: string | null;
}

export interface GeneralInfoUser {
  avatarUrl?: string | null;
  name?: string | null;
  phoneNumber?: string | null;
  email?: string | null;
  lineUserId?: string | null;
  preferredLanguage?: string | null;
  lineBotInfo?: ProfileLineBotInfo | null;
}

export interface SavedBuildProduct {
  id: string;
  name: string;
  imageUrl: string;
}

export interface SavedBuildConfiguration {
  id: string;
  name?: string | null;
  createdAt: Date | string;
  totalPrice: number;
  products: SavedBuildProduct[];
}

export interface ProfileUser extends GeneralInfoUser {
  role?: string | null;
  savedConfigurations?: SavedBuildConfiguration[];
}

export type CommunicationPreferenceKey = "news" | "promotions";

export interface CommunicationPreferences {
  news: boolean;
  promotions: boolean;
  systemUpdates: true;
  revision: number;
}

export interface CommunicationPreferencesResponse {
  success?: boolean;
  error?: string;
  preferences?: CommunicationPreferences;
}
