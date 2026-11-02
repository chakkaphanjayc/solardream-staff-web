import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canRescheduleVisit,
  clearVisitDateDraft,
  dateKeyInTimeZone,
  dateTimeInTimeZone,
  isVisitWithinDateRange,
  MAX_SCHEDULE_DAY_SPAN,
  reconcileVisitDateDrafts,
  scheduleQueryBounds,
  wallClockInTimeZone,
} from "./schedulePresentation";

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
    const drafts = {
      visitA: { originalDate: "2026-11-04", targetDate: "2026-11-06" },
      visitB: { originalDate: "2026-11-05", targetDate: "2026-11-07" },
    };

    assert.deepEqual(clearVisitDateDraft(drafts, "visitA"), { visitB: drafts.visitB });
    assert.deepEqual(drafts, {
      visitA: { originalDate: "2026-11-04", targetDate: "2026-11-06" },
      visitB: { originalDate: "2026-11-05", targetDate: "2026-11-07" },
    });
  });

  it("reconciles date drafts against refreshed visit dates", () => {
    const drafts = {
      visitA: { originalDate: "2026-11-04", targetDate: "2026-11-06" },
      visitB: { originalDate: "2026-11-05", targetDate: "2026-11-07" },
    };

    assert.deepEqual(reconcileVisitDateDrafts(drafts, {
      visitA: "2026-11-04",
      visitB: "2026-11-08",
    }), { visitA: drafts.visitA });
  });

  it("keeps visit wall-clock times in the visit timezone", () => {
    const previousStart = new Date("2026-06-01T02:30:00.000Z");
    const clock = wallClockInTimeZone(previousStart, "Asia/Bangkok");

    assert.deepEqual(clock, { hour: 9, minute: 30 });
    assert.equal(dateTimeInTimeZone("2026-06-03", clock?.hour ?? 0, clock?.minute ?? 0, "Asia/Bangkok")?.toISOString(), "2026-06-03T02:30:00.000Z");
    assert.equal(dateKeyInTimeZone("2026-06-01T18:00:00.000Z", "Asia/Bangkok"), "2026-06-02");
  });

  it("rejects a local time that does not exist during a timezone transition", () => {
    assert.equal(dateTimeInTimeZone("2026-03-08", 2, 30, "America/Los_Angeles"), null);
  });

  it("queries a UTC envelope that covers visit-local calendar dates", () => {
    assert.deepEqual(scheduleQueryBounds("2026-06-01", "2026-06-03"), {
      from: "2026-05-31T10:00:00.000Z",
      to: "2026-06-04T11:59:59.999Z",
    });
    assert.equal(isVisitWithinDateRange("2026-05-31T10:30:00.000Z", "Pacific/Kiritimati", "2026-06-01", "2026-06-01"), true);
    assert.equal(isVisitWithinDateRange("2026-06-02T11:59:00.000Z", "Etc/GMT+12", "2026-06-01", "2026-06-01"), true);
    assert.equal(isVisitWithinDateRange("2026-06-02T12:00:00.000Z", "Etc/GMT+12", "2026-06-01", "2026-06-01"), false);
  });

  it("limits the calendar query to the days the board can display", () => {
    assert.equal(MAX_SCHEDULE_DAY_SPAN, 30);
    assert.equal(scheduleQueryBounds("2026-06-01", "2026-07-02"), null);
    assert.equal(scheduleQueryBounds("2026-06-02", "2026-06-01"), null);
    assert.equal(scheduleQueryBounds("2026-02-30", "2026-03-01"), null);
  });
});
