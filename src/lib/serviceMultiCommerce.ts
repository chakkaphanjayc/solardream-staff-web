import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, asc, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { installedAssets, proposals, serviceBundleItems, serviceBundles, serviceOfferings, serviceOrderAdjustments, serviceOrderItems, serviceOrders, servicePromotionEligibility, servicePromotionRedemptions, servicePromotions, serviceQuoteSessions, serviceRequests, serviceSystemOptions, users } from "@/db/schema";
import { enqueueIntegrationEvent } from "@/lib/integrationOutbox";
import { hashServiceActor } from "@/lib/serviceGuestSession";
import { multiServiceConfirmSchema, multiServiceQuoteSchema, type MultiServiceConfirmInput, type MultiServiceQuoteInput } from "@/lib/serviceMultiContracts";
import { allocateDiscount, basisPointDiscount, eligibleBundleOfferingIds, formulaPriceSatang } from "@/lib/servicePricing";
import { issueGuestServicePortalAccess, serviceContactEmailDigest } from "@/lib/servicePortal";
import { deriveServiceTrackingReference, generateTrackingReference } from "@/lib/trackingReference";
import type { ServiceActor } from "@/lib/serviceCommerce";
import { requireServiceQuoteSecret } from "@/lib/serviceMultiErrors";

function secret() { return requireServiceQuoteSecret(); }
function digest(context: string, value: string) { return createHmac("sha256", secret()).update(`${context}:${value}`).digest("base64url"); }
function equal(left: string, right: string) { const a = Buffer.from(left); const b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b); }
export function promotionCodeDigest(code: string) { return digest("promotion", code.trim().toUpperCase()); }
function quoteRef(actorHash: string) { const id = crypto.randomUUID(); const bearer = randomBytes(32).toString("base64url"); const mac = digest("quote-access", `${id}:${actorHash}:${bearer}`); return { id, reference: `qv1.${id}.${bearer}.${mac}`, referenceDigest: digest("quote-reference", `${id}:${bearer}`) }; }
function parseQuoteRef(reference: string, actorHash: string) { const [version, id, bearer, mac, ...extra] = reference.split("."); if (version !== "qv1" || !id || !bearer || !mac || extra.length || !equal(digest("quote-access", `${id}:${actorHash}:${bearer}`), mac)) return null; return { id, referenceDigest: digest("quote-reference", `${id}:${bearer}`) }; }
type Snapshot = { items: Array<{ offeringId: string; slug: string; code: string; name: { en: string; th: string }; erpItemCode: string | null; unitSatang: number; subtotalSatang: number; discountSatang: number; totalSatang: number }>; bundle: { id: string; code: string; discountSatang: number } | null; promotion: { id: string; discountSatang: number } | null; system: Record<string, unknown> };
function contactEmailFromSnapshot(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const email = (value as Record<string, unknown>).email;
  return typeof email === "string" ? email : "";
}

export async function listServiceConfig() {
  const [offerings, options] = await Promise.all([
    db.select({ slug: serviceOfferings.slug, name: serviceOfferings.name, description: serviceOfferings.description, durationMinutes: serviceOfferings.durationMinutes }).from(serviceOfferings).where(eq(serviceOfferings.isActive, true)).orderBy(asc(serviceOfferings.slug)),
    db.select({ kind: serviceSystemOptions.kind, code: serviceSystemOptions.code, label: serviceSystemOptions.label }).from(serviceSystemOptions).where(eq(serviceSystemOptions.isActive, true)).orderBy(asc(serviceSystemOptions.kind), asc(serviceSystemOptions.sortOrder)),
  ]);
  const publicOptions: Array<{ kind: "INVERTER_BRAND" | "ROOF_TYPE"; code: string; label: { en: string; th: string } }> = options.flatMap((option) => option.kind === "INVERTER_BRAND" || option.kind === "ROOF_TYPE" ? [{ kind: option.kind, code: option.code, label: option.label }] : []);
  return { offerings, options: publicOptions, currency: "THB" as const, locationAttribution: "© OpenStreetMap contributors" as const };
}

