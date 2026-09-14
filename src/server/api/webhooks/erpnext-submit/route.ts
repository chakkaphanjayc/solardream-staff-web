import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { proposals, users } from "@/db/schema";
import { isRequestContentLengthExceeded } from "@/lib/requestSize";
import { hasValidAuthorizationToken } from "@/lib/secretAuth";
import { getRequestEndpoint, queueApiLog, serializeError } from "@/utils/logger";


const erpnextSubmitPayloadSchema = z.object({
  quotation_id: z.string().trim().min(1),
  customer_email: z.string().trim().email(),
  customer_name: z.string().trim().min(1),
  grand_total: z.coerce.number().finite().nonnegative(),
  modified_by: z.string().trim().optional().nullable(),
  owner: z.string().trim().optional().nullable(),
  modified_by_name: z.string().trim().optional().nullable(),
  owner_name: z.string().trim().optional().nullable(),
  staff_name: z.string().trim().optional().nullable(),
});

type ErpnextSubmitPayload = z.infer<typeof erpnextSubmitPayloadSchema>;
type JsonRecord = Record<string, unknown>;

const MAX_ERPNEXT_SUBMIT_BODY_BYTES = 1024 * 1024;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validateErpnextAuthorization(request: NextRequest) {
  const expectedSecret = process.env.ERPNEXT_WEBHOOK_SECRET?.trim() || "";
  return hasValidAuthorizationToken(request.headers.get("authorization"), expectedSecret);
}

async function upsertCustomer(payload: ErpnextSubmitPayload) {
  const email = payload.customer_email.toLowerCase();
  const [customer] = await db
    .insert(users)
    .values({
      email,
      name: payload.customer_name,
      fullName: payload.customer_name,
      role: "USER",
    })
    .onConflictDoUpdate({
      target: users.email,
      set: {
        name: payload.customer_name,
        fullName: payload.customer_name,
      },
    })
    .returning();

  return customer;
}

function buildProposalId(quotationId: string) {
  const cleanQuotationId = quotationId
    .trim()
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const signature = crypto
    .createHash("sha256")
    .update(quotationId)
    .digest("base64url")
    .slice(0, 12);

  return `${cleanQuotationId || "quotation"}-${signature}`;
}

function getStaffContact(payload: ErpnextSubmitPayload) {
  const modifiedBy = payload.modified_by?.trim().toLowerCase() || "";
  const owner = payload.owner?.trim().toLowerCase() || "";
  const staffEmail = isEmail(modifiedBy)
    ? modifiedBy
    : isEmail(owner) ? owner : "admin@solar-dream.org";
  const staffName =
    payload.modified_by_name?.trim() ||
    payload.staff_name?.trim() ||
    payload.owner_name?.trim() ||
    staffEmail.split("@")[0] ||
    "SolarDream Staff";

  return {
    role: "staff",
    email: staffEmail,
    name: staffName,
  };
}

