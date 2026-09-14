import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { proposals } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ensureUserExists } from "@/app/actions/auth";
import { isRequestContentLengthExceeded } from "@/lib/requestSize";
import { createClient } from "@/utils/supabase/server";

type SyncQuotationRequestBody = {
  pdfUrl?: unknown;
  customerEmail?: unknown;
  proposalId?: unknown;
  erpnextQuotationId?: unknown;
};

const MAX_SYNC_QUOTATION_BODY_BYTES = 64 * 1024;

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

async function requireAdminJson() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const dbUser = await ensureUserExists(user);
  if (!dbUser || !["ADMIN", "SUPER_ADMIN", "MANAGER", "STAFF"].includes(dbUser.role)) {
    return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { ok: true as const, user: dbUser };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminJson();
    if (!auth.ok) return auth.response;

    if (isRequestContentLengthExceeded(request.headers, MAX_SYNC_QUOTATION_BODY_BYTES)) {
      return NextResponse.json(
        { error: "Quotation sync payload is too large." },
        { status: 413 },
      );
    }

    const body = await request.json().catch(() => null) as SyncQuotationRequestBody | null;
    const pdfUrl = cleanString(body?.pdfUrl);
    const customerEmail = cleanString(body?.customerEmail);
    const proposalId = cleanString(body?.proposalId);
    const erpnextQuotationId = cleanString(body?.erpnextQuotationId);

    // 1. Validate required payload attributes
    if (!pdfUrl || !customerEmail || !proposalId || !erpnextQuotationId) {
      return NextResponse.json(
        {
          error: "Missing required properties. Expected: pdfUrl, customerEmail, proposalId, erpnextQuotationId",
        },
        { status: 400 }
      );
    }

    if (!isHttpUrl(pdfUrl) || !isValidEmail(customerEmail)) {
      return NextResponse.json(
        { error: "Invalid PDF URL or customer email." },
        { status: 400 },
      );
    }

    // 2. Fetch the corresponding proposal record
    const activeProposal = await db.query.proposals.findFirst({
      where: eq(proposals.id, proposalId),
    });

    if (!activeProposal) {
      return NextResponse.json(
        { error: "Proposal not found." },
        { status: 404 }
      );
    }

    // 3. Update the DB row using Drizzle ORM.
    await db
      .update(proposals)
      .set({
        status: "AWAITING_CLIENT_SIGNATURE",
        signedDocumentDriveUrl: pdfUrl,
        erpnextQuotationId: erpnextQuotationId,
        updatedAt: new Date(),
      })
      .where(eq(proposals.id, proposalId));

    return NextResponse.json({
      success: true,
      message: "Quotation synchronized and customer portal access prepared.",
      proposalId,
      status: "AWAITING_CLIENT_SIGNATURE",
      erpnextQuotationId,
      portalUrl: `/th/portal/${encodeURIComponent(proposalId)}`,
    });
  } catch (error) {
    console.error("[sync-quotation] Server error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
