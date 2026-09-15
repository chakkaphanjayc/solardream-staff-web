import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { installationChecklistItems } from "@/db/schema";
import { requireTaskMutationAccess, requireTaskReviewAccess, requestIdempotencyKey } from "@/lib/installationAccess";
import { checklistCompleteSchema } from "@/lib/installationDtos";
import { InstallationIdempotencyConflictError } from "@/lib/installationIdempotency";
import { completeChecklistItem } from "@/lib/installationWorkflow";
import { publishPortalStateChanged } from "@/lib/portalEvents";

export async function POST(request: NextRequest, context: { params: Promise<{ itemId: string }> }) {
  try {
    const { itemId } = await context.params;
    const body = checklistCompleteSchema.parse({ ...(await request.json().catch(() => ({}))), idempotencyKey: requestIdempotencyKey(request, undefined) || undefined });
    const item = await db.query.installationChecklistItems.findFirst({ where: eq(installationChecklistItems.id, itemId) });
    const installerAccess = item ? await requireTaskMutationAccess(item.taskId) : null;
    const reviewerAccess = item && body.outcome === "NA" ? await requireTaskReviewAccess(item.taskId) : null;
    const access = installerAccess || reviewerAccess;
    if (!access) return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });
    const result = await completeChecklistItem({ itemId, actor: access.actor, idempotencyKey: body.idempotencyKey, outcome: body.outcome, remarks: body.remarks });
    await publishPortalStateChanged(access.proposalId, "INSTALLATION_CHECKLIST_VERIFIED");
    return NextResponse.json({ success: true, result });
  } catch (error: unknown) {
    console.error("[Checklist Complete]", error);
    if (error instanceof InstallationIdempotencyConflictError) return NextResponse.json({ success: false, error: error.message }, { status: 409 });
    return NextResponse.json({ success: false, error: "Checklist completion failed." }, { status: 400 });
  }
}