export async function createMultiServiceQuote(actor: ServiceActor, raw: MultiServiceQuoteInput) {
  const input = multiServiceQuoteSchema.parse(raw); requireServiceQuoteSecret(); if (input.website) throw new Error("BOT_DETECTED");
  const offerings = await db.select().from(serviceOfferings).where(and(inArray(serviceOfferings.slug, input.offeringSlugs), eq(serviceOfferings.isActive, true)));
  if (offerings.length !== input.offeringSlugs.length) throw new Error("OFFERING_UNAVAILABLE");
  let systemSizeKw: number; let loyalty = false; let system: Record<string, unknown>;
  if (input.system.systemSource === "SOLARDREAM") {
    if (!actor.userId) throw new Error("AUTH_REQUIRED");
    const rows = await db.select({ id: installedAssets.id, systemSizeKwp: proposals.systemSizeKwp }).from(installedAssets).innerJoin(proposals, eq(proposals.id, installedAssets.proposalId)).where(and(eq(installedAssets.id, input.system.assetId), eq(installedAssets.customerId, actor.userId))).limit(1);
    if (!rows[0]) throw new Error("ASSET_UNAVAILABLE"); systemSizeKw = rows[0].systemSizeKwp; loyalty = true; system = { systemSource: "SOLARDREAM", assetId: rows[0].id, systemSizeKw };
  } else {
    const optionRows = await db.select({ kind: serviceSystemOptions.kind, code: serviceSystemOptions.code }).from(serviceSystemOptions).where(and(eq(serviceSystemOptions.isActive, true), or(and(eq(serviceSystemOptions.kind, "INVERTER_BRAND"), eq(serviceSystemOptions.code, input.system.systemDetails.inverterBrandCode)), and(eq(serviceSystemOptions.kind, "ROOF_TYPE"), eq(serviceSystemOptions.code, input.system.systemDetails.roofTypeCode)))));
    if (optionRows.length !== 2) throw new Error("SYSTEM_OPTION_UNAVAILABLE"); systemSizeKw = input.system.systemDetails.systemSizeKw; system = { systemSource: "EXTERNAL", ...input.system.systemDetails };
  }
  const baseLines = offerings.sort((a, b) => input.offeringSlugs.indexOf(a.slug) - input.offeringSlugs.indexOf(b.slug)).map((offering) => ({ offering, key: offering.slug, unitSatang: formulaPriceSatang(offering, systemSizeKw, loyalty), quantity: 1 }));
  const subtotalSatang = baseLines.reduce((sum, line) => sum + line.unitSatang, 0); const now = new Date();
  const bundles = await db.select().from(serviceBundles).where(and(eq(serviceBundles.isActive, true), or(isNull(serviceBundles.startsAt), lte(serviceBundles.startsAt, now)), or(isNull(serviceBundles.endsAt), gt(serviceBundles.endsAt, now))));
  const bundleRestrictions = bundles.length === 0
    ? []
    : await db.select({ bundleId: serviceBundleItems.bundleId, offeringId: serviceBundleItems.offeringId })
      .from(serviceBundleItems)
      .where(inArray(serviceBundleItems.bundleId, bundles.map((bundle) => bundle.id)));
  const restrictionsByBundle = new Map<string, string[]>();
  for (const restriction of bundleRestrictions) {
    const offeringIds = restrictionsByBundle.get(restriction.bundleId) ?? [];
    offeringIds.push(restriction.offeringId);
    restrictionsByBundle.set(restriction.bundleId, offeringIds);
  }
  let selectedBundle: typeof bundles[number] | null = null;
  let selectedBundleOfferingIds = new Set<string>();
  for (const bundle of bundles) { const eligibleIds = eligibleBundleOfferingIds(offerings.map((offering) => offering.id), restrictionsByBundle.get(bundle.id) ?? [], bundle.minimumDistinctItems); const eligible = eligibleIds.size >= bundle.minimumDistinctItems; if (eligible && (!selectedBundle || bundle.discountBps > selectedBundle.discountBps)) { selectedBundle = bundle; selectedBundleOfferingIds = eligibleIds; } }
  const bundleLines = baseLines.filter((line) => selectedBundleOfferingIds.has(line.offering.id)); const bundleBase = bundleLines.reduce((sum, line) => sum + line.unitSatang, 0); const bundleDiscount = selectedBundle ? basisPointDiscount(bundleBase, selectedBundle.discountBps) : 0;
  const bundleAllocated = new Map((bundleDiscount ? allocateDiscount(bundleLines, bundleDiscount) : bundleLines.map((line) => ({ ...line, subtotalSatang: line.unitSatang, discountSatang: 0, totalSatang: line.unitSatang }))).map((line) => [line.key, line.discountSatang]));
  const postBundleLines = baseLines.map((line) => ({ ...line, unitSatang: line.unitSatang - (bundleAllocated.get(line.key) || 0) }));
  let promotion: typeof servicePromotions.$inferSelect | null = null; let promotionDiscount = 0;
  if (input.promoCode) {
    promotion = await db.query.servicePromotions.findFirst({ where: and(eq(servicePromotions.codeDigest, promotionCodeDigest(input.promoCode)), eq(servicePromotions.isActive, true)) }) || null;
    if (promotion && (!promotion.startsAt || promotion.startsAt <= now) && (!promotion.endsAt || promotion.endsAt > now) && subtotalSatang >= promotion.minimumSubtotalSatang && (promotion.usageLimit === null || promotion.redemptionCount < promotion.usageLimit)) {
      const rules = await db.select().from(servicePromotionEligibility).where(eq(servicePromotionEligibility.promotionId, promotion.id)); const eligible = !rules.length || rules.some((rule) => (!rule.offeringId || offerings.some((o) => o.id === rule.offeringId)) && (!rule.systemSource || rule.systemSource === input.system.systemSource) && (!rule.minimumSystemKw || systemSizeKw >= Number(rule.minimumSystemKw)) && (!rule.maximumSystemKw || systemSizeKw <= Number(rule.maximumSystemKw)));
      if (eligible) promotionDiscount = promotion.discountType === "PERCENT_BPS" ? basisPointDiscount(subtotalSatang - bundleDiscount, promotion.value, promotion.maximumDiscountSatang) : Math.min(subtotalSatang - bundleDiscount, promotion.maximumDiscountSatang === null ? promotion.value : Math.min(promotion.value, promotion.maximumDiscountSatang)); else promotion = null;
    } else promotion = null;
    if (!promotion) throw new Error("PROMOTION_UNAVAILABLE");
  }
  const discountSatang = Math.min(subtotalSatang, bundleDiscount + promotionDiscount); const promotionAllocated = promotionDiscount ? allocateDiscount(postBundleLines, promotionDiscount) : postBundleLines.map((line) => ({ ...line, subtotalSatang: line.unitSatang, discountSatang: 0, totalSatang: line.unitSatang }));
  const snapshot: Snapshot = { items: promotionAllocated.map((line, index) => { const original = baseLines[index]; const itemDiscount = (bundleAllocated.get(line.key) || 0) + line.discountSatang; return { offeringId: original.offering.id, slug: original.offering.slug, code: original.offering.code, name: original.offering.name, erpItemCode: original.offering.erpItemCode, unitSatang: original.unitSatang, subtotalSatang: original.unitSatang, discountSatang: itemDiscount, totalSatang: original.unitSatang - itemDiscount }; }), bundle: selectedBundle ? { id: selectedBundle.id, code: selectedBundle.code, discountSatang: bundleDiscount } : null, promotion: promotion && promotionDiscount ? { id: promotion.id, discountSatang: promotionDiscount } : null, system };
  const pricingStatus = systemSizeKw > 20 ? "CUSTOM_REQUIRED" as const : "FINAL" as const; const checkoutDisposition = "CUSTOM_QUOTE" as const; const ref = quoteRef(actor.actorHash);
  const expiresAt = new Date(Date.now() + 15 * 60_000); const sanitizedInput = { offeringSlugs: input.offeringSlugs, system: input.system, promotionId: promotion?.id || null };
  await db.insert(serviceQuoteSessions).values({ id: ref.id, referenceDigest: ref.referenceDigest, actorHash: actor.actorHash, inputSnapshot: sanitizedInput, pricingSnapshot: snapshot, subtotalSatang, discountSatang, totalSatang: subtotalSatang - discountSatang, checkoutDisposition, pricingStatus, expiresAt });
  const hideAmounts = pricingStatus === "CUSTOM_REQUIRED";
  return { quoteRef: ref.reference, expiresAt: expiresAt.toISOString(), items: snapshot.items.map(({ slug, name, unitSatang, discountSatang: itemDiscount, totalSatang }) => ({ slug, name, unitSatang: hideAmounts ? null : unitSatang, discountSatang: hideAmounts ? null : itemDiscount, totalSatang: hideAmounts ? null : totalSatang })), adjustments: hideAmounts ? [] : [{ type: "BUNDLE", amountSatang: -bundleDiscount }, ...(promotionDiscount ? [{ type: "PROMOTION", amountSatang: -promotionDiscount }] : [])], subtotalSatang: hideAmounts ? null : subtotalSatang, discountSatang: hideAmounts ? null : discountSatang, totalSatang: hideAmounts ? null : subtotalSatang - discountSatang, currency: "THB" as const, checkoutDisposition, pricingStatus };
}

