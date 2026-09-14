import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { proposals } from "@/db/schema";
import { eq } from "drizzle-orm";
import { mapErpnextQuotationStatus } from "@/lib/erpnextStatus";
import { isRequestContentLengthExceeded } from "@/lib/requestSize";
import { hasValidHeaderSecret } from "@/lib/secretAuth";


const MAX_CRM_WEBHOOK_BODY_BYTES = 64 * 1024;

function parseNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export async function POST(req: NextRequest) {
  try {
    const expectedSecret = process.env.ERPNEXT_WEBHOOK_SECRET;
    if (!expectedSecret) {
      return NextResponse.json(
        { success: false, error: "ERPNext webhook secret is not configured." },
        { status: 503 },
      );
    }

    const receivedSecret = req.headers.get("x-solardream-webhook-secret");
    if (!hasValidHeaderSecret(receivedSecret, expectedSecret)) {
      return NextResponse.json({ success: false, error: "Invalid webhook secret" }, { status: 401 });
    }

    if (isRequestContentLengthExceeded(req.headers, MAX_CRM_WEBHOOK_BODY_BYTES)) {
      return NextResponse.json(
        { success: false, error: "Webhook payload is too large." },
        { status: 413 },
      );
    }

    const payload = await req.json().catch(() => null) as {
      quotation_id?: unknown;
      status?: unknown;
      grand_total?: unknown;
    } | null;

    const quotationId = typeof payload?.quotation_id === "string" ? payload.quotation_id.trim() : "";
    if (!quotationId) {
      return NextResponse.json({ success: false, error: "Missing quotation_id" }, { status: 400 });
    }

    const proposal = await db.query.proposals.findFirst({
      where: eq(proposals.erpnextQuotationId, quotationId),
    });

    if (!proposal) {
      return NextResponse.json({ success: false, error: "Proposal not found for quotation_id" }, { status: 404 });
    }

    const localStatus = mapErpnextQuotationStatus(payload?.status);
    const grandTotal = parseNumber(payload?.grand_total);
    const config = (proposal.configurationData as Record<string, unknown>) || {};
    const history = Array.isArray(config.erpnextWebhookHistory) ? config.erpnextWebhookHistory : [];

    const [updatedProposal] = await db.update(proposals)
      .set({
        status: localStatus,
        ...(grandTotal !== null ? { totalPrice: grandTotal } : {}),
        configurationData: {
          ...config,
          erpnextWebhookHistory: [
            ...history,
            {
              quotationId,
              erpnextStatus: payload?.status || null,
              mappedStatus: localStatus,
              grandTotal,
              receivedAt: new Date().toISOString(),
            },
          ],
        },
      })
      .where(eq(proposals.id, proposal.id))
      .returning();

    return NextResponse.json({
      success: true,
      proposalId: updatedProposal.id,
      status: updatedProposal.status,
    });
  } catch (error: unknown) {
    console.error("[CRM ERPNext Webhook]:", error);
    return NextResponse.json(
      { success: false, error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
