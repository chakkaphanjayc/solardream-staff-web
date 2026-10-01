import "server-only";

import { getSystemSetting } from "@/app/actions/systemSettings";
import { getRuntimeEnvValue, hasCloudflareRuntimeContext } from "@/lib/runtimeEnv";

export const LINE_API_BASE_URL = "https://api.line.me";
export const LINE_DATA_API_BASE_URL = "https://api-data.line.me";
export const LINE_API_REQUEST_TIMEOUT_MS = 8_000;

/** Keep customer-facing LINE mutations behind an explicit production switch. */
export function isLineLiveMutationEnabled() {
  const productionRuntime = process.env.NODE_ENV === "production" || hasCloudflareRuntimeContext();
  return productionRuntime && getRuntimeEnvValue("LINE_LIVE_MUTATIONS_ENABLED") === "true";
}

export type LineCredentialSource = "system_settings" | "environment" | "missing";

export type LineIntegrationConfig = {
  accessToken: string;
  channelSecret: string;
  memberRichMenuId: string;
  accessTokenSource: LineCredentialSource;
  channelSecretSource: LineCredentialSource;
  memberRichMenuIdSource: LineCredentialSource;
};

export type LineApiSuccess<T> = {
  success: true;
  status: number;
  data: T;
  requestId: string | null;
};

export type LineApiFailure = {
  success: false;
  status: number;
  error: string;
  requestId: string | null;
};

export type LineApiResult<T> = LineApiSuccess<T> | LineApiFailure;

type LineErrorBody = {
  message?: unknown;
};

function cleanSetting(value: string | null | undefined) {
  return (value || "").trim().replace(/^['"]|['"]$/g, "");
}

function resolveSetting(
  databaseValue: string | null,
  environmentValue: string | undefined,
): { value: string; source: LineCredentialSource } {
  const databaseSetting = cleanSetting(databaseValue);
  if (databaseSetting) {
    return { value: databaseSetting, source: "system_settings" };
  }

  const environmentSetting = cleanSetting(environmentValue);
  if (environmentSetting) {
    return { value: environmentSetting, source: "environment" };
  }

  return { value: "", source: "missing" };
}

export async function getLineIntegrationConfig(): Promise<LineIntegrationConfig> {
  const [databaseAccessToken, databaseChannelSecret, databaseMemberRichMenuId] = await Promise.all([
    getSystemSetting("line_channel_access_token"),
    getSystemSetting("line_channel_secret"),
    getSystemSetting("line_member_rich_menu_id"),
  ]);

  const accessToken = resolveSetting(databaseAccessToken, getRuntimeEnvValue("LINE_CHANNEL_ACCESS_TOKEN"));
  const channelSecret = resolveSetting(databaseChannelSecret, getRuntimeEnvValue("LINE_CHANNEL_SECRET"));
  const memberRichMenuId = resolveSetting(
    databaseMemberRichMenuId,
    getRuntimeEnvValue("NEXT_PUBLIC_RICH_MENU_MEMBER_ID") ||
      getRuntimeEnvValue("LINE_RICH_MENU_MEMBER_ID") ||
      getRuntimeEnvValue("LINE_MEMBER_RICH_MENU_ID"),
  );

  return {
    accessToken: accessToken.value,
    channelSecret: channelSecret.value,
    memberRichMenuId: memberRichMenuId.value,
    accessTokenSource: accessToken.source,
    channelSecretSource: channelSecret.source,
    memberRichMenuIdSource: memberRichMenuId.source,
  };
}

export function maskLineSecret(value: string, visibleStart: number, visibleEnd: number) {
  if (!value) return null;
  if (value.length <= visibleStart + visibleEnd) return "••••••••";
  return `${value.slice(0, visibleStart)}...${value.slice(-visibleEnd)}`;
}

function getLineErrorMessage(body: unknown, fallback: string) {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const message = (body as LineErrorBody).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }

  return fallback;
}

export async function requestLineApi<T>(
  path: string,
  init: RequestInit = {},
  options: { accessToken?: string; baseUrl?: string } = {},
): Promise<LineApiResult<T>> {
  const config = options.accessToken === undefined
    ? await getLineIntegrationConfig()
    : { accessToken: options.accessToken };
  const accessToken = cleanSetting(config.accessToken);

  if (!accessToken) {
    console.error("[LINE API] Channel access token is missing at runtime.", {
      source: "accessTokenSource" in config ? config.accessTokenSource : "explicit-option",
      runtimeEnvAvailable: Boolean(getRuntimeEnvValue("LINE_CHANNEL_ACCESS_TOKEN")),
    });
    return {
      success: false,
      status: 500,
      error: "LINE channel access token is not configured.",
      requestId: null,
    };
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  try {
    const response = await fetch(`${options.baseUrl || LINE_API_BASE_URL}${path}`, {
      ...init,
      headers,
      signal: init.signal || AbortSignal.timeout(LINE_API_REQUEST_TIMEOUT_MS),
    });
    const requestId = response.headers.get("x-line-request-id");
    const bodyText = await response.text().catch(() => "");
    let body: unknown = null;

    if (bodyText.trim()) {
      try {
        body = JSON.parse(bodyText) as unknown;
      } catch {
        body = null;
      }
    }

    if (!response.ok) {
      return {
        success: false,
        status: response.status,
        error: getLineErrorMessage(body, response.statusText || "LINE API request failed."),
        requestId,
      };
    }

    return {
      success: true,
      status: response.status,
      data: body as T,
      requestId,
    };
  } catch (error: unknown) {
    console.error("[LINE API] Request failed:", error);
    return {
      success: false,
      status: 503,
      error: "Unable to reach the LINE API. Check the server network and try again.",
      requestId: null,
    };
  }
}
