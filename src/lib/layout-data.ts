import { cacheLife, cacheTag } from "next/cache";
import { and, asc, desc, eq, gt, isNull, lte, or } from "drizzle-orm";

import { db } from "@/db";
import { globalBanners, siteSettings } from "@/db/schema";
import type { GlobalBannerTranslations } from "@/types/globalBanner";

const BANNER_CACHE_TAG = "global-banner";
const SITE_SETTINGS_CACHE_TAG = "site-settings-default";

export type LayoutBannerItem = {
  id: string;
  message: string;
  type: string;
  linkUrl: string | null;
  isActive: boolean;
  translations: GlobalBannerTranslations;
  startsAt: Date | null;
  endsAt: Date | null;
  sortOrder: number;
};

export type LayoutBanner = LayoutBannerItem[] | LayoutBannerItem | null;

export type LayoutComplianceSettings = {
  id: string;
  cookieBannerText: string;
  cookieBannerEnabled: boolean;
  termsAndConditions: string | null;
  privacyPolicy: string | null;
  updatedAt: Date | null;
} | null;

export async function getCachedGlobalBanner(): Promise<LayoutBannerItem[]> {
  "use cache";

  cacheLife({ stale: 10, revalidate: 30, expire: 3600 });
  cacheTag(BANNER_CACHE_TAG);

  try {
    const now = new Date();
    const banners = await db.query.globalBanners.findMany({
      where: and(
        eq(globalBanners.isActive, true),
        or(isNull(globalBanners.startsAt), lte(globalBanners.startsAt, now)),
        or(isNull(globalBanners.endsAt), gt(globalBanners.endsAt, now)),
      ),
      orderBy: [asc(globalBanners.sortOrder), desc(globalBanners.createdAt)],
      columns: {
        id: true,
        message: true,
        type: true,
        linkUrl: true,
        isActive: true,
        translations: true,
        startsAt: true,
        endsAt: true,
        sortOrder: true,
      },
    });

    return banners;
  } catch (error) {
    console.error("[layout-data] Failed to fetch global banners:", error);
    return [];
  }
}

export async function getCachedComplianceSettings(): Promise<LayoutComplianceSettings> {
  "use cache";

  cacheLife({ stale: 60, revalidate: 300, expire: 3600 });
  cacheTag(SITE_SETTINGS_CACHE_TAG);

  try {
    let config = await db.query.siteSettings.findFirst({
      where: eq(siteSettings.id, "default"),
    });

    if (!config) {
      const inserted = await db
        .insert(siteSettings)
        .values({ id: "default" })
        .returning();
      config = inserted[0] ?? null;
    }

    return config ?? null;
  } catch (error) {
    console.error("[layout-data] Failed to fetch compliance settings:", error);
    return {
      id: "default",
      cookieBannerText:
        "เราใช้คุกกี้เพื่อพัฒนาประสิทธิภาพ และประสบการณ์ที่ดีในการใช้เว็บไซต์ของคุณ ทั้งนี้ ท่านสามารถศึกษารายละเอียดการใช้คุกกี้ได้ที่ นโยบายความเป็นส่วนตัว",
      cookieBannerEnabled: true,
      termsAndConditions: "",
      privacyPolicy: "",
      updatedAt: null,
    };
  }
}

export { BANNER_CACHE_TAG, SITE_SETTINGS_CACHE_TAG };
