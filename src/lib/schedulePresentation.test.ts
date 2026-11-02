import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { canRescheduleVisit } from "./schedulePresentation";

describe("schedule presentation actions", () => {
  it("allows date changes for planned and confirmed visits", () => {
    assert.equal(canRescheduleVisit("PLANNED"), true);
    assert.equal(canRescheduleVisit("CONFIRMED"), true);
  });

  it("does not offer rescheduling for active or terminal visits", () => {
    assert.equal(canRescheduleVisit("IN_PROGRESS"), false);
    assert.equal(canRescheduleVisit("COMPLETED"), false);
    assert.equal(canRescheduleVisit("CANCELLED"), false);
    assert.equal(canRescheduleVisit("UNKNOWN"), false);
  });
});
