"use server";

import { and, asc, desc, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";
import { revalidatePath, revalidateTag } from "next/cache";

import { db } from "@/db";
import { globalBanners } from "@/db/schema";
import {
  getGlobalBannerFallbackMessage,
  normalizeGlobalBannerTranslations,
  parseGlobalBannerDate,
  validateGlobalBannerSchedule,
} from "@/lib/globalBanner";
import type { GlobalBannerInput } from "@/types/globalBanner";
import { checkAdmin } from "./auth";

const BANNER_TYPES = new Set(["INFO", "PROMO", "NEW", "WARNING", "ALERT"]);

function normalizeBannerInput(data: GlobalBannerInput) {
  if (!data || typeof data !== "object") {
    throw new Error("Banner data is required.");
  }

  const translations = normalizeGlobalBannerTranslations(data.translations);
  const message = getGlobalBannerFallbackMessage(data.message, translations);
  if (!message) throw new Error("A message is required in the fallback, English, or Thai field.");

  const type = typeof data.type === "string" ? data.type.trim().toUpperCase() : "";
  if (!BANNER_TYPES.has(type)) throw new Error("Banner type is not supported.");

  const startsAt = parseGlobalBannerDate(data.startsAt, "Start time");
  const endsAt = parseGlobalBannerDate(data.endsAt, "End time");
  validateGlobalBannerSchedule(startsAt, endsAt);

  const sortOrder = typeof data.sortOrder === "number" && Number.isFinite(data.sortOrder)
    ? Math.trunc(data.sortOrder)
    : 0;
  const linkUrl = typeof data.linkUrl === "string" ? data.linkUrl.trim().slice(0, 2048) || null : null;

  return {
    message: message.slice(0, 1000),
    type,
    linkUrl,
    translations,
    isActive: data.isActive === true,
    startsAt,
    endsAt,
    sortOrder,
  };
}

function activeBannerWhere(now: Date) {
  return and(
    eq(globalBanners.isActive, true),
    or(isNull(globalBanners.startsAt), lte(globalBanners.startsAt, now)),
    or(isNull(globalBanners.endsAt), gt(globalBanners.endsAt, now)),
  );
}

function revalidateBanners() {
  revalidatePath("/", "layout");
  revalidateTag("global-banner", "max");
}

export async function getBanners() {
  await checkAdmin();
  try {
    return await db
      .select()
      .from(globalBanners)
      .orderBy(asc(globalBanners.sortOrder), desc(globalBanners.createdAt));
  } catch (error) {
    console.error("Failed to load global banners:", error);
    return [];
  }
}

export async function getActiveBanner() {
  return db.query.globalBanners.findFirst({
    where: activeBannerWhere(new Date()),
    orderBy: [asc(globalBanners.sortOrder), desc(globalBanners.createdAt)],
  });
}

export async function getActiveBanners() {
  return db.query.globalBanners.findMany({
    where: activeBannerWhere(new Date()),
    orderBy: [asc(globalBanners.sortOrder), desc(globalBanners.createdAt)],
  });
}

export async function createBanner(data: GlobalBannerInput) {
  await checkAdmin();
  const payload = normalizeBannerInput(data);

  const [banner] = await db.insert(globalBanners).values(payload).returning();
  if (!banner) throw new Error("Banner could not be created.");

  revalidateBanners();
  return { success: true, banner };
}

export async function updateBanner(id: string, data: GlobalBannerInput) {
  await checkAdmin();
  if (!id.trim()) throw new Error("Banner ID is required.");

  const payload = normalizeBannerInput(data);
  const [banner] = await db
    .update(globalBanners)
    .set(payload)
    .where(eq(globalBanners.id, id))
    .returning();

  if (!banner) throw new Error("Banner could not be found.");

  revalidateBanners();
  return { success: true, banner };
}

export async function toggleBannerStatus(id: string, newStatus: boolean) {
  await checkAdmin();

  const [banner] = await db
    .update(globalBanners)
    .set({ isActive: newStatus })
    .where(eq(globalBanners.id, id))
    .returning();

  if (!banner) throw new Error("Banner could not be found.");

  revalidateBanners();
  return { success: true, banner };
}

export async function deleteBanner(id: string) {
  await checkAdmin();
  if (!id.trim()) throw new Error("Banner ID is required.");

  const [banner] = await db
    .delete(globalBanners)
    .where(eq(globalBanners.id, id))
    .returning({ id: globalBanners.id });
  if (!banner) throw new Error("Banner could not be found.");

  revalidateBanners();
  return { success: true };
}

export async function deleteBanners(ids: string[]) {
  await checkAdmin();
  if (!Array.isArray(ids)) throw new Error("Select at least one banner.");
  const cleanIds = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
  if (cleanIds.length === 0) throw new Error("Select at least one banner.");
  if (cleanIds.length > 100) throw new Error("Select no more than 100 banners at a time.");

  const deleted = await db
    .delete(globalBanners)
    .where(inArray(globalBanners.id, cleanIds))
    .returning({ id: globalBanners.id });

  if (deleted.length === 0) {
    throw new Error("The selected banners no longer exist. Refresh the page and try again.");
  }

  revalidateBanners();
  return { success: true, count: deleted.length };
}

export async function toggleBannersStatus(ids: string[], newStatus: boolean) {
  await checkAdmin();
  if (!Array.isArray(ids)) throw new Error("Select at least one banner.");
  if (typeof newStatus !== "boolean") throw new Error("Banner status is invalid.");
  const cleanIds = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
  if (cleanIds.length === 0) throw new Error("Select at least one banner.");
  if (cleanIds.length > 100) throw new Error("Select no more than 100 banners at a time.");

  const updated = await db
    .update(globalBanners)
    .set({ isActive: newStatus })
    .where(inArray(globalBanners.id, cleanIds))
    .returning();

  if (updated.length === 0) {
    throw new Error("The selected banners no longer exist. Refresh the page and try again.");
  }

  revalidateBanners();
  return { success: true, banners: updated };
}
