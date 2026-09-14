"use server";

import { db } from "@/db";
import { navigationItems } from "@/db/schema";
import { eq, isNull, asc, count } from "drizzle-orm";
import { checkAdmin } from "./auth";
import { revalidatePath, revalidateTag } from "next/cache";

import { getTranslations } from "next-intl/server";
import { locales } from "@/i18n/locales";
import { getLocale } from "next-intl/server";
import { getSystemSetting, saveSystemSetting } from "@/app/actions/systemSettings";
import { isLocale, type Locale } from "@/i18n/locales";
import { NAVIGATION_CACHE_TAG } from "@/lib/public-content-cache";
import { z } from "zod";

const NAVIGATION_TRANSLATIONS_KEY = "navigation_translations";
const NAVIGATION_TEMPLATES_KEY = "navigation_locale_templates";
export type NavigationTranslations = Partial<Record<Locale, Record<string, string>>>;
export type NavigationTemplateItem = { id: string; label: string; url: string; parentId: string | null; order: number };
export type NavigationTemplates = Partial<Record<Locale, NavigationTemplateItem[]>>;

const navigationItemSchema = z.object({
  id: z.string().trim().min(1).max(120).optional(),
  label: z.string().trim().min(1).max(160),
  url: z.string().trim().min(1).max(2048),
  parentId: z.string().trim().max(120).nullable().optional(),
  order: z.coerce.number().int().min(0).max(10000).default(0),
});

const navigationUpdateSchema = navigationItemSchema.omit({ id: true }).partial();

export async function getNavigationTemplates(): Promise<NavigationTemplates> {
  const raw = await getSystemSetting(NAVIGATION_TEMPLATES_KEY);
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(value).flatMap(([locale, items]) => {
      if (!isLocale(locale) || !Array.isArray(items)) return [];
      const valid = items.flatMap((item) => {
        if (item === null || typeof item !== "object") return [];
        const row = item as Record<string, unknown>;
        if (typeof row.id !== "string" || typeof row.label !== "string" || typeof row.url !== "string" || (row.parentId !== null && typeof row.parentId !== "string") || typeof row.order !== "number") return [];
        return [{ id: row.id, label: row.label, url: row.url, parentId: row.parentId, order: row.order }];
      });
      return [[locale, valid]];
    })) as NavigationTemplates;
  } catch {
    return {};
  }
}

export async function saveNavigationTemplate(locale: Locale, items: NavigationTemplateItem[]) {
  await checkAdmin();
  const parsedItems = z.array(
    navigationItemSchema.omit({ id: true }).extend({ id: z.string().trim().min(1).max(120) }),
  ).max(100).safeParse(items);
  if (!isLocale(locale) || !parsedItems.success || parsedItems.data.some((item) => !isAllowedNavigationUrl(item.url))) {
    return { success: false, error: "Each menu item needs a label and an internal path, #, https URL, mailto, or tel URL." };
  }
  const templates = await getNavigationTemplates();
  const result = await saveSystemSetting(NAVIGATION_TEMPLATES_KEY, JSON.stringify({ ...templates, [locale]: parsedItems.data }));
  if (result.success) revalidateNavigation();
  return result;
}

export async function getNavigationTranslations(): Promise<NavigationTranslations> {
  const raw = await getSystemSetting(NAVIGATION_TRANSLATIONS_KEY);
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(value).flatMap(([locale, labels]) => {
      if (!isLocale(locale) || labels === null || typeof labels !== "object") return [];
      const valid = Object.fromEntries(Object.entries(labels as Record<string, unknown>).flatMap(([id, label]) => typeof label === "string" ? [[id, label]] : []));
      return [[locale, valid]];
    })) as NavigationTranslations;
  } catch {
    return {};
  }
}

export async function saveNavigationTranslations(locale: Locale, labels: Record<string, string>) {
  await checkAdmin();
  if (!isLocale(locale)) return { success: false, error: "Unsupported language." };
  if (!labels || typeof labels !== "object" || Object.keys(labels).length > 500) {
    return { success: false, error: "Invalid navigation translations." };
  }
  const normalizedLabels = Object.fromEntries(
    Object.entries(labels).flatMap(([id, label]) =>
      typeof label === "string" && id.trim() && label.trim()
        ? [[id.trim().slice(0, 120), label.trim().slice(0, 160)]]
        : [],
    ),
  );
  const current = await getNavigationTranslations();
  const result = await saveSystemSetting(NAVIGATION_TRANSLATIONS_KEY, JSON.stringify({ ...current, [locale]: normalizedLabels }));
  if (result.success) revalidateNavigation();
  return result;
}

