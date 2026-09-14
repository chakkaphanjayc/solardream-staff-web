import { NextResponse } from "next/server";
import { db } from "@/db";
import { richMenuProfiles, richMenuSchedules } from "@/db/schema";
import { clearDefaultRichMenuForAllUsers } from "@/lib/linePush";
import { saveSystemSetting } from "@/app/actions/systemSettings";
import { requireStaffJson } from "@/lib/auth-guard";
import { getLineIntegrationConfig } from "@/lib/lineApi";


const LINE_RICH_MENU_RESET_TIMEOUT_MS = 8_000;

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/admin/richmenu/reset-all
//
// Nuclear reset: wipes ALL rich menus from both LINE API and the local database.
//
//  1. List all rich menus registered on LINE → delete each one
//  2. Clear the default rich menu for all users on LINE
//  3. Truncate rich_menu_schedules table
//  4. Truncate rich_menu_profiles table
//  5. Clear system_settings key "line_rich_menus"
// ─────────────────────────────────────────────────────────────────────────────

function getCleanToken() {
  return getLineIntegrationConfig().then((config) => config.accessToken);
}

function isLineRichMenuEntry(value: unknown): value is { richMenuId: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "richMenuId" in value &&
    typeof value.richMenuId === "string" &&
    value.richMenuId.length > 0
  );
}

async function listLineRichMenus(token: string): Promise<{ richMenuId: string }[]> {
  if (!token) return [];
  try {
    const res = await fetch("https://api.line.me/v2/bot/richmenu/list", {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(LINE_RICH_MENU_RESET_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { richmenus?: unknown };
    return Array.isArray(data.richmenus) ? data.richmenus.filter(isLineRichMenuEntry) : [];
  } catch {
    return [];
  }
}

async function deleteLineRichMenu(
  token: string,
  richMenuId: string,
): Promise<
  | { richMenuId: string; ok: true; status: number }
  | { richMenuId: string; ok: false; status?: number; error?: string }
> {
  try {
    const res = await fetch(`https://api.line.me/v2/bot/richmenu/${richMenuId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(LINE_RICH_MENU_RESET_TIMEOUT_MS),
    });
    return { richMenuId, ok: res.ok, status: res.status };
  } catch (err: unknown) {
    console.error(`[Reset All] Failed to delete LINE rich menu ${richMenuId}:`, err);
    return { richMenuId, ok: false, error: "LINE rich menu deletion failed." };
  }
}

export async function DELETE() {
  const auth = await requireStaffJson();
  if (!auth.ok) return auth.response;

  const token = await getCleanToken();
  if (!token) {
    return NextResponse.json(
      { success: false, error: "LINE channel access token is not configured in API Setup or the server environment." },
      { status: 503 },
    );
  }

  const results: {
    deletedFromLine: number;
    deletedProfiles: number;
    deletedSchedules: number;
    lineErrors: string[];
  } = {
    deletedFromLine: 0,
    deletedProfiles: 0,
    deletedSchedules: 0,
    lineErrors: [],
  };

  // 1. List all rich menus from LINE API and delete each
  const menus = await listLineRichMenus(token);
  console.log(`[Reset All] Found ${menus.length} rich menus on LINE API`);

  for (const menu of menus) {
    const result = await deleteLineRichMenu(token, menu.richMenuId);
    if (result.ok) {
      results.deletedFromLine++;
    } else {
      results.lineErrors.push(
        `Failed to delete ${menu.richMenuId}: ${("error" in result && result.error) || `HTTP ${result.status}`}`,
      );
    }
  }

  // 2. Clear the default rich menu assignment for all users
  const clearResult = await clearDefaultRichMenuForAllUsers();
  if (!clearResult.success && !clearResult.simulated) {
    results.lineErrors.push("Failed to clear default rich menu for all users");
  }

  // 3. Truncate rich_menu_schedules
  const deletedSchedules = await db.delete(richMenuSchedules).returning({ id: richMenuSchedules.id });
  results.deletedSchedules = deletedSchedules.length;

  // 4. Truncate rich_menu_profiles
  const deletedProfiles = await db.delete(richMenuProfiles).returning({ id: richMenuProfiles.id });
  results.deletedProfiles = deletedProfiles.length;

  // 5. Clear system_settings key
  await saveSystemSetting("line_rich_menus", "[]");
  await saveSystemSetting("line_rich_menu_member_id", "");

  console.log("[Reset All] Complete:", results);

  return NextResponse.json({ success: true, ...results }, { status: 200 });
}
