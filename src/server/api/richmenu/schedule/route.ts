import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, gt, lt } from "drizzle-orm";
import { db } from "@/db";
import { richMenuProfiles, richMenuSchedules } from "@/db/schema";
import { requireStaffJson } from "@/lib/auth-guard";
import { isRequestContentLengthExceeded } from "@/lib/requestSize";
import {
  applyRichMenuScheduleToAudience,
  cleanupRichMenuAssignment,
  getRichMenuProfileLabel,
  getRichMenuScheduleConflicts,
  normalizeRichMenuProfileType,
  type RichMenuProfileType,
} from "@/lib/richMenuScheduler";

export const maxDuration = 300;

type CreateProfilePayload = {
  kind: "profile";
  profileType: RichMenuProfileType;
  name?: string;
  description?: string | null;
  imageUrl?: string | null;
  richMenuId?: string | null;
  lineRichMenuId?: string | null;
  isActive?: boolean;
};

type CreateSchedulePayload = {
  kind: "schedule";
  profileType: RichMenuProfileType;
  startTime: string;
  endTime: string;
  isActive?: boolean;
  overwrite?: boolean;
};

type RequestBody = CreateProfilePayload | CreateSchedulePayload;
const MAX_RICH_MENU_SCHEDULE_BODY_BYTES = 64 * 1024;

export async function GET() {
  const auth = await requireStaffJson();
  if (!auth.ok) return auth.response;

  const [profiles, schedules] = await Promise.all([
    db.query.richMenuProfiles.findMany({
      orderBy: [asc(richMenuProfiles.profileType), asc(richMenuProfiles.name)],
    }),
    db.query.richMenuSchedules.findMany({
      orderBy: [asc(richMenuSchedules.profileType), asc(richMenuSchedules.startTime)],
    }),
  ]);

  return NextResponse.json({ success: true, profiles, schedules }, { status: 200 });
}

