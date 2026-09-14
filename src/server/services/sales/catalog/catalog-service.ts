import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { catalogSyncVersions, productInventory, products } from "@/db/schema";
import type { Availability, CatalogItem, CatalogVersion } from "./catalog-dtos";
export async function getPublishedCatalogVersion(): Promise<CatalogVersion> {
  const row = await db.query.catalogSyncVersions.findFirst({
    where: and(
      eq(catalogSyncVersions.provider, "ERPNEXT"),
      eq(catalogSyncVersions.status, "PUBLISHED"),
    ),
    orderBy: [desc(catalogSyncVersions.publishedAt)],
  });
  if (!row?.publishedAt) throw new Error("No published catalog is available.");
  return { id: row.id, publishedAt: row.publishedAt };
}
export async function listCatalogItems(): Promise<readonly CatalogItem[]> {
  await getPublishedCatalogVersion();
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      brand: products.brand,
      model: products.model,
      isAvailable: products.isAvailable,
      quantity: productInventory.quantityOnHand,
    })
    .from(products)
    .leftJoin(productInventory, eq(productInventory.productId, products.id))
    .where(eq(products.isActive, true));
  return rows.map((row) => {
    const quantity = row.quantity ?? 0;
    const availability: Availability =
      !row.isAvailable || quantity === 0
        ? "UNAVAILABLE"
        : quantity < 5
          ? "LOW_STOCK"
          : "AVAILABLE";
    return {
      id: row.id,
      name: row.name,
      brand: row.brand,
      model: row.model,
      availability,
    };
  });
}
