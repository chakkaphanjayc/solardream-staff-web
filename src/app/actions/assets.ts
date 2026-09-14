"use server";

import { revalidatePath } from "next/cache";
import { asc, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { assetRegistrations, purchasedProducts, users } from "@/db/schema";
import { requireStaff } from "@/lib/auth-guard";
import {
  getCatalogProduct,
  getCatalogProductsByIds,
  listCatalogProducts,
  type ErpnextCatalogProduct,
} from "@/lib/erpnextCatalog";
import { createClient } from "@/utils/supabase/server";

type UserSummary = {
  id: string;
  name: string | null;
  email: string;
  phoneNumber: string | null;
};

type LegacyProductSummary = {
  id: string;
  erpnextItemCode: string;
  brand: string;
  model: string;
  price: number;
  imageUrl: string;
  description: string | null;
  category?: { id: string; name: string } | null;
};

type PurchasedAssetRow = {
  id: string;
  userId: string;
  productId: string | null;
  erpnextItemCode: string | null;
  purchaseDate: Date;
  serialNumber: string;
  warrantyDays: number;
  createdAt: Date;
  updatedAt: Date;
  user: UserSummary;
  product: LegacyProductSummary | null;
};

function normalizeCodes(rows: readonly PurchasedAssetRow[]): string[] {
  return Array.from(
    new Set(
      rows
        .flatMap((row) => [row.erpnextItemCode, row.product?.erpnextItemCode, row.productId])
        .filter((code): code is string => Boolean(code && code.trim()))
        .map((code) => code.trim()),
    ),
  );
}

function legacyProductSummary(product: LegacyProductSummary): ErpnextCatalogProduct {
  return {
    id: product.erpnextItemCode || product.id,
    erpnextItemCode: product.erpnextItemCode || product.id,
    brand: product.brand,
    model: product.model,
    price: product.price,
    imageUrl: product.imageUrl,
    description: product.description,
    stock: 0,
    stockStatus: "LEGACY_RECORD",
    ctaType: "CONTACT_SALES",
    isAvailable: false,
    isActive: false,
    categoryId: product.category?.id || "legacy",
    metadata: {},
    createdAt: new Date(0),
    updatedAt: new Date(0),
    seoTitle: null,
    seoDescription: null,
    seoKeywords: null,
    seoImage: null,
    physicalWidth: null,
    physicalLength: null,
    wattageCapacity: null,
    useInRecommendation: false,
    recommendTier: null,
    recommendPriority: 0,
    category: {
      id: product.category?.id || "legacy",
      name: product.category?.name || "Legacy catalog record",
      description: null,
      slug: "legacy",
      displayOrder: 0,
      isRequired: false,
      allowMultiple: true,
      dependsOnCategoryId: null,
      dependsOnProductId: null,
      blueprintId: null,
      parentId: null,
      createdAt: new Date(0),
      updatedAt: new Date(0),
      parent: null,
    },
  };
}

function normalizeAsset(row: PurchasedAssetRow, liveByCode: Map<string, ErpnextCatalogProduct>) {
  const code = row.erpnextItemCode || row.product?.erpnextItemCode || row.productId || "";
  const liveProduct = code ? liveByCode.get(code) : undefined;
  const product = liveProduct || (row.product ? legacyProductSummary(row.product) : null);
  if (!product) return null;

  return {
    ...row,
    productId: product.erpnextItemCode,
    erpnextItemCode: product.erpnextItemCode,
    product,
  };
}

async function loadLiveProducts(rows: readonly PurchasedAssetRow[]) {
  const products = await getCatalogProductsByIds(normalizeCodes(rows));
  return new Map(products.map((product) => [product.erpnextItemCode, product]));
}

export async function getAdminAssetRegistrationData() {
  try {
    await requireStaff();

    const [rawAssets, usersList, catalogResult, registrations] = await Promise.all([
      db.query.purchasedProducts.findMany({
        orderBy: [desc(purchasedProducts.createdAt)],
        with: {
          user: {
            columns: { id: true, name: true, email: true, phoneNumber: true },
          },
          product: {
            columns: { id: true, erpnextItemCode: true, brand: true, model: true, price: true, imageUrl: true, description: true, categoryId: true },
            with: { category: { columns: { id: true, name: true } } },
          },
        },
      }),
      db.query.users.findMany({
        orderBy: [asc(users.name), asc(users.email)],
        columns: { id: true, name: true, email: true, phoneNumber: true },
      }),
      listCatalogProducts({ sort: "newest", take: 100 }),
      db.query.assetRegistrations.findMany({
        orderBy: [desc(assetRegistrations.createdAt)],
        with: {
          user: {
            columns: { id: true, name: true, email: true, phoneNumber: true },
          },
        },
      }),
    ]);

    const assets = rawAssets as PurchasedAssetRow[];
    const liveByCode = await loadLiveProducts(assets);
    const normalizedAssets = assets
      .map((asset) => normalizeAsset(asset, liveByCode))
      .filter((asset): asset is NonNullable<typeof asset> => Boolean(asset));

    return { success: true, assets: normalizedAssets, users: usersList, products: catalogResult.products, registrations };
  } catch (error: unknown) {
    console.error("Failed to load asset registration data:", error);
    return { error: "Failed to load asset registration data." };
  }
}

export async function createPurchasedProduct(data: {
  userId: string;
  productId: string;
  serialNumber: string;
  purchaseDate?: string | Date | null;
  warrantyDays: number;
}) {
  try {
    await requireStaff();

    const serialNumber = data.serialNumber.trim();
    if (!data.userId || !data.productId || !serialNumber) {
      return { error: "Customer, product, and serial number are required." };
    }
    if (serialNumber.length > 160) return { error: "Serial number is too long." };
    if (!Number.isFinite(data.warrantyDays) || data.warrantyDays <= 0) {
      return { error: "Warranty days must be greater than zero." };
    }
    const parsedPurchaseDate = data.purchaseDate ? new Date(data.purchaseDate) : new Date();
    if (Number.isNaN(parsedPurchaseDate.getTime())) return { error: "Purchase date is invalid." };

    const [product, user] = await Promise.all([
      getCatalogProduct(data.productId),
      db.query.users.findFirst({
        where: eq(users.id, data.userId),
        columns: { id: true, name: true, email: true, phoneNumber: true },
      }),
    ]);
    if (!product) return { error: "Catalog item was not found in ERPNext." };
    if (!user) return { error: "Customer was not found." };

    const [inserted] = await db
      .insert(purchasedProducts)
      .values({
        userId: data.userId,
        productId: null,
        erpnextItemCode: product.erpnextItemCode,
        serialNumber,
        warrantyDays: Math.round(data.warrantyDays),
        purchaseDate: parsedPurchaseDate,
      })
      .returning();
    if (!inserted) return { error: "Failed to register asset." };

    const asset = {
      ...inserted,
      productId: product.erpnextItemCode,
      erpnextItemCode: product.erpnextItemCode,
      user: user as UserSummary,
      product,
    };

    revalidatePath("/admin/assets");
    revalidatePath("/my-assets");
    return { success: true, asset };
  } catch (error: unknown) {
    console.error("Failed to create purchased product:", error);
    return { error: "Failed to register asset." };
  }
}

export async function updatePurchasedProduct(assetId: string, data: {
  serialNumber?: string;
  purchaseDate?: string | Date | null;
  warrantyDays?: number;
}) {
  try {
    await requireStaff();
    if (!assetId.trim()) return { error: "Asset ID is required." };
    if (data.serialNumber !== undefined && !data.serialNumber.trim()) return { error: "Serial number is required." };
    if (data.serialNumber !== undefined && data.serialNumber.trim().length > 160) return { error: "Serial number is too long." };
    if (data.warrantyDays !== undefined && (!Number.isFinite(data.warrantyDays) || data.warrantyDays <= 0)) {
      return { error: "Warranty days must be greater than zero." };
    }
    const parsedPurchaseDate = data.purchaseDate === undefined
      ? undefined
      : data.purchaseDate
        ? new Date(data.purchaseDate)
        : new Date();
    if (parsedPurchaseDate && Number.isNaN(parsedPurchaseDate.getTime())) return { error: "Purchase date is invalid." };

    const [updated] = await db
      .update(purchasedProducts)
      .set({
        ...(data.serialNumber !== undefined ? { serialNumber: data.serialNumber.trim() } : {}),
        ...(parsedPurchaseDate !== undefined ? { purchaseDate: parsedPurchaseDate } : {}),
        ...(data.warrantyDays !== undefined ? { warrantyDays: Math.round(data.warrantyDays) } : {}),
      })
      .where(eq(purchasedProducts.id, assetId))
      .returning();
    if (!updated) return { error: "Asset not found." };

    const rawAsset = await db.query.purchasedProducts.findFirst({
      where: eq(purchasedProducts.id, updated.id),
      with: {
        user: { columns: { id: true, name: true, email: true, phoneNumber: true } },
        product: {
          columns: { id: true, erpnextItemCode: true, brand: true, model: true, price: true, imageUrl: true, description: true, categoryId: true },
          with: { category: { columns: { id: true, name: true } } },
        },
      },
    });
    if (!rawAsset) return { error: "Asset not found." };
    const assetRow = rawAsset as PurchasedAssetRow;
    const liveByCode = await loadLiveProducts([assetRow]);
    const asset = normalizeAsset(assetRow, liveByCode);

    revalidatePath("/admin/assets");
    revalidatePath("/my-assets");
    return asset ? { success: true, asset } : { error: "The ERPNext item for this asset is no longer available." };
  } catch (error: unknown) {
    console.error("Failed to update purchased product:", error);
    return { error: "Failed to update asset." };
  }
}

export async function deletePurchasedProduct(assetId: string) {
  try {
    await requireStaff();
    if (!assetId.trim()) return { error: "Asset ID is required." };
    const [deleted] = await db.delete(purchasedProducts).where(eq(purchasedProducts.id, assetId)).returning({ id: purchasedProducts.id });
    if (!deleted) return { error: "Asset not found." };
    revalidatePath("/admin/assets");
    revalidatePath("/my-assets");
    return { success: true };
  } catch (error: unknown) {
    console.error("Failed to delete purchased product:", error);
    return { error: "Failed to delete asset." };
  }
}

export async function deletePurchasedProducts(assetIds: string[]) {
  try {
    await requireStaff();
    if (!Array.isArray(assetIds)) return { error: "No assets selected." };
    const cleanIds = Array.from(new Set(assetIds.map((id) => id.trim()).filter(Boolean)));
    if (cleanIds.length === 0) return { error: "No assets selected." };
    if (cleanIds.length > 100) return { error: "Select no more than 100 assets at a time." };

    const deleted = await db
      .delete(purchasedProducts)
      .where(inArray(purchasedProducts.id, cleanIds))
      .returning({ id: purchasedProducts.id });
    if (deleted.length === 0) return { error: "The selected assets no longer exist." };
    revalidatePath("/admin/assets");
    revalidatePath("/my-assets");
    return { success: true, count: deleted.length };
  } catch (error: unknown) {
    console.error("Failed to delete purchased products:", error);
    return { error: "Failed to delete selected assets." };
  }
}

export async function getMyPurchasedProducts() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Unauthorized" };

    const rawAssets = await db.query.purchasedProducts.findMany({
      where: eq(purchasedProducts.userId, user.id),
      orderBy: [desc(purchasedProducts.purchaseDate)],
      with: {
        user: { columns: { id: true, name: true, email: true, phoneNumber: true } },
        product: {
          columns: { id: true, erpnextItemCode: true, brand: true, model: true, price: true, imageUrl: true, description: true, categoryId: true },
          with: { category: { columns: { id: true, name: true } } },
        },
      },
    });

    const assets = rawAssets as PurchasedAssetRow[];
    const liveByCode = await loadLiveProducts(assets);
    const normalizedAssets = assets
      .map((asset) => normalizeAsset(asset, liveByCode))
      .filter((asset): asset is NonNullable<typeof asset> => Boolean(asset));

    return { success: true, assets: normalizedAssets };
  } catch (error: unknown) {
    console.error("Failed to load customer assets:", error);
    return { error: "Failed to load assets." };
  }
}

