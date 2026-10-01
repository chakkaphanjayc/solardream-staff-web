import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { sqlArray } from "@/db/sql";
import {
  integrationOutbox,
  paymentRequests,
  proposals,
  quotationDocumentRequests,
  serviceOrderPayments,
  serviceOrders,
  users,
} from "@/db/schema";
import { frappeRequest } from "@/lib/erpnext";
import { normalizeUserConsentPreferences } from "@/lib/consentPreferences";
import {
  deleteListmonkSubscriber,
  syncListmonkSubscriber,
} from "@/lib/listmonk";
import { publishPortalStateChanged } from "@/lib/portalEvents";
import { LISTMONK_SUBSCRIBER_SYNC_TOPIC } from "@/lib/userConsent";
import { createAdminClient } from "@/utils/supabase/server";
import {
  SERVICE_PAYMENT_VERIFIED_TOPIC,
  SERVICE_QUOTE_REQUESTED_TOPIC,
  syncRequestedServiceQuote,
  syncVerifiedServicePayment,
} from "@/lib/serviceErpPayment";
import {
  deliverServicePortalEmail,
  SERVICE_PORTAL_EMAIL_TOPIC,
} from "@/lib/servicePortal";
import { deliverSalesNotificationEvent } from "@/lib/salesNotificationDelivery";
import {
  advanceProjectPaymentPhase,
  dispatchVerifiedPaymentNotifications,
} from "@/lib/services/payment-verifier";
import { createInstallationProjectFromPayment } from "@/server/services/sales/payment-project-service";
import { syncMilestonePaymentToERP } from "@/lib/erpnextPayments";
import {
  PAYMENT_ERP_SYNC_TOPIC,
  PAYMENT_NOTIFICATION_TOPIC,
} from "@/lib/paymentTopics";
import {
  deliverInstallationErpnextEvent,
  INSTALLATION_ERPNEXT_TOPICS,
  isInstallationErpnextSyncEnabled,
} from "@/lib/installationErpnextSync";
import {
  deliverServiceCaseErpnextEvent,
  SERVICE_CASE_ERPNEXT_TOPICS,
} from "@/lib/serviceCaseErpnextSync";

const MAX_ATTEMPTS = 8;
export const PRIVACY_PROVIDER_CLEANUP_TOPIC = "privacy.provider.cleanup";
export const PRIVACY_AUTH_CLEANUP_TOPIC = "privacy.auth.cleanup";
type ClaimedEvent = typeof integrationOutbox.$inferSelect;
type DeliveryHandler = (event: ClaimedEvent) => Promise<void>;

type RawOutboxRow = Record<string, unknown>;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function asDate(value: unknown) {
  if (value instanceof Date) return value;
  return new Date(String(value));
}

function mapRawOutboxRow(row: RawOutboxRow): ClaimedEvent {
  return {
    id: String(row.id),
    topic: String(row.topic),
    eventVersion: Number(row.event_version),
    aggregateType: String(row.aggregate_type),
    aggregateId: String(row.aggregate_id),
    correlationId: row.correlation_id == null ? null : String(row.correlation_id),
    payload: row.payload as ClaimedEvent["payload"],
    dedupeKey: row.dedupe_key == null ? null : String(row.dedupe_key),
    status: String(row.status),
    availableAt: asDate(row.available_at),
    attempts: Number(row.attempts),
    lastError: row.last_error == null ? null : String(row.last_error),
    providerReference: row.provider_reference == null ? null : String(row.provider_reference),
    processedAt: row.processed_at == null ? null : asDate(row.processed_at),
    deadAt: row.dead_at == null ? null : asDate(row.dead_at),
    createdAt: asDate(row.created_at),
    updatedAt: asDate(row.updated_at),
  };
}

