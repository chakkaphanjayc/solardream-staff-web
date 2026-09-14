import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { installedAssets, proposals, serviceOfferings, serviceOrders, serviceRequests, users } from "@/db/schema";
import { calculateFormulaPrice, createServiceOrderSchema, serviceBookingSchema, serviceOrderIdSchema, serviceQuoteSchema, type CreateServiceOrderInput, type ServiceBookingInput, type ServiceQuoteInput } from "@/lib/serviceCommerceContracts";
import { hashServiceActor } from "@/lib/serviceGuestSession";
import { serviceContactEmailDigest } from "@/lib/servicePortal";
import { deriveServiceTrackingReference, generateTrackingReference } from "@/lib/trackingReference";


export class ServiceCommerceError extends Error {
  constructor(public readonly code: "ACCOUNT_UNAVAILABLE" | "APPOINTMENT_INVALID" | "OFFERING_UNAVAILABLE" | "ASSET_UNAVAILABLE" | "AUTH_REQUIRED" | "LEGACY_FLOW_RETIRED") {
    super(code);
    this.name = "ServiceCommerceError";
  }
}

export async function listPublicServiceCatalog() {
  const offerings = await db.select({
    slug: serviceOfferings.slug, code: serviceOfferings.code,
    name: serviceOfferings.name, description: serviceOfferings.description,
    externalPrice: serviceOfferings.externalPrice, solarDreamCustomerPrice: serviceOfferings.solarDreamCustomerPrice,
    basePrice: serviceOfferings.basePrice, ratePerKwp: serviceOfferings.ratePerKwp, minimumPrice: serviceOfferings.minimumPrice, loyaltyDiscount: serviceOfferings.loyaltyDiscount,
    durationMinutes: serviceOfferings.durationMinutes,
  }).from(serviceOfferings).where(eq(serviceOfferings.isActive, true)).orderBy(serviceOfferings.externalPrice, serviceOfferings.slug);
  return offerings.map((offering) => ({ ...offering, id: offering.slug, externalPrice: Number(offering.externalPrice), solarDreamCustomerPrice: Number(offering.solarDreamCustomerPrice), currency: "THB" as const }));
}

