"use server";

import { db } from "@/db";
import { blueprints, categories } from "@/db/schema";
import { eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireStaff } from "@/lib/auth-guard";
import { locales } from "@/i18n/locales";

type LocalizedFields = Record<string, Record<string, string | null>>;

function normalizeTranslations(value: unknown): LocalizedFields {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([locale, content]) => {
    if (content === null || typeof content !== "object" || Array.isArray(content)) return [];
    const fields = Object.fromEntries(Object.entries(content).flatMap(([key, fieldValue]) =>
      typeof fieldValue === "string" || fieldValue === null ? [[key, fieldValue]] : [],
    ));
    return Object.keys(fields).length > 0 ? [[locale, fields]] : [];
  }));
}

function revalidateBuildPages() {
  for (const locale of locales) {
    revalidatePath(`/${locale}/admin/build`);
    revalidatePath(`/${locale}/build`);
    revalidatePath(`/${locale}/wizard`);
  }
}

function getErrorMessage(error: unknown, fallback: string) {
  if (!error || typeof error !== "object") return fallback;
  const record = error as { code?: unknown; cause?: { code?: unknown } };
  const code = typeof record.code === "string"
    ? record.code
    : typeof record.cause?.code === "string" ? record.cause.code : null;

  if (code === "23505") return "A category or blueprint with that name or slug already exists.";
  if (code === "23503") return "This record references another record that does not exist.";
  return fallback;
}

const idSchema = z.string().trim().min(1).max(200);
const nullableIdSchema = idSchema.nullable().optional();
const optionalText = (max: number) => z.string().trim().max(max).optional();
const nullableText = (max: number) => z.string().trim().max(max).nullable().optional();

const categoryInputSchema = z.object({
  name: z.string().trim().min(1, "Category name is required.").max(200),
  description: optionalText(5000),
  slug: z.string().trim().min(1, "Category slug is required.").max(120),
  displayOrder: z.number().finite().int().min(-100000).max(100000),
  isRequired: z.boolean(),
  allowMultiple: z.boolean(),
  blueprintId: nullableIdSchema,
  parentId: nullableIdSchema,
  seoTitle: nullableText(180),
  seoDescription: nullableText(500),
  seoKeywords: nullableText(500),
  seoImage: nullableText(500),
  translations: z.unknown().optional(),
});

const blueprintCreateSchema = z.object({
  name: z.string().trim().min(1, "Blueprint name is required.").max(200),
  slug: z.string().trim().min(1, "Blueprint slug is required.").max(120),
  description: optionalText(5000),
  translations: z.unknown().optional(),
});

const blueprintUpdateSchema = z.object({
  name: z.string().trim().min(1, "Blueprint name is required.").max(200),
  description: z.string().trim().max(5000).nullable().optional(),
  translations: z.unknown().optional(),
});

