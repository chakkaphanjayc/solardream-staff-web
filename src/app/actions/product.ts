"use server";

import { requireStaff } from "@/lib/auth-guard";
import { listCatalogProducts } from "@/lib/erpnextCatalog";

const ERP_PRODUCT_MASTER_MESSAGE =
  "ERPNext owns the Item master. Create, update, disable, or archive the Item in ERPNext.";

/**
 * Compatibility shape for the retired local ProductTable. The route is
 * redirected to ERPNext settings, but keeping a typed response here avoids
 * breaking old client bundles that may still be present in a deployment.
 */
export type LegacyProductSnapshot = {
  id: string;
  name: string;
  brand: string;
  model: string;
  description: string | null;
  price: number;
  imageUrl: string;
  isActive: boolean;
  categoryId: string;
  metadata: unknown;
  useInRecommendation: boolean;
  recommendTier: string | null;
  recommendPriority: number;
  seoTitle: string | null;
  seoDescription: string | null;
  seoKeywords: string | null;
  seoImage: string | null;
  category: { id: string; name: string } | null;
};

type ProductMutationResult = {
  success: boolean;
  message: string;
  product?: LegacyProductSnapshot | null;
  products?: LegacyProductSnapshot[];
  errors?: string[];
};

export async function createProduct(_rawData: unknown): Promise<ProductMutationResult> {
  await requireStaff();
  return { success: false, message: ERP_PRODUCT_MASTER_MESSAGE, product: null };
}

export async function updateProduct(_id: string, _rawData: unknown): Promise<ProductMutationResult> {
  await requireStaff();
  return { success: false, message: ERP_PRODUCT_MASTER_MESSAGE, product: null };
}

export async function deleteProduct(_id: string): Promise<ProductMutationResult> {
  await requireStaff();
  return { success: false, message: ERP_PRODUCT_MASTER_MESSAGE };
}

export async function deleteProducts(_ids: string[]): Promise<ProductMutationResult> {
  await requireStaff();
  return { success: false, message: ERP_PRODUCT_MASTER_MESSAGE };
}

export async function importProducts(_rows: Record<string, unknown>[]): Promise<ProductMutationResult> {
  await requireStaff();
  return { success: false, message: ERP_PRODUCT_MASTER_MESSAGE, products: [], errors: [] };
}

export async function toggleProductActive(_id: string, _currentStatus: boolean): Promise<ProductMutationResult> {
  await requireStaff();
  return { success: false, message: ERP_PRODUCT_MASTER_MESSAGE };
}

export async function bulkUpdateProductCategory(_ids: string[], _categoryId: string): Promise<ProductMutationResult> {
  await requireStaff();
  return { success: false, message: ERP_PRODUCT_MASTER_MESSAGE };
}

export async function bulkUpdateProductStatus(_ids: string[], _isActive: boolean): Promise<ProductMutationResult> {
  await requireStaff();
  return { success: false, message: ERP_PRODUCT_MASTER_MESSAGE };
}

/**
 * Backwards-compatible name used by the catalog client. It now reads live
 * ERPNext Items, Item Prices, Bins, and Item Groups through the shared adapter.
 */
export async function getInfiniteProducts(params: {
  search?: string;
  categoryId?: string;
  sort?: string;
  brand?: string;
  skip?: number;
  take?: number;
}) {
  try {
    const result = await listCatalogProducts(params);
    return {
      success: true as const,
      products: result.products,
      hasMore: result.hasMore,
    };
  } catch (error: unknown) {
    console.error("getInfiniteProducts ERPNext error:", error);
    return { success: false as const, error: "Failed to load ERPNext catalog." };
  }
}
