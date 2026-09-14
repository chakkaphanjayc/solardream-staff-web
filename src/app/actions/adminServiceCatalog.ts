"use server";

import { revalidateTag } from "next/cache";
import { and, eq, notInArray } from "drizzle-orm";
import { z } from "zod";
import { getDbUser } from "@/app/actions/auth";
import { db } from "@/db";
import {
  serviceBundleItems,
  serviceBundles,
  serviceOfferings,
  serviceOrderItems,
  serviceOrders,
  servicePromotionEligibility,
  servicePromotionRedemptions,
  servicePromotions,
  serviceSystemOptions,
} from "@/db/schema";
import { promotionCodeDigest } from "@/lib/serviceMultiCommerce";
import { localizedServiceTextSchema } from "@/lib/serviceCommerceContracts";
import {
  serviceBundleAdminSchema,
  serviceOptionAdminSchema,
  servicePromotionAdminSchema,
} from "@/lib/serviceMultiContracts";

const staffRoles = new Set(["STAFF", "ADMIN", "SUPER_ADMIN", "MANAGER"]);
const catalogKindSchema = z.enum(["OFFERING", "OPTION", "BUNDLE", "PROMOTION"]);
const catalogRecordSchema = z.object({
  kind: catalogKindSchema,
  id: z.string().uuid(),
});
async function staff() {
  const user = await getDbUser();
  if (!user?.isActive || !staffRoles.has(user.role))
    throw new Error("Unauthorized.");
  return user;
}
const offeringSchema = z
  .object({
    id: z.string().uuid().optional(),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    code: z.string().trim().min(1).max(100),
    name: localizedServiceTextSchema,
    description: localizedServiceTextSchema,
    basePrice: z.string().regex(/^\d+(?:\.\d{1,2})?$/),
    ratePerKwp: z.string().regex(/^\d+(?:\.\d{1,2})?$/),
    minimumPrice: z.string().regex(/^\d+(?:\.\d{1,2})?$/),
    loyaltyDiscount: z.string().regex(/^\d+(?:\.\d{1,2})?$/),
    externalPrice: z.string().regex(/^\d+(?:\.\d{1,2})?$/),
    solarDreamCustomerPrice: z.string().regex(/^\d+(?:\.\d{1,2})?$/),
    durationMinutes: z.number().int().positive().max(10080),
    erpItemCode: z.string().trim().max(140).nullable(),
    isActive: z.boolean(),
  })
  .strict()
  .refine((value) => !value.isActive || Boolean(value.erpItemCode), {
    path: ["erpItemCode"],
    message: "Active services require an ERP item code.",
  });
