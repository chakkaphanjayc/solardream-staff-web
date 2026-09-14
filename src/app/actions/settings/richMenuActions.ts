"use server";

import { checkAdmin } from "@/app/actions/auth";
import {
  applyRichMenuScheduleToAudience,
  getActiveRichMenuSchedules,
  getRichMenuProfiles,
  getRichMenuSchedules,
  type RichMenuProfileType,
} from "@/lib/richMenuScheduler";
import { RICH_MENU_PROFILE_TYPES, getRichMenuProfileLabel } from "@/lib/richMenuSchedulerTypes";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ActiveScheduleSummaryItem = {
  profileType: RichMenuProfileType;
  profileLabel: string;
  lineRichMenuId: string | null;
  scheduleId: string | null;
  startTime: Date | null;
  endTime: Date | null;
  isActiveNow: boolean;
};

export type ApplyProfileResult = {
  success: boolean;
  simulated?: boolean;
  linkedCount?: number;
  unlinkedCount?: number;
  message?: string;
  error?: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Feature 1: Apply active rich menu schedule for a profile type to LINE users
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Looks up the currently active schedule for the given profile type, then
 * calls the LINE API to link the correct rich menu to every matched user.
 *
 * Overlap logic: Only one schedule can be active (start <= now < end) per
 * profile type at any time. Normal inserts reject conflicts; the scheduler's
 * explicit overwrite action replaces the conflicting window first.
 */
export async function applyProfileScheduleNow(
  profileType: RichMenuProfileType,
): Promise<ApplyProfileResult> {
  await checkAdmin();

  const now = new Date();

  // Step 1 — Find the schedule that is active RIGHT NOW for this profile type.
  // getActiveRichMenuSchedules returns all schedules whose window contains `now`.
  const activeSchedules = await getActiveRichMenuSchedules(now);
  const activeSchedule = activeSchedules.find((s) => s.profileType === profileType) ?? null;

  if (!activeSchedule) {
    return {
      success: false,
      error: `ไม่พบ Schedule ที่กำลัง Active อยู่ในขณะนี้สำหรับกลุ่ม ${getRichMenuProfileLabel(profileType)} กรุณาตรวจสอบช่วงเวลาที่ตั้งค่าไว้`,
    };
  }

  if (!activeSchedule.lineRichMenuId) {
    return {
      success: false,
      error: `Schedule ที่ Active อยู่ยังไม่มี LINE Rich Menu ID กรุณา Publish Rich Menu ก่อน`,
    };
  }

  // Step 2 — Push the rich menu link to all matched LINE users.
  try {
    const result = await applyRichMenuScheduleToAudience({
      profileType: activeSchedule.profileType,
      lineRichMenuId: activeSchedule.lineRichMenuId,
    });

    if (!result || !("success" in result)) {
      return { success: false, error: "ไม่สามารถติดต่อ LINE API ได้" };
    }

    const applyResult = result as {
      success: boolean;
      simulated?: boolean;
      linkedCount?: number;
      message?: string;
    };

    return {
      success: applyResult.success,
      simulated: applyResult.simulated ?? false,
      linkedCount: applyResult.linkedCount ?? 0,
      message: applyResult.message,
    };
  } catch (err: unknown) {
    console.error(`[richMenuActions] applyProfileScheduleNow failed for ${profileType}:`, err);
    return {
      success: false,
      error: "เกิดข้อผิดพลาดในการส่งคำสั่งไปยัง LINE API",
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Feature 4: Active schedule summary for the dashboard
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns one row per RICH_MENU_PROFILE_TYPE with the currently active
 * schedule (if any). Used by the Active Status Dashboard to show which
 * profile is being served to LINE users RIGHT NOW.
 */
export async function getActiveScheduleSummary(
  now = new Date(),
): Promise<ActiveScheduleSummaryItem[]> {
  await checkAdmin();

  const [profiles, schedules] = await Promise.all([
    getRichMenuProfiles(),
    getRichMenuSchedules(),
  ]);

  const profileLineMenuMap = new Map(
    profiles.map((p) => [p.profileType, p.lineRichMenuId]),
  );

  return RICH_MENU_PROFILE_TYPES.map((profileType) => {
    // Find the schedule whose window contains `now`
    const activeSchedule = schedules.find(
      (s) =>
        s.profileType === profileType &&
        s.isActive &&
        new Date(s.startTime) <= now &&
        new Date(s.endTime) > now,
    );

    return {
      profileType,
      profileLabel: getRichMenuProfileLabel(profileType),
      lineRichMenuId: activeSchedule?.lineRichMenuId ?? profileLineMenuMap.get(profileType) ?? null,
      scheduleId: activeSchedule?.id ?? null,
      startTime: activeSchedule ? new Date(activeSchedule.startTime) : null,
      endTime: activeSchedule ? new Date(activeSchedule.endTime) : null,
      isActiveNow: Boolean(activeSchedule),
    };
  });
}
