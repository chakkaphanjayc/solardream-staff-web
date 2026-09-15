import assert from "node:assert/strict";

import {
  assertInstallationAuditReplay,
  InstallationIdempotencyConflictError,
} from "../../src/lib/installationIdempotency";

const matchingReplay = {
  eventType: "CHECKLIST_VERIFIED",
  proposalId: "proposal-1",
  taskId: "task-1",
  checklistItemId: "item-1",
  payload: {
    outcome: "PASS",
    remarks: null,
    evidenceSha256: "abc",
    afterHash: "server-only-extra",
  },
} as const;

assert.equal(
  assertInstallationAuditReplay(null, {
    eventType: "CHECKLIST_VERIFIED",
    proposalId: "proposal-1",
    taskId: "task-1",
    checklistItemId: "item-1",
    payload: { outcome: "PASS", remarks: null, evidenceSha256: "abc" },
  }),
  false,
);

assert.equal(
  assertInstallationAuditReplay(matchingReplay, {
    eventType: "CHECKLIST_VERIFIED",
    proposalId: "proposal-1",
    taskId: "task-1",
    checklistItemId: "item-1",
    payload: { outcome: "PASS", remarks: null },
  }),
  true,
);

const conflictExpectations = [
  { eventType: "TASK_COMPLETED", proposalId: "proposal-1", taskId: "task-1" },
  { eventType: "CHECKLIST_VERIFIED", proposalId: "proposal-2", taskId: "task-1", checklistItemId: "item-1" },
  { eventType: "CHECKLIST_VERIFIED", proposalId: "proposal-1", taskId: "task-2", checklistItemId: "item-1" },
  { eventType: "CHECKLIST_VERIFIED", proposalId: "proposal-1", taskId: "task-1", checklistItemId: "item-2" },
  {
    eventType: "CHECKLIST_VERIFIED",
    proposalId: "proposal-1",
    taskId: "task-1",
    checklistItemId: "item-1",
    payload: { outcome: "FAIL" },
  },
] as const;

for (const expected of conflictExpectations) {
  assert.throws(
    () => assertInstallationAuditReplay(matchingReplay, expected),
    (error: unknown) => error instanceof InstallationIdempotencyConflictError,
  );
}

const taskReplay = {
  eventType: "TASK_COMPLETED",
  proposalId: "proposal-1",
  taskId: "task-1",
  checklistItemId: null,
  payload: {},
};
assert.equal(
  assertInstallationAuditReplay(taskReplay, {
    eventType: "TASK_COMPLETED",
    proposalId: "proposal-1",
    taskId: "task-1",
    payload: {},
  }),
  true,
);

process.stdout.write("Installation idempotency fixtures passed.\n");
