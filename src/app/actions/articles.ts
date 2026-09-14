"use server";

import { randomUUID } from "node:crypto";

import { db } from "@/db";
import { articles } from "@/db/schema";
import { checkAdmin } from "./auth";
import { desc, eq, inArray } from "drizzle-orm";
import { revalidatePath, revalidateTag } from "next/cache";
import { unstable_cache } from "next/cache";
import { z } from "zod";

import { validateUploadFile } from "@/lib/fileValidation";
import { createAdminClient } from "@/utils/supabase/server";

const PUBLISHED_ARTICLES_CACHE_TAG = "published-articles";
const ARTICLE_IMAGE_STORAGE_BUCKET = "proposals";

const articleInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(240),
  content: z.string().trim().min(1, "Content is required.").max(1_000_000),
  coverImage: z.string().trim().max(1000).optional(),
  writer: z.string().trim().max(180).optional(),
  publishedAt: z.union([z.string().trim().max(100), z.date(), z.null()]).optional(),
  metaTitle: z.string().trim().max(240).optional(),
  metaDescription: z.string().trim().max(1000).optional(),
  ogImage: z.string().trim().max(1000).optional(),
  isPublished: z.boolean().optional(),
});

function articleDate(value: string | Date | null | undefined) {
  if (!value) return new Date();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function revalidateArticlePages() {
  for (const locale of ["en", "th"] as const) {
    revalidatePath(`/${locale}/news`);
    revalidatePath(`/${locale}/admin/articles`);
  }
  revalidateTag(PUBLISHED_ARTICLES_CACHE_TAG, "max");
}

// ─── Public Reads ─────────────────────────────────────────

export async function getArticles(limit?: number) {
  return getPublishedArticlesCached(limit);
}

const getPublishedArticlesCached = unstable_cache(
  async (limit?: number) => {
    return db.query.articles.findMany({
      where: eq(articles.isPublished, true),
      orderBy: [desc(articles.createdAt)],
      ...(typeof limit === "number" ? { limit } : {}),
      with: {
        author: {
          columns: { id: true, name: true, email: true, avatarUrl: true },
        },
      },
    });
  },
  ["published-articles"],
  { tags: [PUBLISHED_ARTICLES_CACHE_TAG] }
);

const getArticleByIdCached = unstable_cache(
  async (id: string) => {
    return db.query.articles.findFirst({
      where: eq(articles.id, id),
      with: {
        author: {
          columns: { id: true, name: true, email: true, avatarUrl: true },
        },
      },
    });
  },
  ["published-article-by-id"],
  { revalidate: 300, tags: [PUBLISHED_ARTICLES_CACHE_TAG] },
);

export async function getArticleById(id: string) {
  const article = await getArticleByIdCached(id);
  return article ?? null;
}

// ─── Admin Operations ─────────────────────────────────────

export async function adminGetArticles() {
  await checkAdmin();
  return db.query.articles.findMany({
    orderBy: [desc(articles.createdAt)],
    with: {
      author: {
        columns: { id: true, name: true, email: true },
      },
    },
  });
}

export async function adminCreateArticle(data: {
  title: string;
  content: string;
  coverImage?: string;
  writer?: string;
  publishedAt?: string | Date | null;
  metaTitle?: string;
  metaDescription?: string;
  ogImage?: string;
  isPublished?: boolean;
}) {
  const user = await checkAdmin();
  const parsed = articleInputSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Invalid article." };
  const publishedAt = articleDate(parsed.data.publishedAt);
  if (!publishedAt) return { error: "Published date is invalid." };

  const [createdArticle] = await db
    .insert(articles)
    .values({
      title: parsed.data.title,
      content: parsed.data.content,
      coverImage: parsed.data.coverImage || null,
      writer: parsed.data.writer || null,
      publishedAt,
      metaTitle: parsed.data.metaTitle || null,
      metaDescription: parsed.data.metaDescription || null,
      ogImage: parsed.data.ogImage || null,
      isPublished: parsed.data.isPublished ?? false,
      authorId: user.id,
    })
    .returning({ id: articles.id });

  const article = await getAdminArticleById(createdArticle.id);

  revalidateArticlePages();
  return { success: true, article };
}

export async function adminUpdateArticle(
  id: string,
  data: {
    title: string;
    content: string;
    coverImage?: string;
    writer?: string;
    publishedAt?: string | Date | null;
    metaTitle?: string;
    metaDescription?: string;
    ogImage?: string;
    isPublished?: boolean;
  }
) {
  await checkAdmin();
  const parsed = articleInputSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Invalid article." };
  const publishedAt = articleDate(parsed.data.publishedAt);
  if (!publishedAt) return { error: "Published date is invalid." };

  const [updatedArticle] = await db
    .update(articles)
    .set({
      title: parsed.data.title,
      content: parsed.data.content,
      coverImage: parsed.data.coverImage || null,
      writer: parsed.data.writer || null,
      publishedAt,
      metaTitle: parsed.data.metaTitle || null,
      metaDescription: parsed.data.metaDescription || null,
      ogImage: parsed.data.ogImage || null,
      isPublished: parsed.data.isPublished ?? false,
    })
    .where(eq(articles.id, id))
    .returning({ id: articles.id });

  if (!updatedArticle) {
    throw new Error("Article not found.");
  }

  const article = await getAdminArticleById(updatedArticle.id);

  revalidateArticlePages();
  return { success: true, article };
}

export async function adminUploadArticleImage(formData: FormData) {
  await checkAdmin();
  const file = formData.get("file") || formData.get("image");
  if (!file || !(file instanceof File)) {
    return { error: "No image file provided." };
  }

  try {
    const validatedFile = await validateUploadFile({
      file,
      allowedKinds: ["jpeg", "png", "webp"],
      fallbackName: "article-cover",
      maxBytes: 10 * 1024 * 1024,
    });
    const storagePath = `articles/${randomUUID()}.${validatedFile.extension}`;
    const storage = createAdminClient();
    const upload = await storage.storage.from(ARTICLE_IMAGE_STORAGE_BUCKET).upload(
      storagePath,
      Buffer.from(await file.arrayBuffer()),
      {
        contentType: validatedFile.contentType,
        cacheControl: "31536000",
        upsert: false,
      },
    );
    if (upload.error) {
      console.error("[Articles] Cover image upload failed:", upload.error);
      return { error: "The cover image could not be uploaded." };
    }

    const { data: publicUrlData } = storage.storage
      .from(ARTICLE_IMAGE_STORAGE_BUCKET)
      .getPublicUrl(storagePath);
    return { success: true, url: publicUrlData.publicUrl };
  } catch (error: unknown) {
    console.error("[Articles] Cover image validation/upload failed:", error);
    return { error: "The cover image could not be uploaded." };
  }
}

export async function adminDeleteArticle(id: string) {
  await checkAdmin();
  const [deleted] = await db.delete(articles)
    .where(eq(articles.id, id))
    .returning({ id: articles.id });
  if (!deleted) return { success: false, error: "Article not found." };

  revalidateArticlePages();
  return { success: true };
}

export async function adminDeleteArticles(ids: string[]) {
  await checkAdmin();
  const cleanIds = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
  if (cleanIds.length === 0) return { error: "No articles selected." };
  if (cleanIds.length > 100) return { error: "Select no more than 100 articles at a time." };

  const deleted = await db.delete(articles)
    .where(inArray(articles.id, cleanIds))
    .returning({ id: articles.id });
  if (deleted.length === 0) return { error: "No matching articles were found." };

  revalidateArticlePages();
  return { success: true, message: `${deleted.length} article(s) deleted.` };
}

export async function adminImportArticles(rows: Record<string, unknown>[]) {
  const user = await checkAdmin();
  if (rows.length > 500) return { error: "Import no more than 500 articles at a time." };

  let created = 0;
  let updated = 0;
  const changedIds: string[] = [];
  const errors: string[] = [];

  for (const [index, row] of rows.entries()) {
    try {
      const title = String(row.title ?? "").trim();
      const content = String(row.content ?? "").trim();
      if (!title || !content) throw new Error("Title and content are required.");

      const data = {
        title,
        content,
        coverImage: emptyToNull(row.coverImage),
        isPublished: parseBool(row.isPublished, false),
        authorId: user.id,
      };
      const id = String(row.id ?? "").trim();

      if (id && (await findArticleId(id))) {
        const [article] = await db.update(articles)
          .set(data)
          .where(eq(articles.id, id))
          .returning({ id: articles.id });
        if (article) changedIds.push(article.id);
        updated += 1;
      } else {
        const [article] = await db
          .insert(articles)
          .values(id ? { ...data, id } : data)
          .returning({ id: articles.id });
        if (article) changedIds.push(article.id);
        created += 1;
      }
    } catch (error) {
      errors.push(`Row ${index + 2}: ${error instanceof Error ? error.message : "Invalid article row"}`);
    }
  }

  revalidateArticlePages();
  const changedArticles = await Promise.all(changedIds.map((id) => getAdminArticleById(id)));
  return {
    success: errors.length === 0,
    message: `Import finished: ${created} created, ${updated} updated${errors.length ? `, ${errors.length} failed.` : "."}`,
    articles: changedArticles,
    errors,
  };
}

function emptyToNull(value: unknown): string | null {
  const str = String(value ?? "").trim();
  return str || null;
}

function parseBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  const str = String(value ?? "").trim().toLowerCase();
  if (!str) return fallback;
  return ["true", "1", "yes", "y", "published", "active"].includes(str);
}

async function getAdminArticleById(id: string) {
  const article = await db.query.articles.findFirst({
    where: eq(articles.id, id),
    with: {
      author: {
        columns: { id: true, name: true, email: true },
      },
    },
  });

  if (!article) {
    throw new Error("Article not found.");
  }

  return article;
}

async function findArticleId(id: string) {
  const [article] = await db
    .select({ id: articles.id })
    .from(articles)
    .where(eq(articles.id, id))
    .limit(1);

  return article ?? null;
}
