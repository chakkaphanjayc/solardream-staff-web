import { getLineIntegrationConfig } from "@/lib/lineApi";

const LINE_API_BASE_URL = "https://api.line.me/v2/bot";
const LINE_RICH_MENU_TIMEOUT_MS = 8_000;
const MAX_LINE_ERROR_TEXT_CHARS = 2_000;

export type LineRichMenuLifecycleResult = {
  success: boolean;
  status?: number;
  error?: string;
  lineUserId: string;
  richMenuId?: string;
  endpoint: string;
};

async function getLineAccessToken() {
  return (await getLineIntegrationConfig()).accessToken;
}

export async function getMemberRichMenuId() {
  return (await getLineIntegrationConfig()).memberRichMenuId;
}

async function readLineResponseText(response: Response) {
  try {
    const text = await response.text();
    return text.slice(0, MAX_LINE_ERROR_TEXT_CHARS);
  } catch {
    return "";
  }
}

export async function linkMemberRichMenuToLineUser(
  lineUserId: string,
  richMenuId: string,
): Promise<LineRichMenuLifecycleResult> {
  const accessToken = await getLineAccessToken();
  const endpoint = `${LINE_API_BASE_URL}/user/${encodeURIComponent(lineUserId)}/richmenu/${encodeURIComponent(richMenuId)}`;

  if (!accessToken) {
    return {
      success: false,
      status: 500,
      error: "LINE channel access token is not configured in API Setup or the server environment.",
      lineUserId,
      richMenuId,
      endpoint,
    };
  }

  if (!richMenuId) {
    return {
      success: false,
      status: 500,
      error: "The member Rich Menu ID is not configured in API Setup or the server environment.",
      lineUserId,
      richMenuId,
      endpoint,
    };
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(LINE_RICH_MENU_TIMEOUT_MS),
    });

    if (!response.ok) {
      const errorText = await readLineResponseText(response);
      console.error("[LINE Rich Menu Lifecycle] Failed to link member rich menu:", {
        status: response.status,
        lineUserId,
        richMenuId,
        error: errorText,
      });
      return {
        success: false,
        status: response.status,
        error: errorText || response.statusText,
        lineUserId,
        richMenuId,
        endpoint,
      };
    }

    return { success: true, status: response.status, lineUserId, richMenuId, endpoint };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown LINE API error.";
    console.error("[LINE Rich Menu Lifecycle] Network error linking member rich menu:", error);
    return {
      success: false,
      error: message,
      lineUserId,
      richMenuId,
      endpoint,
    };
  }
}

export async function unlinkRichMenuFromLineUser(
  lineUserId: string,
): Promise<LineRichMenuLifecycleResult> {
  const accessToken = await getLineAccessToken();
  const endpoint = `${LINE_API_BASE_URL}/user/${encodeURIComponent(lineUserId)}/richmenu`;

  if (!accessToken) {
    return {
      success: false,
      status: 500,
      error: "LINE channel access token is not configured in API Setup or the server environment.",
      lineUserId,
      endpoint,
    };
  }

  try {
    const response = await fetch(endpoint, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(LINE_RICH_MENU_TIMEOUT_MS),
    });

    if (!response.ok) {
      const errorText = await readLineResponseText(response);
      console.error("[LINE Rich Menu Lifecycle] Failed to unlink rich menu:", {
        status: response.status,
        lineUserId,
        error: errorText,
      });
      return {
        success: false,
        status: response.status,
        error: errorText || response.statusText,
        lineUserId,
        endpoint,
      };
    }

    return { success: true, status: response.status, lineUserId, endpoint };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown LINE API error.";
    console.error("[LINE Rich Menu Lifecycle] Network error unlinking rich menu:", error);
    return {
      success: false,
      error: message,
      lineUserId,
      endpoint,
    };
  }
}