function revalidateNavigation() {
  revalidateTag(NAVIGATION_CACHE_TAG, "max");
  revalidatePath("/", "layout");
  for (const locale of locales) revalidatePath(`/${locale}`, "layout");
}

function isAllowedNavigationUrl(value: string) {
  if (value.startsWith("/") || value === "#") return true;
  try {
    const url = new URL(value);
    return ["https:", "mailto:", "tel:"].includes(url.protocol);
  } catch {
    return false;
  }
}

export async function getNavigationItems() {
  try {
    // 💡 ดึงฟังก์ชันแปลภาษาของกลุ่มเมนูแบบปลอดภัย (มี fallback หากไม่มี context)
    let t = (key: string) => {
      const defaults: Record<string, string> = {
        products: "Products",
        build: "Savings Guide",
        protools: "Pro Tools",
        wizard: "Solar Estimator",
        visualizer: "Rooftop Visualizer",
        community: "Community",
        news: "News & KB",
      };
      return defaults[key] || key;
    };

    try {
      const trans = await getTranslations("Navigation");
      if (trans) t = trans;
    } catch {
      // Graceful fallback when locale request context is missing
    }

    const [items, locale, translations, templates] = await Promise.all([
      db.query.navigationItems.findMany({
        where: isNull(navigationItems.parentId),
        with: {
          children: {
            orderBy: [asc(navigationItems.order)],
          },
        },
        orderBy: [asc(navigationItems.order)],
      }),
      getLocale().catch(() => "th"),
      getNavigationTranslations().catch(() => ({} as NavigationTranslations)),
      getNavigationTemplates().catch(() => ({} as NavigationTemplates)),
    ]);

    if (items.length === 0) {
      // ใช้ค่า t('key') ครอบข้อความเพื่อดึงภาษา Th/En ที่ตั้งไว้ใน JSON ออกมาแสดงผล
      return [
        {
          id: "default-products",
          label: t("products"), // เดิม "Products"
          url: "#",
          parentId: null,
          order: 0,
          children: [
            { id: "default-build", label: t("build"), url: "/build", parentId: "default-products", order: 1, children: [] }, // เดิม "Savings Guide"
          ]
        },
        {
          id: "default-pro-tools",
          label: t("protools"), // เดิม "Pro Tools"
          url: "#",
          parentId: null,
          order: 1,
          children: [
            { id: "default-wizard", label: t("wizard"), url: "/wizard", parentId: "default-pro-tools", order: 0, children: [] }, // เดิม "Solar Estimator"
            { id: "default-visualizer", label: t("visualizer"), url: "/visualizer", parentId: "default-pro-tools", order: 1, children: [] }, // เดิม "Rooftop Visualizer"
          ]
        },
        {
          id: "default-community",
          label: t("community"), // เดิม "Community"
          url: "#",
          parentId: null,
          order: 2,
          children: [
            { id: "default-news", label: t("news"), url: "/news", parentId: "default-community", order: 0, children: [] }, // เดิม "News & KB"
          ]
        }
      ];
    }

    const localizedTemplate = isLocale(locale) ? templates[locale] : undefined;
    if (localizedTemplate?.length) {
      return localizedTemplate.filter((item) => item.parentId === null).sort((a, b) => a.order - b.order).map((item) => ({
        ...item,
        children: localizedTemplate.filter((child) => child.parentId === item.id).sort((a, b) => a.order - b.order),
      }));
    }
    // Thai is the source navigation. Older translation records must never
    // override a label that was just saved to the primary navigation table.
    const labels = isLocale(locale) && locale !== "th" ? translations[locale] : undefined;
    return items.map((item) => ({
      ...item,
      label: labels?.[item.id] || item.label,
      children: item.children.map((child) => ({ ...child, label: labels?.[child.id] || child.label })),
    }));
  } catch (err) {
    console.error("Error fetching navigation items:", err);
    return [];
  }
}

export async function getAllNavigationItemsRaw() {
  await checkAdmin();
  try {
    return await db.select()
      .from(navigationItems)
      .orderBy(asc(navigationItems.parentId), asc(navigationItems.order));
  } catch (error) {
    console.error("Failed to load raw navigation items:", error);
    return [];
  }
}