export async function createAssetRegistration(data: {
  userId: string;
  productName: string;
  serialNumber: string;
  purchaseDate?: string | Date | null;
  warrantyMonths: number;
}) {
  try {
    await requireStaff();

    const serialNumber = data.serialNumber.trim();
    const productName = data.productName.trim();
    if (!data.userId || !productName || !serialNumber) {
      return { error: "Customer, product variant name, and serial number are required." };
    }
    if (productName.length > 240 || serialNumber.length > 160) return { error: "Product name or serial number is too long." };
    if (!Number.isFinite(data.warrantyMonths) || data.warrantyMonths <= 0) {
      return { error: "Warranty months must be greater than zero." };
    }
    const parsedPurchaseDate = data.purchaseDate ? new Date(data.purchaseDate) : new Date();
    if (Number.isNaN(parsedPurchaseDate.getTime())) return { error: "Purchase date is invalid." };

    const [inserted] = await db.insert(assetRegistrations)
      .values({
        userId: data.userId,
        productName,
        serialNumber,
        warrantyMonths: Math.round(data.warrantyMonths),
        purchaseDate: parsedPurchaseDate,
        status: "ACTIVE",
      })
      .returning();
    if (!inserted) return { error: "Failed to register hardware asset." };

    const registration = await db.query.assetRegistrations.findFirst({
      where: eq(assetRegistrations.id, inserted.id),
      with: {
        user: {
          columns: { id: true, name: true, email: true, phoneNumber: true },
        },
      },
    });

    revalidatePath("/admin/assets");
    revalidatePath("/dashboard/warranties");
    return { success: true, registration };
  } catch (error: unknown) {
    console.error("Failed to create asset registration:", error);
    return { error: "Failed to register hardware asset." };
  }
}

