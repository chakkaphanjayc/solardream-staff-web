import { and, asc, desc, eq, gt, isNull, lt, ne, lte, or } from "drizzle-orm";
import { db } from "@/db";
import { richMenuProfiles, richMenuSchedules, users } from "@/db/schema";
import {
  clearDefaultRichMenuForAllUsers,
  linkRichMenuToUser,
  linkRichMenuToUsers,
  unlinkRichMenuFromUser,
  setDefaultRichMenuForAllUsers,
} from "@/lib/linePush";
import {
  ensureDefaultLineUserGroupRules,
  resolveLineUserGroupForUser,
  resolveLineUserIdsForGroup,
} from "@/lib/lineUserGroups";
import {
  getRichMenuProfileLabel,
  type RichMenuProfileType,
  type RichMenuScheduleRecord,
} from "@/lib/richMenuSchedulerTypes";
import { getLineIntegrationConfig } from "@/lib/lineApi";

export {
  getRichMenuProfileLabel,
  isRichMenuProfileType,
  isRichMenuScheduleOverlap,
  normalizeRichMenuProfileType,
  RICH_MENU_PROFILE_TYPES,
  type RichMenuProfileRecord,
  type RichMenuProfileType,
  type RichMenuScheduleRecord,
} from "@/lib/richMenuSchedulerTypes";

export function getRichMenuSchedulerTimezone() {
  const candidate = (process.env.LINE_AUTOMATION_TIMEZONE || "Asia/Bangkok").trim();
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format();
    return candidate;
  } catch {
    return "Asia/Bangkok";
  }
}

export async function getRichMenuProfiles() {
  return db.query.richMenuProfiles.findMany({
    orderBy: [asc(richMenuProfiles.profileType), desc(richMenuProfiles.isActive), desc(richMenuProfiles.createdAt)],
  });
}

export async function getRichMenuSchedules() {
  return db.query.richMenuSchedules.findMany({
    orderBy: [asc(richMenuSchedules.profileType), asc(richMenuSchedules.startTime), desc(richMenuSchedules.createdAt)],
  });
}

export async function getRichMenuScheduleConflicts(
  profileType: RichMenuProfileType,
  startTime: Date,
  endTime: Date,
  ignoreScheduleId?: string,
) {
  const conditions = [
    eq(richMenuSchedules.profileType, profileType),
    lt(richMenuSchedules.startTime, endTime),
    gt(richMenuSchedules.endTime, startTime),
  ];

  if (ignoreScheduleId) {
    conditions.push(ne(richMenuSchedules.id, ignoreScheduleId));
  }

  return db.select().from(richMenuSchedules).where(and(...conditions));
}

export async function getActiveRichMenuSchedules(now = new Date()) {
  return db.query.richMenuSchedules.findMany({
    where: (table, { and, eq, lte, gt }) =>
      and(
        eq(table.isActive, true),
        lte(table.startTime, now),
        gt(table.endTime, now),
      ),
    orderBy: [asc(richMenuSchedules.profileType), asc(richMenuSchedules.startTime)],
  });
}

export async function resolveLineUserIdsForProfileType(profileType: RichMenuProfileType) {
  return resolveLineUserIdsForGroup(profileType);
}

export async function applyRichMenuScheduleToAudience(schedule: Pick<RichMenuScheduleRecord, "profileType" | "lineRichMenuId">) {
  if (schedule.profileType === "GUEST") {
    return setDefaultRichMenuForAllUsers(schedule.lineRichMenuId);
  }

  const lineUserIds = await resolveLineUserIdsForProfileType(schedule.profileType);
  if (lineUserIds.length === 0) {
    return {
      success: true,
      simulated: false,
      linkedCount: 0,
      message: `No linked LINE users found for ${getRichMenuProfileLabel(schedule.profileType)}.`,
    };
  }

  return linkRichMenuToUsers(lineUserIds, schedule.lineRichMenuId);
}

export async function cleanupRichMenuAssignment(
  profileType: RichMenuProfileType,
  lineRichMenuId?: string | null,
) {
  if (profileType === "GUEST") {
    return clearDefaultRichMenuForAllUsers();
  }

  if (!lineRichMenuId) {
    return { success: true, simulated: false, unlinkedCount: 0 };
  }

  const lineUserIds = await resolveLineUserIdsForProfileType(profileType);
  if (lineUserIds.length === 0) {
    return { success: true, simulated: false, unlinkedCount: 0 };
  }

  const results = await Promise.allSettled(
    lineUserIds.map((lineUserId) => unlinkRichMenuFromUser(lineUserId)),
  );

  const failed = results.filter((result) => result.status === "rejected" || (result.status === "fulfilled" && !result.value.success));

  return {
    success: failed.length === 0,
    simulated: false,
    unlinkedCount: lineUserIds.length - failed.length,
    failedCount: failed.length,
  };
}

export async function getCurrentActiveRichMenuAssignment(profileType: RichMenuProfileType, now = new Date()) {
  return db.query.richMenuSchedules.findFirst({
    where: (table) =>
      and(
        eq(table.profileType, profileType),
        eq(table.isActive, true),
        lte(table.startTime, now),
        gt(table.endTime, now),
      ),
    orderBy: [desc(richMenuSchedules.startTime)],
  });
}

export async function getFallbackRichMenuProfile(profileType: RichMenuProfileType) {
  return db.query.richMenuProfiles.findFirst({
    where: (table, { and, eq, isNotNull }) =>
      and(
        eq(table.profileType, profileType),
        eq(table.isActive, true),
        isNotNull(table.lineRichMenuId),
      ),
    orderBy: [desc(richMenuProfiles.updatedAt), desc(richMenuProfiles.createdAt)],
  });
}