export async function createNavigationItem(data: {
  label: string;
  url: string;
  parentId?: string | null;
  order?: number;
}) {
  await checkAdmin();
  try {
    const parsed = navigationItemSchema.omit({ id: true }).safeParse(data);
    if (!parsed.success || !isAllowedNavigationUrl(parsed.data.url)) {
      return { success: false, error: "Each menu item needs a label and an internal path, #, https URL, mailto, or tel URL." };
    }

    const [item] = await db.insert(navigationItems)
      .values(parsed.data)
      .returning();
    if (!item) return { success: false, error: "The menu item could not be created." };

    revalidateNavigation();
    return { success: true, item };
  } catch (error) {
    console.error("Failed to create navigation item:", error);
    return { success: false, error: "The menu item could not be created." };
  }
}

export async function updateNavigationItem(
  id: string,
  data: {
    label?: string;
    url?: string;
    parentId?: string | null;
    order?: number;
  }
) {
  await checkAdmin();
  try {
    if (!id.trim()) return { success: false, error: "Menu item ID is required." };
    const parsed = navigationUpdateSchema.safeParse(data);
    if (!parsed.success || (parsed.data.url !== undefined && !isAllowedNavigationUrl(parsed.data.url))) {
      return { success: false, error: "Each menu item needs a valid label, path, or URL." };
    }
    if (Object.keys(parsed.data).length === 0) return { success: false, error: "No menu item changes were provided." };

    const [item] = await db.update(navigationItems)
      .set(parsed.data)
      .where(eq(navigationItems.id, id))
      .returning();

    if (!item) return { success: false, error: "The menu item no longer exists. Refresh the page and try again." };
    revalidateNavigation();
    return { success: true, item };
  } catch (error) {
    console.error("Failed to update navigation item:", error);
    return { success: false, error: "The menu item could not be updated." };
  }
}

export async function deleteNavigationItem(id: string) {
  await checkAdmin();
  try {
    if (!id.trim()) return { success: false, error: "Menu item ID is required." };
    const [deleted] = await db.delete(navigationItems).where(eq(navigationItems.id, id)).returning({ id: navigationItems.id });
    if (!deleted) return { success: false, error: "The menu item no longer exists. Refresh the page and try again." };

    revalidateNavigation();
    return { success: true };
  } catch (error) {
    console.error("Failed to delete navigation item:", error);
    return { success: false, error: "The menu item could not be deleted." };
  }
}

export async function seedDefaultNavigationItems() {
  await checkAdmin();

  const [row] = await db.select({ value: count() }).from(navigationItems);
  const countVal = row?.value || 0;
  if (countVal > 0) {
    return { success: false, message: "Database already has navigation items." };
  }

  const seededItems = await db.transaction(async (tx) => {
    const [productsCategory] = await tx.insert(navigationItems)
      .values({ label: "Products", url: "#", order: 0 })
      .returning();
    const productChildren = await tx.insert(navigationItems)
      .values([
        { label: "Savings Guide", url: "/build", parentId: productsCategory.id, order: 1 },
      ])
      .returning();

    const [proToolsCategory] = await tx.insert(navigationItems)
      .values({ label: "Pro Tools", url: "#", order: 1 })
      .returning();
    const proToolChildren = await tx.insert(navigationItems)
      .values([
        { label: "Solar Estimator", url: "/wizard", parentId: proToolsCategory.id, order: 0 },
        { label: "Rooftop Visualizer", url: "/visualizer", parentId: proToolsCategory.id, order: 1 },
      ])
      .returning();

    const [communityCategory] = await tx.insert(navigationItems)
      .values({ label: "Community", url: "#", order: 2 })
      .returning();
    const communityChildren = await tx.insert(navigationItems)
      .values([
        { label: "News & KB", url: "/news", parentId: communityCategory.id, order: 0 },
      ])
      .returning();

    return [
      productsCategory,
      ...productChildren,
      proToolsCategory,
      ...proToolChildren,
      communityCategory,
      ...communityChildren,
    ].sort((a, b) => {
      if (a.parentId === b.parentId) return a.order - b.order;
      if (!a.parentId) return -1;
      if (!b.parentId) return 1;
      return a.parentId.localeCompare(b.parentId);
    });
  });

  revalidateNavigation();
  return {
    success: true,
    message: "Successfully seeded default navigation items!",
    items: seededItems,
  };
}