export async function createServiceOrderForUser(userId: string, rawInput: CreateServiceOrderInput) {
  throw new ServiceCommerceError("LEGACY_FLOW_RETIRED");
  /* istanbul ignore next -- retained temporarily for type-compatible rollback only. */
  const input = createServiceOrderSchema.parse(rawInput);
  if (input.appointmentDate.getTime() < Date.now() - 60_000) throw new ServiceCommerceError("APPOINTMENT_INVALID");
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${userId}:${input.idempotencyKey}`}))`);
    const existing = await tx.query.serviceOrders.findFirst({
      where: and(eq(serviceOrders.customerUserId, userId), eq(serviceOrders.idempotencyKey, input.idempotencyKey)),
    });
    if (existing) {
      const request = await tx.query.serviceRequests.findFirst({ where: eq(serviceRequests.serviceOrderId, existing.id) });
      return { order: existing, serviceRequestId: request?.id || "", redirectPath: `/support/orders/${existing.id}` as const };
    }
    const [user] = await tx.select({ id: users.id, isActive: users.isActive }).from(users).where(eq(users.id, userId)).for("update");
    if (!user?.isActive) throw new ServiceCommerceError("ACCOUNT_UNAVAILABLE");
    const [offering] = await tx.select().from(serviceOfferings).where(and(eq(serviceOfferings.slug, input.offeringSlug), eq(serviceOfferings.isActive, true))).limit(1);
    if (!offering) throw new ServiceCommerceError("OFFERING_UNAVAILABLE");

    let assetId: string | null = null;
    let systemSnapshot: Record<string, unknown>;
    if (input.systemSource === "SOLARDREAM") {
      const [asset] = await tx.select({ id: installedAssets.id, proposalId: installedAssets.proposalId, productName: installedAssets.productName, serialNumber: installedAssets.serialNumber, installedDate: installedAssets.installedDate, warrantyExpiryDate: installedAssets.warrantyExpiryDate })
        .from(installedAssets).where(and(eq(installedAssets.id, input.assetId), eq(installedAssets.customerId, userId))).limit(1);
      if (!asset) throw new ServiceCommerceError("ASSET_UNAVAILABLE");
      assetId = asset.id;
      const [proposal] = await tx.select({ systemSizeKwp: proposals.systemSizeKwp }).from(proposals).where(eq(proposals.id, asset.proposalId));
      systemSnapshot = { source: "SOLARDREAM", assetId: asset.id, productName: asset.productName, serialNumber: asset.serialNumber, installedDate: asset.installedDate, warrantyExpiryDate: asset.warrantyExpiryDate, systemSizeKw: proposal?.systemSizeKwp || 0 };
    } else {
      systemSnapshot = { source: "EXTERNAL", ...input.systemDetails };
    }

    const systemSizeKw = Number(systemSnapshot.systemSizeKw) || 0;
    const price = calculateFormulaPrice(offering, systemSizeKw, input.systemSource === "SOLARDREAM");
    const trackingToken = crypto.randomUUID();
    const trackingExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    const offeringSnapshot = { id: offering.id, slug: offering.slug, code: offering.code, name: offering.name, description: offering.description, durationMinutes: offering.durationMinutes, erpItemCode: offering.erpItemCode };
    const [order] = await tx.insert(serviceOrders).values({
      idempotencyKey: input.idempotencyKey, customerUserId: userId, actorHash: hashServiceActor("member", userId), trackingTokenHash: hashServiceActor("tracking", trackingToken), trackingExpiresAt,
      serviceOfferingId: offering.id, assetId, systemSource: input.systemSource,
      priceSnapshot: price, offeringSnapshot, systemSnapshot, contactSnapshot: input.contact,
      appointmentDate: input.appointmentDate, customerNotes: input.customerNotes || null,
    }).returning();
    const requestType = offering.code === "INVERTER_REPAIR_ASSESSMENT" ? "REPAIR" as const : "MAINTENANCE" as const;
    const [serviceRequest] = await tx.insert(serviceRequests).values({
      assetId, customerUserId: userId, serviceOrderId: order.id, serviceOfferingId: offering.id,
      systemSource: input.systemSource, externalSystemDetails: input.systemSource === "EXTERNAL" ? input.systemDetails : {},
      type: requestType, subject: offering.name.en, description: input.customerNotes || offering.description.en,
      contactName: input.contact.name, contactPhone: input.contact.phone, appointmentDate: input.appointmentDate,
    }).returning({ id: serviceRequests.id });
    return { order, serviceRequestId: serviceRequest.id, redirectPath: `/support/orders/${order.id}` as const };
  });
}

export type ServiceActor = { userId: string; actorHash: string; guestSessionHash: null } | { userId: null; actorHash: string; guestSessionHash: string };