async function claimEvents(
  limit: number,
  aggregateId?: string,
  topics?: readonly string[],
): Promise<ClaimedEvent[]> {
  const configuredLease = Number(process.env.OUTBOX_PROCESSING_LEASE_SECONDS);
  const processingLeaseSeconds =
    Number.isInteger(configuredLease) &&
    configuredLease >= 300 &&
    configuredLease <= 3600
      ? configuredLease
      : 600;
  // Installation events are intentionally retained until ERPNext sync is
  // explicitly enabled. This keeps local-first field operations durable and
  // prevents a disabled integration from consuming the outbox.
  const installationTopicFilter = isInstallationErpnextSyncEnabled()
    ? sql``
    : sql`AND current_event.topic NOT LIKE 'installation.%' AND current_event.topic NOT LIKE 'service.case.%' AND current_event.topic NOT LIKE 'service.visit.%'`;
  const installationOrderingFilter = isInstallationErpnextSyncEnabled()
    ? sql`
        AND (
          current_event.topic NOT LIKE 'installation.%'
          OR NOT EXISTS (
            SELECT 1
            FROM integration_outbox AS previous_event
            WHERE previous_event.aggregate_id = current_event.aggregate_id
              AND previous_event.topic LIKE 'installation.%'
              AND (
                previous_event.created_at < current_event.created_at
                OR (previous_event.created_at = current_event.created_at AND previous_event.id < current_event.id)
              )
              AND previous_event.status <> 'PROCESSED'
          )
        )
      `
    : sql``;
  const topicFilter = topics && topics.length > 0
    ? sql`AND (${sql.join(topics.map((topic) => sql`current_event.topic = ${topic}`), sql` OR `)})`
    : sql``;
  return db.transaction(async (tx) => {
    const rows = await tx.execute<ClaimedEvent>(sql`
      SELECT current_event.* FROM integration_outbox AS current_event
      WHERE (
        (current_event.status IN ('PENDING', 'RETRY') AND current_event.available_at <= now())
        OR (current_event.status = 'PROCESSING' AND current_event.updated_at <= now() - (${processingLeaseSeconds} * interval '1 second'))
      )
        ${installationTopicFilter}
        ${installationOrderingFilter}
        ${topicFilter}
        ${aggregateId ? sql`AND current_event.aggregate_id = ${aggregateId}` : sql``}
      ORDER BY current_event.created_at, current_event.id
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    `);
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);
    await tx.execute(sql`
      UPDATE integration_outbox
      SET status = 'PROCESSING', attempts = attempts + 1, updated_at = now()
      WHERE id = ANY(${sqlArray(ids, "uuid")})
    `);
    return rows.map((row) => {
      const event = mapRawOutboxRow(row);
      event.attempts += 1;
      return event;
    });
  });
}

async function ensureErpComment(input: {
  event: ClaimedEvent;
  erpnextQuotationId: string;
  payload: Record<string, unknown>;
}) {
  const eventMarker = `[SolarDream-Event:${input.event.id}]`;
  const fields = encodeURIComponent(JSON.stringify(["name"]));
  const filters = encodeURIComponent(
    JSON.stringify([
    ["Comment", "reference_doctype", "=", "Quotation"],
    ["Comment", "reference_name", "=", input.erpnextQuotationId],
    ["Comment", "content", "like", `%${eventMarker}%`],
    ]),
  );
  const existing = await frappeRequest(
    "GET",
    `/api/resource/Comment?fields=${fields}&filters=${filters}&limit_page_length=1`,
  );
  const existingRows = asRecord(existing.data).data;
  if (Array.isArray(existingRows) && existingRows.length > 0) return;

  await frappeRequest("POST", "/api/resource/Comment", {
    data: {
      comment_type: "Info",
      reference_doctype: "Quotation",
      reference_name: input.erpnextQuotationId,
      content: `${eventMarker}\n${JSON.stringify({
        eventId: input.event.id,
        idempotencyKey: input.event.dedupeKey || input.event.id,
        eventType: input.event.topic,
        occurredAt: input.event.createdAt,
        ...input.payload,
      })}`,
    },
  });
}

