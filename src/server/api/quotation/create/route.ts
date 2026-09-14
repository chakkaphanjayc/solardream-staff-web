import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { proposals } from "@/db/schema";
import { createClient } from "@/utils/supabase/server";
import { ensureUserExists } from "@/app/actions/auth";
import { saveProposal } from "@/app/actions/proposals";
import { createErpnextQuotationForMember } from "@/app/actions/erpnextQuotation";
import { isRequestContentLengthExceeded } from "@/lib/requestSize";

type WizardSummaryRequest = {
  proposalId?: string;
  leadId?: string;
  customerName?: string;
  bundleItemCode?: string;
  amendedFrom?: string;
  lines?: Array<{ itemCode: string; itemName: string; qty: number; rate: number; amount: number }>;
  systemSizeKwp?: number;
  panelCount?: number;
  totalPrice?: number;
  monthlySavings?: number;
  paybackPeriod?: string;
  configurationData?: Record<string, unknown>;
};

const MAX_QUOTATION_CREATE_BODY_BYTES = 256 * 1024;

function toNumber(value: unknown, fallback: number | null = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function isErpnextConfigured() {
  return Boolean(
    process.env.ERPNEXT_BASE_URL?.trim() &&
      process.env.ERPNEXT_API_KEY?.trim() &&
      process.env.ERPNEXT_API_SECRET?.trim(),
  );
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const activeUser = await ensureUserExists(user);
    if (!activeUser) {
      await supabase.auth.signOut();
      return NextResponse.json({ success: false, error: "Account is inactive." }, { status: 403 });
    }

    if (isRequestContentLengthExceeded(request.headers, MAX_QUOTATION_CREATE_BODY_BYTES)) {
      return NextResponse.json(
        { success: false, error: "Quotation request payload is too large." },
        { status: 413 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as WizardSummaryRequest;
    let targetProposalId = typeof body.proposalId === "string" ? body.proposalId.trim() : "";

    if (targetProposalId) {
      const existing = await db.query.proposals.findFirst({
        where: eq(proposals.id, targetProposalId),
      });

      if (existing) {
        if (Array.isArray(body.lines) && body.lines.length > 0) {
          const config = (existing.configurationData as Record<string, unknown>) || {};
          const linesTotal = body.lines.reduce((sum, line) => sum + (line.amount || line.qty * line.rate), 0);
          await db.update(proposals)
            .set({
              ...(linesTotal > 0 ? { totalPrice: linesTotal } : {}),
              configurationData: {
                ...config,
                customBoqLines: body.lines,
                bundleItemCode: body.bundleItemCode || config.bundleItemCode,
                updatedAt: new Date().toISOString(),
              },
              updatedAt: new Date(),
            })
            .where(eq(proposals.id, existing.id));
        }
      } else {
        targetProposalId = "";
      }
    }

    if (!targetProposalId) {
      const linesTotal = Array.isArray(body.lines)
        ? body.lines.reduce((sum, line) => sum + (line.amount || line.qty * line.rate), 0)
        : 0;

      const systemSizeKwp = toNumber(body.systemSizeKwp, 5.0) ?? 5.0;
      const panelCount = toNumber(body.panelCount, 10) ?? 10;
      const totalPrice = toNumber(body.totalPrice, linesTotal > 0 ? linesTotal : 150000) ?? 150000;
      const monthlySavings = toNumber(body.monthlySavings, 3000) ?? 3000;
      const paybackPeriod = typeof body.paybackPeriod === "string" && body.paybackPeriod.trim()
        ? body.paybackPeriod.trim()
        : "4.2 Years";

      const configurationData = {
        ...(body.configurationData || {}),
        leadId: body.leadId || null,
        customerName: body.customerName || null,
        bundleItemCode: body.bundleItemCode || null,
        amendedFrom: body.amendedFrom || null,
        customBoqLines: body.lines || [],
        exportSource: "crm-quotation-create",
        requestedAt: new Date().toISOString(),
      };

      const proposalResult = await saveProposal({
        systemSizeKwp,
        panelCount,
        totalPrice,
        monthlySavings,
        paybackPeriod,
        status: "DRAFT",
        configurationData,
      });

      if (!proposalResult.success || !proposalResult.proposal) {
        return NextResponse.json(
          { success: false, error: proposalResult.error || "Failed to save proposal." },
          { status: 500 },
        );
      }
      targetProposalId = proposalResult.proposal.id;
    }

    if (!isErpnextConfigured()) {
      return NextResponse.json(
        {
          success: false,
          setupRequired: true,
          proposalId: targetProposalId,
          error:
            "ERPNext is not configured yet. Please open Admin > Settings > ERPNext Integration & Sync Settings and set the site endpoint plus API credentials, then try again.",
        },
        { status: 409 },
      );
    }

    const quotationResult = await createErpnextQuotationForMember(targetProposalId);
    if (!quotationResult.success) {
      const errorMessage = quotationResult.error || "Failed to create ERPNext quotation.";
      const setupRequired =
        /ERPNext configuration is missing|did not return a Customer ID|base URL is missing|auth configuration is missing/i.test(
          errorMessage,
        );

      return NextResponse.json(
        {
          success: false,
          setupRequired,
          proposalId: targetProposalId,
          error: setupRequired
            ? "ERPNext is not ready. Please configure Admin > Settings > ERPNext Integration & Sync Settings before requesting quotation."
            : errorMessage,
        },
        { status: setupRequired ? 409 : 500 },
      );
    }

    return NextResponse.json({
      success: true,
      proposalId: targetProposalId,
      quotationId: quotationResult.quotationId,
      customerId: quotationResult.customerId,
    });
  } catch (error) {
    console.error("[API /quotation/create] failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal Server Error",
      },
      { status: 500 },
    );
  }
}
