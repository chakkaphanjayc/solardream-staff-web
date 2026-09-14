"use server";

import { db } from "@/db";
import { globalSeo, pageSeo } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath, revalidateTag, unstable_cache } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth-guard";
import { locales } from "@/i18n/locales";

export interface GlobalSeoSettings {
  defaultSeoTitle: string;
  defaultSeoDescription: string;
  defaultOgImage: string;
  defaultKeywords: string;
}

export interface PageSeoSettings {
  id: string;
  pageName: string;
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string;
  seoImage: string;
}

const DEFAULT_SEO_SETTINGS: GlobalSeoSettings = {
  defaultSeoTitle: "SolarDream | Smart Residential Solar Sizing & Suncaster Estimation",
  defaultSeoDescription: "Plan your smart residential solar system in Thailand. Get live solar roof potential analysis, instant size estimations, and digital quotes with SolarDream.",
  defaultOgImage: "https://images.unsplash.com/photo-1509391366360-2e959784a276?q=80&w=1200&auto=format&fit=crop",
  defaultKeywords: "solar cell Thailand, solar panel calculator, solar design app, SolarDream, smart energy home",
};

const DEFAULT_PAGE_SEO: Record<string, Omit<PageSeoSettings, "id">> = {
  home: {
    pageName: "Home Page",
    seoTitle: "SolarDream | Smart Residential Solar Sizing & Suncaster Estimation",
    seoDescription: "Plan your smart residential solar system in Thailand. Get live solar roof potential analysis, instant size estimations, and digital quotes with SolarDream.",
    seoKeywords: "solar cell Thailand, solar panel calculator, solar design app, SolarDream, smart energy home",
    seoImage: "https://images.unsplash.com/photo-1509391366360-2e959784a276?q=80&w=1200&auto=format&fit=crop",
  },
  catalog: {
    pageName: "Product Catalog",
    seoTitle: "Premium Solar Products Catalog | SolarDream",
    seoDescription: "Browse our curated selection of ultra-premium solar panels, smart inverters, microinverters, and mounting accessories.",
    seoKeywords: "solar panels, microinverter, solar inverter, Tier 1 solar, SolarDream catalog",
    seoImage: "https://images.unsplash.com/photo-1509391366360-2e959784a276?q=80&w=1200&auto=format&fit=crop",
  },
  news: {
    pageName: "Solar Insights & News",
    seoTitle: "Solar Insights & Residential Sizing News | SolarDream",
    seoDescription: "Read the latest tips, guides, and insights on home solar panel installation, ROI calculation, and solar technology updates.",
    seoKeywords: "solar energy tips, solar panel guide, solar ROI, SolarDream news",
    seoImage: "https://images.unsplash.com/photo-1509391366360-2e959784a276?q=80&w=1200&auto=format&fit=crop",
  },
  support: {
    pageName: "Customer Support Desk",
    seoTitle: "Help Desk & Customer Support | SolarDream",
    seoDescription: "Need help with your solar system? Access the SolarDream support desk to submit inquiries, search documentation, or talk to an advisor.",
    seoKeywords: "solar support, solar installation help, customer service, SolarDream desk",
    seoImage: "https://images.unsplash.com/photo-1509391366360-2e959784a276?q=80&w=1200&auto=format&fit=crop",
  },
  wizard: {
    pageName: "Sizing Wizard Advisor",
    seoTitle: "Dynamic Solar Sizing Wizard | SolarDream",
    seoDescription: "Map your rooftop, input your electric bill details, and let our dynamic sunlight engine recommend the perfect solar capacity for your home.",
    seoKeywords: "solar calculator, solar size advisor, roof solar mapping, sun potential estimator",
    seoImage: "https://images.unsplash.com/photo-1509391366360-2e959784a276?q=80&w=1200&auto=format&fit=crop",
  },
};

const globalSeoSchema = z.object({
  defaultSeoTitle: z.string().trim().min(1, "SEO title is required.").max(180),
  defaultSeoDescription: z.string().trim().min(1, "SEO description is required.").max(500),
  defaultOgImage: z.string().trim().max(500),
  defaultKeywords: z.string().trim().max(500),
});

const pageSeoSchema = z.object({
  seoTitle: z.string().trim().min(1, "SEO title is required.").max(180),
  seoDescription: z.string().trim().min(1, "SEO description is required.").max(500),
  seoKeywords: z.string().trim().max(500).nullable(),
  seoImage: z.string().trim().max(500).nullable(),
});

const pageIdSchema = z.enum(Object.keys(DEFAULT_PAGE_SEO) as [string, ...string[]]);

function normalizeSeoText(value: string, maxLength: number): string {
  return value.trim().slice(0, maxLength);
}

function getErrorCode(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const record = error as { code?: unknown; cause?: { code?: unknown } };
  if (typeof record.code === "string") return record.code;
  return typeof record.cause?.code === "string" ? record.cause.code : null;
}

export async function getGlobalSeo(): Promise<GlobalSeoSettings> {
  try {
    const record = await db.query.globalSeo.findFirst({
      where: eq(globalSeo.id, "default"),
    });

    if (record) {
      return {
        defaultSeoTitle: record.defaultSeoTitle,
        defaultSeoDescription: record.defaultSeoDescription,
        defaultOgImage: record.defaultOgImage || "",
        defaultKeywords: record.defaultKeywords || "",
      };
    }
  } catch (error: unknown) {
    if (getErrorCode(error) === "EADDRNOTAVAIL") {
      console.warn("[Global SEO] Database network connection currently unavailable (EADDRNOTAVAIL), using default SEO settings.");
    } else {
      console.error("[Global SEO] Error fetching global SEO settings, returning defaults:", error);
    }
  }
  return DEFAULT_SEO_SETTINGS;
}

