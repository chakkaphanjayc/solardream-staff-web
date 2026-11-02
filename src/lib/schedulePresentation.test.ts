import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { canRescheduleVisit, clearVisitDateDraft } from "./schedulePresentation";

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

  it("clears one moved visit date draft without changing other drafts", () => {
    const drafts = { visitA: "2026-11-04", visitB: "2026-11-05" };

    assert.deepEqual(clearVisitDateDraft(drafts, "visitA"), { visitB: "2026-11-05" });
    assert.deepEqual(drafts, { visitA: "2026-11-04", visitB: "2026-11-05" });
  });
});
