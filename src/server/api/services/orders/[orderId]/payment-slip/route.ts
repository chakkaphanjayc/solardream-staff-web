import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { paymentSlipRegistry, serviceOrderPayments, serviceOrders } from "@/db/schema";
import { validateUploadContentLength, validateUploadFile } from "@/lib/fileValidation";
import { enqueueIntegrationEvent } from "@/lib/integrationOutbox";
import { enforcePortalRateLimit } from "@/lib/portalRateLimit";
import { isSameOrigin, privacyHmac, requestClientAddress } from "@/lib/privacyConsent";
import { idempotencyHeaderSchema, resolveServiceActor } from "@/lib/serviceApi";
import { ServiceSlipVerificationError } from "@/lib/serviceSlipContracts";
import { verifyServiceSlip } from "@/lib/serviceSlipVerification";
import { SERVICE_PAYMENT_VERIFIED_TOPIC } from "@/lib/serviceErpPayment";
import { processOutboxBestEffort } from "@/lib/outboxProcessor";
import { isProcessingLeaseStale } from "@/lib/processingLease";
import { issueGuestServicePortalAccess } from "@/lib/servicePortal";
import { createAdminClient } from "@/utils/supabase/server";

export const maxDuration = 60;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_REQUEST_BYTES = MAX_FILE_BYTES + 512 * 1024;

function json(body: unknown, status = 200) { return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } }); }
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function postgresCode(error: unknown) { let cursor = error; for (let depth = 0; depth < 4; depth += 1) { const row = record(cursor); if (typeof row.code === "string") return row.code; cursor = row.cause; } return ""; }

