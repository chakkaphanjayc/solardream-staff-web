import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { eq, or } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { proposals, systemSettingsKeyValue } from "@/db/schema";
import { enqueueIntegrationEvent } from "@/lib/integrationOutbox";
import { processOutboxBestEffort } from "@/lib/outboxProcessor";
import { publishPortalStateChanged } from "@/lib/portalEvents";
import { closeProposalPortalTokens } from "@/lib/portalTokens";
import { validateUploadContentLength } from "@/lib/fileValidation";
import { readBoundedRequestBody } from "@/lib/webhookBody";
import { DatabaseWebhookReplayStore } from "@/server/services/integrations/database-webhook-replay-store";
import { hashWebhookBody, verifyRawWebhookSignature, verifyWebhook } from "@/server/services/integrations/webhook-verifier";

const MAX_WEBHOOK_BYTES = 64 * 1024;

const payloadSchema = z.object({
  proposalId: z.string().trim().min(1).max(128).optional(),
  erpnextQuotationId: z.string().trim().min(1).max(255).optional(),
  status: z.string().trim().min(1).max(80),
  eventId: z.string().trim().min(8).max(160).optional(),
  occurredAt: z.string().datetime().optional(),
}).refine((value) => value.proposalId || value.erpnextQuotationId);

async function getWebhookSecret() {
  const environment = process.env.ERP_LIFECYCLE_WEBHOOK_SECRET?.trim();
  if (environment && environment.length >= 32) return environment;
  const setting = await db.query.systemSettingsKeyValue.findFirst({
    where: eq(systemSettingsKeyValue.key, "erp_lifecycle_webhook_secret"),
    columns: { value: true },
  });
  const value = setting?.value.trim();
  return value && value.length >= 32 ? value : null;
}

function eventIdFromBody(value: unknown, rawBody: Uint8Array) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const eventId = (value as Record<string, unknown>).eventId;
    if (typeof eventId === "string" && eventId.trim()) return eventId.trim();
  }
  return `legacy-${createHash("sha256").update(rawBody).digest("hex")}`;
}

export async function POST(request: NextRequest) {
  try {
    const contentLength = validateUploadContentLength(request.headers, MAX_WEBHOOK_BYTES);
    if (!contentLength.ok) {
      return NextResponse.json({ success: false, error: contentLength.error }, { status: contentLength.status });
    }
    const rawBody = await readBoundedRequestBody(request, MAX_WEBHOOK_BYTES, contentLength.value);
    const secret = await getWebhookSecret();
    const rawBytes = Buffer.from(rawBody, "utf8");
    const parsedBody: unknown = JSON.parse(rawBody);
    const payload = payloadSchema.parse(parsedBody);
    if (payload.occurredAt && Math.abs(Date.now() - Date.parse(payload.occurredAt)) > 10 * 60_000) {
      return NextResponse.json({ success: false, error: "Stale event." }, { status: 409 });
    }
    const payloadEventId = payload.eventId || null;
    const eventId = request.headers.get("x-solardream-event-id")?.trim()
      || (typeof payloadEventId === "string" ? payloadEventId.trim() : "")
      || eventIdFromBody(parsedBody, rawBytes);
    const replayStore = new DatabaseWebhookReplayStore("erpnext-lifecycle");
    let replayed = false;
    try {
      const timestamp = request.headers.get("x-solardream-timestamp")?.trim() || "";
      const signature = request.headers.get("x-solardream-signature") || "";
      if (!secret) throw new Error("Webhook secret is not configured.");
      if (timestamp) {
        replayed = (await verifyWebhook({ rawBody: rawBytes, signature, timestamp, eventId, secret }, replayStore)).replayed;
      } else {
        verifyRawWebhookSignature({ rawBody: rawBytes, signature, secret });
        const claim = await replayStore.claim(eventId, hashWebhookBody(rawBytes));
        if (claim === "CONFLICT") throw new Error("Webhook event ID was reused with a different payload.");
        replayed = claim === "REPLAY";
      }
    } catch {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    if (replayed) return NextResponse.json({ success: true, replayed: true });
    const normalizedStatus = payload.status.toUpperCase();
    if (!["CLOSED", "COMPLETED", "COMPLETE"].includes(normalizedStatus)) {
      await replayStore.complete(eventId, hashWebhookBody(rawBytes));
      return NextResponse.json({ success: true, ignored: true });
    }
    const proposal = await db.query.proposals.findFirst({
      where: or(
        eq(proposals.id, payload.proposalId || "__none__"),
        eq(proposals.erpnextQuotationId, payload.erpnextQuotationId || "__none__"),
      ),
    });
    if (!proposal) return NextResponse.json({ success: false, error: "Proposal not found." }, { status: 404 });

    await db.transaction(async (tx) => {
      await tx.update(proposals).set({
        status: "COMPLETED",
        projectStatus: "COMPLETED",
        updatedAt: new Date(),
      }).where(eq(proposals.id, proposal.id));
      await closeProposalPortalTokens(proposal.id, tx);
      await enqueueIntegrationEvent(tx, {
        topic: "erp.lifecycle.closed",
        aggregateType: "PROPOSAL",
        aggregateId: proposal.id,
        payload: { status: normalizedStatus, erpnextQuotationId: proposal.erpnextQuotationId },
        dedupeKey: `erp.lifecycle.closed:${proposal.id}`,
      });
    });
    await replayStore.complete(eventId, hashWebhookBody(rawBytes));
    await processOutboxBestEffort(proposal.id);
    await publishPortalStateChanged(proposal.id, "ERP_LIFECYCLE_CLOSED");
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("[ERPNext Lifecycle Webhook]", error);
    return NextResponse.json({ success: false, error: "Lifecycle update failed." }, { status: 400 });
  }
}
