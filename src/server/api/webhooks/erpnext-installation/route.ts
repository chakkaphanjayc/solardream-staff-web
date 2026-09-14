import { createHmac } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { installationAuditEvents, installationTasks, installationWorkflowProjects, systemSettingsKeyValue } from "@/db/schema";
import { installationWebhookSchema } from "@/lib/installationDtos";
import { publishPortalStateChanged } from "@/lib/portalEvents";
import { timingSafeStringEqual } from "@/lib/secretAuth";
import { validateUploadContentLength } from "@/lib/fileValidation";
import { readBoundedRequestBody } from "@/lib/webhookBody";

const MAX_WEBHOOK_BYTES = 64 * 1024;

async function secret() {
  const env = process.env.ERP_INSTALLATION_WEBHOOK_SECRET?.trim();
  if (env && env.length >= 32) return env;
  const row = await db.query.systemSettingsKeyValue.findFirst({ where: eq(systemSettingsKeyValue.key, "erp_installation_webhook_secret"), columns: { value: true } });
  return row?.value.trim() && row.value.trim().length >= 32 ? row.value.trim() : null;
}
export async function POST(request: NextRequest) {
  try {
    const length = validateUploadContentLength(request.headers, MAX_WEBHOOK_BYTES);
    if (!length.ok) return NextResponse.json({ success: false, error: length.error }, { status: length.status });
    const timestamp = request.headers.get("x-solardream-timestamp") || "";
    const signature = request.headers.get("x-solardream-signature")?.replace(/^sha256=/i, "") || "";
    const timestampMs = Date.parse(timestamp);
    if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 5 * 60_000) return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
    const body = await readBoundedRequestBody(request, MAX_WEBHOOK_BYTES, length.value);
    const key = await secret();
    const expected = key ? createHmac("sha256", key).update(`${timestamp}.${body}`).digest("hex") : "";
    if (!key || !timingSafeStringEqual(signature, expected)) return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
    const payload = installationWebhookSchema.parse(JSON.parse(body) as unknown);
    if (Math.abs(Date.now() - Date.parse(payload.occurredAt)) > 10 * 60_000) return NextResponse.json({ success: false, error: "Stale event." }, { status: 409 });
    const project = await db.query.installationWorkflowProjects.findFirst({ where: eq(installationWorkflowProjects.proposalId, payload.proposalId) });
    if (!project) return NextResponse.json({ success: false, error: "Project not found." }, { status: 404 });
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`erp-installation:${payload.eventId}`}))`);
      if (await tx.query.installationAuditEvents.findFirst({ where: eq(installationAuditEvents.idempotencyKey, `erp:${payload.eventId}`) })) return;
      let taskId: string | null = null;
      if (payload.taskCode) {
        const task = await tx.query.installationTasks.findFirst({ where: eq(installationTasks.taskCode, payload.taskCode) });
        if (!task || task.projectId !== project.id) throw new Error("Task not found.");
        taskId = task.id;
        if (payload.status) await tx.update(installationTasks).set({ status: payload.status.toUpperCase(), updatedAt: new Date() }).where(eq(installationTasks.id, task.id));
      } else if (payload.status) await tx.update(installationWorkflowProjects).set({ status: payload.status.toUpperCase(), lastSyncedAt: new Date(), updatedAt: new Date() }).where(eq(installationWorkflowProjects.id, project.id));
      await tx.insert(installationAuditEvents).values({ proposalId: payload.proposalId, taskId, eventType: `ERP_${payload.eventType.toUpperCase().replaceAll(".", "_")}`, idempotencyKey: `erp:${payload.eventId}`, payload });
    });
    await publishPortalStateChanged(payload.proposalId, "ERP_INSTALLATION_UPDATED");
    return NextResponse.json({ success: true });
  } catch (error: unknown) { console.error("[ERP Installation Webhook]", error); return NextResponse.json({ success: false, error: "Webhook processing failed." }, { status: 400 }); }
}