export async function POST(request: NextRequest, context: { params: Promise<{ orderId: string }> }) {
  let storagePath = "";
  let reservedPaymentId = "";
  try {
    if (!isSameOrigin(request)) return json({ success: false, error: "Forbidden." }, 403);
    const length = validateUploadContentLength(request.headers, MAX_REQUEST_BYTES);
    if (!length.ok) return json({ success: false, error: length.error }, length.status);
    const idempotencyKey = idempotencyHeaderSchema.parse(request.headers.get("idempotency-key"));
    const { orderId } = await context.params;
    const subject = await resolveServiceActor(request);
    const order = await db.query.serviceOrders.findFirst({ where: eq(serviceOrders.id, orderId) });
    if (!order) return json({ success: false, error: "Service order not found." }, 404);
    if (order.paymentRequirement === "NOT_REQUIRED" || order.checkoutDisposition === "CUSTOM_QUOTE") return json({ success: false, error: "This service request requires a custom quotation and cannot accept payment yet." }, 409);
    const authorized = subject.actor.userId
      ? order.customerUserId === subject.actor.userId
      : order.customerUserId === null && order.actorHash === subject.actor.actorHash;
    if (!authorized) return json({ success: false, error: "Unauthorized payment upload." }, 401);
    const rate = await enforcePortalRateLimit({ namespace: "service-payment-slip", identity: `${order.id}:${subject.actor.actorHash}:${privacyHmac(requestClientAddress(request.headers), "ip")}`, limit: 6, windowSeconds: 600 });
    if (!rate.allowed) return json({ success: false, error: "Too many payment attempts." }, 429);
    const existing = await db.query.serviceOrderPayments.findFirst({ where: eq(serviceOrderPayments.serviceOrderId, order.id) });
    if (existing?.status === "VERIFIED") return existing.idempotencyKey === idempotencyKey
      ? json({ success: true, paymentStatus: "VERIFIED", orderId: order.id, paymentId: existing.id, idempotentReplay: true })
      : json({ success: false, error: "This service order already has a verified payment." }, 409);
    if (existing?.status === "VERIFYING" && !isProcessingLeaseStale(existing.updatedAt)) return json({ success: false, error: "Payment verification is already in progress." }, 409);
    if (existing?.status === "REJECTED" && existing.idempotencyKey === idempotencyKey) return json({ success: false, error: "This payment attempt was rejected. Use a new idempotency key to retry." }, 422);

    const formData = await request.formData();
    const file = formData.get("image") || formData.get("file");
    if (!(file instanceof File)) return json({ success: false, error: "Slip image is required." }, 400);
    const validated = await validateUploadFile({ file, allowedKinds: ["jpeg", "png"], fallbackName: "service-payment-slip", maxBytes: MAX_FILE_BYTES });
    const storage = createAdminClient();
    const bucket = process.env.SERVICE_PAYMENT_STORAGE_BUCKET?.trim() || "private-service-payments";
    storagePath = `service-orders/${order.id}/${crypto.randomUUID()}.${validated.extension}`;
    const upload = await storage.storage.from(bucket).upload(storagePath, file, { contentType: validated.contentType, upsert: false });
    if (upload.error) throw new Error("Private payment storage upload failed.");

    const previousStoragePath = existing?.storageFileId && existing.storageFileId !== "[REMOVED]" ? existing.storageFileId : "";
    const payment = await db.transaction(async (tx) => {
      const [lockedOrder] = await tx.select().from(serviceOrders).where(eq(serviceOrders.id, order.id)).for("update");
      if (!lockedOrder || lockedOrder.paymentStatus !== "UNPAID") throw new Error("ORDER_ALREADY_VERIFIED");
      const current = await tx.query.serviceOrderPayments.findFirst({ where: eq(serviceOrderPayments.serviceOrderId, order.id) });
      if (current?.status === "VERIFIED") throw new Error("ORDER_ALREADY_VERIFIED");
      if (current?.status === "VERIFYING" && !isProcessingLeaseStale(current.updatedAt)) throw new Error("VERIFICATION_IN_PROGRESS");
      if (current) {
        const staleRecovery = current.status === "VERIFYING" ? { staleAttemptRejectedAt: new Date().toISOString(), previousStorageRemoved: Boolean(current.storageFileId && current.storageFileId !== "[REMOVED]") } : {};
        const [updated] = await tx.update(serviceOrderPayments).set({ idempotencyKey, status: "VERIFYING", amountSnapshot: lockedOrder.priceSnapshot, storageProvider: "SUPABASE_PRIVATE", storageFileId: storagePath, contentType: validated.contentType, byteSize: validated.byteSize, sha256: validated.sha256, easySlipData: staleRecovery, erpSyncStatus: "PENDING", erpSyncError: null, updatedAt: new Date() }).where(eq(serviceOrderPayments.id, current.id)).returning();
        return updated;
      }
      const [created] = await tx.insert(serviceOrderPayments).values({ serviceOrderId: lockedOrder.id, idempotencyKey, status: "VERIFYING", amountSnapshot: lockedOrder.priceSnapshot, storageProvider: "SUPABASE_PRIVATE", storageFileId: storagePath, contentType: validated.contentType, byteSize: validated.byteSize, sha256: validated.sha256 }).returning();
      return created;
    });
    reservedPaymentId = payment.id;
    if (previousStoragePath && previousStoragePath !== storagePath) await storage.storage.from(bucket).remove([previousStoragePath]).catch(() => undefined);

    let verification;
    try { verification = await verifyServiceSlip(file, String(payment.amountSnapshot)); }
    catch (error) {
      await db.update(serviceOrderPayments).set({ status: "REJECTED", storageFileId: "[REMOVED]", erpSyncStatus: "BLOCKED", erpSyncError: error instanceof ServiceSlipVerificationError ? error.code : "VERIFICATION_FAILED", updatedAt: new Date() }).where(eq(serviceOrderPayments.id, payment.id));
      await storage.storage.from(bucket).remove([storagePath]).catch(() => undefined); storagePath = "";
      const message = error instanceof ServiceSlipVerificationError && error.code === "DUPLICATE" ? "This slip has already been used." : "The payment slip could not be verified.";
      return json({ success: false, error: message }, 422);
    }

    try {
      await db.transaction(async (tx) => {
        await tx.insert(paymentSlipRegistry).values({ transRef: verification.transRef, sourceType: "SERVICE_ORDER", sourceId: payment.id, amount: verification.amount });
        const rawSlip = record(verification.rawSlip); const receiver = record(rawSlip.receiver); const bank = record(receiver.bank);
        const safeEvidence = { verificationProvider: "EASYSLIP_V2", transRef: verification.transRef, amount: verification.amount, receiverMatched: true, receiverAccountLast4: verification.receiverAccount.slice(-4), receiverName: "[MATCHED]", receiverBankCode: typeof bank.short === "string" ? bank.short : null, verifiedAt: new Date().toISOString() };
        const [verifiedPayment] = await tx.update(serviceOrderPayments).set({ status: "VERIFIED", transRef: verification.transRef, receiverAccount: `****${verification.receiverAccount.slice(-4)}`, receiverName: "[MATCHED]", easySlipData: safeEvidence, verifiedAt: new Date(), erpSyncStatus: "PENDING", erpSyncError: null, updatedAt: new Date() }).where(and(eq(serviceOrderPayments.id, payment.id), eq(serviceOrderPayments.status, "VERIFYING"))).returning({ id: serviceOrderPayments.id });
        if (!verifiedPayment) throw new Error("PAYMENT_STATE_CONFLICT");
        await tx.update(serviceOrders).set({ paymentStatus: "VERIFIED", paidAt: null, erpPaymentSyncStatus: "PENDING", erpPaymentSyncError: null, updatedAt: new Date() }).where(eq(serviceOrders.id, order.id));
        if (order.customerUserId === null) {
          const contact = record(order.contactSnapshot); const recipient = typeof contact.email === "string" ? contact.email : "";
          if (!recipient) throw new Error("Guest service order is missing its portal delivery email.");
          await issueGuestServicePortalAccess(tx, {
            orderId: order.id,
            email: recipient,
            locale: order.portalLocale === "en" ? "en" : "th",
            purpose: "INITIAL",
          });
        }
        await enqueueIntegrationEvent(tx, { topic: SERVICE_PAYMENT_VERIFIED_TOPIC, aggregateType: "SERVICE_ORDER", aggregateId: order.id, payload: { paymentId: payment.id }, dedupeKey: `${SERVICE_PAYMENT_VERIFIED_TOPIC}:${payment.id}` });
      });
    } catch (error) {
      if (postgresCode(error) === "23505") {
        await db.update(serviceOrderPayments).set({ status: "REJECTED", storageFileId: "[REMOVED]", erpSyncStatus: "BLOCKED", erpSyncError: "GLOBAL_DUPLICATE", updatedAt: new Date() }).where(eq(serviceOrderPayments.id, payment.id));
        await storage.storage.from(bucket).remove([storagePath]).catch(() => undefined); storagePath = "";
        return json({ success: false, error: "This slip has already been used." }, 409);
      }
      throw error;
    }
    void processOutboxBestEffort(order.id);
    return json({ success: true, paymentStatus: "VERIFIED", orderId: order.id, paymentId: payment.id, idempotentReplay: false });
  } catch (error) {
    if (storagePath) {
      try { const storage = createAdminClient(); await storage.storage.from(process.env.SERVICE_PAYMENT_STORAGE_BUCKET?.trim() || "private-service-payments").remove([storagePath]); } catch { /* Retention cleanup remains a fallback. */ }
    }
    if (error instanceof z.ZodError || error instanceof SyntaxError) return json({ success: false, error: "Invalid payment request." }, 400);
    if (reservedPaymentId) await db.update(serviceOrderPayments).set({ status: "REJECTED", storageFileId: "[REMOVED]", erpSyncStatus: "BLOCKED", erpSyncError: "INTERNAL_FAILURE", updatedAt: new Date() }).where(and(eq(serviceOrderPayments.id, reservedPaymentId), eq(serviceOrderPayments.status, "VERIFYING"))).catch(() => undefined);
    console.error("[Service Payment Slip]", error);
    return json({ success: false, error: "Payment upload could not be completed." }, 503);
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ orderId: string }> }) {
  try {
    if (!isSameOrigin(request)) return json({ success: false, error: "Forbidden." }, 403);
    const { orderId } = await context.params;
    const subject = await resolveServiceActor(request);
    const order = await db.query.serviceOrders.findFirst({ where: eq(serviceOrders.id, orderId), columns: { id: true, customerUserId: true, actorHash: true, paymentStatus: true, erpPaymentSyncStatus: true, updatedAt: true } });
    if (!order) return json({ success: false, error: "Service order not found." }, 404);
    const authorized = subject.actor.userId ? order.customerUserId === subject.actor.userId : order.customerUserId === null && order.actorHash === subject.actor.actorHash;
    if (!authorized) return json({ success: false, error: "Unauthorized." }, 401);
    const rate = await enforcePortalRateLimit({ namespace: "service-payment-status", identity: `${order.id}:${subject.actor.actorHash}`, limit: 30, windowSeconds: 60 });
    if (!rate.allowed) return json({ success: false, error: "Too many requests." }, 429);
    const payment = await db.query.serviceOrderPayments.findFirst({ where: eq(serviceOrderPayments.serviceOrderId, order.id), columns: { status: true, erpSyncStatus: true, verifiedAt: true, updatedAt: true } });
    return json({ success: true, orderId: order.id, paymentStatus: order.paymentStatus, erpSyncStatus: order.erpPaymentSyncStatus, slipStatus: payment?.status || null, paymentErpSyncStatus: payment?.erpSyncStatus || null, verifiedAt: payment?.verifiedAt || null, updatedAt: payment?.updatedAt || order.updatedAt });
  } catch (error) {
    console.error("[Service Payment Status]", error);
    return json({ success: false, error: "Payment status is temporarily unavailable." }, 503);
  }
}