export async function confirmMultiServiceQuote(actor: ServiceActor, raw: MultiServiceConfirmInput, idempotencyKey: string) {
  const input = multiServiceConfirmSchema.parse(raw); if (input.appointmentDate.getTime() < Date.now() - 60_000) throw new Error("APPOINTMENT_INVALID"); const parsed = parseQuoteRef(input.quoteRef, actor.actorHash); if (!parsed) throw new Error("QUOTE_INVALID");
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`service-confirm:${parsed.id}`}))`); const [quote] = await tx.select().from(serviceQuoteSessions).where(eq(serviceQuoteSessions.id, parsed.id)).for("update");
    if (!quote || !equal(quote.referenceDigest, parsed.referenceDigest) || quote.actorHash !== actor.actorHash) throw new Error("QUOTE_INVALID");
    const existing = await tx.query.serviceOrders.findFirst({ where: and(eq(serviceOrders.actorHash, actor.actorHash), eq(serviceOrders.idempotencyKey, idempotencyKey)) }); if (existing) { const request = await tx.query.serviceRequests.findFirst({ where: eq(serviceRequests.serviceOrderId, existing.id) }); const requiresEngineeringQuote = existing.totalSatang === null; const portalAccess = await issueGuestServicePortalAccess(tx, { orderId: existing.id, email: contactEmailFromSnapshot(existing.contactSnapshot), locale: (existing.portalLocale || "th") as "en" | "th", purpose: "INITIAL" }); const existingTrackingRef = existing.trackingRef || deriveServiceTrackingReference(existing.trackingId); return { orderId: existing.id, serviceRequestId: request?.id || null, trackingId: existingTrackingRef, orderReference: existingTrackingRef, price: requiresEngineeringQuote ? null : Number(existing.priceSnapshot), totalSatang: requiresEngineeringQuote ? null : existing.totalSatang, currency: existing.currency, checkoutDisposition: existing.checkoutDisposition, pricingStatus: requiresEngineeringQuote ? "CUSTOM_REQUIRED" as const : "FINAL" as const, paymentRequirement: existing.paymentRequirement, trackingUrl: portalAccess.link, idempotentReplay: true }; }
    if (quote.status !== "ACTIVE" || quote.expiresAt <= new Date()) throw new Error("QUOTE_INVALID");
    if (quote.checkoutDisposition === "CUSTOM_QUOTE" && input.action !== "REQUEST_QUOTE") throw new Error("CUSTOM_QUOTE_REQUIRED");
    if (actor.userId) { const [user] = await tx.select({ isActive: users.isActive }).from(users).where(eq(users.id, actor.userId)).for("update"); if (!user?.isActive) throw new Error("ACCOUNT_UNAVAILABLE"); }
    const snapshot = quote.pricingSnapshot as Snapshot; const promo = snapshot.promotion;
    const currentOfferings = await tx.select({ id: serviceOfferings.id }).from(serviceOfferings).where(and(inArray(serviceOfferings.id, snapshot.items.map((item) => item.offeringId)), eq(serviceOfferings.isActive, true)));
    if (currentOfferings.length !== snapshot.items.length) throw new Error("OFFERING_UNAVAILABLE");
    let currentSystemSizeKw: number; const quotedSource = snapshot.system.systemSource === "SOLARDREAM" ? "SOLARDREAM" : "EXTERNAL";
    if (quotedSource === "SOLARDREAM") {
      if (!actor.userId || typeof snapshot.system.assetId !== "string") throw new Error("ASSET_UNAVAILABLE");
      const rows = await tx.select({ systemSizeKwp: proposals.systemSizeKwp }).from(installedAssets).innerJoin(proposals, eq(proposals.id, installedAssets.proposalId)).where(and(eq(installedAssets.id, snapshot.system.assetId), eq(installedAssets.customerId, actor.userId))).limit(1);
      if (!rows[0]) throw new Error("ASSET_UNAVAILABLE"); currentSystemSizeKw = rows[0].systemSizeKwp;
    } else {
      const inverterBrandCode = typeof snapshot.system.inverterBrandCode === "string" ? snapshot.system.inverterBrandCode : ""; const roofTypeCode = typeof snapshot.system.roofTypeCode === "string" ? snapshot.system.roofTypeCode : "";
      const optionRows = await tx.select({ id: serviceSystemOptions.id }).from(serviceSystemOptions).where(and(eq(serviceSystemOptions.isActive, true), or(and(eq(serviceSystemOptions.kind, "INVERTER_BRAND"), eq(serviceSystemOptions.code, inverterBrandCode)), and(eq(serviceSystemOptions.kind, "ROOF_TYPE"), eq(serviceSystemOptions.code, roofTypeCode)))));
      if (optionRows.length !== 2) throw new Error("SYSTEM_OPTION_UNAVAILABLE"); currentSystemSizeKw = Number(snapshot.system.systemSizeKw); if (!Number.isFinite(currentSystemSizeKw)) throw new Error("QUOTE_INVALID");
    }
    const currentlyCustom = currentSystemSizeKw > 20; if ((currentlyCustom && quote.pricingStatus !== "CUSTOM_REQUIRED") || (!currentlyCustom && quote.pricingStatus !== "FINAL")) throw new Error("QUOTE_CHANGED");
    if (promo) { const now = new Date(); const [locked] = await tx.select().from(servicePromotions).where(eq(servicePromotions.id, promo.id)).for("update"); if (!locked || !locked.isActive || (locked.startsAt && locked.startsAt > now) || (locked.endsAt && locked.endsAt <= now) || quote.subtotalSatang < locked.minimumSubtotalSatang || (locked.usageLimit !== null && locked.redemptionCount >= locked.usageLimit)) throw new Error("PROMOTION_UNAVAILABLE"); const rules = await tx.select().from(servicePromotionEligibility).where(eq(servicePromotionEligibility.promotionId, locked.id)); const eligible = !rules.length || rules.some((rule) => (!rule.offeringId || snapshot.items.some((item) => item.offeringId === rule.offeringId)) && (!rule.systemSource || rule.systemSource === quotedSource) && (!rule.minimumSystemKw || currentSystemSizeKw >= Number(rule.minimumSystemKw)) && (!rule.maximumSystemKw || currentSystemSizeKw <= Number(rule.maximumSystemKw))); if (!eligible) throw new Error("PROMOTION_UNAVAILABLE"); const promotionBase = quote.subtotalSatang - (snapshot.bundle?.discountSatang || 0); const expectedDiscount = locked.discountType === "PERCENT_BPS" ? basisPointDiscount(promotionBase, locked.value, locked.maximumDiscountSatang) : Math.min(promotionBase, locked.maximumDiscountSatang === null ? locked.value : Math.min(locked.value, locked.maximumDiscountSatang)); if (expectedDiscount !== promo.discountSatang) throw new Error("PROMOTION_CHANGED"); const used = await tx.$count(servicePromotionRedemptions, and(eq(servicePromotionRedemptions.promotionId, locked.id), eq(servicePromotionRedemptions.actorHash, actor.actorHash))); if (used >= locked.perActorLimit) throw new Error("PROMOTION_LIMIT_REACHED"); }
    const primary = snapshot.items[0]; if (!primary) throw new Error("QUOTE_INVALID"); const orderId = crypto.randomUUID(); const trackingId = crypto.randomUUID(); const trackingRef = generateTrackingReference("SV"); const trackingToken = crypto.randomUUID(); const requiresEngineeringQuote = quote.pricingStatus === "CUSTOM_REQUIRED"; const systemSource = snapshot.system.systemSource === "SOLARDREAM" ? "SOLARDREAM" : "EXTERNAL";
    const [order] = await tx.insert(serviceOrders).values({ id: orderId, idempotencyKey, customerUserId: actor.userId, actorHash: actor.actorHash, guestSessionHash: actor.guestSessionHash, trackingId, trackingRef, trackingTokenHash: hashServiceActor("tracking", trackingToken), trackingExpiresAt: new Date(Date.now() + 90 * 86400_000), guestExpiresAt: actor.userId ? null : new Date(Date.now() + 180 * 86400_000), quoteSessionId: quote.id, checkoutDisposition: quote.checkoutDisposition, paymentRequirement: "NOT_REQUIRED", subtotalSatang: requiresEngineeringQuote ? null : quote.subtotalSatang, discountSatang: requiresEngineeringQuote ? null : quote.discountSatang, totalSatang: requiresEngineeringQuote ? null : quote.totalSatang, priceSnapshot: requiresEngineeringQuote ? "0.00" : (quote.totalSatang / 100).toFixed(2), contactEmailDigest: serviceContactEmailDigest(input.contact.email), serviceAddress: input.contact.serviceAddress, necessaryConsentAt: new Date(), necessaryConsentVersion: process.env.SERVICE_NECESSARY_CONSENT_VERSION?.trim() || "v1", portalLocale: input.locale, serviceOfferingId: primary.offeringId, assetId: typeof snapshot.system.assetId === "string" ? snapshot.system.assetId : null, systemSource, status: "QUOTE_REQUESTED", paymentStatus: "UNPAID", offeringSnapshot: { items: snapshot.items.map((item) => ({ slug: item.slug, code: item.code, name: item.name, unitSatang: item.unitSatang, subtotalSatang: item.subtotalSatang, discountSatang: item.discountSatang, totalSatang: item.totalSatang })) }, systemSnapshot: snapshot.system, contactSnapshot: input.contact, locationSnapshot: input.location ?? {}, latitude: input.location ? String(input.location.latitude) : null, longitude: input.location ? String(input.location.longitude) : null, appointmentDate: input.appointmentDate, customerNotes: input.customerNotes || null, erpPayload: { serviceOrderId: orderId, itemCount: snapshot.items.length, checkoutDisposition: quote.checkoutDisposition, pricingStatus: quote.pricingStatus, fulfillmentModel: "QUOTATION_ON_SITE_PAYMENT" } }).returning();
    const insertedItems = await tx.insert(serviceOrderItems).values(snapshot.items.map((item) => ({ serviceOrderId: order.id, serviceOfferingId: item.offeringId, unitPriceSatang: item.unitSatang, subtotalSatang: item.subtotalSatang, discountSatang: item.discountSatang, totalSatang: item.totalSatang, offeringSnapshot: { slug: item.slug, code: item.code, name: item.name, erpItemCode: item.erpItemCode } }))).returning({ id: serviceOrderItems.id, serviceOfferingId: serviceOrderItems.serviceOfferingId });
    if (snapshot.bundle?.discountSatang) await tx.insert(serviceOrderAdjustments).values({ serviceOrderId: order.id, kind: "BUNDLE", label: snapshot.bundle.code, amountSatang: -snapshot.bundle.discountSatang, bundleId: snapshot.bundle.id });
    if (promo) await tx.insert(serviceOrderAdjustments).values({ serviceOrderId: order.id, kind: "PROMOTION", label: "Promotion", amountSatang: -promo.discountSatang, promotionId: promo.id });
    if (promo && !requiresEngineeringQuote) { await tx.insert(servicePromotionRedemptions).values({ promotionId: promo.id, serviceOrderId: order.id, actorHash: actor.actorHash, discountSatang: promo.discountSatang }); await tx.update(servicePromotions).set({ redemptionCount: sql`${servicePromotions.redemptionCount}+1`, updatedAt: new Date() }).where(eq(servicePromotions.id, promo.id)); }
    const insertedItemsByOffering = new Map(insertedItems.map((item) => [item.serviceOfferingId, item.id]));
    const serviceRequestValues: Array<typeof serviceRequests.$inferInsert> = snapshot.items.map((item) => {
      const serviceOrderItemId = insertedItemsByOffering.get(item.offeringId);
      if (!serviceOrderItemId) throw new Error("ORDER_ITEM_INSERT_FAILED");
      return {
        assetId: typeof snapshot.system.assetId === "string" ? snapshot.system.assetId : null,
        customerUserId: actor.userId,
        serviceOrderId: order.id,
        serviceOrderItemId,
        serviceOfferingId: item.offeringId,
        systemSource,
        externalSystemDetails: systemSource === "EXTERNAL" ? snapshot.system : {},
        type: item.code.includes("REPAIR") ? "REPAIR" : "MAINTENANCE",
        subject: item.name.en,
        description: input.customerNotes || item.name.en,
        contactName: input.contact.fullName,
        contactPhone: input.contact.phone,
        appointmentDate: input.appointmentDate,
      };
    });
    const insertedRequests = await tx.insert(serviceRequests).values(serviceRequestValues).returning({ id: serviceRequests.id });
    const firstServiceRequestId = insertedRequests[0]?.id ?? null;
    const proposalServiceItems = snapshot.items.map((item) => ({ offeringId: item.offeringId, slug: item.slug, code: item.code, name: item.name, erpItemCode: item.erpItemCode, unitSatang: item.unitSatang, discountSatang: item.discountSatang, totalSatang: item.totalSatang }));
    if (actor.userId) await tx.insert(proposals).values({ userId: actor.userId, requestType: "Service", serviceItems: proposalServiceItems, preferredDate: input.appointmentDate, serviceOrderId: order.id, systemSizeKwp: currentSystemSizeKw, panelCount: 0, totalPrice: requiresEngineeringQuote ? 0 : quote.totalSatang / 100, monthlySavings: 0, paybackPeriod: "N/A", status: "PENDING_QUOTE", configurationData: { requestType: "Service", serviceItems: proposalServiceItems, serviceOrderId: order.id, trackingId: trackingRef, trackingRef, serviceOrderTrackingId: order.trackingId, pricingStatus: quote.pricingStatus, checkoutDisposition: quote.checkoutDisposition, preferredDate: input.appointmentDate.toISOString(), contact: input.contact, location: input.location ?? null, system: snapshot.system }, fulfillmentType: "INSTALLATION", isInstallationRequired: false });
    await tx.update(serviceQuoteSessions).set({ status: "CONSUMED", consumedAt: new Date() }).where(eq(serviceQuoteSessions.id, quote.id));
    const portalAccess = await issueGuestServicePortalAccess(tx, { orderId: order.id, email: input.contact.email, locale: input.locale, purpose: "INITIAL" });
    await enqueueIntegrationEvent(tx, { topic: "erp.service_quote.requested", aggregateType: "SERVICE_ORDER", aggregateId: order.id, payload: { orderId: order.id }, dedupeKey: `erp.service_quote.requested:${order.id}` });
    return { orderId: order.id, serviceRequestId: firstServiceRequestId, trackingId: trackingRef, orderReference: trackingRef, price: requiresEngineeringQuote ? null : quote.totalSatang / 100, checkoutDisposition: quote.checkoutDisposition, pricingStatus: quote.pricingStatus, paymentRequirement: "NOT_REQUIRED" as const, totalSatang: requiresEngineeringQuote ? null : quote.totalSatang, currency: "THB" as const, trackingUrl: portalAccess.link, idempotentReplay: false };
  });
}
