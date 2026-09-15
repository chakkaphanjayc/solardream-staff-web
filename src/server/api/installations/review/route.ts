import { createHash } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import { installationAuditEvents, installationChecklistItems, installationEvidence, installationTasks, installationWorkflowProjects } from "@/db/schema";
import { canReviewInstallation, getInstallationActor } from "@/lib/installationAccess";
import { evidenceReviewSchema } from "@/lib/installationDtos";
import { assertInstallationAuditReplay, InstallationIdempotencyConflictError } from "@/lib/installationIdempotency";
import { enqueueIntegrationEvent } from "@/lib/integrationOutbox";
import { publishPortalStateChanged } from "@/lib/portalEvents";

export async function POST(request: NextRequest) {
  try {
    const input = evidenceReviewSchema.parse(await request.json());
    const actor = await getInstallationActor();
    if (!actor || !canReviewInstallation(actor)) {
      return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });
    }

    const rows = await db.select({
      evidence: installationEvidence,
      item: installationChecklistItems,
      task: installationTasks,
      proposalId: installationWorkflowProjects.proposalId,
    })
      .from(installationEvidence)
      .innerJoin(installationChecklistItems, eq(installationEvidence.checklistItemId, installationChecklistItems.id))
      .innerJoin(installationTasks, eq(installationChecklistItems.taskId, installationTasks.id))
      .innerJoin(installationWorkflowProjects, eq(installationTasks.projectId, installationWorkflowProjects.id))
      .where(eq(installationEvidence.id, input.evidenceId))
      .limit(1);
    const row = rows[0];
    if (!row) return NextResponse.json({ success: false, error: "Evidence not found." }, { status: 404 });

    const afterHash = createHash("sha256").update(JSON.stringify({
      taskCode: row.task.taskCode,
      itemCode: row.item.itemCode,
      evidenceId: input.evidenceId,
      decision: input.decision,
      reason: input.reason,
      sha256: row.evidence.sha256,
      idempotencyKey: input.idempotencyKey,
    })).digest("hex");

    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`installation:review:${input.evidenceId}`}))`);
      const existing = await tx.query.installationAuditEvents.findFirst({ where: eq(installationAuditEvents.idempotencyKey, input.idempotencyKey) });
      if (assertInstallationAuditReplay(existing, {
        eventType: `EVIDENCE_${input.decision}`,
        proposalId: row.proposalId,
        taskId: row.task.id,
        checklistItemId: row.item.id,
        payload: { evidenceId: input.evidenceId, decision: input.decision, reason: input.reason, sha256: row.evidence.sha256 },
      })) return;

      await tx.update(installationEvidence).set({ status: input.decision }).where(eq(installationEvidence.id, input.evidenceId));
      const [auditEvent] = await tx.insert(installationAuditEvents).values({
        proposalId: row.proposalId,
        taskId: row.task.id,
        checklistItemId: row.item.id,
        eventType: `EVIDENCE_${input.decision}`,
        actorUserId: actor.userId,
        idempotencyKey: input.idempotencyKey,
        payload: {
          evidenceId: input.evidenceId,
          decision: input.decision,
          reason: input.reason,
          sha256: row.evidence.sha256,
          afterHash,
        },
      }).returning({ id: installationAuditEvents.id });
      if (!auditEvent) throw new Error("Evidence review audit event could not be created.");

      await enqueueIntegrationEvent(tx, {
        topic: "installation.evidence.reviewed",
        aggregateType: "INSTALLATION_PROJECT",
        aggregateId: row.proposalId,
        payload: {
          auditEventId: auditEvent.id,
          localTaskId: row.task.id,
          checklistItemId: row.item.id,
          itemCode: row.item.itemCode,
          evidenceId: input.evidenceId,
          decision: input.decision,
          reason: input.reason,
          sha256: row.evidence.sha256,
          afterHash,
        },
        dedupeKey: `installation.evidence.reviewed:${input.idempotencyKey}`,
      });
    });

    await publishPortalStateChanged(row.proposalId, "INSTALLATION_EVIDENCE_REVIEWED");
    return NextResponse.json({ success: true, status: input.decision });
  } catch (error: unknown) {
    console.error("[Evidence Review]", error);
    if (error instanceof InstallationIdempotencyConflictError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 409 });
    }
    return NextResponse.json({ success: false, error: "Evidence review failed." }, { status: 400 });
  }
}
