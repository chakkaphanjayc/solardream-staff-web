export type GlobalBannerTranslation = {
  message?: string;
  linkUrl?: string | null;
};

export type GlobalBannerTranslations = Record<string, GlobalBannerTranslation>;

export type GlobalBannerRecord = {
  id: string;
  message: string;
  type: string;
  isActive: boolean;
  linkUrl: string | null;
  translations: GlobalBannerTranslations;
  startsAt: Date | null;
  endsAt: Date | null;
  sortOrder: number;
  createdAt: Date;
};

export type GlobalBannerInput = {
  message?: string | null;
  type: string;
  linkUrl?: string | null;
  translations?: GlobalBannerTranslations | null;
  isActive: boolean;
  startsAt?: string | Date | null;
  endsAt?: string | Date | null;
  sortOrder?: number;
};
