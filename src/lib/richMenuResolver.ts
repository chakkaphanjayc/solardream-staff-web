/**
 * richMenuResolver.ts
 * Pure server-side utility (no "use server" directive) for resolving which
 * LINE rich menu ID should be applied for a given trigger event.
 * Safe to import from API routes (webhook) and server actions alike.
 */
import { createAdminClient } from "@/utils/supabase/server";

export type RichMenuTrigger =
  | "ON_ACCOUNT_LINK"
  | "ON_ORDER_CONFIRM"
  | "ON_INSTALLATION_COMPLETE"
  | "DEFAULT_ALL";

interface StoredCondition {
  id: string;
  trigger: RichMenuTrigger;
  targetMenuId: string;
  priority: number;
  isActive: boolean;
}

interface StoredMenu {
  id: string;
  lineRichMenuId: string | null;
  status: string;
}

/**
 * Reads conditions from DB (system_settings) and returns the LINE rich menu ID
 * for the highest-priority active condition matching the given trigger.
 * Returns null if no matching published condition is found.
 */
export async function resolveMenuIdForTrigger(
  trigger: RichMenuTrigger
): Promise<string | null> {
  try {
    const supabase = createAdminClient();

    const [{ data: condRow }, { data: menuRow }] = await Promise.all([
      supabase
        .from("system_settings")
        .select("value")
        .eq("key", "line_rich_menu_conditions")
        .single(),
      supabase
        .from("system_settings")
        .select("value")
        .eq("key", "line_rich_menus")
        .single(),
    ]);

    if (!condRow?.value || !menuRow?.value) return null;

    const conditions: StoredCondition[] = JSON.parse(condRow.value);
    const menus: StoredMenu[] = JSON.parse(menuRow.value);

    const matching = conditions
      .filter((c) => c.isActive && c.trigger === trigger)
      .sort((a, b) => a.priority - b.priority);

    for (const cond of matching) {
      const menu = menus.find((m) => m.id === cond.targetMenuId);
      if (menu?.lineRichMenuId) {
        console.log(
          `[richMenuResolver] Resolved trigger "${trigger}" → LINE menu ${menu.lineRichMenuId}`
        );
        return menu.lineRichMenuId;
      }
    }

    return null;
  } catch (err) {
    console.error("[richMenuResolver] Failed to resolve menu for trigger:", err);
    return null;
  }
}
