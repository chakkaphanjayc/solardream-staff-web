import { getLineIntegrationConfig } from "@/lib/lineApi";

/**
 * Helper to fetch and sanitize the LINE channel access token.
 */
async function getChannelAccessToken(): Promise<string> {
  return (await getLineIntegrationConfig()).accessToken;
}

const LINE_RICHMENU_TIMEOUT_MS = 8_000;
const MAX_LINE_API_ERROR_CHARS = 2_000;

async function getLineApiError(response: Response, fallback: string) {
  const body = await response.text().catch(() => "");
  const trimmed = body.trim();
  return trimmed ? `${fallback} (HTTP ${response.status}): ${trimmed.slice(0, MAX_LINE_API_ERROR_CHARS)}` : `${fallback} (HTTP ${response.status})`;
}

/**
 * Links a specific rich menu to a designated LINE user.
 * 
 * **When to call it:**
 * Call this function immediately after a user successfully links their LINE account 
 * with their SolarDream user account (e.g. during the oauth/webview callback completion).
 * 
 * @param lineUserId The unique LINE user identifier.
 * @param richMenuId The ID of the rich menu to link. Defaults to LINE_MEMBER_RICH_MENU_ID from env.
 * @returns A promise that resolves when the rich menu linking is complete.
 */
export async function linkRichMenuToUser(lineUserId: string, richMenuId?: string): Promise<void> {
  const config = await getLineIntegrationConfig();
  const token = config.accessToken;
  const menuId = richMenuId || config.memberRichMenuId;

  if (!token) {
    console.error("[LINE Richmenu Utility] Failed to link rich menu: channel access token is missing.");
    throw new Error("LINE channel access token is not configured in API Setup or the server environment.");
  }

  if (!menuId) {
    console.error("[LINE Richmenu Utility] Failed to link rich menu: member Rich Menu ID is missing.");
    throw new Error("Rich menu ID is not specified.");
  }

  console.log(`[LINE Richmenu Utility] Linking rich menu ${menuId} to user ${lineUserId}`);

  const url = `https://api.line.me/v2/bot/user/${lineUserId}/richmenu/${menuId}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`
      },
      signal: AbortSignal.timeout(LINE_RICHMENU_TIMEOUT_MS),
    });

    if (!response.ok) {
      const message = await getLineApiError(response, "LINE API rich menu link failed");
      console.error("[LINE Richmenu Utility] LINE API returned an error while linking rich menu:", message);
      throw new Error(message);
    }

    console.log(`[LINE Richmenu Utility] Successfully linked rich menu ${menuId} to user ${lineUserId}`);
  } catch (error: unknown) {
    console.error("[LINE Richmenu Utility] Exception thrown while linking rich menu:", error);
    throw error;
  }
}

/**
 * Unlinks the active custom rich menu from a user, reverting their view back to the default/guest rich menu.
 * 
 * **When to call it:**
 * Call this function when a user disconnects or unlinks their LINE account from their 
 * SolarDream profile, ensuring they no longer see member-only options.
 * 
 * @param lineUserId The unique LINE user identifier.
 * @returns A promise that resolves when the rich menu unlinking is complete.
 */
export async function unlinkRichMenuFromUser(lineUserId: string): Promise<void> {
  const token = await getChannelAccessToken();

  if (!token) {
    console.error("[LINE Richmenu Utility] Failed to unlink rich menu: channel access token is missing.");
    throw new Error("LINE channel access token is not configured in API Setup or the server environment.");
  }

  console.log(`[LINE Richmenu Utility] Unlinking rich menu from user ${lineUserId}`);

  const url = `https://api.line.me/v2/bot/user/${lineUserId}/richmenu`;

  try {
    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`
      },
      signal: AbortSignal.timeout(LINE_RICHMENU_TIMEOUT_MS),
    });

    if (!response.ok) {
      const message = await getLineApiError(response, "LINE API rich menu unlink failed");
      console.error("[LINE Richmenu Utility] LINE API returned an error while unlinking rich menu:", message);
      throw new Error(message);
    }

    console.log(`[LINE Richmenu Utility] Successfully unlinked rich menu from user ${lineUserId}`);
  } catch (error: unknown) {
    console.error("[LINE Richmenu Utility] Exception thrown while unlinking rich menu:", error);
    throw error;
  }
}