function validationMessage(result: { success: false; error: z.ZodError }) {
  return result.error.issues[0]?.message || "Invalid build configuration.";
}

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function createCategory(data: {
  name: string;
  description?: string;
  slug: string;
  displayOrder: number;
  isRequired: boolean;
  allowMultiple: boolean;
  blueprintId?: string | null;
  parentId?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  seoKeywords?: string | null;
  seoImage?: string | null;
  translations?: unknown;
}) {
  await requireStaff();
  try {
    const parsed = categoryInputSchema.safeParse(data);
    if (!parsed.success) return { success: false, message: validationMessage(parsed) };
    const nameTrimmed = parsed.data.name;
    const slugTrimmed = normalizeSlug(parsed.data.slug);
    if (!slugTrimmed) return { success: false, message: "Category slug is required." };

    // Check if name already exists
    const existingName = await db.query.categories.findFirst({
      where: (categories, { eq }) => eq(categories.name, nameTrimmed)
    });
    if (existingName) {
      return { success: false, message: "A category with this name already exists." };
    }

    // Check if slug already exists
    const existingSlug = await db.query.categories.findFirst({
      where: (categories, { eq }) => eq(categories.slug, slugTrimmed)
    });
    if (existingSlug) {
      return { success: false, message: "A category with this slug already exists." };
    }

    const [category] = await db.insert(categories).values({
      name: nameTrimmed,
      description: parsed.data.description || null,
      slug: slugTrimmed,
      displayOrder: parsed.data.displayOrder,
      isRequired: parsed.data.isRequired,
      allowMultiple: parsed.data.allowMultiple,
      blueprintId: parsed.data.blueprintId || null,
      parentId: parsed.data.parentId || null,
      seoTitle: parsed.data.seoTitle || null,
      seoDescription: parsed.data.seoDescription || null,
      seoKeywords: parsed.data.seoKeywords || null,
      seoImage: parsed.data.seoImage || null,
      translations: normalizeTranslations(parsed.data.translations),
    }).returning();

    revalidateBuildPages();
    return { success: true, message: "Category created successfully!", category };
  } catch (error: unknown) {
    console.error("Create Category Error:", error);
    return { success: false, message: getErrorMessage(error, "Failed to create category.") };
  }
}

export async function updateCategory(
  id: string,
  data: {
    name: string;
    description?: string;
    slug: string;
    displayOrder: number;
    isRequired: boolean;
    allowMultiple: boolean;
    blueprintId?: string | null;
    parentId?: string | null;
    seoTitle?: string | null;
    seoDescription?: string | null;
    seoKeywords?: string | null;
    seoImage?: string | null;
    translations?: unknown;
  }
) {
  await requireStaff();
  try {
    const parsedId = idSchema.safeParse(id);
    if (!parsedId.success) return { success: false, message: "Category was not found." };
    const parsed = categoryInputSchema.safeParse(data);
    if (!parsed.success) return { success: false, message: validationMessage(parsed) };
    const nameTrimmed = parsed.data.name;
    const slugTrimmed = normalizeSlug(parsed.data.slug);
    if (!slugTrimmed) return { success: false, message: "Category slug is required." };

    // Check name conflict
    const existingName = await db.query.categories.findFirst({
      where: (categories, { eq, and, ne }) => and(
        eq(categories.name, nameTrimmed),
        ne(categories.id, parsedId.data)
      )
    });
    if (existingName) {
      return { success: false, message: "Another category with this name already exists." };
    }

    // Check slug conflict
    const existingSlug = await db.query.categories.findFirst({
      where: (categories, { eq, and, ne }) => and(
        eq(categories.slug, slugTrimmed),
        ne(categories.id, parsedId.data)
      )
    });
    if (existingSlug) {
      return { success: false, message: "Another category with this slug already exists." };
    }

    // Guard against circular parent references
    if (parsed.data.parentId === id) {
      return { success: false, message: "A step category cannot be its own parent." };
    }

    const [category] = await db.update(categories)
      .set({
        name: nameTrimmed,
        description: parsed.data.description || null,
        slug: slugTrimmed,
        displayOrder: parsed.data.displayOrder,
        isRequired: parsed.data.isRequired,
        allowMultiple: parsed.data.allowMultiple,
        blueprintId: parsed.data.blueprintId || null,
        parentId: parsed.data.parentId || null,
        seoTitle: parsed.data.seoTitle || null,
        seoDescription: parsed.data.seoDescription || null,
        seoKeywords: parsed.data.seoKeywords || null,
        seoImage: parsed.data.seoImage || null,
        translations: normalizeTranslations(parsed.data.translations),
      })
      .where(eq(categories.id, parsedId.data))
      .returning();

    revalidateBuildPages();
    return { success: true, message: "Category updated successfully!", category };
  } catch (error: unknown) {
    console.error("Update Category Error:", error);
    return { success: false, message: getErrorMessage(error, "Failed to update category.") };
  }
}

