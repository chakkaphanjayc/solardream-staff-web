import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createClient } from "@/utils/supabase/server";
import { upsertLineUserGroupOverride } from "@/lib/lineUserGroups";
import { unlinkRichMenuFromLineUser } from "@/lib/lineRichMenuLifecycle";
import { isRequestContentLengthExceeded } from "@/lib/requestSize";
import { hasValidHeaderSecret } from "@/lib/secretAuth";

type UnlinkLineRequestBody = {
  lineUserId?: unknown;
};

const MAX_UNLINK_LINE_BODY_BYTES = 16 * 1024;

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getResultStatus(value: unknown): number | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const status = (value as Record<string, unknown>).status;
  return typeof status === "number" && Number.isFinite(status) ? status : null;
}

function serializeLineLifecycleResult(value: unknown) {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

  return {
    success: record.success === true,
    status: getResultStatus(value),
  };
}

async function getSessionUserId() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user?.id ?? null;
  } catch (error) {
    console.warn("[POST /api/auth/unlink-line] Unable to read Supabase session:", error);
    return null;
  }
}

function hasValidInternalSecret(request: NextRequest) {
  const configuredSecret = (process.env.LINE_LIFECYCLE_API_SECRET || "").trim();
  return hasValidHeaderSecret(request.headers.get("x-line-lifecycle-secret"), configuredSecret);
}

function revalidateUserGroupScreens() {
  revalidatePath("/admin/settings/user-groups");
  revalidatePath("/th/admin/settings/user-groups");
  revalidatePath("/en/admin/settings/user-groups");
  revalidatePath("/profile");
  revalidatePath("/th/profile");
  revalidatePath("/en/profile");
}

export async function POST(request: NextRequest) {
  try {
    if (isRequestContentLengthExceeded(request.headers, MAX_UNLINK_LINE_BODY_BYTES)) {
      return NextResponse.json(
        { success: false, error: "LINE unlink request is too large." },
        { status: 413 },
      );
    }

    const body = (await request.json().catch(() => null)) as UnlinkLineRequestBody | null;
    if (!body) {
      return NextResponse.json({ success: false, error: "Invalid JSON body." }, { status: 400 });
    }

    const lineUserId = cleanString(body.lineUserId);
    if (!lineUserId) {
      return NextResponse.json(
        { success: false, error: "lineUserId is required." },
        { status: 400 },
      );
    }

    const sessionUserId = await getSessionUserId();
    const hasInternalAccess = hasValidInternalSecret(request);
    if (!sessionUserId && !hasInternalAccess) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized. Use an authenticated request or x-line-lifecycle-secret.",
        },
        { status: 401 },
      );
    }

    const linkedUser = await db.query.users.findFirst({
      where: eq(users.lineUserId, lineUserId),
    });

    if (!linkedUser) {
      return NextResponse.json(
        { success: false, error: "No local user is linked to this lineUserId." },
        { status: 404 },
      );
    }

    if (sessionUserId && sessionUserId !== linkedUser.id) {
      return NextResponse.json(
        { success: false, error: "Authenticated user does not own this LINE link." },
        { status: 403 },
      );
    }

    const [updatedUser] = await db
      .update(users)
      .set({
        lineUserId: null,
        lineLinkNonce: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, linkedUser.id))
      .returning({
        id: users.id,
        email: users.email,
        lineUserId: users.lineUserId,
      });

    const override = await upsertLineUserGroupOverride({
      userId: linkedUser.id,
      targetGroup: "GUEST",
      reason: "LINE account unlinked. Rich menu falls back to default.",
      assignedBy: sessionUserId,
    });

    const lineResult = await unlinkRichMenuFromLineUser(lineUserId);
    if (!lineResult.success) {
      console.error("[POST /api/auth/unlink-line] LINE rich menu unlink failed:", lineResult);
      return NextResponse.json(
        {
          success: false,
          error: "User was unlinked in DB, but LINE rich menu cleanup failed.",
          user: updatedUser,
          targetGroup: override.targetGroup,
          line: serializeLineLifecycleResult(lineResult),
        },
        { status: 502 },
      );
    }

    revalidateUserGroupScreens();

    return NextResponse.json({
      success: true,
      user: updatedUser,
      targetGroup: override.targetGroup,
      line: serializeLineLifecycleResult(lineResult),
      defaultRichMenuRestored: true,
    });
  } catch (error: unknown) {
    console.error("[POST /api/auth/unlink-line] Unexpected error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal Server Error",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  return POST(request);
}
