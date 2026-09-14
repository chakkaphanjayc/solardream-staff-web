import { cache } from "react";
import { createClient } from "@/utils/supabase/server";
import { ensureUserExists } from "@/app/actions/auth";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

const STAFF_ROLES = new Set(["ADMIN", "SUPER_ADMIN", "MANAGER", "STAFF"]);
const ADMIN_ROLES = new Set(["ADMIN", "SUPER_ADMIN"]);

export const requireAdmin = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const dbUser = await ensureUserExists(user);

  if (!dbUser || !ADMIN_ROLES.has(dbUser.role)) {
    redirect("/profile?error=unauthorized");
  }

  return dbUser;
});

export const requireStaff = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const dbUser = await ensureUserExists(user);

  if (!dbUser || !STAFF_ROLES.has(dbUser.role)) {
    redirect("/profile?error=unauthorized");
  }

  return dbUser;
});

export async function requireStaffJson() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }),
    };
  }

  const dbUser = await ensureUserExists(user);

  if (!dbUser || !STAFF_ROLES.has(dbUser.role)) {
    return {
      ok: false as const,
      response: NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true as const, user: dbUser };
}

export async function requireAdminJson() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }),
    };
  }

  const dbUser = await ensureUserExists(user);

  if (!dbUser || !ADMIN_ROLES.has(dbUser.role)) {
    return {
      ok: false as const,
      response: NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true as const, user: dbUser };
}
