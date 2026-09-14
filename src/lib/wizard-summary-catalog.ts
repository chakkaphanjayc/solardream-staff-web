import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import {
  listCatalogProducts,
  type ErpnextCatalogCategory,
  type ErpnextCatalogProduct,
} from "@/lib/erpnextCatalog";

export const WIZARD_SUMMARY_CATALOG_CACHE_TAG = "wizard-summary-catalog";

export type WizardSummaryCatalog = Readonly<{
  categories: ErpnextCatalogCategory[];
  products: ErpnextCatalogProduct[];
}>;

function isAbortLikeError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === "AbortError"
    || error.name === "TimeoutError"
    || error.message.toLowerCase().includes("aborted");
}

/**
 * The summary only needs a small product set for the optional swap flow. Keep
 * it out of the request path after the first successful read and gracefully
 * fall back to the local recommendation package when ERPNext is unavailable.
 */
export async function getCachedWizardSummaryCatalog(): Promise<WizardSummaryCatalog> {
  "use cache";

  cacheLife({ stale: 60, revalidate: 300, expire: 3600 });
  cacheTag(WIZARD_SUMMARY_CATALOG_CACHE_TAG);

  try {
    const result = await listCatalogProducts({ take: 100 });
    const categories = Array.from(
      new Map(result.products.map((product) => [product.category.id, product.category])).values(),
    ).sort((left, right) => left.displayOrder - right.displayOrder);

    return {
      categories,
      products: result.products,
    };
  } catch (error: unknown) {
    // Catalog data is an enhancement to the preliminary estimate. A provider
    // timeout must not turn a usable customer summary into a failed request.
    const reason = error instanceof Error ? error.message : "unknown provider error";
    console.warn(
      `[WizardSummaryCatalog] ERPNext catalog unavailable (${isAbortLikeError(error) ? "timeout" : reason}); using local package data.`,
    );
    return { categories: [], products: [] };
  }
}
