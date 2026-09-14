import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  catalogErpReferences,
  catalogPriceLists,
  catalogPrices,
  catalogSyncVersions,
  categories,
  productBundleItems,
  productBundles,
  productInventory,
  products,
} from "@/db/schema";
import {
  fetchCatalogBundlesFromErpnext,
  fetchCatalogProductsFromErpnext,
} from "@/lib/erpnextCatalog";
export async function synchronizeCatalog(sourceCursor?: string): Promise<void> {
  const [version] = await db
    .insert(catalogSyncVersions)
    .values({ provider: "ERPNEXT", status: "STAGING", sourceCursor })
    .returning();
  if (!version) throw new Error("Could not create a catalog staging version.");
  try {
    const [providerProducts, providerBundles] = await Promise.all([
      fetchCatalogProductsFromErpnext({ take: 1000 }),
      fetchCatalogBundlesFromErpnext(),
    ]);
    const result = {
      itemCount: providerProducts.products.length,
      bundleCount: providerBundles.length,
      syncedAt: new Date().toISOString(),
    };
    const localProductIds = new Map<string, string>();
    await db.transaction(async (tx) => {
      for (const item of providerProducts.products) {
        await tx
          .insert(categories)
          .values({
            id: item.category.id,
            name: item.category.name,
            description: item.category.description,
            slug: item.category.slug,
            isRequired: item.category.isRequired,
            allowMultiple: item.category.allowMultiple,
            isGroup: false,
            isActive: true,
          })
          .onConflictDoUpdate({
            target: categories.id,
            set: {
              name: item.category.name,
              description: item.category.description,
              slug: item.category.slug,
              isActive: true,
              updatedAt: new Date(),
            },
          });
        await tx
          .insert(products)
          .values({
            id: item.id,
            erpnextItemCode: item.erpnextItemCode,
            name: `${item.brand} ${item.model}`.trim(),
            brand: item.brand,
            model: item.model,
            price: item.price,
            imageUrl: item.imageUrl,
            description: item.description,
            stock: item.stock,
            stockStatus: item.stockStatus,
            ctaType: item.ctaType,
            isAvailable: item.isAvailable,
            isActive: item.isActive,
            categoryId: item.category.id,
            metadata: item.metadata,
            physicalWidth: item.physicalWidth,
            physicalLength: item.physicalLength,
            wattageCapacity: item.wattageCapacity,
            useInRecommendation: item.useInRecommendation,
            recommendTier: item.recommendTier,
            recommendPriority: item.recommendPriority,
            lastSyncedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: products.erpnextItemCode,
            set: {
              name: `${item.brand} ${item.model}`.trim(),
              brand: item.brand,
              model: item.model,
              price: item.price,
              imageUrl: item.imageUrl,
              description: item.description,
              stock: item.stock,
              stockStatus: item.stockStatus,
              ctaType: item.ctaType,
              isAvailable: item.isAvailable,
              isActive: item.isActive,
              categoryId: item.category.id,
              metadata: item.metadata,
              lastSyncedAt: new Date(),
            },
          })
          .returning({ id: products.id });
        const localProduct = await tx.query.products.findFirst({
          where: eq(products.erpnextItemCode, item.erpnextItemCode),
          columns: { id: true },
        });
        if (!localProduct)
          throw new Error("Synchronized product could not be resolved.");
        localProductIds.set(item.erpnextItemCode, localProduct.id);
        await tx
          .insert(productInventory)
          .values({
            productId: localProduct.id,
            quantityOnHand: Math.max(0, Math.floor(item.stock)),
            reservedQuantity: 0,
          })
          .onConflictDoUpdate({
            target: productInventory.productId,
            set: {
              quantityOnHand: Math.max(0, Math.floor(item.stock)),
              updatedAt: new Date(),
            },
          });
      }
      for (const bundle of providerBundles) {
        await tx
          .insert(productBundles)
          .values({
            id: bundle.id,
            name: bundle.name,
            description: bundle.description,
            imageUrl: bundle.imageUrl,
            price: bundle.price,
            isActive: bundle.isActive,
            discountType: bundle.discountType,
            discountValue: bundle.discountValue,
            promoText: bundle.promoText,
            labels: bundle.labels,
            validFrom: bundle.validFrom,
            validUntil: bundle.validUntil,
          })
          .onConflictDoUpdate({
            target: productBundles.id,
            set: {
              name: bundle.name,
              description: bundle.description,
              imageUrl: bundle.imageUrl,
              price: bundle.price,
              isActive: bundle.isActive,
              labels: bundle.labels,
              updatedAt: new Date(),
            },
          });
        await tx
          .delete(productBundleItems)
          .where(eq(productBundleItems.bundleId, bundle.id));
        if (bundle.items.length)
          await tx.insert(productBundleItems).values(
            bundle.items.map((entry: { productId: string; quantity: number }) => ({
              bundleId: bundle.id,
              productId:
                localProductIds.get(entry.productId) ?? entry.productId,
              quantity: Math.max(1, Math.round(entry.quantity)),
            })),
          );
      }
      const code =
        process.env.ERPNEXT_SELLING_PRICE_LIST?.trim() || "Standard Selling";
      const stableCode = code.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
      const [priceList] = await tx
        .insert(catalogPriceLists)
        .values({
          code: stableCode,
          name: code,
          currency: (process.env.CATALOG_CURRENCY || "THB").toUpperCase(),
          taxInclusive: false,
          syncVersionId: version.id,
        })
        .onConflictDoUpdate({
          target: catalogPriceLists.code,
          set: { name: code, syncVersionId: version.id, isActive: true },
        })
        .returning();
      if (!priceList)
        throw new Error("Could not resolve the catalog price list.");
      const itemRows = await tx
        .select({
          id: products.id,
          remoteId: products.erpnextItemCode,
          price: products.price,
        })
        .from(products);
      if (itemRows.length) {
        await tx
          .insert(catalogErpReferences)
          .values(
            itemRows.map((p) => ({
              productId: p.id,
              provider: "ERPNEXT",
              remoteType: "Item",
              remoteId: p.remoteId,
              syncVersionId: version.id,
            })),
          )
          .onConflictDoUpdate({
            target: [
              catalogErpReferences.provider,
              catalogErpReferences.remoteType,
              catalogErpReferences.remoteId,
            ],
            set: { syncVersionId: version.id, syncedAt: new Date() },
          });
        await tx.insert(catalogPrices).values(
          itemRows.map((p) => ({
            priceListId: priceList.id,
            productId: p.id,
            amount: p.price.toFixed(2),
            syncVersionId: version.id,
          })),
        );
      }
      const bundleRows = await tx
        .select({ id: productBundles.id, price: productBundles.price })
        .from(productBundles);
      if (bundleRows.length)
        await tx.insert(catalogPrices).values(
          bundleRows.map((b) => ({
            priceListId: priceList.id,
            bundleId: b.id,
            amount: b.price.toFixed(2),
            syncVersionId: version.id,
          })),
        );
      await tx
        .update(catalogSyncVersions)
        .set({ status: "ARCHIVED" })
        .where(eq(catalogSyncVersions.status, "PUBLISHED"));
      await tx
        .update(catalogSyncVersions)
        .set({
          status: "PUBLISHED",
          publishedAt: new Date(),
          summary: result && typeof result === "object" ? result : {},
        })
        .where(eq(catalogSyncVersions.id, version.id));
      await tx.execute(
        sql`SELECT pg_notify('catalog_published', ${version.id})`,
      );
    });
  } catch (error) {
    await db
      .update(catalogSyncVersions)
      .set({
        status: "FAILED",
        failedAt: new Date(),
        summary: {
          error:
            error instanceof Error
              ? error.message
              : "Catalog synchronization failed.",
        },
      })
      .where(eq(catalogSyncVersions.id, version.id));
    throw error;
  }
}
