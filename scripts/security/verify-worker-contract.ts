import assert from "node:assert/strict";

import {
  COMMUNICATION_EVENT_TYPES,
  COMMUNICATION_WORKER_TOPICS,
  DOCUMENT_WORKER_TOPICS,
  WORKER_EVENT_SCHEMA_VERSION,
  isWorkerTopic,
} from "@solar-dream/contracts/workers";

assert.equal(WORKER_EVENT_SCHEMA_VERSION, 1);
assert.deepEqual(DOCUMENT_WORKER_TOPICS, ["document.verified", "documents.render.requested"]);
assert.deepEqual(COMMUNICATION_WORKER_TOPICS, ["communications.notification.requested"]);
assert.equal(COMMUNICATION_EVENT_TYPES.length, 7);

for (const topic of [...DOCUMENT_WORKER_TOPICS, ...COMMUNICATION_WORKER_TOPICS]) {
  assert.equal(isWorkerTopic(topic), true);
}
assert.equal(isWorkerTopic("installation.task.completed"), false);
assert.equal(isWorkerTopic("communications.notification.failed"), false);

console.log("Worker contract fixtures passed.");