async function deliverPaymentReceived(event: ClaimedEvent) {
  const eventPayload = asRecord(event.payload);
  const paymentRequestId = getText(eventPayload.paymentRequestId);
  const [proposal, paymentRequest] = await Promise.all([
    db.query.proposals.findFirst({
      where: eq(proposals.id, event.aggregateId),
      columns: { id: true, erpnextQuotationId: true },
    }),
    db.query.paymentRequests.findFirst({
      where: and(
        eq(paymentRequests.id, paymentRequestId || "__missing__"),
        eq(paymentRequests.proposalId, event.aggregateId),
      ),
    }),
  ]);
  if (!proposal?.erpnextQuotationId || !paymentRequest) {
    throw new Error(
      "Payment outbox event is missing a bound ERP quotation or payment request.",
    );
  }
  const slipMetadata = asRecord(paymentRequest.easySlipData);
  await ensureErpComment({
    event,
    erpnextQuotationId: proposal.erpnextQuotationId,
    payload: {
      proposalId: proposal.id,
      erpnextQuotationId: proposal.erpnextQuotationId,
      paymentRequestId: paymentRequest.id,
      title: paymentRequest.title,
      amount: String(paymentRequest.amountRequested),
      status: paymentRequest.status,
      verificationStatus: getText(slipMetadata.verificationStatus) || null,
      transactionReference:
        getText(asRecord(asRecord(slipMetadata.data).rawSlip).transRef) || null,
      storageProvider: paymentRequest.storageProvider,
    },
  });
}

async function deliverPaymentCompleted(event: ClaimedEvent) {
  const payload = asRecord(event.payload);
  const proposalId = getText(payload.proposalId) || event.aggregateId;
  const paymentEventKey = event.dedupeKey || event.id;
  if (!proposalId)
    throw new Error("Payment completion event is missing its proposal ID.");

  const paidAtText = getText(payload.paidAt);
  const paidAt = paidAtText ? new Date(paidAtText) : null;
  if (paidAt && Number.isNaN(paidAt.getTime())) {
    throw new Error(
      "Payment completion event contains an invalid payment date.",
    );
  }

  await createInstallationProjectFromPayment({
    proposalId,
    paymentEventKey,
    paymentId: getText(payload.paymentId) || null,
    paidAt,
  });
}

async function deliverDocumentVerified(event: ClaimedEvent) {
  const eventPayload = asRecord(event.payload);
  const documentRequestId = getText(eventPayload.documentRequestId);
  const [proposal, documentRequest] = await Promise.all([
    db.query.proposals.findFirst({
      where: eq(proposals.id, event.aggregateId),
      columns: { id: true, erpnextQuotationId: true },
    }),
    db.query.quotationDocumentRequests.findFirst({
      where: and(
        eq(quotationDocumentRequests.id, documentRequestId || "__missing__"),
        eq(quotationDocumentRequests.quotationId, event.aggregateId),
      ),
    }),
  ]);
  if (!proposal?.erpnextQuotationId || !documentRequest) {
    throw new Error(
      "Document outbox event is missing a bound ERP quotation or document request.",
    );
  }
  await ensureErpComment({
    event,
    erpnextQuotationId: proposal.erpnextQuotationId,
    payload: {
      proposalId: proposal.id,
      erpnextQuotationId: proposal.erpnextQuotationId,
      documentRequestId: documentRequest.id,
      documentName: documentRequest.documentName,
      requestType: documentRequest.requestType,
      status: documentRequest.status,
      storageProvider: documentRequest.storageProvider,
      hasStoredFile: Boolean(documentRequest.storageFileId),
    },
  });
}

async function deliverListmonkSubscriberSync(event: ClaimedEvent) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, event.aggregateId),
    columns: {
      id: true,
      email: true,
      name: true,
      fullName: true,
      consentPreferences: true,
      listmonkSubscriberId: true,
      lineUserId: true,
      preferredLanguage: true,
      isActive: true,
      anonymizedAt: true,
      deletionRequestedAt: true,
    },
  });
  if (!user)
    throw new Error("Listmonk outbox event references a missing user.");
  // A consent sync may already be queued when account deletion anonymizes the
  // user. Treat it as obsolete so it cannot recreate the subscriber after the
  // privacy cleanup event removes the original provider record.
  if (!user.isActive || user.anonymizedAt || user.deletionRequestedAt) return;

  const subscriberId = await syncListmonkSubscriber({
    userId: user.id,
    email: user.email,
    name: user.fullName || user.name || "SolarDream Member",
    preferences: normalizeUserConsentPreferences(user.consentPreferences),
    storedSubscriberId: user.listmonkSubscriberId,
    lineUserId: user.lineUserId,
    preferredLanguage: user.preferredLanguage === "en" ? "en" : "th",
  });
  if (subscriberId !== user.listmonkSubscriberId) {
    await db
      .update(users)
      .set({ listmonkSubscriberId: subscriberId })
      .where(eq(users.id, user.id));
  }
}