function refresh() {
  revalidateTag("service-config", "max");
}
export async function getServiceCatalogAdminData() {
  await staff();
  try {
    const [offerings, options, bundles, bundleItems, promotions, eligibility] =
      await Promise.all([
        db.select().from(serviceOfferings),
        db.select().from(serviceSystemOptions),
        db.select().from(serviceBundles),
        db.select().from(serviceBundleItems),
        db
          .select({
            id: servicePromotions.id,
            name: servicePromotions.name,
            discountType: servicePromotions.discountType,
            value: servicePromotions.value,
            minimumSubtotalSatang: servicePromotions.minimumSubtotalSatang,
            maximumDiscountSatang: servicePromotions.maximumDiscountSatang,
            usageLimit: servicePromotions.usageLimit,
            perActorLimit: servicePromotions.perActorLimit,
            redemptionCount: servicePromotions.redemptionCount,
            isActive: servicePromotions.isActive,
            startsAt: servicePromotions.startsAt,
            endsAt: servicePromotions.endsAt,
          })
          .from(servicePromotions),
        db.select().from(servicePromotionEligibility),
      ]);
    return { offerings, options, bundles, bundleItems, promotions, eligibility };
  } catch (error: unknown) {
    console.error("[Service Catalog Admin] Failed to load catalog:", error);
    return { offerings: [], options: [], bundles: [], bundleItems: [], promotions: [], eligibility: [] };
  }
}
export async function upsertServiceOffering(input: unknown) {
  await staff();
  const value = offeringSchema.parse(input);
  const values = {
    slug: value.slug,
    code: value.code,
    name: value.name,
    description: value.description,
    basePrice: value.basePrice,
    ratePerKwp: value.ratePerKwp,
    minimumPrice: value.minimumPrice,
    loyaltyDiscount: value.loyaltyDiscount,
    externalPrice: value.externalPrice,
    solarDreamCustomerPrice: value.solarDreamCustomerPrice,
    durationMinutes: value.durationMinutes,
    erpItemCode: value.erpItemCode,
    isActive: value.isActive,
  };
  const [offering] = value.id
    ? await db
        .update(serviceOfferings)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(serviceOfferings.id, value.id))
        .returning()
    : await db.insert(serviceOfferings).values(values).returning();
  if (!offering) throw new Error("Service offering was not found.");
  refresh();
  return { success: true as const, offering };
}
export async function upsertServiceSystemOption(input: unknown) {
  await staff();
  const value = serviceOptionAdminSchema.parse(input);
  await db
    .insert(serviceSystemOptions)
    .values(value)
    .onConflictDoUpdate({
      target: [serviceSystemOptions.kind, serviceSystemOptions.code],
      set: {
        label: value.label,
        isActive: value.isActive,
        sortOrder: value.sortOrder,
        updatedAt: new Date(),
      },
    })
    .returning();
  refresh();
  return { success: true as const };
}
export async function upsertServiceBundle(input: unknown) {
  await staff();
  const value = serviceBundleAdminSchema.parse(input);
  await db.transaction(async (tx) => {
    const [bundle] = await tx
      .insert(serviceBundles)
      .values({
        code: value.code,
        name: value.name,
        discountBps: value.discountBps,
        minimumDistinctItems: value.minimumDistinctItems,
        isActive: value.isActive,
      })
      .onConflictDoUpdate({
        target: serviceBundles.code,
        set: {
          name: value.name,
          discountBps: value.discountBps,
          minimumDistinctItems: value.minimumDistinctItems,
          isActive: value.isActive,
          updatedAt: new Date(),
        },
      })
      .returning();
    if (!bundle) throw new Error("Service bundle could not be saved.");
    if (value.offeringIds.length) {
      await tx
        .delete(serviceBundleItems)
        .where(
          and(
            eq(serviceBundleItems.bundleId, bundle.id),
            notInArray(serviceBundleItems.offeringId, value.offeringIds),
          ),
        );
      await tx
        .insert(serviceBundleItems)
        .values(
          value.offeringIds.map((offeringId) => ({
            bundleId: bundle.id,
            offeringId,
          })),
        )
        .onConflictDoNothing();
    } else
      await tx
        .delete(serviceBundleItems)
        .where(eq(serviceBundleItems.bundleId, bundle.id));
  });
  refresh();
  return { success: true as const };
}
export async function upsertServicePromotion(input: unknown) {
  await staff();
  const value = servicePromotionAdminSchema.parse(input);
  const codeDigest = promotionCodeDigest(value.code);
  await db.transaction(async (tx) => {
    const [promotion] = await tx
      .insert(servicePromotions)
      .values({
        codeDigest,
        name: value.name,
        discountType: value.discountType,
        value: value.value,
        minimumSubtotalSatang: value.minimumSubtotalSatang,
        maximumDiscountSatang: value.maximumDiscountSatang,
        usageLimit: value.usageLimit,
        perActorLimit: value.perActorLimit,
        isActive: value.isActive,
      })
      .onConflictDoUpdate({
        target: servicePromotions.codeDigest,
        set: {
          name: value.name,
          discountType: value.discountType,
          value: value.value,
          minimumSubtotalSatang: value.minimumSubtotalSatang,
          maximumDiscountSatang: value.maximumDiscountSatang,
          usageLimit: value.usageLimit,
          perActorLimit: value.perActorLimit,
          isActive: value.isActive,
          updatedAt: new Date(),
        },
      })
      .returning();
    if (!promotion) throw new Error("Promotion could not be saved.");
    await tx
      .delete(servicePromotionEligibility)
      .where(eq(servicePromotionEligibility.promotionId, promotion.id));
    if (value.eligibility.length)
      await tx
        .insert(servicePromotionEligibility)
        .values(
          value.eligibility.map((rule) => ({
            promotionId: promotion.id,
            offeringId: rule.offeringId,
            systemSource: rule.systemSource,
            minimumSystemKw:
              rule.minimumSystemKw === null
                ? null
                : String(rule.minimumSystemKw),
            maximumSystemKw:
              rule.maximumSystemKw === null
                ? null
                : String(rule.maximumSystemKw),
          })),
        );
  });
  refresh();
  return { success: true as const };
}
export async function archiveServiceCatalogRecord(
  kind: "OFFERING" | "OPTION" | "BUNDLE" | "PROMOTION",
  id: string,
) {
  await staff();
  catalogKindSchema.parse(kind);
  z.string().uuid().parse(id);
  let archived = false;
  if (kind === "OFFERING") {
    const [row] = await db
      .update(serviceOfferings)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(serviceOfferings.id, id))
      .returning({ id: serviceOfferings.id });
    archived = Boolean(row);
  }
  if (kind === "OPTION") {
    const [row] = await db
      .update(serviceSystemOptions)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(serviceSystemOptions.id, id))
      .returning({ id: serviceSystemOptions.id });
    archived = Boolean(row);
  }
  if (kind === "BUNDLE") {
    const [row] = await db
      .update(serviceBundles)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(serviceBundles.id, id))
      .returning({ id: serviceBundles.id });
    archived = Boolean(row);
  }
  if (kind === "PROMOTION") {
    const [row] = await db
      .update(servicePromotions)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(servicePromotions.id, id))
      .returning({ id: servicePromotions.id });
    archived = Boolean(row);
  }
  if (!archived) throw new Error("Service catalog item was not found.");
  refresh();
  return { success: true as const };
}

