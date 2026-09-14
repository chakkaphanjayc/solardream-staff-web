import { NextResponse } from "next/server";
import { generateQuotationFromInboundRequest } from "@/app/actions/inboundRequests";
import { requireStaffJson } from "@/lib/auth-guard";
import { z } from "zod";

const convertLeadSchema = z.object({
  lead_id: z.string().trim().max(200).optional(),
  lead_name: z.string().trim().max(200).optional(),
  requestId: z.string().uuid().optional(),
  request_id: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  try {
    const auth = await requireStaffJson();
    if (!auth.ok) return auth.response;

    const body = convertLeadSchema.parse(await request.json());
    const { lead_id, lead_name, requestId, request_id } = body;
    const targetRequestId = requestId || request_id || lead_id;

    if (!targetRequestId) {
      return NextResponse.json({ success: false, error: "Lead ID / Request ID is required" }, { status: 400 });
    }

    // The shared conversion action creates the local proposal and performs the
    // single idempotent ERPNext sync. Do not create a second remote quotation
    // in this compatibility endpoint.
    const localResult = await generateQuotationFromInboundRequest(targetRequestId);

    if (!localResult.success) {
      return NextResponse.json({ success: false, error: localResult.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      quotationId: localResult.quotationId,
      erpnextQuotationId: localResult.erpnextQuotationName || null,
    });
  } catch (error) {
    console.error("POST /api/erpnext/convert-lead error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof z.ZodError ? "Invalid lead conversion request." : "Failed to convert lead to quotation." },
      { status: error instanceof z.ZodError ? 400 : 500 }
    );
  }
}
