"use server";

import { requireStaff } from "@/lib/auth-guard";
import { listCatalogCategories } from "@/lib/erpnextCatalog";

const ERP_CATEGORY_MASTER_MESSAGE =
  "Product categories are managed as ERPNext Item Groups. Create or update them in ERPNext.";

type LegacyCategoryRecord = {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  displayOrder: number;
  parentId: string | null;
  parent: { id: string; name: string } | null;
};

type CategoryMutationResult =
  | { success: true; category: LegacyCategoryRecord; error?: undefined }
  | { success: false; error: string; category: null };

export async function getAdminCategories() {
  try {
    await requireStaff();
    const categories = await listCatalogCategories();

    return {
      success: true,
      categories: categories.map((category) => ({
        ...category,
        subCategories: [],
        children: [],
        _count: { products: 0 },
      })),
    };
  } catch (error: unknown) {
    console.error("Failed to fetch ERPNext item groups:", error);
    return { success: false, error: "Failed to load ERPNext item groups." };
  }
}

export async function createCategory(_data: {
  name: string;
  description?: string | null;
  parentId?: string | null;
  displayOrder?: number | null;
}): Promise<CategoryMutationResult> {
  void _data;
  await requireStaff();
  return { success: false as const, error: ERP_CATEGORY_MASTER_MESSAGE, category: null };
}

export async function updateCategory(
  _id: string,
  _data: {
    name: string;
    description?: string | null;
    parentId?: string | null;
    displayOrder?: number | null;
  },
): Promise<CategoryMutationResult> {
  void _id;
  void _data;
  await requireStaff();
  return { success: false as const, error: ERP_CATEGORY_MASTER_MESSAGE, category: null };
}

export async function deleteCategory(_id: string) {
  void _id;
  await requireStaff();
  return { success: false as const, error: ERP_CATEGORY_MASTER_MESSAGE };
}

export async function syncCategoriesFromErpnextAction() {
  try {
    await requireStaff();
    const categories = await listCatalogCategories();
    return {
      success: true,
      categoriesSynced: categories.length,
      productsUpdated: 0,
      sourceOfTruth: "ERPNext" as const,
    };
  } catch (error: unknown) {
    console.error("Failed to read ERPNext item groups:", error);
    return { success: false, error: "Failed to read ERPNext item groups." };
  }
}