async function deliverPrivacyProviderCleanup(event: ClaimedEvent) {
  const subscriberId = getText(asRecord(event.payload).listmonkSubscriberId);
  if (subscriberId) await deleteListmonkSubscriber(subscriberId);
}

async function deliverPrivacyAuthCleanup(event: ClaimedEvent) {
  const authUserId = getText(asRecord(event.payload).authUserId);
  if (!authUserId)
    throw new Error("Privacy auth cleanup is missing the auth user ID.");
  const { error } = await createAdminClient().auth.admin.deleteUser(authUserId);
  if (error && error.code !== "user_not_found") throw error;
}

async function deliverPaymentErpSync(event: ClaimedEvent) {
  const payload = asRecord(event.payload);
  const milestoneId = getText(payload.milestoneId);
  const transRef = getText(payload.transRef);
  if (!milestoneId || !transRef)
    throw new Error(
      "Payment ERP sync event is missing its milestone ID or transaction reference.",
    );
  await syncMilestonePaymentToERP(milestoneId, transRef);
  await advanceProjectPaymentPhase({
    quotationId: event.aggregateId,
    milestoneIndex: Number(payload.milestoneIndex || 1),
  });
}

async function deliverPaymentNotifications(event: ClaimedEvent) {
  const verifiedSlipId = getText(asRecord(event.payload).verifiedSlipId);
  if (!verifiedSlipId)
    throw new Error(
      "Payment notification event is missing its verified slip ID.",
    );
  await dispatchVerifiedPaymentNotifications({
    quotationId: event.aggregateId,
    verifiedSlipId,
  });
}

async function deliverEvent(event: ClaimedEvent) {
  if (event.topic === "catalog.sync.requested") {
    const { synchronizeCatalog } =
      await import("@/server/services/sales/catalog/sync/catalog-sync-worker");
    return synchronizeCatalog(event.correlationId ?? event.id);
  }
  if (
    INSTALLATION_ERPNEXT_TOPICS.includes(
      event.topic as (typeof INSTALLATION_ERPNEXT_TOPICS)[number],
    )
  ) {
    return deliverInstallationErpnextEvent(event);
  }
  if (event.topic.startsWith("sales."))
    return deliverSalesNotificationEvent(event);
  if (event.topic === "payment.completed")
    return deliverPaymentCompleted(event);
  if (event.topic === "payment.received") return deliverPaymentReceived(event);
  if (
    SERVICE_CASE_ERPNEXT_TOPICS.includes(
      event.topic as (typeof SERVICE_CASE_ERPNEXT_TOPICS)[number],
    )
  )
    return deliverServiceCaseErpnextEvent(event);
  if (event.topic === PAYMENT_ERP_SYNC_TOPIC)
    return deliverPaymentErpSync(event);
  if (event.topic === PAYMENT_NOTIFICATION_TOPIC)
    return deliverPaymentNotifications(event);
  if (event.topic === "document.verified")
    return deliverDocumentVerified(event);
  if (event.topic === "documents.render.requested") {
    const { deliverDocumentWorkerEvent } =
      await import("@/server/services/workers/documents/document-worker");
    await deliverDocumentWorkerEvent(event);
    return;
  }
  if (event.topic === "communications.notification.requested") {
    const { deliverCommunicationNotification } =
      await import("@/server/services/workers/communications/notification-worker");
    await deliverCommunicationNotification(event);
    return;
  }
  if (event.topic === "erp.lifecycle.closed") return;
  if (event.topic === LISTMONK_SUBSCRIBER_SYNC_TOPIC)
    return deliverListmonkSubscriberSync(event);
  if (event.topic === PRIVACY_PROVIDER_CLEANUP_TOPIC)
    return deliverPrivacyProviderCleanup(event);
  if (event.topic === PRIVACY_AUTH_CLEANUP_TOPIC)
    return deliverPrivacyAuthCleanup(event);
  // Drain legacy pre-payment service events without mutating ERP. New ERP
  // processing starts only from a verified service payment event.
  if (event.topic === "erp.service_order.created") return;
  if (event.topic === SERVICE_PAYMENT_VERIFIED_TOPIC)
    return syncVerifiedServicePayment(event.aggregateId);
  if (event.topic === SERVICE_QUOTE_REQUESTED_TOPIC)
    return syncRequestedServiceQuote(event.aggregateId);
  if (event.topic === SERVICE_PORTAL_EMAIL_TOPIC) {
    const deliveryId = getText(asRecord(event.payload).deliveryId);
    if (!deliveryId)
      throw new Error("Service portal email event is missing its delivery ID.");
    return deliverServicePortalEmail(deliveryId);
  }
  throw new Error(`Unsupported integration outbox topic: ${event.topic}`);
}

