import { NextRequest, NextResponse } from "next/server";

import { resolveInstallationProjectActor } from "@/lib/installationAccess";
import { loadInstallationSnapshot } from "@/lib/installationWorkflow";

export async function GET(_request: NextRequest, context: { params: Promise<{ proposalId: string }> }) {
  const { proposalId } = await context.params;
  const access = await resolveInstallationProjectActor(proposalId);
  if (!access) return NextResponse.json({ success: false, error: "Access denied." }, { status: 403 });
  const installation = await loadInstallationSnapshot(proposalId, {
    userId: access.actor.userId,
    mode: access.mode,
    role: access.actor.role,
  });
  if (!installation) return NextResponse.json({ success: false, error: "Project not found." }, { status: 404 });
  const tasks = installation.tasks.map((task) => ({
    id: task.id, taskCode: task.taskCode, title: task.title, sequence: task.sequence,
    dependsOnTaskCode: task.dependsOnTaskCode, assignedUserId: task.assignedUserId, status: task.status, completedAt: task.completedAt,
    capabilities: task.capabilities,
    checklist: task.checklist.map((item) => ({
      id: item.id, taskId: item.taskId, itemCode: item.itemCode, label: item.label, sequence: item.sequence,
      required: item.required, evidenceRequired: item.evidenceRequired, allowsNa: item.allowsNa,
      status: item.status, outcome: item.outcome, remarks: item.remarks, verifiedAt: item.verifiedAt, verifiedByUserId: item.verifiedByUserId,
      verificationHash: item.verificationHash, supersededById: item.supersededById,
      evidence: item.evidence,
    })),
  }));
  return NextResponse.json({
    success: true,
    snapshot: {
      proposal: { id: proposalId, label: access.project.projectCode },
      project: {
        id: installation.project.id,
        projectCode: installation.project.projectCode,
        status: installation.project.status,
        lastSyncedAt: installation.project.lastSyncedAt,
        permitStatus: installation.project.permitStatus,
        permitAuthority: installation.project.permitAuthority,
        permitApplicationNumber: installation.project.permitApplicationNumber,
        permitSubmittedAt: installation.project.permitSubmittedAt,
        permitApprovedAt: installation.project.permitApprovedAt,
      },
      actor: installation.actor,
      tasks,
    },
  }, { headers: { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" } });
}
