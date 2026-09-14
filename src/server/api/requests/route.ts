import { NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  createInboundRequest,
  getInboundRequests,
  type InboundRequestType,
  type InboundRequestStatus,
} from "@/app/actions/inboundRequests";
import { normalizePreferredLanguage } from "@/lib/userLanguage";
import { enforcePublicApiRateLimit } from "@/lib/apiRateLimit";
import { isRequestContentLengthExceeded } from "@/lib/requestSize";
import { inboundRequestSchema } from "@/lib/validations/requestSchema";
import { requireStaffJson } from "@/lib/auth-guard";

const MAX_REQUEST_BODY_BYTES = 32 * 1024;

export async function POST(request: Request) {
  try {
    if (isRequestContentLengthExceeded(request.headers, MAX_REQUEST_BODY_BYTES)) {
      return NextResponse.json({ success: false, error: "Request payload is too large." }, { status: 413 });
    }
    const rateLimited = await enforcePublicApiRateLimit(request, {
      namespace: "inbound-request-create",
      limit: 8,
      windowSeconds: 600,
    });
    if (rateLimited) return rateLimited;

    const body = inboundRequestSchema.parse(await request.json());
    const { customer_name, customerName, phone, email, request_type, requestType, payload, source, notes, preferred_language, preferredLanguage } = body;

    const finalCustomerName = (customer_name || customerName || "").trim();
    const finalPhone = (phone || "").trim();
    const finalEmail = (email || "").trim() || null;
    const finalSource = (source || "Direct").trim();
    const finalRequestType = (request_type || requestType || "WIZARD").toUpperCase() as InboundRequestType;
    const finalPreferredLanguage = normalizePreferredLanguage(preferred_language ?? preferredLanguage);
    const rawPayload = payload || (notes ? { notes } : {});
    const finalPayload = { ...rawPayload, preferred_language: finalPreferredLanguage };

    // Persist locally and let the shared inbound action create the matching ERPNext Lead.
    const result = await createInboundRequest({
      customerName: finalCustomerName,
      phone: finalPhone,
      email: finalEmail,
      requestType: finalRequestType,
      payload: finalPayload,
      source: finalSource,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    const createdRequest = result.request;
    if (!createdRequest) {
      console.error("POST /api/requests completed without an inbound request record.");
      return NextResponse.json(
        { success: false, error: "Failed to create inbound request" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      request: createdRequest,
      erpnextLead: createdRequest.erpnextLeadId || null,
    });
  } catch (error) {
    console.error("POST /api/requests error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof ZodError ? "Invalid request payload." : "Failed to process inbound request" },
      { status: error instanceof ZodError ? 400 : 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const auth = await requireStaffJson();
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const type = (searchParams.get("type") || undefined) as InboundRequestType | undefined;
    const status = (searchParams.get("status") || undefined) as InboundRequestStatus | undefined;
    const search = searchParams.get("search") || undefined;

    const items = await getInboundRequests({ type, status, search });

    return NextResponse.json({
      success: true,
      items,
    });
  } catch (error) {
    console.error("GET /api/requests error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch requests" },
      { status: 500 }
    );
  }
}
