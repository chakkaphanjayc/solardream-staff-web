import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { serviceOrders, servicePortalAuditEvents, servicePortalTokens, serviceRequests } from "@/db/schema";
import { normalizeErpnextIssueStatus } from "@/lib/erpnextIssues";
import { isRequestContentLengthExceeded } from "@/lib/requestSize";
import { hasValidHeaderSecret } from "@/lib/secretAuth";


const WEBHOOK_SECRET_HEADER = "x-erpnext-webhook-secret";
const MAX_ERPNEXT_ISSUE_WEBHOOK_BODY_BYTES = 256 * 1024;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getString(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export async function POST(request: NextRequest) {
  const expectedSecret = process.env.ERPNEXT_WEBHOOK_SECRET?.trim();
  if (!expectedSecret) {
    console.error("[ERPNext Issue Webhook] ERPNEXT_WEBHOOK_SECRET is not configured.");
    return NextResponse.json(
      { success: false, error: "Webhook is not configured." },
      { status: 503 },
    );
  }

  const receivedSecret = request.headers.get(WEBHOOK_SECRET_HEADER)?.trim() || "";
  if (!hasValidHeaderSecret(receivedSecret, expectedSecret)) {
    return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }

  if (isRequestContentLengthExceeded(request.headers, MAX_ERPNEXT_ISSUE_WEBHOOK_BODY_BYTES)) {
    return NextResponse.json(
      { success: false, error: "Webhook payload is too large." },
      { status: 413 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON payload." }, { status: 400 });
  }

  const root = asRecord(payload);
  const doc = asRecord(root?.doc);
  const source = doc ? { ...root, ...doc } : root;
  if (!source) {
    return NextResponse.json(
      { success: false, error: "Webhook payload must be a JSON object." },
      { status: 400 },
    );
  }

  const issueId = getString(source, ["name", "issue_id", "issueId", "erpnext_issue_id"]);
  const localRequestId = getString(source, [
    "service_request_id",
    "serviceRequestId",
    "custom_service_request_id",
  ]);
  const status = normalizeErpnextIssueStatus(source.status);

  if (!issueId && !localRequestId) {
    return NextResponse.json(
      { success: false, error: "Missing ERPNext Issue ID." },
      { status: 400 },
    );
  }
  if (!status) {
    return NextResponse.json(
      { success: false, error: `Unsupported ERPNext Issue status: ${String(source.status || "")}` },
      { status: 422 },
    );
  }

  try {
    const existing = issueId
      ? await db.query.serviceRequests.findFirst({
          where: eq(serviceRequests.erpnextIssueId, issueId),
        })
      : await db.query.serviceRequests.findFirst({
          where: eq(serviceRequests.id, localRequestId),
        });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "No local service request matches this ERPNext Issue." },
        { status: 404 },
      );
    }

    const updated = await db.transaction(async (tx) => {
      const now = new Date();
      const [requestRow] = await tx
        .update(serviceRequests)
        .set({
          status,
          ...(issueId && !existing.erpnextIssueId ? { erpnextIssueId: issueId } : {}),
          erpnextSyncStatus: "SYNCED",
          erpnextSyncError: null,
          erpnextLastSyncedAt: now,
        })
        .where(eq(serviceRequests.id, existing.id))
        .returning({
          id: serviceRequests.id,
          serviceOrderId: serviceRequests.serviceOrderId,
          status: serviceRequests.status,
          erpnextIssueId: serviceRequests.erpnextIssueId,
          updatedAt: serviceRequests.updatedAt,
        });

      const openSiblingCount = requestRow.serviceOrderId ? await tx.$count(serviceRequests, and(eq(serviceRequests.serviceOrderId, requestRow.serviceOrderId), ne(serviceRequests.status, "Closed"))) : 1;
      if (status === "Closed" && requestRow.serviceOrderId && openSiblingCount === 0) {
        await tx.update(serviceOrders).set({ status: "CLOSED", portalClosedAt: now, updatedAt: now }).where(eq(serviceOrders.id, requestRow.serviceOrderId));
        await tx.update(servicePortalTokens).set({ status: "CLOSED", closedAt: now }).where(and(eq(servicePortalTokens.serviceOrderId, requestRow.serviceOrderId), eq(servicePortalTokens.status, "ACTIVE")));
        await tx.insert(servicePortalAuditEvents).values({ serviceOrderId: requestRow.serviceOrderId, eventType: "PORTAL_CLOSED", metadata: { source: "ERPNEXT_ISSUE" }, dedupeKey: `PORTAL_CLOSED:${requestRow.serviceOrderId}` }).onConflictDoNothing({ target: servicePortalAuditEvents.dedupeKey });
      }
      return requestRow;
    });

    revalidatePath("/my-assets");
    revalidatePath("/support/dashboard");

    return NextResponse.json({
      success: true,
      serviceRequest: updated,
      changed: existing.status !== status,
    });
  } catch (error: unknown) {
    console.error("[ERPNext Issue Webhook] Failed:", error);
    return NextResponse.json({ success: false, error: "Webhook processing failed." }, { status: 500 });
  }
}
