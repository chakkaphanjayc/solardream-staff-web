import assert from "node:assert/strict";

import {
  classifyTechSyncResponse,
  getLegacyTechSyncState,
  getTechRetryDelayMs,
  isTechSyncAckState,
} from "../../src/lib/techPortalSyncPolicy";

const statusExpectations = {
  PENDING: "LOCAL_SAVED",
  PENDING_AUTH: "PENDING_AUTH",
  SYNCING: "UPLOADING",
  SYNCED: "SYNCED",
  FAILED: "RETRY_AVAILABLE",
  CONFLICT: "CONFLICT",
  REJECTED: "REJECTED",
} as const;

for (const [status, expected] of Object.entries(statusExpectations)) {
  assert.equal(getLegacyTechSyncState(status as keyof typeof statusExpectations), expected);
}

assert.equal(isTechSyncAckState("PENDING_SERVER"), true);
assert.equal(isTechSyncAckState("PENDING_ERP"), true);
assert.equal(isTechSyncAckState("SYNCED"), true);
assert.equal(isTechSyncAckState("CONFLICT"), false);

assert.equal(getTechRetryDelayMs(1), 2_000);
assert.equal(getTechRetryDelayMs(8), 256_000);
assert.equal(getTechRetryDelayMs(10), 15 * 60 * 1_000);
assert.equal(getTechRetryDelayMs(99), 15 * 60 * 1_000);

assert.equal(classifyTechSyncResponse({ status: 200, contentType: "application/json" }), "JSON");
assert.equal(classifyTechSyncResponse({ status: 403, contentType: "application/json" }), "JSON");
assert.equal(classifyTechSyncResponse({ status: 401, contentType: "application/json" }), "AUTH");
assert.equal(classifyTechSyncResponse({ status: 403, contentType: "text/html; charset=utf-8" }), "AUTH");
assert.equal(classifyTechSyncResponse({ status: 200, contentType: "text/html; charset=utf-8" }), "AUTH");
assert.equal(classifyTechSyncResponse({ status: 200, contentType: "application/json", redirected: true }), "AUTH");
assert.equal(classifyTechSyncResponse({ status: 502, contentType: "text/plain" }), "NON_JSON");

process.stdout.write("Technician offline sync policy fixtures passed.\n");