export async function POST(request: NextRequest) {
  const endpoint = getRequestEndpoint(request);
  let rawPayload: unknown = null;
  try {
    if (!validateErpnextAuthorization(request)) {
      const responseBody = { success: false, error: "Unauthorized" };
      queueApiLog({
        direction: "INBOUND",
        sourceSystem: "ERPNEXT",
        endpoint,
        method: request.method,
        statusCode: 401,
        requestHeaders: request.headers,
        requestBody: null,
        responseBody,
        errorMessage: "Unauthorized",
      });
      return NextResponse.json(responseBody, { status: 401 });
    }

    if (isRequestContentLengthExceeded(request.headers, MAX_ERPNEXT_SUBMIT_BODY_BYTES)) {
      const responseBody = { success: false, error: "Webhook payload is too large." };
      queueApiLog({
        direction: "INBOUND",
        sourceSystem: "ERPNEXT",
        endpoint,
        method: "POST",
        statusCode: 413,
        requestHeaders: request.headers,
        requestBody: {},
        responseBody,
        errorMessage: "ERPNext submit webhook payload exceeded size limit.",
      });
      return NextResponse.json(responseBody, { status: 413 });
    }

    rawPayload = await request.json().catch(() => null);
    const parsedPayload = erpnextSubmitPayloadSchema.safeParse(rawPayload);
    if (!parsedPayload.success) {
      const responseBody = {
          success: false,
          error: "Invalid ERPNext submit payload",
          issues: parsedPayload.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        };
      queueApiLog({
        direction: "INBOUND",
        sourceSystem: "ERPNEXT",
        endpoint,
        method: request.method,
        statusCode: 400,
        requestHeaders: request.headers,
        requestBody: rawPayload,
        responseBody,
        errorMessage: "Invalid ERPNext submit payload",
      });
      return NextResponse.json(responseBody, { status: 400 });
    }

    const payload = parsedPayload.data;
    const existingProposal = await db.query.proposals.findFirst({
      where: eq(proposals.erpnextQuotationId, payload.quotation_id),
    });

    const existingConfig = asRecord(existingProposal?.configurationData);

    if (existingProposal?.dispatchStatus === "DISPATCHED") {
      const responseBody = {
        success: true,
        idempotent: true,
        quotation_id: payload.quotation_id,
        proposalId: existingProposal.id,
        status: existingProposal.status,
      };
      queueApiLog({
        direction: "INBOUND",
        sourceSystem: "ERPNEXT",
        endpoint,
        method: request.method,
        statusCode: 200,
        requestHeaders: request.headers,
        requestBody: rawPayload,
        responseBody,
      });
      return NextResponse.json(responseBody);
    }

    const customer = await upsertCustomer(payload);
    const now = new Date();
    const staffContact = getStaffContact(payload);
    const configurationData = {
      ...existingConfig,
      source: "erpnext-on-submit",
      erpnextQuotation: {
        ...asRecord(existingConfig.erpnextQuotation),
        quotationId: payload.quotation_id,
        customerEmail: payload.customer_email.toLowerCase(),
        customerName: payload.customer_name,
        grandTotal: payload.grand_total,
        submittedAt: now.toISOString(),
      },
      dispatch: {
        ...asRecord(existingConfig.dispatch),
        status: "AWAITING_CLIENT_SIGNATURE",
        erpnextSubmittedAt: now.toISOString(),
        staffContact,
      },
    };

    const [proposal] = await db
      .insert(proposals)
      .values({
        id: existingProposal?.id || buildProposalId(payload.quotation_id),
        userId: customer.id,
        systemSizeKwp: existingProposal?.systemSizeKwp ?? 0,
        panelCount: existingProposal?.panelCount ?? 0,
        totalPrice: payload.grand_total,
        monthlySavings: existingProposal?.monthlySavings ?? 0,
        paybackPeriod: existingProposal?.paybackPeriod || "Pending consultant confirmation",
        status: "AWAITING_CLIENT_SIGNATURE",
        dispatchStatus: "DISPATCHED",
        configurationData,
        erpnextQuotationId: payload.quotation_id,
        fulfillmentType: existingProposal?.fulfillmentType || "INSTALLATION",
      })
      .onConflictDoUpdate({
        target: proposals.erpnextQuotationId,
        set: {
          userId: customer.id,
          totalPrice: payload.grand_total,
          status: "AWAITING_CLIENT_SIGNATURE",
          dispatchStatus: "DISPATCHED",
          configurationData,
          updatedAt: now,
        },
      })
      .returning();

    revalidatePath("/admin/quotations");
    revalidatePath("/admin/quotations/dispatch");
    revalidatePath(`/admin/crm/${proposal.id}`);
    revalidatePath(`/proposals/${proposal.magicTokenSlug}`);

    const responseBody = { success: true };
    queueApiLog({
      direction: "INBOUND",
      sourceSystem: "ERPNEXT",
      endpoint,
      method: request.method,
      statusCode: 200,
      requestHeaders: request.headers,
      requestBody: rawPayload,
      responseBody,
    });
    return NextResponse.json(responseBody);
  } catch (error) {
    console.error("[ERPNext Submit Webhook] failed:", error);
    const serialized = serializeError(error);
    const responseBody = {
      success: false,
      error: serialized.message || "ERPNext submit webhook failed.",
    };
    queueApiLog({
      direction: "INBOUND",
      sourceSystem: "ERPNEXT",
      endpoint,
      method: request.method,
      statusCode: 500,
      requestHeaders: request.headers,
      requestBody: rawPayload,
      responseBody: { ...responseBody, trace: serialized },
      errorMessage: serialized.stack || serialized.message,
    });
    return NextResponse.json(responseBody, { status: 500 });
  }
}
