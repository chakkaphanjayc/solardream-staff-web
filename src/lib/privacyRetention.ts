import "server-only";

import { createHmac } from "node:crypto";
import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { sqlArray } from "@/db/sql";
import { paymentRequests, proposals, quotationDeliveryDocuments, quotationDocumentRequests, users } from "@/db/schema";
import { anonymizeUserAccount } from "@/lib/privacyAccount";
import { privacyHmac } from "@/lib/privacyConsent";
import { retentionEligibility } from "@/lib/privacyRedaction";

type Candidate = {
  id: string;
  last_activity_at: Date;
  newest_proposal_activity_at: Date | null;
  proposal_statuses: string[] | null;
  has_current_warranty: boolean;
  has_legal_hold: boolean;
};

function positiveInteger(value: string | undefined, fallback: number, max: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

async function archiveReferences(userId: string) {
  const proposalRows = await db.select({ id: proposals.id }).from(proposals).where(eq(proposals.userId, userId));
  const proposalIds = proposalRows.map((row) => row.id);
  const [deliveryDocuments, requestedDocuments, paymentSlips] = proposalIds.length
    ? await Promise.all([
      db.select({ id: quotationDeliveryDocuments.id, proposalId: quotationDeliveryDocuments.quotationId, storageProvider: quotationDeliveryDocuments.storageProvider, storageFileId: quotationDeliveryDocuments.storageFileId }).from(quotationDeliveryDocuments).where(sql`${quotationDeliveryDocuments.quotationId} = ANY(${sqlArray(proposalIds, "text")})`),
      db.select({ id: quotationDocumentRequests.id, proposalId: quotationDocumentRequests.quotationId, storageProvider: quotationDocumentRequests.storageProvider, storageFileId: quotationDocumentRequests.storageFileId }).from(quotationDocumentRequests).where(sql`${quotationDocumentRequests.quotationId} = ANY(${sqlArray(proposalIds, "text")})`),
      db.select({ id: paymentRequests.id, proposalId: paymentRequests.proposalId, storageProvider: paymentRequests.storageProvider, storageFileId: paymentRequests.storageFileId }).from(paymentRequests).where(sql`${paymentRequests.proposalId} = ANY(${sqlArray(proposalIds, "text")})`),
    ])
    : [[], [], []];
  return {
    userReference: privacyHmac(userId, "session"),
    proposalIds,
    attachments: [
      ...deliveryDocuments.map((item) => ({ ...item, kind: "delivery_document" })),
      ...requestedDocuments.map((item) => ({ ...item, kind: "requested_document" })),
      ...paymentSlips.map((item) => ({ ...item, kind: "payment_slip" })),
    ],
  };
}

async function callArchiveWebhook(payload: unknown) {
  const url = process.env.PRIVACY_ARCHIVE_WEBHOOK_URL?.trim();
  if (!url) return;
  const secret = process.env.PRIVACY_ARCHIVE_WEBHOOK_SECRET?.trim();
  if (!secret || secret.length < 24) throw new Error("Privacy archive webhook secret is not configured securely.");
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") throw new Error("Privacy archive webhook must use HTTPS.");
  const body = JSON.stringify(payload);
  const signature = createHmac("sha256", secret).update(body).digest("hex");
  const response = await fetch(parsed, { method: "POST", headers: { "Content-Type": "application/json", "X-SolarDream-Signature": `sha256=${signature}` }, body, cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Privacy archive webhook failed with status ${response.status}.`);
}

export async function processPrivacyRetention(input: { dryRun: boolean }) {
  const years = positiveInteger(process.env.PRIVACY_RETENTION_YEARS, 3, 20);
  const batchSize = positiveInteger(process.env.PRIVACY_RETENTION_BATCH_SIZE, 50, 200);
  const cutoff = new Date();
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - years);
  const autoAnonymize = process.env.PRIVACY_RETENTION_AUTO_ANONYMIZE === "true";
  let guestOrdersRedacted = 0;
  if (!input.dryRun) {
    await db.execute(sql`UPDATE service_quote_sessions SET status='EXPIRED', input_snapshot='{"expired":true}'::jsonb, pricing_snapshot='{"expired":true}'::jsonb WHERE status='ACTIVE' AND expires_at <= now()`);
    const expired = await db.transaction(async (tx) => {
      const rows = await tx.execute<{ id: string }>(sql`
        SELECT so.id
        FROM service_orders so
        WHERE so.customer_user_id IS NULL
          AND so.guest_expires_at <= now()
          AND so.contact_snapshot <> '{"redacted":true}'::jsonb
          AND (
            (so.payment_status = 'UNPAID' AND NOT EXISTS (
              SELECT 1 FROM service_order_payments sop
              WHERE sop.service_order_id = so.id AND sop.status IN ('VERIFYING','VERIFIED')
            ))
            OR (so.payment_status = 'PAID' AND so.erp_payment_sync_status = 'SYNCED')
          )
        FOR UPDATE OF so SKIP LOCKED
        LIMIT 200
      `);
      const ids = rows.map((row) => row.id);
      if (!ids.length) return 0;
      const serviceOrderIds = sqlArray(ids, "uuid");
      await tx.execute(sql`UPDATE service_portal_tokens SET status='CLOSED', closed_at=COALESCE(closed_at, now()) WHERE service_order_id = ANY(${serviceOrderIds}) AND status='ACTIVE'`);
      await tx.execute(sql`UPDATE service_portal_email_deliveries SET encrypted_capability=NULL WHERE token_id IN (SELECT id FROM service_portal_tokens WHERE service_order_id = ANY(${serviceOrderIds}))`);
      await tx.execute(sql`DELETE FROM service_portal_claim_intents WHERE service_order_id = ANY(${serviceOrderIds})`);
      await tx.execute(sql`UPDATE service_quote_sessions SET input_snapshot='{"redacted":true}'::jsonb, pricing_snapshot='{"redacted":true}'::jsonb WHERE id IN (SELECT quote_session_id FROM service_orders WHERE id = ANY(${serviceOrderIds}))`);
      await tx.execute(sql`UPDATE service_requests SET contact_name=NULL, contact_phone=NULL, description='[REDACTED AFTER GUEST RETENTION]', external_system_details='{}'::jsonb, updated_at=now() WHERE service_order_id = ANY(${serviceOrderIds})`);
      await tx.execute(sql`UPDATE service_order_payments SET easyslip_data='{"redacted":true}'::jsonb, updated_at=now() WHERE service_order_id = ANY(${serviceOrderIds})`);
      await tx.execute(sql`
        UPDATE service_orders
        SET contact_snapshot='{"redacted":true}'::jsonb,
            contact_email_digest=NULL,
            service_address=NULL,
            latitude=NULL,
            longitude=NULL,
            location_snapshot='{}'::jsonb,
            customer_notes=NULL,
            erp_payload='{}'::jsonb,
            portal_closed_at=COALESCE(portal_closed_at, now()),
            actor_hash=encode(digest('redacted-actor:' || id::text || ':' || gen_random_uuid()::text, 'sha256'), 'hex'),
            guest_session_hash=encode(digest('redacted-session:' || id::text || ':' || gen_random_uuid()::text, 'sha256'), 'hex'),
            tracking_token_hash=encode(digest(gen_random_uuid()::text, 'sha256'), 'hex'),
            tracking_expires_at=now(),
            updated_at=now()
        WHERE id = ANY(${serviceOrderIds})
      `);
      return ids.length;
    });
    guestOrdersRedacted = expired;
  }
  const rows = await db.execute<Candidate>(sql`
    SELECT u.id, u.last_activity_at,
      MAX(p.updated_at) AS newest_proposal_activity_at,
      COALESCE(array_agg(DISTINCT p.status) FILTER (WHERE p.id IS NOT NULL), ARRAY[]::text[]) AS proposal_statuses,
      EXISTS (SELECT 1 FROM installed_assets ia WHERE ia.customer_id = u.id AND ia.warranty_expiry_date > now()) AS has_current_warranty,
      COALESCE(bool_or(upper(p.status) = 'LEGAL_HOLD'), false) AS has_legal_hold
    FROM "User" u
    LEFT JOIN proposals p ON p.user_id = u.id
    WHERE u.anonymized_at IS NULL
      AND (${autoAnonymize} OR u.retention_review_at IS NULL OR u.last_activity_at > u.retention_review_at)
    GROUP BY u.id
    HAVING GREATEST(u.last_activity_at, COALESCE(MAX(p.updated_at), '-infinity'::timestamptz)) < ${cutoff.toISOString()}
    ORDER BY u.last_activity_at ASC
    LIMIT ${batchSize}
  `);
  let reviewed = 0;
  let anonymized = 0;
  let protectedCount = 0;
  const failures: string[] = [];
  for (const row of rows) {
    const eligibility = retentionEligibility({ lastActivityAt: new Date(row.last_activity_at), newestProposalActivityAt: row.newest_proposal_activity_at ? new Date(row.newest_proposal_activity_at) : null, cutoff, proposalStatuses: row.proposal_statuses || [], hasCurrentWarranty: row.has_current_warranty, hasLegalHold: row.has_legal_hold });
    if (!eligibility.eligibleForReview) continue;
    if (eligibility.protectedRecord) {
      // Do not mark protected records as reviewed: the monthly worker must
      // reconsider them after a warranty, open project, or legal hold ends.
      protectedCount += 1;
      continue;
    }
    if (input.dryRun) continue;
    try {
      await db.update(users).set({ retentionReviewAt: new Date() }).where(eq(users.id, row.id));
      reviewed += 1;
      if (autoAnonymize && eligibility.eligibleForAnonymization) {
        await callArchiveWebhook({ event: "privacy.retention.archive", createdAt: new Date().toISOString(), ...(await archiveReferences(row.id)) });
        await anonymizeUserAccount({ userId: row.id, ipHash: privacyHmac("privacy-retention-cron", "ip"), userAgentHash: null, source: "retention" });
        anonymized += 1;
      }
    } catch (error) {
      failures.push(`${row.id}:${error instanceof Error ? error.message : "unknown error"}`.slice(0, 300));
    }
  }
  return { dryRun: input.dryRun, cutoff: cutoff.toISOString(), years, candidates: rows.length, reviewed, protected: protectedCount, anonymized, guestOrdersRedacted, autoAnonymize, failures };
}
