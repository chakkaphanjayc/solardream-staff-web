import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { requireStaff } from "@/lib/auth-guard";
import { db } from "@/db";
import { activityLogs, proposals } from "@/db/schema";
import { buildErpnextQuotationPayload, calculateBoqTotals, createErpnextBoqQuotation } from "@/lib/erpnextBoq";


const boqLineSchema = z.object({
  id: z.string().trim().min(1).max(200),
  source: z.enum(["BUNDLE", "ADDON"]),
  itemCode: z.string().trim().min(1).max(140),
  itemName: z.string().trim().min(1).max(240),
  description: z.string().trim().max(2000).nullable(),
  qty: z.number().finite().positive().max(100_000),
  uom: z.string().trim().min(1).max(140),
  rate: z.number().finite().min(0).max(100_000_000),
  warehouse: z.string().trim().max(140).nullable(),
});

const createSchema = z.object({
  company: z.string().trim().min(1).max(140),
  currency: z.string().trim().length(3),
  sellingPriceList: z.string().trim().min(1).max(140),
  validTill: z.string().date(),
  remarks: z.string().trim().max(2000).default(""),
  amendedFrom: z.string().trim().min(1).max(140).optional(),
  lines: z.array(boqLineSchema).min(1).max(250),
});

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function POST(request: NextRequest, context: { params: Promise<{ proposalId: string }> }) {
  try {
    const actor = await requireStaff();
    const { proposalId } = await context.params;
    const input = createSchema.parse(await request.json());
    const proposal = await db.query.proposals.findFirst({ where: eq(proposals.id, proposalId) });
    if (!proposal) return NextResponse.json({ error: "Quotation CRM record was not found." }, { status: 404 });
    if (proposal.erpnextQuotationId) return NextResponse.json({ error: "An ERPNext quotation already exists for this record." }, { status: 409 });
    if (!proposal.erpnextCustomerId) return NextResponse.json({ error: "Link an ERPNext Customer before creating the BOQ quotation." }, { status: 409 });

    const payload = buildErpnextQuotationPayload({
      partyName: proposal.erpnextCustomerId,
      company: input.company,
      currency: input.currency.toUpperCase(),
      sellingPriceList: input.sellingPriceList,
      lines: input.lines,
      remarks: input.remarks,
      validTill: input.validTill,
      amendedFrom: input.amendedFrom,
    });
    const created = await createErpnextBoqQuotation(payload);
    const totals = calculateBoqTotals(input.lines);
    const configuration = asRecord(proposal.configurationData);
    await db.transaction(async (tx) => {
      await tx.update(proposals).set({
        erpnextQuotationId: created.name,
        totalPrice: totals.grandTotal,
        configurationData: { ...configuration, boq: { lines: input.lines, totals, currency: payload.currency, sellingPriceList: payload.selling_price_list, syncedAt: new Date().toISOString(), erpnextQuotationId: created.name }, revisionDraft: null, revisionHistory: [...(Array.isArray(configuration.revisionHistory) ? configuration.revisionHistory : []), ...(input.amendedFrom ? [{ name: created.name, amendedFrom: input.amendedFrom, status: "DRAFT", createdAt: new Date().toISOString() }] : [])] },
        updatedAt: new Date(),
      }).where(eq(proposals.id, proposal.id));
      await tx.insert(activityLogs).values({ entityId: proposal.id, entityType: "QUOTATION", action: "BOQ_QUOTATION_CREATED", description: `Created ERPNext quotation ${created.name} from ${input.lines.length} BOQ rows.`, userId: actor.id });
    });
    return NextResponse.json({ success: true, quotationId: created.name, totals, payload });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create the ERPNext quotation." }, { status: 400 });
  }
}