export async function resolveLineRichMenuIdForProfileType(
  profileType: RichMenuProfileType,
  now = new Date(),
) {
  const activeSchedule = await getCurrentActiveRichMenuAssignment(profileType, now);
  if (activeSchedule?.lineRichMenuId) {
    return {
      lineRichMenuId: activeSchedule.lineRichMenuId,
      source: "schedule" as const,
      profileType,
    };
  }

  const fallbackProfile = await getFallbackRichMenuProfile(profileType);
  if (fallbackProfile?.lineRichMenuId) {
    return {
      lineRichMenuId: fallbackProfile.lineRichMenuId,
      source: "profile" as const,
      profileType,
    };
  }

  if (profileType === "MEMBER") {
    const { memberRichMenuId: envMemberMenuId } = await getLineIntegrationConfig();

    if (envMemberMenuId) {
      return {
        lineRichMenuId: envMemberMenuId,
        source: "env" as const,
        profileType,
      };
    }
  }

  return null;
}

export async function applyRichMenuToLineUserForProfileType(
  lineUserId: string,
  profileType: RichMenuProfileType,
) {
  if (profileType === "GUEST") {
    return unlinkRichMenuFromUser(lineUserId);
  }

  const assignment = await resolveLineRichMenuIdForProfileType(profileType);
  if (!assignment) {
    console.warn("[Rich Menu Scheduler] No rich menu mapping found for linked LINE user.", {
      lineUserId,
      profileType,
    });
    return {
      success: false,
      skipped: true,
      error: `No active rich menu profile or schedule found for ${getRichMenuProfileLabel(profileType)}.`,
      lineUserId,
      profileType,
    };
  }

  const result = await linkRichMenuToUser(lineUserId, assignment.lineRichMenuId);
  return {
    ...result,
    profileType,
    lineRichMenuId: assignment.lineRichMenuId,
    assignmentSource: assignment.source,
  };
}

export async function applyResolvedRichMenuToUser(userId: string) {
  const user = await db.query.users.findFirst({
    columns: {
      id: true,
      lineUserId: true,
    },
    where: eq(users.id, userId),
  });

  if (!user?.lineUserId) {
    return {
      success: false,
      skipped: true,
      error: "User does not have a linked LINE user ID.",
      userId,
    };
  }

  await ensureDefaultLineUserGroupRules();
  const resolved = await resolveLineUserGroupForUser(user.id);
  if (!resolved) {
    return {
      success: false,
      skipped: true,
      error: "Unable to resolve user group.",
      userId,
      lineUserId: user.lineUserId,
    };
  }

  const result = await applyRichMenuToLineUserForProfileType(user.lineUserId, resolved.group);
  return {
    ...result,
    userId,
    resolvedGroup: resolved.group,
    resolvedReason: resolved.reason,
    resolvedSource: resolved.source,
  };
}

function getScheduleWindowKey(schedule: Pick<RichMenuScheduleRecord, "id" | "startTime" | "endTime" | "lineRichMenuId">) {
  return [
    schedule.id,
    schedule.startTime.toISOString(),
    schedule.endTime.toISOString(),
    schedule.lineRichMenuId,
  ].join(":");
}

async function claimRichMenuSchedule(
  schedule: RichMenuScheduleRecord,
  now: Date,
  windowKey: string,
) {
  const [claimed] = await db
    .update(richMenuSchedules)
    .set({
      lastAppliedWindowKey: windowKey,
      lastAppliedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(richMenuSchedules.id, schedule.id),
        eq(richMenuSchedules.isActive, true),
        lte(richMenuSchedules.startTime, now),
        gt(richMenuSchedules.endTime, now),
        or(
          isNull(richMenuSchedules.lastAppliedWindowKey),
          ne(richMenuSchedules.lastAppliedWindowKey, windowKey),
        ),
      ),
    )
    .returning({ id: richMenuSchedules.id });

  return Boolean(claimed);
}

async function releaseRichMenuScheduleClaim(scheduleId: string, windowKey: string) {
  await db
    .update(richMenuSchedules)
    .set({
      lastAppliedWindowKey: null,
      lastAppliedAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(richMenuSchedules.id, scheduleId),
        eq(richMenuSchedules.lastAppliedWindowKey, windowKey),
      ),
    );
}

export async function processRichMenuScheduler(now = new Date()) {
  const schedules = await getActiveRichMenuSchedules(now);
  const results = [];

  for (const schedule of schedules) {
    const windowKey = getScheduleWindowKey(schedule);
    const claimed = await claimRichMenuSchedule(schedule, now, windowKey);
    if (!claimed) {
      results.push({
        profileType: schedule.profileType,
        richMenuId: schedule.lineRichMenuId,
        success: true,
        skipped: true,
        reason: "already-applied-for-window",
      });
      continue;
    }

    let result: Awaited<ReturnType<typeof applyRichMenuScheduleToAudience>>;
    try {
      result = await applyRichMenuScheduleToAudience(schedule);
    } catch (error: unknown) {
      await releaseRichMenuScheduleClaim(schedule.id, windowKey).catch((releaseError: unknown) => {
        console.error("[Rich Menu Scheduler] Failed to release a failed schedule claim.", releaseError);
      });
      throw error;
    }

    const success = Boolean(result && typeof result === "object" && "success" in result ? (result as { success: boolean }).success : true);
    if (!success) await releaseRichMenuScheduleClaim(schedule.id, windowKey);
    results.push({
      profileType: schedule.profileType,
      richMenuId: schedule.lineRichMenuId,
      success,
      skipped: false,
      result,
    });
  }

  return {
    success: true,
    processedCount: schedules.length,
    appliedCount: results.filter((result) => !result.skipped).length,
    skippedCount: results.filter((result) => result.skipped).length,
    results,
  };
}