async function resolveQuote(actor: ServiceActor, input: ReturnType<typeof serviceQuoteSchema.parse> | ReturnType<typeof serviceBookingSchema.parse>) {
  const offering = await db.query.serviceOfferings.findFirst({ where: and(eq(serviceOfferings.slug, input.offeringSlug), eq(serviceOfferings.isActive, true)) });
  if (!offering) throw new ServiceCommerceError("OFFERING_UNAVAILABLE");
  let systemSizeKw: number;
  let loyaltyEligible = false;
  let asset: { id: string; productName: string; serialNumber: string; installedDate: Date; warrantyExpiryDate: Date } | null = null;
  if (input.systemSource === "SOLARDREAM") {
    if (!actor.userId) throw new ServiceCommerceError("AUTH_REQUIRED");
    const row = await db.select({ id: installedAssets.id, productName: installedAssets.productName, serialNumber: installedAssets.serialNumber, installedDate: installedAssets.installedDate, warrantyExpiryDate: installedAssets.warrantyExpiryDate, systemSizeKwp: proposals.systemSizeKwp })
      .from(installedAssets).innerJoin(proposals, eq(proposals.id, installedAssets.proposalId))
      .where(and(eq(installedAssets.id, input.assetId), eq(installedAssets.customerId, actor.userId))).limit(1);
    if (!row[0]) throw new ServiceCommerceError("ASSET_UNAVAILABLE");
    asset = row[0];
    systemSizeKw = row[0].systemSizeKwp;
    loyaltyEligible = true;
  } else {
    systemSizeKw = input.systemDetails.systemSizeKw;
  }
  const price = calculateFormulaPrice(offering, systemSizeKw, loyaltyEligible);
  return { input, offering, systemSizeKw, loyaltyEligible, asset, price, currency: "THB" as const };
}

export async function quoteUniversalService(actor: ServiceActor, rawInput: ServiceQuoteInput) {
  const input = serviceQuoteSchema.parse(rawInput);
  if (input.website) throw new Error("BOT_DETECTED");
  const quote = await resolveQuote(actor, input);
  return {
    offering: { slug: quote.offering.slug, code: quote.offering.code, name: quote.offering.name, description: quote.offering.description, durationMinutes: quote.offering.durationMinutes },
    systemSizeKw: quote.systemSizeKw, loyaltyEligible: quote.loyaltyEligible,
    price: Number(quote.price), currency: quote.currency,
  };
}

function retentionDays() {
  const value = Number(process.env.SERVICE_GUEST_RETENTION_DAYS);
  return Number.isInteger(value) && value >= 1 && value <= 730 ? value : 180;
}