export async function archiveServiceCatalogRecords(input: unknown) {
  await staff();
  const records = z.array(catalogRecordSchema).min(1).max(100).parse(input);
  for (const record of records)
    await archiveServiceCatalogRecord(record.kind, record.id);
  return { success: true as const };
}

export async function deleteServiceCatalogRecord(
  kind: "OFFERING" | "OPTION" | "BUNDLE" | "PROMOTION",
  id: string,
) {
  await staff();
  catalogKindSchema.parse(kind);
  z.string().uuid().parse(id);

  await db.transaction(async (tx) => {
    if (kind === "OFFERING") {
      const [serviceOrder] = await tx
        .select({ id: serviceOrders.id })
        .from(serviceOrders)
        .where(eq(serviceOrders.serviceOfferingId, id))
        .limit(1);
      const [serviceOrderItem] = await tx
        .select({ id: serviceOrderItems.id })
        .from(serviceOrderItems)
        .where(eq(serviceOrderItems.serviceOfferingId, id))
        .limit(1);

      if (serviceOrder || serviceOrderItem)
        throw new Error(
          "This service is used by an existing sale or service order. Archive it to remove it from future sales while preserving history.",
        );

      const [deleted] = await tx
        .delete(serviceOfferings)
        .where(eq(serviceOfferings.id, id))
        .returning({ id: serviceOfferings.id });
      if (!deleted) throw new Error("Service catalog item not found.");
      return;
    }

    if (kind === "PROMOTION") {
      const [redemption] = await tx
        .select({ id: servicePromotionRedemptions.id })
        .from(servicePromotionRedemptions)
        .where(eq(servicePromotionRedemptions.promotionId, id))
        .limit(1);
      if (redemption)
        throw new Error(
          "This promotion has been used in a sale. Archive it instead to preserve the sales history.",
        );
    }

    if (kind === "OPTION") {
      const [deleted] = await tx
        .delete(serviceSystemOptions)
        .where(eq(serviceSystemOptions.id, id))
        .returning({ id: serviceSystemOptions.id });
      if (!deleted) throw new Error("System option not found.");
    }
    if (kind === "BUNDLE") {
      const [deleted] = await tx
        .delete(serviceBundles)
        .where(eq(serviceBundles.id, id))
        .returning({ id: serviceBundles.id });
      if (!deleted) throw new Error("Service bundle not found.");
    }
    if (kind === "PROMOTION") {
      const [deleted] = await tx
        .delete(servicePromotions)
        .where(eq(servicePromotions.id, id))
        .returning({ id: servicePromotions.id });
      if (!deleted) throw new Error("Promotion not found.");
    }
  });

  refresh();
  return { success: true as const };
}

export async function deleteServiceCatalogRecords(input: unknown) {
  await staff();
  const records = z.array(catalogRecordSchema).min(1).max(100).parse(input);
  const errors: Array<{ id: string; message: string }> = [];
  let deletedCount = 0;

  for (const record of records) {
    try {
      await deleteServiceCatalogRecord(record.kind, record.id);
      deletedCount += 1;
    } catch (error) {
      errors.push({
        id: record.id,
        message: error instanceof Error ? error.message : "Could not delete this item.",
      });
    }
  }

  return { success: errors.length === 0, deletedCount, errors };
}
