"use server";

import { revalidatePath } from "next/cache";
import { asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { recommendationCategories } from "@/db/schema";
import { requireStaff } from "@/lib/auth-guard";

const COMPONENT_TYPES = ["PANEL", "INVERTER", "ADD_ON", "STRUCTURE"] as const;

const RecommendationCategorySchema = z.object({
  nameTh: z.string().trim().min(1, "Thai name is required."),
  nameEn: z.string().trim().min(1, "English name is required."),
  componentType: z.enum(COMPONENT_TYPES),
  applicableSizes: z
    .array(z.string().trim().min(1))
    .default([])
    .transform((sizes) => [...new Set(sizes.map((size) => size.trim()).filter(Boolean))]),
  descriptionTh: z.string().trim().min(1, "Thai description is required."),
  descriptionEn: z.string().trim().min(1, "English description is required."),
  isDefault: z.boolean().default(false),
});

type RecommendationCategoryInput = z.input<typeof RecommendationCategorySchema>;

function revalidateRecommendationCategorySurfaces() {
  revalidatePath("/admin");
  revalidatePath("/admin/recommendation-categories");
  revalidatePath("/admin/settings");
  revalidatePath("/build");
  revalidatePath("/wizard");
  revalidatePath("/wizard/summary");
}

export async function getRecommendationCategories() {
  try {
    await requireStaff();

    const records = await db.query.recommendationCategories.findMany({
      orderBy: [
        asc(recommendationCategories.componentType),
        asc(recommendationCategories.nameEn),
      ],
    });

    return { success: true, recommendationCategories: records };
  } catch (error: unknown) {
    console.error("Failed to fetch recommendation categories:", error);
    return {
      success: false,
      error: "Failed to fetch recommendation categories.",
    };
  }
}

export async function createRecommendationCategory(data: RecommendationCategoryInput) {
  try {
    await requireStaff();
    const parsed = RecommendationCategorySchema.parse(data);

    const [record] = await db
      .insert(recommendationCategories)
      .values(parsed)
      .returning();

    if (!record) {
      return { success: false, error: "The recommendation category could not be created." };
    }

    revalidateRecommendationCategorySurfaces();

    return { success: true, recommendationCategory: record };
  } catch (error: unknown) {
    console.error("Failed to create recommendation category:", error);
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0]?.message || "Validation failed." };
    }
    return {
      success: false,
      error: "Failed to create recommendation category.",
    };
  }
}

export async function updateRecommendationCategory(
  id: string,
  data: RecommendationCategoryInput,
) {
  try {
    await requireStaff();
    if (!id.trim()) {
      return { success: false, error: "Recommendation category ID is required." };
    }

    const parsed = RecommendationCategorySchema.parse(data);
    const [record] = await db
      .update(recommendationCategories)
      .set(parsed)
      .where(eq(recommendationCategories.id, id))
      .returning();

    if (!record) {
      return { success: false, error: "Recommendation category not found." };
    }

    revalidateRecommendationCategorySurfaces();

    return { success: true, recommendationCategory: record };
  } catch (error: unknown) {
    console.error("Failed to update recommendation category:", error);
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0]?.message || "Validation failed." };
    }
    return {
      success: false,
      error: "Failed to update recommendation category.",
    };
  }
}

export async function deleteRecommendationCategory(id: string) {
  try {
    await requireStaff();
    if (!id.trim()) {
      return { success: false, error: "Recommendation category ID is required." };
    }

    const [deleted] = await db
      .delete(recommendationCategories)
      .where(eq(recommendationCategories.id, id))
      .returning({ id: recommendationCategories.id });

    if (!deleted) {
      return { success: false, error: "Recommendation category not found." };
    }

    revalidateRecommendationCategorySurfaces();

    return { success: true };
  } catch (error: unknown) {
    console.error("Failed to delete recommendation category:", error);
    return {
      success: false,
      error: "Failed to delete recommendation category.",
    };
  }
}

export async function deleteRecommendationCategories(ids: string[]) {
  try {
    await requireStaff();
    const uniqueIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
    if (uniqueIds.length === 0) {
      return { success: false, error: "At least one recommendation category is required." };
    }
    if (uniqueIds.length > 100) {
      return { success: false, error: "You can delete up to 100 categories at once." };
    }

    const deleted = await db
      .delete(recommendationCategories)
      .where(inArray(recommendationCategories.id, uniqueIds))
      .returning({ id: recommendationCategories.id });

    if (deleted.length === 0) {
      return { success: false, error: "The selected recommendation categories no longer exist." };
    }

    revalidateRecommendationCategorySurfaces();

    return { success: true, count: deleted.length };
  } catch (error: unknown) {
    console.error("Failed to delete recommendation categories:", error);
    return {
      success: false,
      error: "Failed to delete recommendation categories.",
    };
  }
}
