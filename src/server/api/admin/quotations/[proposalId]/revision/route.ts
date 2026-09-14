import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";

import { requireStaff } from "@/lib/auth-guard";
import { frappeRequest } from "@/lib/erpnext";
import { db } from "@/db";
import { activityLogs, paymentRequests, proposals } from "@/db/schema";
import type { BoqLine } from "@/types/boq";
import { createProposalRevision } from "@/lib/proposal-revisions";


function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function number(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }

export async function POST(_request: NextRequest, context: { params: Promise<{ proposalId: string }> }) {
  try {
    const actor = await requireStaff();
    const { proposalId } = await context.params;
    const proposal = await db.query.proposals.findFirst({ where: eq(proposals.id, proposalId) });
    if (!proposal?.erpnextQuotationId) return NextResponse.json({ error: "No active ERPNext quotation is available to revise." }, { status: 409 });
    const paymentInProgress = await db.query.paymentRequests.findFirst({
      where: and(
        eq(paymentRequests.proposalId, proposal.id),
        inArray(paymentRequests.status, ["AWAITING_VERIFICATION", "PAID"]),
      ),
      columns: { id: true },
    });
    if (["DEPOSIT_PAID", "FULLY_PAID"].includes(proposal.paymentStatus) || paymentInProgress) {
      return NextResponse.json(
        { error: "Quotation revisions are unavailable after payment has been submitted or confirmed." },
        { status: 409 },
      );
    }
    const originalName = proposal.erpnextQuotationId;
    const source = record((await frappeRequest("GET", `/api/resource/Quotation/${encodeURIComponent(originalName)}`)).data).data;
    const document = record(source);
    const docstatus = Number(document.docstatus);
    if (!Number.isInteger(docstatus)) {
      return NextResponse.json(
        { error: `ERPNext quotation ${originalName} returned an invalid document status.` },
        { status: 502 },
      );
    }
    const lines: BoqLine[] = (Array.isArray(document.items) ? document.items : []).map((raw, index) => {
      const item = record(raw);
      return { id: `revision-${index}-${text(item.item_code)}`, source: "BUNDLE" as const, itemCode: text(item.item_code), itemName: text(item.item_name) || text(item.item_code), description: text(item.description) || null, qty: number(item.qty), uom: text(item.uom) || "Nos", rate: number(item.rate), warehouse: text(item.warehouse) || null };
    }).filter((line) => line.itemCode && line.qty > 0);
    if (docstatus === 1) {
      await frappeRequest("POST", "/api/method/frappe.client.cancel", { doctype: "Quotation", name: originalName });
    } else if (docstatus !== 0) {
      return NextResponse.json(
        { error: `ERPNext quotation ${originalName} cannot be revised because it is already cancelled or in an unsupported state.` },
        { status: 409 },
      );
    }

    const reusesExistingDraft = docstatus === 0;
    const config = record(proposal.configurationData);
    const startedAt = new Date().toISOString();
    const nextConfiguration = {
          ...config,
          customerApproval: {
            ...record(config.customerApproval),
            status: proposal.status.toUpperCase() === "REVISION_REQUESTED" ? "REVISION_IN_PROGRESS" : record(config.customerApproval).status,
            revisionStartedAt: startedAt,
          },
          revisionDraft: { amendedFrom: originalName, lines, startedAt },
          revisionHistory: [
            ...(Array.isArray(config.revisionHistory) ? config.revisionHistory : []),
            reusesExistingDraft
              ? { name: originalName, status: "DRAFT_REOPENED", startedAt }
              : { name: originalName, status: "CANCELLED", cancelledAt: startedAt },
          ],
        };
    await createProposalRevision({
      proposalId: proposal.id,
      snapshots: {
        pricing: { totalPrice: proposal.totalPrice, monthlySavings: proposal.monthlySavings, paybackPeriod: proposal.paybackPeriod },
        configuration: nextConfiguration,
        terms: record(config.terms),
        payment: { paymentStatus: proposal.paymentStatus, selectedFinancingId: proposal.selectedFinancingId },
      },
      items: lines.map((line, index) => ({
        lineNumber: index + 1,
        itemCode: line.itemCode,
        pricing: { quantity: line.qty, unitPrice: line.rate, unitOfMeasure: line.uom },
        configuration: { source: line.source, warehouse: line.warehouse, description: line.description },
      })),
      erpQuotationReference: reusesExistingDraft ? originalName : null,
      createdByUserId: actor.id,
      creationSource: "ADMIN_QUOTATION_REVISION",
      creationMetadata: { amendedFrom: originalName },
    });
    await db.insert(activityLogs).values({
        entityId: proposal.id,
        entityType: "QUOTATION",
        action: "REVISION_STARTED",
        description: reusesExistingDraft
          ? `Reopened ERPNext draft quotation ${originalName} for revision.`
          : `Cancelled ERPNext quotation ${originalName} and opened an amendment draft.`,
        userId: actor.id,
      });
    return NextResponse.json({ success: true, amendedFrom: originalName, lines, reusesExistingDraft });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to start quotation revision." }, { status: 400 });
  }
}