export async function bookUniversalService(actor: ServiceActor, rawInput: ServiceBookingInput, idempotencyKey: string) {
  const input = serviceBookingSchema.parse(rawInput);
  if (input.website) throw new Error("BOT_DETECTED");
  if (input.appointmentDate.getTime() < Date.now() - 60_000) throw new ServiceCommerceError("APPOINTMENT_INVALID");
  const quote = await resolveQuote(actor, input);
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${actor.actorHash}:${idempotencyKey}`}))`);
    const existing = await tx.query.serviceOrders.findFirst({ where: and(eq(serviceOrders.actorHash, actor.actorHash), eq(serviceOrders.idempotencyKey, idempotencyKey)) });
    if (existing) {
      const request = await tx.query.serviceRequests.findFirst({ where: eq(serviceRequests.serviceOrderId, existing.id) });
      const existingTrackingRef = existing.trackingRef || deriveServiceTrackingReference(existing.trackingId); return { orderId: existing.id, serviceRequestId: request?.id || null, trackingId: existingTrackingRef, price: Number(existing.priceSnapshot), currency: existing.currency, erp: existing.erpPayload, idempotentReplay: true };
    }
    if (actor.userId) {
      const [user] = await tx.select({ isActive: users.isActive }).from(users).where(eq(users.id, actor.userId)).for("update");
      if (!user?.isActive) throw new ServiceCommerceError("ACCOUNT_UNAVAILABLE");
    }
    const trackingId = crypto.randomUUID();
    const trackingRef = generateTrackingReference("SV");
    const trackingToken = crypto.randomUUID();
    const trackingExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    const guestExpiresAt = actor.userId ? null : new Date(Date.now() + retentionDays() * 24 * 60 * 60 * 1000);
    const systemSnapshot = quote.input.systemSource === "SOLARDREAM"
      ? { source: "SOLARDREAM", systemSizeKw: quote.systemSizeKw, assetId: quote.asset!.id, productName: quote.asset!.productName, serialNumber: quote.asset!.serialNumber, installedDate: quote.asset!.installedDate, warrantyExpiryDate: quote.asset!.warrantyExpiryDate }
      : { source: "EXTERNAL", ...quote.input.systemDetails };
    const offeringSnapshot = { id: quote.offering.id, slug: quote.offering.slug, code: quote.offering.code, name: quote.offering.name, description: quote.offering.description, durationMinutes: quote.offering.durationMinutes, erpItemCode: quote.offering.erpItemCode, pricing: { basePrice: quote.offering.basePrice, ratePerKwp: quote.offering.ratePerKwp, minimumPrice: quote.offering.minimumPrice, loyaltyDiscount: quote.offering.loyaltyDiscount, loyaltyEligible: quote.loyaltyEligible } };
    const orderId = crypto.randomUUID();
    const erpPayload = {
      doctype: "Issue",
      customer_type: input.systemSource === "SOLARDREAM" ? "existing" : "external",
      service_sku: quote.offering.erpItemCode,
      system_size_kw: quote.systemSizeKw,
      calculated_price: Number(quote.price),
      appointment_date: input.appointmentDate.toISOString(),
      service_order_id: orderId,
      subject: quote.offering.name.en,
      raised_by: input.contact.email,
      contact_name: input.contact.fullName,
      contact_phone: input.contact.phone,
      currency: "THB",
      system: systemSnapshot,
    };
    const [order] = await tx.insert(serviceOrders).values({
      id: orderId, idempotencyKey, customerUserId: actor.userId, actorHash: actor.actorHash, guestSessionHash: actor.guestSessionHash,
      trackingId, trackingRef, trackingTokenHash: hashServiceActor("tracking", trackingToken), trackingExpiresAt, guestExpiresAt, erpPayload,
      contactEmailDigest: serviceContactEmailDigest(input.contact.email), serviceAddress: input.contact.serviceAddress,
      necessaryConsentAt: new Date(), necessaryConsentVersion: process.env.SERVICE_NECESSARY_CONSENT_VERSION?.trim() || "v1",
      portalLocale: input.locale,
      serviceOfferingId: quote.offering.id, assetId: quote.asset?.id || null, systemSource: input.systemSource,
      priceSnapshot: quote.price, offeringSnapshot, systemSnapshot, contactSnapshot: input.contact, appointmentDate: input.appointmentDate, customerNotes: input.customerNotes || null,
    }).returning();
    const requestType = quote.offering.code.includes("REPAIR") ? "REPAIR" as const : "MAINTENANCE" as const;
    const [request] = await tx.insert(serviceRequests).values({ assetId: quote.asset?.id || null, customerUserId: actor.userId, serviceOrderId: order.id, serviceOfferingId: quote.offering.id, systemSource: input.systemSource, externalSystemDetails: input.systemSource === "EXTERNAL" ? input.systemDetails : {}, type: requestType, subject: quote.offering.name.en, description: input.customerNotes || quote.offering.description.en, contactName: input.contact.fullName, contactPhone: input.contact.phone, appointmentDate: input.appointmentDate }).returning({ id: serviceRequests.id });
    return { orderId: order.id, serviceRequestId: request.id, trackingId: trackingRef, price: Number(order.priceSnapshot), currency: order.currency, erp: erpPayload, idempotentReplay: false };
  });
}

export async function getOwnedServiceOrder(userId: string, rawOrderId: string) {
  const orderId = serviceOrderIdSchema.parse(rawOrderId);
  const order = await db.query.serviceOrders.findFirst({
    where: and(eq(serviceOrders.id, orderId), eq(serviceOrders.customerUserId, userId)),
  });
  if (!order) return null;
  const [offering, request] = await Promise.all([
    db.query.serviceOfferings.findFirst({ where: eq(serviceOfferings.id, order.serviceOfferingId) }),
    db.query.serviceRequests.findFirst({ where: eq(serviceRequests.serviceOrderId, order.id), orderBy: [desc(serviceRequests.createdAt)] }),
  ]);
  return { ...order, offering, serviceRequest: request };
}