export async function deleteAssetRegistration(registrationId: string) {
  try {
    await requireStaff();
    if (!registrationId.trim()) return { error: "Registration ID is required." };
    const [deleted] = await db.delete(assetRegistrations).where(eq(assetRegistrations.id, registrationId)).returning({ id: assetRegistrations.id });
    if (!deleted) return { error: "Asset registration not found." };
    revalidatePath("/admin/assets");
    revalidatePath("/dashboard/warranties");
    return { success: true };
  } catch (error: unknown) {
    console.error("Failed to delete asset registration:", error);
    return { error: "Failed to delete registered asset." };
  }
}

export async function deleteAssetRegistrations(registrationIds: string[]) {
  try {
    await requireStaff();
    if (!Array.isArray(registrationIds)) return { error: "No registrations selected." };
    const cleanIds = Array.from(new Set(registrationIds.map((id) => id.trim()).filter(Boolean)));
    if (cleanIds.length === 0) return { error: "No registrations selected." };
    if (cleanIds.length > 100) return { error: "Select no more than 100 registrations at a time." };

    const deleted = await db
      .delete(assetRegistrations)
      .where(inArray(assetRegistrations.id, cleanIds))
      .returning({ id: assetRegistrations.id });
    if (deleted.length === 0) return { error: "The selected registrations no longer exist." };
    revalidatePath("/admin/assets");
    revalidatePath("/dashboard/warranties");
    return { success: true, count: deleted.length };
  } catch (error: unknown) {
    console.error("Failed to delete asset registrations:", error);
    return { error: "Failed to delete selected registrations." };
  }
}

export async function getMyAssetRegistrations() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Unauthorized" };

    const registrations = await db.query.assetRegistrations.findMany({
      where: eq(assetRegistrations.userId, user.id),
      orderBy: [desc(assetRegistrations.purchaseDate)],
    });

    return { success: true, registrations };
  } catch (error: unknown) {
    console.error("Failed to load customer asset registrations:", error);
    return { error: "Failed to load warranty registrations." };
  }
}
