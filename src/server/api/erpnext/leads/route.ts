import { NextResponse } from "next/server";
import { createInboundRequest, getInboundRequests } from "@/app/actions/inboundRequests";
import { requireStaffJson } from "@/lib/auth-guard";
import { z } from "zod";

const erpnextLeadRequestSchema = z.object({
  first_name: z.string().trim().max(200).optional(),
  customer_name: z.string().trim().max(200).optional(),
  customerName: z.string().trim().max(200).optional(),
  email_id: z.string().trim().max(320).nullable().optional(),
  email: z.string().trim().max(320).nullable().optional(),
  mobile_no: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(80).optional(),
  source: z.string().trim().max(120).optional(),
  request_type: z.enum(["WIZARD", "BUILD", "SERVICE"]).optional(),
  requestType: z.enum(["WIZARD", "BUILD", "SERVICE"]).optional(),
  payload: z.union([z.record(z.string(), z.unknown()), z.string().max(16_000)]).optional(),
  notes: z.string().max(16_000).optional(),
});

export async function POST(request: Request) {
  try {
    const auth = await requireStaffJson();
    if (!auth.ok) return auth.response;

    const body = erpnextLeadRequestSchema.parse(await request.json());
    const {
      first_name,
      customer_name,
      customerName,
      email_id,
      email,
      mobile_no,
      phone,
      source,
      request_type,
      requestType,
      payload,
      notes,
    } = body;

    const finalName = (first_name || customer_name || customerName || "").trim();
    const finalPhone = (mobile_no || phone || "").trim();
    const finalEmail = (email_id || email || "").trim() || null;
    const finalSource = (source || "direct").trim();
    const finalRequestType = (request_type || requestType || "WIZARD").toUpperCase();
    const finalPayload = payload || (notes ? { notes } : {});

    if (!finalName) {
      return NextResponse.json({ success: false, error: "Customer name is required" }, { status: 400 });
    }
    if (!finalPhone) {
      return NextResponse.json({ success: false, error: "Phone number is required" }, { status: 400 });
    }

    // The shared action persists locally and owns the single ERPNext Lead
    // attempt. Keeping this endpoint on that path prevents duplicate leads.
    const localResult = await createInboundRequest({
      customerName: finalName,
      phone: finalPhone,
      email: finalEmail,
      requestType: finalRequestType as "WIZARD" | "BUILD" | "SERVICE",
      payload: typeof finalPayload === "object" ? finalPayload : { notes: finalPayload },
      source: finalSource,
    });

    if (!localResult.success) {
      return NextResponse.json({ success: false, error: localResult.error }, { status: 400 });
    }
    if (!localResult.request) {
      return NextResponse.json({ success: false, error: "Failed to create ERPNext lead." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      erpnextLeadId: localResult.request.erpnextLeadId || null,
      request: localResult.request,
    });
  } catch (error) {
    console.error("POST /api/erpnext/leads error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof z.ZodError ? "Invalid lead payload." : "Failed to create ERPNext lead." },
      { status: error instanceof z.ZodError ? 400 : 500 }
    );
  }
}

export async function GET() {
  try {
    const auth = await requireStaffJson();
    if (!auth.ok) return auth.response;

    const items = await getInboundRequests();
    return NextResponse.json({ success: true, items });
  } catch (error) {
    console.error("GET /api/erpnext/leads error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch leads" }, { status: 500 });
  }
}
