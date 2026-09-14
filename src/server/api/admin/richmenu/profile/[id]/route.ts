import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { richMenuProfiles, richMenuSchedules } from "@/db/schema";
import { cleanupRichMenuAssignment } from "@/lib/richMenuScheduler";
import { requireStaffJson } from "@/lib/auth-guard";


// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/admin/richmenu/profile/[id]
//
// Cascading delete for a rich_menu_profiles record:
//  1. Verify profile exists.
//  2. For every schedule tied to this profileType that is currently ACTIVE
//     (now is inside [startTime, endTime)), call cleanupRichMenuAssignment()
//     to fire the LINE Messaging API Unlink so user screens revert to default.
//  3. Delete ALL rich_menu_schedules for this profileType.
//  4. Delete the rich_menu_profiles row.
//  5. Return a structured result.
// ─────────────────────────────────────────────────────────────────────────────

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireStaffJson();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!id?.trim()) {
    return NextResponse.json(
      { success: false, error: "Profile ID is required." },
      { status: 400 },
    );
  }

  // 1. Fetch profile
  const profile = await db.query.richMenuProfiles.findFirst({
    where: eq(richMenuProfiles.id, id),
  });
  if (!profile) {
    return NextResponse.json(
      { success: false, error: "ไม่พบ Profile ที่ต้องการลบ" },
      { status: 404 },
    );
  }

  const now = new Date();

  // 2. Find all schedules belonging to this profileType
  const relatedSchedules = await db.query.richMenuSchedules.findMany({
    where: eq(richMenuSchedules.profileType, profile.profileType),
  });

  // 3. For each currently-active schedule, unlink from LINE first
  const activeSchedules = relatedSchedules.filter(
    (s) =>
      s.isActive &&
      new Date(s.startTime) <= now &&
      new Date(s.endTime) > now,
  );

  type UnlinkResult = {
    success: boolean;
    simulated?: boolean;
    unlinkedCount?: number;
    failedCount?: number;
    error?: string;
  };

  const unlinkResults: UnlinkResult[] = [];

  for (const schedule of activeSchedules) {
    try {
      const result = await cleanupRichMenuAssignment(
        schedule.profileType,
        schedule.lineRichMenuId,
      );
      unlinkResults.push(result as UnlinkResult);
    } catch (err: unknown) {
      console.error(
        `[DELETE /api/admin/richmenu/profile] Unlink failed for schedule ${schedule.id}:`,
        err,
      );
      unlinkResults.push({ success: false, error: "LINE unlink failed." });
    }
  }

  // 4. Cascade-delete all related schedules for this profileType
  await db
    .delete(richMenuSchedules)
    .where(eq(richMenuSchedules.profileType, profile.profileType));

  // 5. Delete the profile row itself
  await db.delete(richMenuProfiles).where(eq(richMenuProfiles.id, id));

  const totalUnlinked = unlinkResults.reduce(
    (sum, r) => sum + (r.unlinkedCount ?? 0),
    0,
  );

  return NextResponse.json(
    {
      success: true,
      deletedProfileId: id,
      profileType: profile.profileType,
      deletedScheduleCount: relatedSchedules.length,
      activeSchedulesUnlinked: activeSchedules.length,
      lineUnlinkResults: unlinkResults.map((result) => ({
        success: result.success,
        simulated: result.simulated,
        unlinkedCount: result.unlinkedCount,
        failedCount: result.failedCount,
        error: result.error ? "LINE unlink failed." : undefined,
      })),
      totalLineUnlinkedUsers: totalUnlinked,
    },
    { status: 200 },
  );
}
