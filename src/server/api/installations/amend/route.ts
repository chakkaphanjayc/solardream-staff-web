import { createHash } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import { installationAuditEvents, installationChecklistItems, installationTasks, installationWorkflowProjects } from "@/db/schema";
import { canReviewInstallation, getInstallationActor } from "@/lib/installationAccess";
import { amendmentSchema } from "@/lib/installationDtos";
import { enqueueIntegrationEvent } from "@/lib/integrationOutbox";
import { publishPortalStateChanged } from "@/lib/portalEvents";

export async function POST(request: NextRequest) {
  try {
    const input = amendmentSchema.parse(await request.json());
    const actor = await getInstallationActor();
    if (!actor || !canReviewInstallation(actor)) {
      return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });
    }

    const rows = await db.select({
      item: installationChecklistItems,
      task: installationTasks,
      proposalId: installationWorkflowProjects.proposalId,
    })
      .from(installationChecklistItems)
      .innerJoin(installationTasks, eq(installationChecklistItems.taskId, installationTasks.id))
      .innerJoin(installationWorkflowProjects, eq(installationTasks.projectId, installationWorkflowProjects.id))
      .where(eq(installationChecklistItems.id, input.itemId))
      .limit(1);
    const row = rows[0];
    if (!row || row.item.status !== "VERIFIED") {
      return NextResponse.json({ success: false, error: "Verified checklist item not found." }, { status: 404 });
    }

    const amendmentHash = createHash("sha256").update(JSON.stringify({
      taskCode: row.task.taskCode,
      itemCode: row.item.itemCode,
      label: input.label,
      evidenceRequired: input.evidenceRequired,
      allowsNa: input.allowsNa,
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
    })).digest("hex");
    const newItemCode = `SD-AMEND-${row.item.itemCode}-${amendmentHash.slice(0, 12)}`;
    let newItemId = "";

    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`installation:amend:${input.itemId}`}))`);
      const existingAudit = await tx.query.installationAuditEvents.findFirst({
        where: eq(installationAuditEvents.idempotencyKey, input.idempotencyKey),
      });
      if (existingAudit) {
        const existing = await tx.query.installationChecklistItems.findFirst({
          where: eq(installationChecklistItems.itemCode, newItemCode),
        });
        newItemId = existing?.id || "";
        return;
      }

      const [created] = await tx.insert(installationChecklistItems).values({
        taskId: row.task.id,
        itemCode: newItemCode,
        label: input.label,
        sequence: row.item.sequence + 1,
        required: true,
        evidenceRequired: input.evidenceRequired,
        allowsNa: input.allowsNa,
        status: "OPEN",
      }).returning({ id: installationChecklistItems.id });
      if (!created) throw new Error("The amended checklist item could not be created.");
      newItemId = created.id;

      await tx.update(installationChecklistItems).set({
        status: "SUPERSEDED",
        required: false,
        supersededById: created.id,
      }).where(eq(installationChecklistItems.id, row.item.id));

      const [auditEvent] = await tx.insert(installationAuditEvents).values({
        proposalId: row.proposalId,
        taskId: row.task.id,
        checklistItemId: created.id,
        eventType: "CHECKLIST_AMENDED",
        actorUserId: actor.userId,
        idempotencyKey: input.idempotencyKey,
        payload: {
          amendsItemId: row.item.id,
          itemCode: newItemCode,
          label: input.label,
          evidenceRequired: input.evidenceRequired,
          allowsNa: input.allowsNa,
          reason: input.reason,
          afterHash: amendmentHash,
        },
      }).returning({ id: installationAuditEvents.id });
      if (!auditEvent) throw new Error("Checklist amendment audit event could not be created.");

      await enqueueIntegrationEvent(tx, {
        topic: "installation.checklist.amended",
        aggregateType: "INSTALLATION_PROJECT",
        aggregateId: row.proposalId,
        payload: {
          auditEventId: auditEvent.id,
          localTaskId: row.task.id,
          checklistItemId: created.id,
          itemCode: newItemCode,
          label: input.label,
          evidenceRequired: input.evidenceRequired,
          allowsNa: input.allowsNa,
          reason: input.reason,
          afterHash: amendmentHash,
        },
        dedupeKey: `installation.checklist.amended:${input.idempotencyKey}`,
      });
    });

    await publishPortalStateChanged(row.proposalId, "INSTALLATION_CHECKLIST_AMENDED");
    return NextResponse.json({ success: true, itemId: newItemId });
  } catch (error: unknown) {
    console.error("[Checklist Amend]", error);
    return NextResponse.json({ success: false, error: "Checklist amendment failed." }, { status: 400 });
  }
}