export async function deleteCategory(id: string) {
  await requireStaff();
  try {
    const parsedId = idSchema.safeParse(id);
    if (!parsedId.success) return { success: false, message: "Category was not found." };

    const [deleted] = await db.delete(categories)
      .where(eq(categories.id, parsedId.data))
      .returning({ id: categories.id });
    if (!deleted) return { success: false, message: "Category was not found." };
    revalidateBuildPages();
    return { success: true, message: "Category deleted successfully!" };
  } catch (error: unknown) {
    console.error("Delete Category Error:", error);
    return { success: false, message: getErrorMessage(error, "Failed to delete category.") };
  }
}

export async function createBlueprint(data: {
  name: string;
  slug: string;
  description?: string;
  translations?: unknown;
}) {
  await requireStaff();
  try {
    const parsed = blueprintCreateSchema.safeParse(data);
    if (!parsed.success) return { success: false, message: validationMessage(parsed) };
    const nameTrimmed = parsed.data.name;
    const slugTrimmed = normalizeSlug(parsed.data.slug);
    if (!slugTrimmed) return { success: false, message: "Blueprint slug is required." };

    const existingSlug = await db.query.blueprints.findFirst({
      where: (blueprints, { eq }) => eq(blueprints.slug, slugTrimmed)
    });
    if (existingSlug) {
      return { success: false, message: "A blueprint with this slug already exists." };
    }

    const [bp] = await db.insert(blueprints).values({
      name: nameTrimmed,
      slug: slugTrimmed,
      description: parsed.data.description || null,
      translations: normalizeTranslations(parsed.data.translations),
    }).returning();

    revalidateBuildPages();
    return { success: true, message: "Blueprint created successfully!", data: bp };
  } catch (error: unknown) {
    console.error("Create Blueprint Error:", error);
    return { success: false, message: getErrorMessage(error, "Failed to create blueprint.") };
  }
}

export async function updateBlueprint(
  id: string,
  data: {
    name: string;
    description?: string | null;
    translations?: unknown;
  },
) {
  await requireStaff();
  try {
    const parsedId = idSchema.safeParse(id);
    if (!parsedId.success) return { success: false, message: "Blueprint was not found." };
    const parsed = blueprintUpdateSchema.safeParse(data);
    if (!parsed.success) return { success: false, message: validationMessage(parsed) };

    const [blueprint] = await db.update(blueprints)
      .set({
        name: parsed.data.name,
        description: parsed.data.description?.trim() || null,
        translations: normalizeTranslations(parsed.data.translations),
      })
      .where(eq(blueprints.id, parsedId.data))
      .returning();

    if (!blueprint) return { success: false, message: "Blueprint was not found." };
    revalidateBuildPages();
    return { success: true, message: "Blueprint updated successfully!", data: blueprint };
  } catch (error: unknown) {
    console.error("Update Blueprint Error:", error);
    return { success: false, message: getErrorMessage(error, "Failed to update blueprint.") };
  }
}

export async function deleteBlueprint(id: string) {
  await requireStaff();
  try {
    const parsedId = idSchema.safeParse(id);
    if (!parsedId.success) return { success: false, message: "Blueprint was not found." };

    const child = await db.query.categories.findFirst({
      where: eq(categories.blueprintId, parsedId.data),
      columns: { id: true },
    });
    if (child) {
      return { success: false, message: "Delete the blueprint categories first." };
    }

    const [deleted] = await db.delete(blueprints)
      .where(eq(blueprints.id, parsedId.data))
      .returning({ id: blueprints.id });
    if (!deleted) return { success: false, message: "Blueprint was not found." };
    revalidateBuildPages();
    return { success: true, message: "Blueprint deleted successfully!" };
  } catch (error: unknown) {
    console.error("Delete Blueprint Error:", error);
    return { success: false, message: getErrorMessage(error, "Failed to delete blueprint.") };
  }
}
