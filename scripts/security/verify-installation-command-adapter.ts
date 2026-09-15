import assert from "node:assert/strict";

import {
  getInstallationCommandState,
  StaffInstallationCommandService,
  type InstallationCommandGateway,
} from "@/server/services/staff-api/installation-command-service";

assert.equal(getInstallationCommandState({ enabled: true, configured: true }), "ERP_APPLIED");
assert.equal(getInstallationCommandState({ enabled: false, configured: true }), "PENDING_ERP");
assert.equal(getInstallationCommandState({ enabled: true, configured: false }), "PENDING_ERP");

let checklistInput: unknown;
let taskInput: unknown;
let reviewInput: unknown;
let amendmentInput: unknown;
const gateway: InstallationCommandGateway = {
  isConfigured: () => true,
  completeInstallationChecklistItem: async (input) => {
    checklistInput = input;
    return { task: input.taskId, item: input.itemCode };
  },
  completeInstallationTask: async (input) => {
    taskInput = input;
    return { task: input.taskId };
  },
  reviewInstallationEvidence: async (input) => {
    reviewInput = input;
    return { task: input.taskId, decision: input.decision };
  },
  amendInstallationChecklistItem: async (input) => {
    amendmentInput = input;
    return { task: input.taskId, item: input.newItemCode || input.itemCode };
  },
};

async function main() {
  const previousSyncFlag = process.env.ERPNEXT_INSTALLATION_SYNC_ENABLED;
  const previousCommandFlag = process.env.ERPNEXT_INSTALLATION_COMMANDS_ENABLED;
  process.env.ERPNEXT_INSTALLATION_SYNC_ENABLED = "true";
  process.env.ERPNEXT_INSTALLATION_COMMANDS_ENABLED = "false";

  try {
  const service = new StaffInstallationCommandService(gateway);
  const pending = await service.completeTask({ taskId: "TASK-1", idempotencyKey: "task-command-123456" });
  assert.equal(pending.state, "PENDING_ERP");
  assert.equal(taskInput, undefined);

  process.env.ERPNEXT_INSTALLATION_COMMANDS_ENABLED = "true";
  const key = "installation-command-123456";
  const checklist = await service.completeChecklistItem({
    taskId: "TASK-1",
    itemCode: "SITE_REVIEW_READY",
    outcome: "PASS",
    remarks: " inspected ",
    evidenceHash: "abc123",
    evidenceMime: "image/jpeg",
    idempotencyKey: key,
  });
  assert.equal(checklist.state, "ERP_APPLIED");
  assert.deepEqual(checklistInput, {
    taskId: "TASK-1",
    itemCode: "SITE_REVIEW_READY",
    outcome: "Pass",
    remarks: "inspected",
    evidenceHash: "abc123",
    evidenceMime: "image/jpeg",
    idempotencyKey: key,
  });

  await service.completeTask({ taskId: "TASK-1", idempotencyKey: "task-command-123456" });
  assert.deepEqual(taskInput, { taskId: "TASK-1", idempotencyKey: "task-command-123456" });

  await service.reviewEvidence({
    taskId: "TASK-1",
    itemCode: "SITE_REVIEW_READY",
    decision: "READY",
    reason: "clear evidence",
    evidenceHash: "abc123",
    idempotencyKey: "review-command-123456",
  });
  assert.deepEqual(reviewInput, {
    taskId: "TASK-1",
    itemCode: "SITE_REVIEW_READY",
    decision: "Approved",
    reason: "clear evidence",
    evidenceHash: "abc123",
    idempotencyKey: "review-command-123456",
  });

  await service.amendChecklistItem({
    taskId: "TASK-1",
    itemCode: "SITE_REVIEW_READY",
    newItemCode: "SD-AMEND-SITE_REVIEW_READY-ABC123",
    label: "Updated site review",
    evidenceRequired: true,
    allowsNa: false,
    reason: "updated scope",
    idempotencyKey: "amend-command-123456",
  });
  assert.deepEqual(amendmentInput, {
    taskId: "TASK-1",
    itemCode: "SITE_REVIEW_READY",
    newItemCode: "SD-AMEND-SITE_REVIEW_READY-ABC123",
    label: "Updated site review",
    evidenceRequired: true,
    allowsNa: false,
    reason: "updated scope",
    idempotencyKey: "amend-command-123456",
  });

  await assert.rejects(
    service.completeTask({ taskId: "TASK-1", idempotencyKey: "too-short" }),
    /idempotency key is invalid/i,
  );
  } finally {
    if (previousSyncFlag === undefined) delete process.env.ERPNEXT_INSTALLATION_SYNC_ENABLED;
    else process.env.ERPNEXT_INSTALLATION_SYNC_ENABLED = previousSyncFlag;
    if (previousCommandFlag === undefined) delete process.env.ERPNEXT_INSTALLATION_COMMANDS_ENABLED;
    else process.env.ERPNEXT_INSTALLATION_COMMANDS_ENABLED = previousCommandFlag;
  }

  console.log("Installation command adapter fixtures passed.");
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
