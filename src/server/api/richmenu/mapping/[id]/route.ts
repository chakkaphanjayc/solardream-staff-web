import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { richMenuSchedules } from "@/db/schema";
import { cleanupRichMenuAssignment } from "@/lib/richMenuScheduler";
import { requireStaffJson } from "@/lib/auth-guard";


// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/richmenu/mapping/[id]
//
// Deletes a rich_menu_schedules row by ID.
//
// If the schedule is currently active (now is inside its [startTime, endTime)
// window), the handler first calls cleanupRichMenuAssignment() which fires the
// LINE Messaging API Unlink endpoint so the user's LINE app reverts to the
// default (channel-level) rich menu.
// ─────────────────────────────────────────────────────────────────────────────

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireStaffJson();
  if (!auth.ok) return auth.response;

  const { id } = await params;

  if (!id || typeof id !== "string" || id.trim().length === 0) {
    return NextResponse.json(
      { success: false, error: "Schedule ID is required." },
      { status: 400 },
    );
  }

  // 1. Fetch the target schedule
  const schedule = await db.query.richMenuSchedules.findFirst({
    where: eq(richMenuSchedules.id, id),
  });

  if (!schedule) {
    return NextResponse.json(
      { success: false, error: "ไม่พบตารางเวลา (Schedule) ที่ต้องการลบ" },
      { status: 404 },
    );
  }

  const now = new Date();
  const isCurrentlyActive =
    schedule.isActive &&
    new Date(schedule.startTime) <= now &&
    new Date(schedule.endTime) > now;

  // 2. If the schedule is live right now, unlink the rich menu from LINE users
  //    so they immediately revert to the channel-default menu.
  let unlinkResult: { success: boolean; simulated?: boolean; unlinkedCount?: number } | null = null;

  if (isCurrentlyActive) {
    try {
      const cleanup = await cleanupRichMenuAssignment(
        schedule.profileType,
        schedule.lineRichMenuId,
      );
      unlinkResult = cleanup as unknown as typeof unlinkResult;
    } catch (err: unknown) {
      console.error("[DELETE /api/richmenu/mapping] Unlink failed:", err);
      return NextResponse.json(
        {
          success: false,
          error: "ไม่สามารถยกเลิก Rich Menu บน LINE ได้ กรุณาลองใหม่หรือยกเลิกด้วยตนเองใน LINE Console.",
        },
        { status: 502 },
      );
    }
  }

  // 3. Delete the DB row
  await db.delete(richMenuSchedules).where(eq(richMenuSchedules.id, id));

  return NextResponse.json(
    {
      success: true,
      deleted: id,
      wasActive: isCurrentlyActive,
      unlinkResult,
    },
    { status: 200 },
  );
}