export async function saveGlobalSeo(
  settings: GlobalSeoSettings
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();
  try {
    const parsed = globalSeoSchema.safeParse(settings);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message || "Invalid SEO settings." };
    }

    await db.insert(globalSeo)
      .values({
        id: "default",
        defaultSeoTitle: normalizeSeoText(parsed.data.defaultSeoTitle, 180),
        defaultSeoDescription: normalizeSeoText(parsed.data.defaultSeoDescription, 500),
        defaultOgImage: normalizeSeoText(parsed.data.defaultOgImage, 500) || null,
        defaultKeywords: normalizeSeoText(parsed.data.defaultKeywords, 500) || null,
      })
      .onConflictDoUpdate({
        target: globalSeo.id,
        set: {
          defaultSeoTitle: normalizeSeoText(parsed.data.defaultSeoTitle, 180),
          defaultSeoDescription: normalizeSeoText(parsed.data.defaultSeoDescription, 500),
          defaultOgImage: normalizeSeoText(parsed.data.defaultOgImage, 500) || null,
          defaultKeywords: normalizeSeoText(parsed.data.defaultKeywords, 500) || null,
          updatedAt: new Date(),
        },
      });

    for (const locale of locales) {
      revalidatePath(`/${locale}`);
      revalidatePath(`/${locale}/catalog`);
      revalidatePath(`/${locale}/news`);
      revalidatePath(`/${locale}/admin/settings/seo`);
    }
    revalidateTag("global-seo", "max");

    return { success: true };
  } catch (err: unknown) {
    console.error("Error saving global SEO settings:", err);
    return { success: false, error: "Failed to save settings" };
  }
}

export async function getPageSeo(pageId: string): Promise<PageSeoSettings> {
  try {
    const record = await db.query.pageSeo.findFirst({
      where: eq(pageSeo.id, pageId),
    });

    if (record) {
      return {
        id: record.id,
        pageName: record.pageName,
        seoTitle: record.seoTitle,
        seoDescription: record.seoDescription,
        seoKeywords: record.seoKeywords || "",
        seoImage: record.seoImage || "",
      };
    }

  } catch (error: unknown) {
    if (getErrorCode(error) === "EADDRNOTAVAIL") {
      console.warn(`[Page SEO] Database connection unavailable for page '${pageId}', using default page SEO settings.`);
    } else {
      console.error(`[Page SEO] Error fetching page SEO for ${pageId}:`, error);
    }
  }

  const fallback = DEFAULT_PAGE_SEO[pageId] || DEFAULT_PAGE_SEO.home;
  return {
    id: pageId,
    ...fallback,
  };
}

export async function getAllPageSeo(): Promise<PageSeoSettings[]> {
  try {
    const pageIds = Object.keys(DEFAULT_PAGE_SEO);
    const results = await Promise.all(pageIds.map(id => getPageSeo(id)));
    return results;
  } catch (error) {
    console.error("Error fetching all page SEO settings:", error);
    return [];
  }
}

export const getCachedGlobalSeo = unstable_cache(
  getGlobalSeo,
  ["global-seo-v1"],
  { revalidate: 300, tags: ["global-seo"] },
);

export const getCachedPageSeo = unstable_cache(
  async (pageId: string) => getPageSeo(pageId),
  ["page-seo-v1"],
  { revalidate: 300, tags: ["page-seo"] },
);

export async function savePageSeo(
  pageId: string,
  settings: Omit<PageSeoSettings, "id" | "pageName">
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();
  try {
    const parsedPageId = pageIdSchema.safeParse(pageId);
    if (!parsedPageId.success) {
      return { success: false, error: "Unsupported public page." };
    }
    const parsed = pageSeoSchema.safeParse(settings);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message || "Invalid page SEO settings." };
    }

    const normalizedPageId = parsedPageId.data;
    const defaults = DEFAULT_PAGE_SEO[normalizedPageId];
    await db.insert(pageSeo)
      .values({
        id: normalizedPageId,
        pageName: defaults.pageName,
        seoTitle: normalizeSeoText(parsed.data.seoTitle, 180),
        seoDescription: normalizeSeoText(parsed.data.seoDescription, 500),
        seoKeywords: parsed.data.seoKeywords ? normalizeSeoText(parsed.data.seoKeywords, 500) : null,
        seoImage: parsed.data.seoImage ? normalizeSeoText(parsed.data.seoImage, 500) : null,
      })
      .onConflictDoUpdate({
        target: pageSeo.id,
        set: {
          seoTitle: normalizeSeoText(parsed.data.seoTitle, 180),
          seoDescription: normalizeSeoText(parsed.data.seoDescription, 500),
          seoKeywords: parsed.data.seoKeywords ? normalizeSeoText(parsed.data.seoKeywords, 500) : null,
          seoImage: parsed.data.seoImage ? normalizeSeoText(parsed.data.seoImage, 500) : null,
          updatedAt: new Date(),
        },
      });

    for (const locale of locales) {
      revalidatePath(`/${locale}`);
      revalidatePath(`/${locale}/catalog`);
      revalidatePath(`/${locale}/news`);
      revalidatePath(`/${locale}/support`);
      revalidatePath(`/${locale}/wizard`);
      revalidatePath(`/${locale}/admin/settings/seo`);
    }
    revalidateTag("page-seo", "max");

    return { success: true };
  } catch (err: unknown) {
    console.error(`Error saving page SEO for ${pageId}:`, err);
    return { success: false, error: "Failed to save settings" };
  }
}
