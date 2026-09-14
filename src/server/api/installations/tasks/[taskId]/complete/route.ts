import { NextRequest, NextResponse } from "next/server";
import { requireTaskMutationAccess, requestIdempotencyKey } from "@/lib/installationAccess";
import { taskCompleteSchema } from "@/lib/installationDtos";
import { completeInstallationTask } from "@/lib/installationWorkflow";
import { publishPortalStateChanged } from "@/lib/portalEvents";

export async function POST(request: NextRequest, context: { params: Promise<{ taskId: string }> }) {
  try {
    const { taskId } = await context.params;
    const body = taskCompleteSchema.parse({ ...(await request.json().catch(() => ({}))), idempotencyKey: requestIdempotencyKey(request, undefined) || undefined });
    const access = await requireTaskMutationAccess(taskId);
    if (!access) return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });
    const result = await completeInstallationTask({ taskId, actor: access.actor, idempotencyKey: body.idempotencyKey });
    await publishPortalStateChanged(access.proposalId, "INSTALLATION_TASK_COMPLETED");
    return NextResponse.json({ success: true, result });
  } catch (error: unknown) { console.error("[Task Complete]", error); return NextResponse.json({ success: false, error: "Task completion failed." }, { status: 400 }); }
}
