import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createClient } from "@/utils/supabase/server";
import { upsertLineUserGroupOverride } from "@/lib/lineUserGroups";
import { applyResolvedRichMenuToUser } from "@/lib/richMenuScheduler";
import { isRequestContentLengthExceeded } from "@/lib/requestSize";
import { hasValidHeaderSecret } from "@/lib/secretAuth";

type LinkLineRequestBody = {
  lineUserId?: unknown;
  userId?: unknown;
  email?: unknown;
  lineLinkNonce?: unknown;
  projectId?: unknown;
};

const MAX_LINK_LINE_BODY_BYTES = 16 * 1024;

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getResultStatus(value: unknown): number | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const status = (value as Record<string, unknown>).status;
  return typeof status === "number" && Number.isFinite(status) ? status : null;
}

function serializeLineAssignmentResult(value: unknown) {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

  return {
    success: record.success === true,
    skipped: record.skipped === true,
    status: getResultStatus(value),
    profileType: typeof record.profileType === "string" ? record.profileType : null,
    resolvedGroup: typeof record.resolvedGroup === "string" ? record.resolvedGroup : null,
    assignmentSource: typeof record.assignmentSource === "string" ? record.assignmentSource : null,
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
    console.warn("[POST /api/auth/link-line] Unable to read Supabase session:", error);
    return null;
  }
}

function hasValidInternalSecret(request: NextRequest) {
  const configuredSecret = (process.env.LINE_LIFECYCLE_API_SECRET || "").trim();
  return hasValidHeaderSecret(request.headers.get("x-line-lifecycle-secret"), configuredSecret);
}

async function resolveVerifiedUser(
  body: LinkLineRequestBody,
  sessionUserId: string | null,
  allowDirectIdentity: boolean,
) {
  if (sessionUserId) {
    return db.query.users.findFirst({ where: eq(users.id, sessionUserId) });
  }

  const lineLinkNonce = cleanString(body.lineLinkNonce);
  if (lineLinkNonce) {
    return db.query.users.findFirst({ where: eq(users.lineLinkNonce, lineLinkNonce) });
  }

  if (!allowDirectIdentity) return null;

  const userId = cleanString(body.userId);
  if (userId) {
    return db.query.users.findFirst({ where: eq(users.id, userId) });
  }

  const email = cleanString(body.email).toLowerCase();
  if (email) {
    return db.query.users.findFirst({ where: eq(users.email, email) });
  }

  return null;
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
    if (isRequestContentLengthExceeded(request.headers, MAX_LINK_LINE_BODY_BYTES)) {
      return NextResponse.json(
        { success: false, error: "LINE linking request is too large." },
        { status: 413 },
      );
    }

    const body = (await request.json().catch(() => null)) as LinkLineRequestBody | null;
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
    const allowDirectIdentity = Boolean(sessionUserId) || hasValidInternalSecret(request);
    const verifiedUser = await resolveVerifiedUser(body, sessionUserId, allowDirectIdentity);
    if (!verifiedUser) {
      return NextResponse.json(
        {
          success: false,
          error: "Verified user was not found. Use an authenticated request, lineLinkNonce, or x-line-lifecycle-secret for direct userId/email lookup.",
        },
        { status: 401 },
      );
    }

    await db.update(users).set({ lineUserId: null }).where(eq(users.lineUserId, lineUserId));

    const [updatedUser] = await db
      .update(users)
      .set({
        lineUserId,
        lineLinkNonce: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, verifiedUser.id))
      .returning({
        id: users.id,
        email: users.email,
        lineUserId: users.lineUserId,
      });

    const override = await upsertLineUserGroupOverride({
      userId: verifiedUser.id,
      targetGroup: "MEMBER",
      reason: `LINE account linked${cleanString(body.projectId) ? ` from project ${cleanString(body.projectId)}` : ""}`,
      assignedBy: sessionUserId,
    });

    const lineResult = await applyResolvedRichMenuToUser(verifiedUser.id);
    if (!lineResult.success) {
      console.error("[POST /api/auth/link-line] LINE rich menu link failed:", lineResult);
      return NextResponse.json(
        {
          success: false,
          error: "User was linked in DB, but automatic LINE rich menu assignment failed.",
          user: updatedUser,
          targetGroup: override.targetGroup,
          line: serializeLineAssignmentResult(lineResult),
        },
        { status: 502 },
      );
    }

    revalidateUserGroupScreens();

    return NextResponse.json({
      success: true,
      user: updatedUser,
      targetGroup: override.targetGroup,
      line: serializeLineAssignmentResult(lineResult),
    });
  } catch (error: unknown) {
    console.error("[POST /api/auth/link-line] Unexpected error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal Server Error",
      },
      { status: 500 },
    );
  }
}