export async function POST(request: NextRequest) {
  const auth = await requireStaffJson();
  if (!auth.ok) return auth.response;

  if (isRequestContentLengthExceeded(request.headers, MAX_RICH_MENU_SCHEDULE_BODY_BYTES)) {
    return NextResponse.json(
      { success: false, error: "Rich menu schedule payload is too large." },
      { status: 413 },
    );
  }

  const body = (await request.json().catch(() => null)) as RequestBody | null;
  if (!body?.kind) {
    return NextResponse.json({ success: false, error: "kind is required." }, { status: 400 });
  }

  if (body.kind === "profile") {
    const profileType = normalizeRichMenuProfileType(body.profileType);
    if (!profileType) {
      return NextResponse.json(
        { success: false, error: "profileType is required." },
        { status: 400 },
      );
    }

    const existingProfile = await db.query.richMenuProfiles.findFirst({
      where: eq(richMenuProfiles.profileType, profileType),
    });

    const name =
      typeof body.name === "string" && body.name.trim()
        ? body.name.trim()
        : existingProfile?.name ?? getRichMenuProfileLabel(profileType);
    const description =
      body.description === undefined
        ? existingProfile?.description ?? null
        : typeof body.description === "string"
          ? body.description.trim() || null
          : null;
    const imageUrl =
      body.imageUrl === undefined
        ? existingProfile?.imageUrl ?? null
        : typeof body.imageUrl === "string"
          ? body.imageUrl.trim() || null
          : null;
    if (imageUrl) {
      try {
        const parsedImageUrl = new URL(imageUrl);
        if (parsedImageUrl.protocol !== "http:" && parsedImageUrl.protocol !== "https:") {
          throw new Error("Unsupported image URL protocol.");
        }
      } catch {
        return NextResponse.json(
          { success: false, error: "imageUrl must be a valid HTTP or HTTPS URL." },
          { status: 400 },
        );
      }
    }
    const richMenuId =
      body.richMenuId === undefined
        ? existingProfile?.richMenuId ?? null
        : typeof body.richMenuId === "string"
          ? body.richMenuId.trim() || null
          : null;
    const lineRichMenuId =
      body.lineRichMenuId === undefined
        ? existingProfile?.lineRichMenuId ?? null
        : typeof body.lineRichMenuId === "string"
          ? body.lineRichMenuId.trim() || null
          : null;
    const isActive = body.isActive ?? existingProfile?.isActive ?? true;

    const [profile] = await db
      .insert(richMenuProfiles)
      .values({
        profileType,
        name,
        description,
        imageUrl,
        richMenuId,
        lineRichMenuId,
        isActive,
      })
      .onConflictDoUpdate({
        target: richMenuProfiles.profileType,
        set: {
          name,
          description,
          imageUrl,
          richMenuId,
          lineRichMenuId,
          isActive,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (lineRichMenuId) {
      await db
        .update(richMenuSchedules)
        .set({
          lineRichMenuId,
          updatedAt: new Date(),
        })
        .where(eq(richMenuSchedules.profileType, profileType));
    }

    return NextResponse.json({ success: true, profile }, { status: 200 });
  }

  const profileType = normalizeRichMenuProfileType(body.profileType);
  const startTime = body.startTime ? new Date(body.startTime) : null;
  const endTime = body.endTime ? new Date(body.endTime) : null;

  if (!profileType || !startTime || !endTime || Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
    return NextResponse.json(
      { success: false, error: "profileType, startTime, and endTime are required." },
      { status: 400 },
    );
  }

  if (startTime >= endTime) {
    return NextResponse.json(
      { success: false, error: "startTime must be earlier than endTime." },
      { status: 400 },
    );
  }

  const profile = await db.query.richMenuProfiles.findFirst({
    where: eq(richMenuProfiles.profileType, profileType),
  });

  if (!profile) {
    return NextResponse.json(
      {
        success: false,
        error: "ไม่พบ Rich Menu Profile ของกลุ่มนี้ กรุณาสร้าง Profile ก่อนบันทึกตารางเวลา",
      },
      { status: 404 },
    );
  }

  if (!profile.lineRichMenuId) {
    return NextResponse.json(
      {
        success: false,
        error: "Rich Menu Profile นี้ยังไม่มี LINE Rich Menu ID กรุณา Publish Rich Menu ก่อน",
      },
      { status: 409 },
    );
  }

  const overwrite = (body as CreateSchedulePayload).overwrite === true;
  const conflicts = await getRichMenuScheduleConflicts(profileType, startTime, endTime);
  if (conflicts.length > 0 && !overwrite) {
    return NextResponse.json(
      {
        success: false,
        error: "ไม่สามารถบันทึกได้เนื่องจากมี Rich Menu อื่นจองช่วงเวลานี้ของกลุ่มลูกค้านี้อยู่แล้ว",
        conflicts,
      },
      { status: 409 },
    );
  }

  let replacedSchedules: typeof richMenuSchedules.$inferSelect[] = [];
  let transactionConflict = false;
  const schedule = await db.transaction(async (tx) => {
    const recheck = await tx
      .select()
      .from(richMenuSchedules)
      .where(
        and(
          eq(richMenuSchedules.profileType, profileType),
          lt(richMenuSchedules.startTime, endTime),
          gt(richMenuSchedules.endTime, startTime),
        ),
      );

    if (recheck.length > 0 && !overwrite) {
      transactionConflict = true;
      return null;
    }

    if (recheck.length > 0) {
      replacedSchedules = await tx
        .delete(richMenuSchedules)
        .where(
          and(
            eq(richMenuSchedules.profileType, profileType),
            lt(richMenuSchedules.startTime, endTime),
            gt(richMenuSchedules.endTime, startTime),
          ),
        )
        .returning();
    }

    const [createdSchedule] = await tx
      .insert(richMenuSchedules)
      .values({
        profileType,
        richMenuId: profile.richMenuId || profile.id,
        lineRichMenuId: profile.lineRichMenuId ?? "",
        startTime,
        endTime,
        isActive: (body as CreateSchedulePayload).isActive ?? true,
      })
      .returning();

    return createdSchedule ?? null;
  });

  if (transactionConflict || !schedule) {
    return NextResponse.json(
      {
        success: false,
        error: "ไม่สามารถบันทึกได้เนื่องจากมี Rich Menu อื่นจองช่วงเวลานี้ของกลุ่มลูกค้านี้อยู่แล้ว",
      },
      { status: 409 },
    );
  }

  const now = new Date();
  const replacedActiveSchedules = replacedSchedules.filter(
    (replacedSchedule) =>
      replacedSchedule.isActive &&
      replacedSchedule.startTime <= now &&
      replacedSchedule.endTime > now,
  );

  if (replacedActiveSchedules.length > 0) {
    try {
      const newScheduleIsActive =
        schedule.isActive && schedule.startTime <= now && schedule.endTime > now;

      if (newScheduleIsActive) {
        await applyRichMenuScheduleToAudience(schedule);
      } else {
        await Promise.all(
          replacedActiveSchedules.map((replacedSchedule) =>
            cleanupRichMenuAssignment(replacedSchedule.profileType, replacedSchedule.lineRichMenuId),
          ),
        );
      }
    } catch (error: unknown) {
      console.error("[richmenu/schedule] Failed to sync overwritten schedule to LINE:", error);
    }
  }

  return NextResponse.json({ success: true, schedule }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireStaffJson();
  if (!auth.ok) return auth.response;

  if (isRequestContentLengthExceeded(request.headers, MAX_RICH_MENU_SCHEDULE_BODY_BYTES)) {
    return NextResponse.json(
      { success: false, error: "Rich menu schedule payload is too large." },
      { status: 413 },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | { kind?: "profile" | "schedule"; id?: string }
    | null;

  if (!body?.kind || !body.id) {
    return NextResponse.json({ success: false, error: "kind and id are required." }, { status: 400 });
  }

  if (body.kind === "schedule") {
    const schedule = await db.query.richMenuSchedules.findFirst({
      where: eq(richMenuSchedules.id, body.id),
    });

    if (!schedule) {
      return NextResponse.json({ success: false, error: "Schedule not found." }, { status: 404 });
    }

    if (schedule.isActive && schedule.startTime <= new Date() && schedule.endTime > new Date()) {
      await cleanupRichMenuAssignment(schedule.profileType, schedule.lineRichMenuId);
    }

    await db.delete(richMenuSchedules).where(eq(richMenuSchedules.id, body.id));

    return NextResponse.json({ success: true }, { status: 200 });
  }

  const profile = await db.query.richMenuProfiles.findFirst({
    where: eq(richMenuProfiles.id, body.id),
  });

  if (!profile) {
    return NextResponse.json({ success: false, error: "Profile not found." }, { status: 404 });
  }

  const activeSchedule = await db.query.richMenuSchedules.findFirst({
    where: (table, { and, eq, lte, gt }) =>
      and(
        eq(table.profileType, profile.profileType),
        eq(table.isActive, true),
        lte(table.startTime, new Date()),
        gt(table.endTime, new Date()),
      ),
  });

  if (activeSchedule) {
    await cleanupRichMenuAssignment(activeSchedule.profileType, activeSchedule.lineRichMenuId);
  }

  await db.delete(richMenuSchedules).where(eq(richMenuSchedules.profileType, profile.profileType));
  await db.delete(richMenuProfiles).where(eq(richMenuProfiles.id, profile.id));

  return NextResponse.json({ success: true }, { status: 200 });
}