export async function evaluateOutboxDelivery(
  event: ClaimedEvent,
  handler: DeliveryHandler,
  now = new Date(),
) {
  try {
    await handler(event);
    return {
      status: "PROCESSED" as const,
      processedAt: now,
      lastError: null,
      availableAt: event.availableAt,
      deadAt: null,
    };
  } catch (error: unknown) {
    const dead = event.attempts >= MAX_ATTEMPTS;
    const retrySeconds = Math.min(
      3600,
      15 * 2 ** Math.max(0, event.attempts - 1),
    );
    return {
      status: dead ? ("DEAD" as const) : ("RETRY" as const),
      processedAt: null,
      lastError:
        error instanceof Error
          ? error.message.slice(0, 2000)
          : "Unknown delivery error",
      availableAt: new Date(now.getTime() + retrySeconds * 1000),
      deadAt: dead ? now : null,
    };
  }
}

export async function processIntegrationOutbox(
  input: { limit?: number; aggregateId?: string; topics?: readonly string[] } = {},
) {
  const events = await claimEvents(
    Math.min(Math.max(input.limit || 20, 1), 100),
    input.aggregateId,
    input.topics,
  );
  let processed = 0;
  let failed = 0;
  for (const event of events) {
    const transition = await evaluateOutboxDelivery(event, deliverEvent);
    await db
      .update(integrationOutbox)
      .set({ ...transition, updatedAt: new Date() })
      .where(eq(integrationOutbox.id, event.id));
    if (
      transition.status === "DEAD" &&
      event.topic === SERVICE_PAYMENT_VERIFIED_TOPIC
    ) {
      const terminalError =
        transition.lastError ||
        "ERP service payment processing exhausted its retry limit.";
      await Promise.all([
        db
          .update(serviceOrders)
          .set({
            erpPaymentSyncStatus: "FAILED",
            erpPaymentSyncError: terminalError,
            updatedAt: new Date(),
          })
          .where(eq(serviceOrders.id, event.aggregateId)),
        db
          .update(serviceOrderPayments)
          .set({
            erpSyncStatus: "BLOCKED",
            erpSyncError: terminalError,
            updatedAt: new Date(),
          })
          .where(eq(serviceOrderPayments.serviceOrderId, event.aggregateId)),
      ]);
    }
    if (transition.status === "PROCESSED") {
      if (
        !event.topic.startsWith("sales.") &&
        event.topic !== LISTMONK_SUBSCRIBER_SYNC_TOPIC &&
        event.topic !== PRIVACY_PROVIDER_CLEANUP_TOPIC &&
        event.topic !== PRIVACY_AUTH_CLEANUP_TOPIC &&
        event.topic !== "erp.service_order.created" &&
        event.topic !== "service.case.created" &&
        event.topic !== "service.case.updated" &&
        event.topic !== SERVICE_PAYMENT_VERIFIED_TOPIC &&
        event.topic !== SERVICE_QUOTE_REQUESTED_TOPIC &&
        event.topic !== SERVICE_PORTAL_EMAIL_TOPIC &&
        !event.topic.startsWith("communications.") &&
        !event.topic.startsWith("documents.")
      ) {
        await publishPortalStateChanged(event.aggregateId, event.topic);
      }
      processed += 1;
    } else {
      failed += 1;
    }
  }
  return { claimed: events.length, processed, failed };
}

export async function processOutboxBestEffort(aggregateId: string) {
  try {
    await processIntegrationOutbox({ limit: 5, aggregateId });
  } catch (error: unknown) {
    console.warn("[Integration Outbox] Immediate processing failed:", error);
  }
}
