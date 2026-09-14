"use server";

import { db } from "@/db";
import { articles } from "@/db/schema";
import { like, or, eq, and } from "drizzle-orm";
import { getSystemSetting } from "@/app/actions/systemSettings";
import { listCatalogProducts } from "@/lib/erpnextCatalog";

export type SearchResultItem = {
  id: string;
  type: "article" | "product";
  title: string;
  content: string;
  url: string;
  imageUrl?: string | null;
};

export async function searchSupportPortalAction(
  query: string,
  locale: string,
  logTelemetry: boolean = false
): Promise<{
  success: boolean;
  results: SearchResultItem[];
  error?: string;
}> {
  try {
    const trimmedQuery = query.trim().toLowerCase();
    if (!trimmedQuery) {
      return { success: true, results: [] };
    }

    // 1. Fetch system search configuration toggles (default is true if not set)
    const [enableArticlesVal, enableProductsVal] = await Promise.all([
      getSystemSetting("search_enable_articles"),
      getSystemSetting("search_enable_products"),
    ]);

    const enableArticles = enableArticlesVal !== "false";
    const enableProducts = enableProductsVal !== "false";

    const results: SearchResultItem[] = [];
    const searchPattern = `%${trimmedQuery}%`;

    const searchPromises: Promise<void>[] = [];

    // Query Articles
    if (enableArticles) {
      searchPromises.push(
        db.query.articles.findMany({
          where: and(
            eq(articles.isPublished, true),
            or(
              like(articles.title, searchPattern),
              like(articles.content, searchPattern)
            )
          ),
          limit: 5,
        }).then((items) => {
          items.forEach((item) => {
            results.push({
              id: item.id,
              type: "article",
              title: item.title,
              content: item.content,
              url: `/news/${item.id}`,
              imageUrl: item.coverImage,
            });
          });
        })
      );
    }

    // Query Catalog Products
    if (enableProducts) {
      searchPromises.push(
        listCatalogProducts({ search: trimmedQuery, take: 5 }).then((catalog) => {
          catalog.products.forEach((item) => {
            const title = `${item.brand} ${item.model}`.trim();
            results.push({
              id: item.id,
              type: "product",
              title,
              content: item.description || "",
              url: `/catalog/${item.id}`,
              imageUrl: item.imageUrl,
            });
          });
        })
      );
    }

    await Promise.all(searchPromises);

    void logTelemetry;
    void locale;

    return { success: true, results };
  } catch (err: unknown) {
    console.error("[Search Action] Failed to execute support portal search:", err);
    return {
      success: false,
      results: [],
      error: "Search is temporarily unavailable. Please try again.",
    };
  }
}
