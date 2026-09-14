import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { eq, or } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { proposals, systemSettingsKeyValue } from "@/db/schema";
import { enqueueIntegrationEvent } from "@/lib/integrationOutbox";
import { processOutboxBestEffort } from "@/lib/outboxProcessor";
import { publishPortalStateChanged } from "@/lib/portalEvents";
import { closeProposalPortalTokens } from "@/lib/portalTokens";
import { timingSafeStringEqual } from "@/lib/secretAuth";
import { validateUploadContentLength } from "@/lib/fileValidation";
import { readBoundedRequestBody } from "@/lib/webhookBody";

const MAX_WEBHOOK_BYTES = 64 * 1024;

const payloadSchema = z.object({
  proposalId: z.string().trim().min(1).max(128).optional(),
  erpnextQuotationId: z.string().trim().min(1).max(255).optional(),
  status: z.string().trim().min(1).max(80),
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

export async function POST(request: NextRequest) {
  try {
    const contentLength = validateUploadContentLength(request.headers, MAX_WEBHOOK_BYTES);
    if (!contentLength.ok) {
      return NextResponse.json({ success: false, error: contentLength.error }, { status: contentLength.status });
    }
    const rawBody = await readBoundedRequestBody(request, MAX_WEBHOOK_BYTES, contentLength.value);
    const secret = await getWebhookSecret();
    const received = request.headers.get("x-solardream-signature")?.replace(/^sha256=/i, "") || "";
    const expected = secret ? createHmac("sha256", secret).update(rawBody).digest("hex") : "";
    if (!secret || !timingSafeStringEqual(received, expected)) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const payload = payloadSchema.parse(JSON.parse(rawBody) as unknown);
    const normalizedStatus = payload.status.toUpperCase();
    if (!["CLOSED", "COMPLETED", "COMPLETE"].includes(normalizedStatus)) {
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
    await processOutboxBestEffort(proposal.id);
    await publishPortalStateChanged(proposal.id, "ERP_LIFECYCLE_CLOSED");
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("[ERPNext Lifecycle Webhook]", error);
    return NextResponse.json({ success: false, error: "Lifecycle update failed." }, { status: 400 });
  }
}
