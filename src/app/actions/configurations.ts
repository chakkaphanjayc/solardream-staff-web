"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { savedConfigurations } from "@/db/schema";
import { getCatalogProductsByIds, type ErpnextCatalogProduct } from "@/lib/erpnextCatalog";
import { createClient } from "@/utils/supabase/server";

type SavedCatalogProduct = ErpnextCatalogProduct & { name: string };

function displayName(product: ErpnextCatalogProduct): string {
  return `${product.brand} ${product.model}`.trim();
}

function normalizeItemCodes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value.filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ).slice(0, 100);
}

async function getUTMFromCookies() {
  try {
    const cookieStore = await cookies();
    return {
      utm_source: cookieStore.get("utm_source")?.value || null,
      utm_medium: cookieStore.get("utm_medium")?.value || null,
      utm_campaign: cookieStore.get("utm_campaign")?.value || null,
    };
  } catch (error) {
    console.error("Failed to read UTM cookies:", error);
    return { utm_source: null, utm_medium: null, utm_campaign: null };
  }
}

export async function saveConfiguration(selectedComponentIds: string[], totalPrice: number) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be logged in to save configurations." };
  }

  const itemCodes = normalizeItemCodes(selectedComponentIds);
  const utmCookies = await getUTMFromCookies();

  try {
    const liveProducts = await getCatalogProductsByIds(itemCodes);
    const liveCodes = liveProducts.map((product) => product.erpnextItemCode);
    if (liveCodes.length !== itemCodes.length) {
      return { error: "One or more selected items are no longer available in ERPNext." };
    }

    const savedConfig = await db
      .insert(savedConfigurations)
      .values({
        userId: user.id,
        totalPrice,
        erpnextItemCodes: liveCodes,
        utm_source: utmCookies.utm_source,
        utm_medium: utmCookies.utm_medium,
        utm_campaign: utmCookies.utm_campaign,
      })
      .returning();

    revalidatePath("/saved-builds");
    return {
      success: true,
      data: savedConfig[0],
      products: liveProducts.map((product): SavedCatalogProduct => ({
        ...product,
        name: displayName(product),
      })),
    };
  } catch (error) {
    console.error("Error saving ERPNext-backed configuration:", error);
    return { error: "Failed to save configuration." };
  }
}

export async function getSavedConfigurations() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return [];

  try {
    const list = await db.query.savedConfigurations.findMany({
      where: eq(savedConfigurations.userId, user.id),
      with: {
        // This relation is read only for legacy saved builds. New saves use
        // ERPNext item codes and never create local product links.
        productLinks: {
          columns: { productId: true },
          with: { product: { columns: { id: true, erpnextItemCode: true } } },
        },
      },
      orderBy: [desc(savedConfigurations.createdAt)],
    });

    const codesByConfiguration = list.map((configuration) => {
      const storedCodes = normalizeItemCodes(configuration.erpnextItemCodes);
      const legacyCodes = configuration.productLinks
        .map((link) => link.product?.erpnextItemCode || link.product?.id || "")
        .filter(Boolean);
      return Array.from(new Set([...storedCodes, ...legacyCodes]));
    });
    const allCodes = Array.from(new Set(codesByConfiguration.flat()));
    const liveProducts = await getCatalogProductsByIds(allCodes);
    const productsByCode = new Map(
      liveProducts.map((product): [string, SavedCatalogProduct] => [
        product.erpnextItemCode,
        { ...product, name: displayName(product) },
      ]),
    );

    return list.map((configuration, index) => {
      const { productLinks: legacyLinks, ...rest } = configuration;
      void legacyLinks;
      return {
        ...rest,
        erpnextItemCodes: codesByConfiguration[index] || [],
        products: (codesByConfiguration[index] || [])
          .map((code) => productsByCode.get(code))
          .filter((product): product is SavedCatalogProduct => Boolean(product)),
      };
    });
  } catch (error) {
    console.error("Failed to load ERPNext-backed saved configurations:", error);
    return [];
  }
}

export async function deleteSavedConfiguration(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { error: "Unauthorized" };

  await db.delete(savedConfigurations).where(
    and(eq(savedConfigurations.id, id), eq(savedConfigurations.userId, user.id)),
  );

  revalidatePath("/saved-builds");
  return { success: true };
}
