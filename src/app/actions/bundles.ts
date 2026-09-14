"use server";

import { listCatalogBundles, type ErpnextCatalogBundle } from "@/lib/erpnextCatalog";
import { requireStaff } from "@/lib/auth-guard";

type BundleMutationInput = {
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  price: number;
  discountType: string;
  discountValue: number;
  isActive?: boolean;
  promoText?: string | null;
  labels?: string[];
  validFrom?: Date | string | null;
  validUntil?: Date | string | null;
  items: { productId: string; quantity: number }[];
};

const ERP_MANAGED_BUNDLE_MESSAGE =
  "Product Bundles are managed in ERPNext Product Bundle. Update the ERPNext Item and Bundle records instead.";

type BundleMutationResult = {
  success: boolean;
  error?: string;
  message?: string;
  count: number;
  bundle: ErpnextCatalogBundle | null;
  bundles: ErpnextCatalogBundle[];
};

export async function getAdminBundles() {
  try {
    await requireStaff();
    return { success: true, bundles: await listCatalogBundles() };
  } catch (error: unknown) {
    console.error("Failed to fetch ERPNext bundles:", error);
    return { success: false, error: "Failed to load ERPNext Product Bundles." };
  }
}

export async function getStorefrontBundles() {
  try {
    return { success: true, bundles: await listCatalogBundles() };
  } catch (error: unknown) {
    console.error("Failed to fetch ERPNext storefront bundles:", error);
    return { success: false, error: "Failed to load ERPNext Product Bundles." };
  }
}

export async function createBundle(_data: BundleMutationInput): Promise<BundleMutationResult> {
  await requireStaff();
  return { success: false, error: ERP_MANAGED_BUNDLE_MESSAGE, bundle: null, bundles: [], count: 0 };
}

export async function deleteBundle(_id: string): Promise<BundleMutationResult> {
  await requireStaff();
  return { success: false, error: ERP_MANAGED_BUNDLE_MESSAGE, bundle: null, bundles: [], count: 0 };
}

export async function toggleBundleStatus(_id: string, _isActive: boolean): Promise<BundleMutationResult> {
  await requireStaff();
  return { success: false, error: ERP_MANAGED_BUNDLE_MESSAGE, bundle: null, bundles: [], count: 0 };
}

export async function importBundles(_bundles: BundleMutationInput[]): Promise<BundleMutationResult> {
  await requireStaff();
  return { success: false, error: ERP_MANAGED_BUNDLE_MESSAGE, bundle: null, count: 0, bundles: [] };
}
