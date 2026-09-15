"use server";

import { headers } from "next/headers";
import { createHmac, randomUUID } from "crypto";
import { checkAdmin } from "@/app/actions/auth";
import { saveSystemSetting, saveSystemSettings } from "@/app/actions/systemSettings";
import {
  LINE_DATA_API_BASE_URL,
  getLineIntegrationConfig,
  isLineLiveMutationEnabled,
  maskLineSecret,
  requestLineApi,
  type LineCredentialSource,
} from "@/lib/lineApi";
import { 
  triggerLowStockGroupAlert, 
  triggerShippingUpdateNotification, 
  linkRichMenuToUser, 
  unlinkRichMenuFromUser,
  type LowStockAlertResult,
  type ShippingNotificationResult,
} from "@/lib/linePush";
import {
  DEFAULT_LINE_QUICK_REPLY_TEXT,
  LINE_CONVERSATION_CONFIG_KEY,
  LINE_MAX_QUICK_REPLY_ITEMS,
  LINE_QUICK_BUTTONS_KEY,
  LINE_QUICK_REPLY_CONFIG_KEY,
  LINE_QUICK_REPLY_LABEL_MAX_LENGTH,
  LINE_QUICK_REPLY_MESSAGE_MAX_LENGTH,
  LINE_QUICK_REPLY_TEXT_MAX_LENGTH,
  LINE_QUICK_REPLY_URI_MAX_LENGTH,
  LINE_TRIGGER_CONFIG_KEY,
  LINE_TRIGGER_KINDS,
  isLineQuickButtonAction,
  normalizeLineTriggerText,
  sortLineQuickButtons,
  type LineConversationConfig,
  type LineQuickButton,
  type LineQuickReplyConfig,
  type LineTriggerConfig,
} from "@/lib/lineAutomationConfig";

const LINE_SETTINGS_REQUEST_TIMEOUT_MS = 8_000;
const MAX_LINE_SETTINGS_ERROR_BODY_CHARS = 2_000;

async function readLineSettingsErrorText(response: Response) {
  const text = await response.text().catch(() => "");
  return text.slice(0, MAX_LINE_SETTINGS_ERROR_BODY_CHARS);
}

export type LineEnvStatus = {
  LINE_CHANNEL_ACCESS_TOKEN: boolean;
  LINE_CHANNEL_SECRET: boolean;
  LINE_MEMBER_RICH_MENU_ID: string | null;
  LINE_CHANNEL_ACCESS_TOKEN_PREVIEW: string | null;
  LINE_CHANNEL_SECRET_PREVIEW: string | null;
  LINE_CHANNEL_ACCESS_TOKEN_SOURCE: LineCredentialSource;
  LINE_CHANNEL_SECRET_SOURCE: LineCredentialSource;
  LINE_MEMBER_RICH_MENU_ID_SOURCE: LineCredentialSource;
};

export type LineBotInfo = {
  userId: string;
  basicId: string;
  displayName: string;
  pictureUrl: string;
};

export type LineUserProfile = {
  userId: string;
  displayName: string;
  pictureUrl: string;
  statusMessage: string;
  language: string;
};

export type LineWebhookSettings = {
  endpoint: string;
  active: boolean;
};

export type LineUsageSnapshot = {
  date: string;
  quota: {
    type: "none" | "limited";
    value?: number;
  } | null;
  consumption: number | null;
  followers: {
    status: "ready" | "unready" | "out_of_service";
    followers: number | null;
    targetedReaches: number | null;
  } | null;
  errors: string[];
};

type LineActionFailure = {
  success: false;
  status?: number;
  error: string;
};

export type LineConnectionResult =
  | { success: true; status: number; botInfo: LineBotInfo }
  | LineActionFailure;

export type LineWebhookResult =
  | { success: true; status: number; webhook: LineWebhookSettings }
  | LineActionFailure;

export type LineWebhookMutationResult =
  | { success: true; status: number; endpoint?: string }
  | LineActionFailure;

export type LineUsageResult =
  | { success: true; status: number; usage: LineUsageSnapshot; error?: string }
  | LineActionFailure;

export type LineMessageMutationResult =
  | { success: true; status: number; requestId: string | null }
  | LineActionFailure;

export type LineUserProfileResult =
  | { success: true; status: number; profile: LineUserProfile }
  | LineActionFailure;

export type LineRichMenuApiRecord = {
  richMenuId: string;
  name: string;
  chatBarText: string;
  selected: boolean;
  width: number | null;
  height: number | null;
};

export type LineRichMenuApiState = {
  richMenus: LineRichMenuApiRecord[];
  defaultRichMenuId: string | null;
  errors: string[];
};

export type LineRichMenuApiResult =
  | { success: true; status: number; state: LineRichMenuApiState }
  | LineActionFailure;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown) {
  return value === true;
}

function getTokyoDateString() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year") || "0000"}${values.get("month") || "00"}${values.get("day") || "00"}`;
}

function validateWebhookEndpoint(value: string) {
  const endpoint = value.trim();
  if (!endpoint) return { endpoint: "", error: "Enter a webhook URL." };
  if (endpoint.length > 500) return { endpoint: "", error: "Webhook URL must be 500 characters or less." };

  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:") {
      return { endpoint: "", error: "LINE requires an HTTPS webhook URL." };
    }
  } catch {
    return { endpoint: "", error: "Enter a valid HTTPS webhook URL." };
  }

  return { endpoint };
}

function validateLineDestination(value: string) {
  const destination = value.trim();
  if (!destination || !/^[UCR][A-Za-z0-9_-]{10,127}$/.test(destination)) {
    return { destination: "", error: "Enter a valid LINE user, group, or room ID." };
  }

  return { destination };
}

function validateLineUserId(value: string) {
  const userId = value.trim();
  if (!/^U[A-Za-z0-9_-]{10,127}$/.test(userId)) {
    return { userId: "", error: "Enter a valid LINE user ID beginning with U." };
  }

  return { userId };
}

function validateLineText(value: string) {
  const text = value.trim();
  if (!text) return { text: "", error: "Enter a message before continuing." };
  if (text.length > 5_000) return { text: "", error: "LINE text messages must be 5,000 characters or less." };
  return { text };
}

// Represents the diagnostic state of LINE config
export async function getLineEnvStatus(): Promise<LineEnvStatus> {
  const config = await getLineIntegrationConfig();

  return {
    LINE_CHANNEL_ACCESS_TOKEN: Boolean(config.accessToken),
    LINE_CHANNEL_SECRET: Boolean(config.channelSecret),
    LINE_MEMBER_RICH_MENU_ID: config.memberRichMenuId || null,
    LINE_CHANNEL_ACCESS_TOKEN_PREVIEW: maskLineSecret(config.accessToken, 8, 8),
    LINE_CHANNEL_SECRET_PREVIEW: maskLineSecret(config.channelSecret, 4, 4),
    LINE_CHANNEL_ACCESS_TOKEN_SOURCE: config.accessTokenSource,
    LINE_CHANNEL_SECRET_SOURCE: config.channelSecretSource,
    LINE_MEMBER_RICH_MENU_ID_SOURCE: config.memberRichMenuIdSource,
  };
}

// Triggers the creation of the Member Rich Menu via the api route
export async function createMemberRichMenuAction() {
  try {
    const headersList = await headers();
    const host = headersList.get("host") || "localhost:3000";
    const protocol = host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https";
    const url = `${protocol}://${host}/api/create-richmenu`;

    const response = await fetch(url, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(LINE_SETTINGS_REQUEST_TIMEOUT_MS),
    });

    const data = await response.json() as { error?: unknown; details?: unknown; richMenuId?: unknown };
    if (!response.ok) {
      console.error("[LINE Settings] Failed to create Member Rich Menu:", data);
      return {
        success: false,
        error: "Failed to create Member Rich Menu.",
      };
    }

    return {
      success: true,
      richMenuId: data.richMenuId
    };
  } catch (err: unknown) {
    console.error("[LINE Settings] Failed to create Member Rich Menu:", err);
    return {
      success: false,
      error: "Failed to create Member Rich Menu.",
    };
  }
}

// Save trigger keywords to settings
export async function saveLineKeywords(orderKeyword: string, pointsKeyword: string) {
  try {
    const res1 = await saveSystemSetting("line_keyword_order", orderKeyword.trim());
    const res2 = await saveSystemSetting("line_keyword_points", pointsKeyword.trim());

    if (!res1.success || !res2.success) {
      return {
        success: false,
        error: res1.error || res2.error || "Failed to save keyword parameters.",
      };
    }

    return { success: true };
  } catch (err: unknown) {
    console.error("[LINE Settings] Failed to save keywords:", err);
    return {
      success: false,
      error: "Failed to save keywords.",
    };
  }
}

// Verify LINE Channel Access Token connection and fetch bot profile
export async function checkLineConnection(): Promise<LineConnectionResult> {
  const { checkAdmin } = await import("@/app/actions/auth");
  await checkAdmin();

  const result = await requestLineApi<unknown>("/v2/bot/info");
  if (!result.success) {
    return {
      success: false,
      status: result.status,
      error: result.error,
    } satisfies LineActionFailure;
  }

  if (!isRecord(result.data)) {
    return {
      success: false,
      status: result.status,
      error: "LINE returned an unexpected bot profile response.",
    } satisfies LineActionFailure;
  }

  const botInfo: LineBotInfo = {
    userId: asString(result.data.userId),
    basicId: asString(result.data.basicId),
    displayName: asString(result.data.displayName),
    pictureUrl: asString(result.data.pictureUrl),
  };

  if (!botInfo.userId || !botInfo.displayName) {
    return {
      success: false,
      status: result.status,
      error: "LINE returned an incomplete bot profile response.",
    } satisfies LineActionFailure;
  }

  try {
    // Cache the LINE Bot details into system settings for public usage
    try {
      const { createAdminClient } = await import("@/utils/supabase/server");
      const supabaseAdmin = createAdminClient();
      await supabaseAdmin.from("system_settings").upsert([
        { key: "line_bot_basic_id", value: botInfo.basicId, updated_at: new Date().toISOString() },
        { key: "line_bot_display_name", value: botInfo.displayName, updated_at: new Date().toISOString() },
        { key: "line_bot_picture_url", value: botInfo.pictureUrl, updated_at: new Date().toISOString() },
      ], { onConflict: "key" });
    } catch (saveErr) {
      console.warn("Failed to cache bot info to system settings:", saveErr);
    }

    return {
      success: true,
      status: result.status,
      botInfo,
    };
  } catch (err: unknown) {
    console.error("LINE connection check failed:", err);
    return {
      success: false,
      error: "Connection failed. Please verify the LINE access token and network status.",
    };
  }
}

export async function getLineWebhookSettings(): Promise<LineWebhookResult> {
  const { checkAdmin } = await import("@/app/actions/auth");
  await checkAdmin();

  const result = await requestLineApi<unknown>("/v2/bot/channel/webhook/endpoint");
  if (!result.success) {
    return {
      success: false,
      status: result.status,
      error: result.status === 404 ? "No webhook URL is configured in LINE yet." : result.error,
    } satisfies LineActionFailure;
  }

  if (!isRecord(result.data)) {
    return { success: false, status: result.status, error: "LINE returned an invalid webhook response." } satisfies LineActionFailure;
  }

  const settings: LineWebhookSettings = {
    endpoint: asString(result.data.endpoint),
    active: asBoolean(result.data.active),
  };

  return { success: true, status: result.status, webhook: settings };
}

export async function setLineWebhookEndpoint(endpointInput: string): Promise<LineWebhookMutationResult> {
  const { checkAdmin } = await import("@/app/actions/auth");
  await checkAdmin();

  if (!isLineLiveMutationEnabled()) {
    return { success: false, error: "Live LINE mutations are disabled outside production or until LINE_LIVE_MUTATIONS_ENABLED=true." } satisfies LineActionFailure;
  }

  const validation = validateWebhookEndpoint(endpointInput);
  if (validation.error) {
    return { success: false, error: validation.error } satisfies LineActionFailure;
  }

  const result = await requestLineApi<unknown>("/v2/bot/channel/webhook/endpoint", {
    method: "PUT",
    body: JSON.stringify({ endpoint: validation.endpoint }),
  });

  return result.success
    ? { success: true, status: result.status, endpoint: validation.endpoint }
    : { success: false, status: result.status, error: result.error } satisfies LineActionFailure;
}

export async function testLineWebhookEndpoint(endpointInput?: string): Promise<LineWebhookMutationResult> {
  const { checkAdmin } = await import("@/app/actions/auth");
  await checkAdmin();

  if (!isLineLiveMutationEnabled()) {
    return { success: false, error: "Live LINE webhook tests are disabled outside production or until LINE_LIVE_MUTATIONS_ENABLED=true." } satisfies LineActionFailure;
  }

  let body: Record<string, string> = {};
  if (endpointInput?.trim()) {
    const validation = validateWebhookEndpoint(endpointInput);
    if (validation.error) {
      return { success: false, error: validation.error } satisfies LineActionFailure;
    }
    body = { endpoint: validation.endpoint };
  }

  const result = await requestLineApi<unknown>("/v2/bot/channel/webhook/test", {
    method: "POST",
    body: JSON.stringify(body),
  });

  return result.success
    ? { success: true, status: result.status }
    : { success: false, status: result.status, error: result.error } satisfies LineActionFailure;
}

export async function getLineUsageSnapshot(date = getTokyoDateString()): Promise<LineUsageResult> {
  const { checkAdmin } = await import("@/app/actions/auth");
  await checkAdmin();

  if (!/^\d{8}$/.test(date)) {
    return { success: false, error: "Usage date must use yyyyMMdd format." } satisfies LineActionFailure;
  }

  const [quotaResult, consumptionResult, followersResult] = await Promise.all([
    requestLineApi<unknown>("/v2/bot/message/quota"),
    requestLineApi<unknown>("/v2/bot/message/quota/consumption"),
    requestLineApi<unknown>(`/v2/bot/insight/followers?date=${date}`, {}, { baseUrl: LINE_DATA_API_BASE_URL }),
  ]);

  const errors = [quotaResult, consumptionResult, followersResult]
    .filter((result): result is Extract<typeof result, { success: false }> => !result.success)
    .map((result) => result.error);

  const quota = quotaResult.success && isRecord(quotaResult.data)
    ? {
        type: asString(quotaResult.data.type) === "limited" ? "limited" as const : "none" as const,
        value: asNumber(quotaResult.data.value) ?? undefined,
      }
    : null;

  const followers = followersResult.success && isRecord(followersResult.data)
    ? {
        status: ((): NonNullable<LineUsageSnapshot["followers"]>["status"] => {
          const status = asString(followersResult.data.status);
          return status === "ready" || status === "out_of_service" ? status : "unready";
        })(),
        followers: asNumber(followersResult.data.followers),
        targetedReaches: asNumber(followersResult.data.targetedReaches),
      }
    : null;

  const snapshot: LineUsageSnapshot = {
    date,
    quota,
    consumption: consumptionResult.success && isRecord(consumptionResult.data)
      ? asNumber(consumptionResult.data.totalUsage)
      : null,
    followers,
    errors,
  };

  if (errors.length === 3) {
    return {
      success: false,
      status: 503,
      error: "LINE usage data could not be loaded.",
    };
  }

  return {
    success: true,
    status: 200,
    usage: snapshot,
    error: errors.length > 0 ? "Some LINE usage metrics are unavailable." : undefined,
  };
}

export async function validateLinePushText(messageText: string): Promise<LineMessageMutationResult> {
  const { checkAdmin } = await import("@/app/actions/auth");
  await checkAdmin();

  const validation = validateLineText(messageText);
  if (validation.error) return { success: false, error: validation.error };

  const result = await requestLineApi<unknown>("/v2/bot/message/validate/push", {
    method: "POST",
    body: JSON.stringify({ messages: [{ type: "text", text: validation.text }] }),
  });

  return result.success
    ? { success: true, status: result.status, requestId: result.requestId }
    : { success: false, status: result.status, error: result.error };
}

export async function sendLinePushText(
  destinationInput: string,
  messageText: string,
): Promise<LineMessageMutationResult> {
  const { checkAdmin } = await import("@/app/actions/auth");
  await checkAdmin();

  if (process.env.NODE_ENV !== "production") {
    return { success: false, error: "Live LINE sends are disabled outside production." } satisfies LineActionFailure;
  }

  const destination = validateLineDestination(destinationInput);
  if (destination.error) return { success: false, error: destination.error };

  const message = validateLineText(messageText);
  if (message.error) return { success: false, error: message.error };

  const result = await requestLineApi<unknown>("/v2/bot/message/push", {
    method: "POST",
    body: JSON.stringify({
      to: destination.destination,
      messages: [{ type: "text", text: message.text }],
    }),
  });

  return result.success
    ? { success: true, status: result.status, requestId: result.requestId }
    : { success: false, status: result.status, error: result.error };
}

export async function getLineUserProfile(lineUserIdInput: string): Promise<LineUserProfileResult> {
  const { checkAdmin } = await import("@/app/actions/auth");
  await checkAdmin();

  const validation = validateLineUserId(lineUserIdInput);
  if (validation.error) return { success: false, error: validation.error } satisfies LineActionFailure;

  const result = await requestLineApi<unknown>(`/v2/bot/profile/${encodeURIComponent(validation.userId)}`);
  if (!result.success) {
    return { success: false, status: result.status, error: result.error } satisfies LineActionFailure;
  }

  if (!isRecord(result.data)) {
    return { success: false, status: result.status, error: "LINE returned an invalid user profile response." } satisfies LineActionFailure;
  }

  const profile: LineUserProfile = {
    userId: asString(result.data.userId),
    displayName: asString(result.data.displayName),
    pictureUrl: asString(result.data.pictureUrl),
    statusMessage: asString(result.data.statusMessage),
    language: asString(result.data.language),
  };

  if (!profile.userId || !profile.displayName) {
    return { success: false, status: result.status, error: "LINE returned an incomplete user profile response." } satisfies LineActionFailure;
  }

  return { success: true, status: result.status, profile };
}

export async function getLineRichMenuApiState(): Promise<LineRichMenuApiResult> {
  const { checkAdmin } = await import("@/app/actions/auth");
  await checkAdmin();

  const [listResult, defaultResult] = await Promise.all([
    requestLineApi<unknown>("/v2/bot/richmenu/list"),
    requestLineApi<unknown>("/v2/bot/user/all/richmenu"),
  ]);

  const errors = [listResult, defaultResult]
    .filter((result): result is Extract<typeof result, { success: false }> => !result.success)
    .map((result) => result.error);

  const richMenus: LineRichMenuApiRecord[] = [];
  if (listResult.success && isRecord(listResult.data) && Array.isArray(listResult.data.richmenus)) {
    for (const item of listResult.data.richmenus) {
      if (!isRecord(item)) continue;
      const richMenuId = asString(item.richMenuId);
      if (!richMenuId) continue;
      const size = isRecord(item.size) ? item.size : null;
      richMenus.push({
        richMenuId,
        name: asString(item.name) || "Unnamed Rich Menu",
        chatBarText: asString(item.chatBarText),
        selected: asBoolean(item.selected),
        width: size ? asNumber(size.width) : null,
        height: size ? asNumber(size.height) : null,
      });
    }
  }

  const defaultRichMenuId = defaultResult.success && isRecord(defaultResult.data)
    ? asString(defaultResult.data.richMenuId) || null
    : null;

  if (errors.length === 2) {
    return { success: false, status: 503, error: "LINE Rich Menu inventory could not be loaded." };
  }

  return {
    success: true,
    status: 200,
    state: { richMenus, defaultRichMenuId, errors },
  };
}

// Simulates sending a user text message to the webhook route
export async function simulateLineWebhook(messageText: string, targetUserId?: string) {
  const { checkAdmin } = await import("@/app/actions/auth");
  await checkAdmin();

  const { channelSecret } = await getLineIntegrationConfig();
  
  // 1. Get host and protocol dynamically from incoming headers to call local API route
  const headersList = await headers();
  const host = headersList.get("host") || "localhost:3000";
  const protocol = host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https";
  const webhookUrl = `${protocol}://${host}/api/webhook`;

  // 2. Build the exact event format LINE would send
  const mockUserId = "U1234567890abcdef1234567890abcdef";
  const mockReplyToken = `mockReplyToken_${Math.random().toString(36).substring(2, 11)}${Date.now()}`;
  
  const payload = {
    destination: "U00000000000000000000000000000000",
    events: [
      {
        type: "message",
        message: {
          type: "text",
          id: `msg_${Math.random().toString(36).substring(2, 11)}`,
          text: messageText,
        },
        webhookEventId: `ev_${Math.random().toString(36).substring(2, 11)}`,
        deliveryContext: {
          isRedelivery: false,
        },
        timestamp: Date.now(),
        source: {
          type: "user",
          userId: targetUserId || mockUserId, // Inject target user ID for testing custom profiles
        },
        replyToken: mockReplyToken,
        mode: "active",
      },
    ],
  };

  const rawBody = JSON.stringify(payload);

  // 3. Compute LINE Signature
  let signature = "mock_test_signature_for_local_development";
  if (channelSecret) {
    signature = createHmac("sha256", channelSecret)
      .update(rawBody)
      .digest("base64");
  }

  try {
    // 4. Fire the POST request to local webhook endpoint
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-line-signature": signature,
        "x-line-simulate": "true", // Special header to intercept LINE reply fetch and return payload
      },
      body: rawBody,
      signal: AbortSignal.timeout(LINE_SETTINGS_REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      const errorText = await readLineSettingsErrorText(response);
      console.error("[LINE Settings] Local webhook simulation failed:", {
        status: response.status,
        body: errorText,
      });
      return {
        success: false,
        status: response.status,
        error: `Webhook returned error status: ${response.status}`,
        details: "Webhook simulation failed. Check server logs for the raw response.",
        payload,
      };
    }

    const result = await response.json();
    return {
      success: true,
      status: response.status,
      result,
      payload,
    };
  } catch (err: unknown) {
    console.error("Local webhook simulation failed:", err);
    return {
      success: false,
      error: "Webhook simulation request failed.",
      details: "Webhook simulation request failed. Check server logs for details.",
      payload,
    };
  }
}

// Triggers a low stock alert for a specific product code
export async function testLowStockAlertPush(productId: string): Promise<LowStockAlertResult> {
  try {
    const { checkAdmin } = await import("@/app/actions/auth");
    await checkAdmin();
    return await triggerLowStockGroupAlert(productId);
  } catch (err: unknown) {
    console.error("[LINE Settings] Failed to trigger stock alert push:", err);
    return {
      success: false,
      error: "Failed to trigger stock alert push.",
    };
  }
}

// Triggers a shipping tracking notification for a specific proposal ID
export async function testShippingNotificationPush(proposalId: string): Promise<ShippingNotificationResult> {
  try {
    const { checkAdmin } = await import("@/app/actions/auth");
    await checkAdmin();
    return await triggerShippingUpdateNotification(proposalId);
  } catch (err: unknown) {
    console.error("[LINE Settings] Failed to trigger shipping notification push:", err);
    return {
      success: false,
      error: "Failed to trigger shipping notification push.",
    };
  }
}

// Swaps the target user's Rich Menu between Member and Guest profiles
export async function testToggleUserRichMenu(lineUserId: string, type: "guest" | "member") {
  try {
    const { checkAdmin } = await import("@/app/actions/auth");
    await checkAdmin();

    const validation = validateLineUserId(lineUserId);
    if (validation.error) return { success: false, error: validation.error };

    if (type === "member") {
      const { memberRichMenuId: memberMenuId } = await getLineIntegrationConfig();
      if (!memberMenuId) {
        return { success: false, error: "LINE_RICH_MENU_MEMBER_ID is not configured." };
      }
      return await linkRichMenuToUser(validation.userId, memberMenuId);
    } else {
      return await unlinkRichMenuFromUser(validation.userId);
    }
  } catch (err: unknown) {
    console.error("[LINE Settings] Failed to toggle user rich menu:", err);
    return {
      success: false,
      error: "Failed to toggle user rich menu.",
    };
  }
}

function validateLineAutomationConfig(
  triggers: LineTriggerConfig[],
  quickButtons: LineQuickButton[],
  conversation: LineConversationConfig,
  quickReply?: Partial<LineQuickReplyConfig>,
): string | null {
  if (triggers.length > 30) return "You can create up to 30 LINE triggers.";
  if (quickButtons.length > LINE_MAX_QUICK_REPLY_ITEMS) {
    return `LINE supports up to ${LINE_MAX_QUICK_REPLY_ITEMS} Quick Reply buttons.`;
  }
  if (conversation.owner !== "native" && conversation.owner !== "chatwoot") {
    return "Choose a valid LINE conversation owner.";
  }
  if (quickReply?.messageText && quickReply.messageText.length > LINE_QUICK_REPLY_TEXT_MAX_LENGTH) {
    return `Quick Reply default message must be ${LINE_QUICK_REPLY_TEXT_MAX_LENGTH} characters or less.`;
  }

  for (const [label, value] of [
    ["Chatwoot workspace URL", conversation.chatwootWorkspaceUrl],
    ["Chatwoot inbox URL", conversation.chatwootInboxUrl],
  ] as const) {
    if (!value.trim()) continue;
    try {
      const url = new URL(value.trim());
      if (url.protocol !== "https:") throw new Error("unsupported protocol");
    } catch {
      return `${label} must be a valid HTTPS URL.`;
    }
  }

  if (conversation.owner === "chatwoot" && !conversation.chatwootWorkspaceUrl.trim()) {
    return "Add the Chatwoot workspace URL before routing conversations to Chatwoot.";
  }

  const triggerIds = new Set<string>();
  const triggerKeywords = new Set<string>();
  for (const trigger of triggers) {
    if (!trigger.id.trim() || trigger.id.length > 80) return "Each trigger needs a valid ID.";
    if (triggerIds.has(trigger.id)) return `Duplicate trigger ID: ${trigger.id}`;
    triggerIds.add(trigger.id);

    if (!trigger.name.trim() || trigger.name.length > 80) return "Trigger names must be 1 to 80 characters.";
    if (!trigger.keyword.trim() || trigger.keyword.length > 300) return `Keyword for ${trigger.name} must be 1 to 300 characters.`;
    const normalizedKeyword = normalizeLineTriggerText(trigger.keyword);
    if (triggerKeywords.has(normalizedKeyword)) return `Duplicate trigger keyword: ${trigger.keyword}`;
    triggerKeywords.add(normalizedKeyword);

    if (!LINE_TRIGGER_KINDS.includes(trigger.kind)) return `Unsupported trigger type for ${trigger.name}.`;
    if (trigger.altText.length > 400) return `Alt text for ${trigger.name} is too long.`;
    if (trigger.flexJson.trim()) {
      try {
        JSON.parse(trigger.flexJson);
      } catch {
        return `Flex JSON for ${trigger.name} is invalid.`;
      }
    }
    if (trigger.kind === "custom" && !trigger.flexJson.trim()) {
      return `Custom trigger ${trigger.name} needs a Flex JSON template.`;
    }
  }

  const quickButtonIds = new Set<string>();
  for (const [index, button] of quickButtons.entries()) {
    if (!isRecord(button)) return `Quick Reply ${index + 1} is invalid.`;

    const buttonId = asString(button.id).trim();
    const label = asString(button.label).trim();
    const value = asString(button.value).trim();
    const action = button.action;

    if (!buttonId || buttonId.length > 80 || quickButtonIds.has(buttonId)) {
      return `Duplicate or invalid Quick Button ID: ${buttonId || `#${index + 1}`}`;
    }
    if (!isLineQuickButtonAction(action)) return `Quick Reply ${label || `#${index + 1}`} has an unsupported action.`;
    if (typeof button.enabled !== "boolean") return `Quick Reply ${label || `#${index + 1}`} must have a valid enabled state.`;
    if (typeof button.sortOrder !== "number" || !Number.isInteger(button.sortOrder) || button.sortOrder < 0) {
      return `Quick Reply ${label || `#${index + 1}`} must have a valid order.`;
    }

    quickButtonIds.add(buttonId);
    if (!label || label.length > LINE_QUICK_REPLY_LABEL_MAX_LENGTH) {
      return `Quick Button labels must be 1 to ${LINE_QUICK_REPLY_LABEL_MAX_LENGTH} characters.`;
    }
    if (!value) return `Quick Button ${label} needs an action value.`;
    if (action === "message" && value.length > LINE_QUICK_REPLY_MESSAGE_MAX_LENGTH) {
      return `Message action for ${label} must be ${LINE_QUICK_REPLY_MESSAGE_MAX_LENGTH} characters or less.`;
    }
    if (action === "uri") {
      if (value.length > LINE_QUICK_REPLY_URI_MAX_LENGTH) {
        return `URL action for ${label} must be ${LINE_QUICK_REPLY_URI_MAX_LENGTH} characters or less.`;
      }
      const candidate = value.replaceAll("{{siteUrl}}", "https://example.com");
      try {
        const url = new URL(candidate);
        if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("unsupported protocol");
      } catch {
        return `URI action for ${label} must be a valid HTTP or HTTPS URL.`;
      }
    }
  }

  return null;
}

/**
 * Saves the editable LINE trigger collection and Quick Reply collection.
 * Legacy keyword/template keys are mirrored for compatibility with older
 * deployments and scripts, while the normalized collections are authoritative.
 */
export async function saveLineAutomationConfigAction(input: {
  triggers: LineTriggerConfig[];
  quickButtons: LineQuickButton[];
  loginUrl?: string;
  conversation: LineConversationConfig;
  quickReply?: Partial<LineQuickReplyConfig>;
}): Promise<{ success: boolean; error?: string }> {
  try {
    await checkAdmin();

    if (!Array.isArray(input.triggers) || !Array.isArray(input.quickButtons)) {
      return { success: false, error: "Invalid LINE automation configuration." };
    }

    const validationError = validateLineAutomationConfig(input.triggers, input.quickButtons, input.conversation, input.quickReply);
    if (validationError) return { success: false, error: validationError };

    const normalizedQuickButtons = sortLineQuickButtons(input.quickButtons).map((button, index) => ({
      ...button,
      id: button.id.trim(),
      label: button.label.trim(),
      value: button.value.trim(),
      sortOrder: (index + 1) * 10,
    }));

    const quickReplyConfig: LineQuickReplyConfig = {
      messageText: typeof input.quickReply?.messageText === "string" && input.quickReply.messageText.trim()
        ? input.quickReply.messageText.trim()
        : DEFAULT_LINE_QUICK_REPLY_TEXT,
      replyAlways: typeof input.quickReply?.replyAlways === "boolean"
        ? input.quickReply.replyAlways
        : true,
    };

    const entries: { key: string; value: string }[] = [
      { key: LINE_TRIGGER_CONFIG_KEY, value: JSON.stringify(input.triggers) },
      { key: LINE_QUICK_BUTTONS_KEY, value: JSON.stringify(normalizedQuickButtons) },
      { key: LINE_QUICK_REPLY_CONFIG_KEY, value: JSON.stringify(quickReplyConfig) },
      { key: "line_login_url", value: (input.loginUrl || "").trim() },
      { key: LINE_CONVERSATION_CONFIG_KEY, value: JSON.stringify({
        owner: input.conversation.owner,
        chatwootWorkspaceUrl: input.conversation.chatwootWorkspaceUrl.trim(),
        chatwootInboxUrl: input.conversation.chatwootInboxUrl.trim(),
      }) },
    ];

    const legacyKeys: Partial<Record<LineTriggerConfig["kind"], { keyword: string; flex: string }>> = {
      order: { keyword: "line_keyword_order", flex: "line_flex_json_order" },
      installation: { keyword: "line_keyword_installation", flex: "line_flex_json_installation" },
      points: { keyword: "line_keyword_points", flex: "line_flex_json_points" },
      stock: { keyword: "line_keyword_stock", flex: "line_flex_json_stock" },
      promo: { keyword: "line_keyword_promo", flex: "line_flex_json_promo" },
      link: { keyword: "line_keyword_link", flex: "line_flex_json_link" },
    };

    for (const trigger of input.triggers) {
      const legacy = legacyKeys[trigger.kind];
      if (!legacy) continue;
      entries.push({ key: legacy.keyword, value: trigger.keyword.trim() });
      if (trigger.kind === "order") {
        entries.push({ key: "line_keyword_quotation", value: trigger.keyword.trim() });
      }
      if (trigger.flexJson.trim()) entries.push({ key: legacy.flex, value: trigger.flexJson.trim() });
    }

    const result = await saveSystemSettings(entries);
    if (!result.success) return { success: false, error: result.error };

    const { recordAuditEventBestEffort, resolveAuditActor } = await import("@/lib/auditLog");
    const actor = await resolveAuditActor();
    await recordAuditEventBestEffort({
      actorUserId: actor?.userId,
      actorType: actor?.actorType,
      action: "UPDATE_LINE_AUTOMATION_CONFIG",
      resourceType: "LINE_AUTOMATION",
      outcome: "SUCCESS",
      metadata: {
        conversationOwner: input.conversation.owner,
        triggerCount: input.triggers.length,
        enabledTriggerCount: input.triggers.filter((trigger) => trigger.enabled).length,
        quickButtonCount: normalizedQuickButtons.length,
        enabledQuickButtonCount: normalizedQuickButtons.filter((button) => button.enabled).length,
        quickReplyAlways: quickReplyConfig.replyAlways,
      },
    });

    return { success: true };
  } catch (err: unknown) {
    console.error("[LINE Settings] Failed to save trigger and Quick Button configuration:", err);
    return { success: false, error: "Failed to save LINE trigger configuration." };
  }
}

// Saves all line configurations (keywords, login URL, and Flex message templates) atomically
export async function saveLineConfigSettings(
  keywords: {
    orderKeyword: string;
    pointsKeyword: string;
    stockKeyword: string;
    promoKeyword: string;
    linkKeyword: string;
    loginUrl: string;
  },
  templates: {
    stockJson: string;
    promoJson: string;
    orderJson: string;
    pointsJson: string;
    linkJson: string;
  }
) {
  try {
    const entries = [
      { key: "line_keyword_order", value: keywords.orderKeyword.trim() },
      { key: "line_keyword_points", value: keywords.pointsKeyword.trim() },
      { key: "line_keyword_stock", value: keywords.stockKeyword.trim() },
      { key: "line_keyword_promo", value: keywords.promoKeyword.trim() },
      { key: "line_keyword_link", value: keywords.linkKeyword.trim() },
      { key: "line_login_url", value: keywords.loginUrl.trim() },
      { key: "line_flex_json_stock", value: templates.stockJson.trim() },
      { key: "line_flex_json_promo", value: templates.promoJson.trim() },
      { key: "line_flex_json_order", value: templates.orderJson.trim() },
      { key: "line_flex_json_points", value: templates.pointsJson.trim() },
      { key: "line_flex_json_link", value: templates.linkJson.trim() },
    ];

    const { saveSystemSettings } = await import("@/app/actions/systemSettings");
    const res = await saveSystemSettings(entries);
    if (!res.success) {
      return { success: false, error: res.error || "Failed to save LINE configurations" };
    }
    return { success: true };
  } catch (err: unknown) {
    console.error("[LINE Settings] Failed to save LINE configurations:", err);
    return { success: false, error: "Failed to save LINE configurations." };
  }
}

export type RichMenuArea = {
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  label?: string;
  showLabel?: boolean;
  action:
    | {
      type: "message";
      text: string;
    }
    | {
      type: "uri";
      uri: string;
    };
};

export interface RichMenuRecord {
  id: string;
  menuName: string;
  chatBarText: string;
  imageUrl: string;
  status: "DRAFT" | "PUBLISHED";
  lineRichMenuId: string | null;
  isMemberMenu: boolean;
  areas: RichMenuArea[];
}

export type RichMenuImageUploadResult =
  | {
    success: true;
    url: string;
    fileName: string;
    width: number;
    height: number;
  }
  | {
    success: false;
    error: string;
  };

const MAX_RICH_MENU_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * Validates and stores the artwork used by an authenticated admin's LINE Rich Menu.
 * The publish flow crops the image to LINE's 2500 × 1686 canvas.
 */
export async function uploadRichMenuImage(
  formData: FormData,
): Promise<RichMenuImageUploadResult> {
  try {
    const { checkAdmin } = await import("@/app/actions/auth");
    await checkAdmin();

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return { success: false, error: "Please choose a Rich Menu image." };
    }

    const { validateUploadFile } = await import("@/lib/fileValidation");
    const validatedFile = await validateUploadFile({
      file,
      allowedKinds: ["jpeg", "png", "webp"],
      fallbackName: "rich-menu-image",
      maxBytes: MAX_RICH_MENU_IMAGE_BYTES,
    });
    const bytes = Buffer.from(await file.arrayBuffer());

    const { default: sharp } = await import("sharp");
    const metadata = await sharp(bytes).metadata();
    if (!metadata.width || !metadata.height) {
      return { success: false, error: "The Rich Menu image dimensions could not be read." };
    }

    const { createAdminClient } = await import("@/utils/supabase/server");
    const storagePath = `rich-menu-images/${randomUUID()}.${validatedFile.extension}`;
    const storage = createAdminClient();
    const upload = await storage.storage.from("proposals").upload(storagePath, bytes, {
      contentType: validatedFile.contentType,
      cacheControl: "31536000",
      upsert: false,
    });

    if (upload.error) {
      console.error("[LINE Settings] Rich Menu image upload failed:", upload.error);
      return { success: false, error: "Failed to upload the Rich Menu image." };
    }

    const {
      data: { publicUrl },
    } = storage.storage.from("proposals").getPublicUrl(storagePath);

    return {
      success: true,
      url: publicUrl,
      fileName: validatedFile.safeFileName,
      width: metadata.width,
      height: metadata.height,
    };
  } catch (error: unknown) {
    console.error("[LINE Settings] Rich Menu image validation failed:", error);
    return { success: false, error: "The Rich Menu image could not be uploaded." };
  }
}

/**
 * Retrieves the list of created Rich Menus from the system_settings table.
 */
export async function getRichMenusAction(): Promise<RichMenuRecord[]> {
  try {
    const { getSystemSetting } = await import("@/app/actions/systemSettings");
    const raw = await getSystemSetting("line_rich_menus");
    if (!raw) {
      // Return a default initial draft record
      const defaultMenus: RichMenuRecord[] = [
        {
          id: "default-member-menu",
          menuName: "Member Default Rich Menu",
          chatBarText: "เมนูสมาชิก",
          imageUrl: "https://images.unsplash.com/photo-1509391366360-2e959784a276?auto=format&fit=crop&q=80&w=1200",
          status: "DRAFT",
          lineRichMenuId: null,
          isMemberMenu: true,
          areas: [
            {
              bounds: { x: 0, y: 0, width: 2500, height: 843 },
              action: { type: "uri", uri: "https://solar-dream.org/th/build" }
            },
            {
              bounds: { x: 0, y: 843, width: 833, height: 843 },
              action: { type: "uri", uri: "https://solar-dream.org/th/wizard" }
            },
            {
              bounds: { x: 833, y: 843, width: 834, height: 843 },
              action: { type: "message", text: "ติดตามใบเสนอราคา" }
            },
            {
              bounds: { x: 1667, y: 843, width: 833, height: 843 },
              action: { type: "message", text: "ติดตามงานติดตั้ง" }
            }
          ]
        }
      ];
      return defaultMenus;
    }
    return JSON.parse(raw);
  } catch (error) {
    console.error("[LINE Settings Action] Failed to load rich menus:", error);
    return [];
  }
}

/**
 * Saves or updates a Rich Menu draft in the list stored in system_settings.
 */
export async function saveRichMenuDraftAction(menu: RichMenuRecord): Promise<{ success: boolean; error?: string }> {
  try {
    const { getSystemSetting, saveSystemSetting } = await import("@/app/actions/systemSettings");
    const raw = await getSystemSetting("line_rich_menus");
    let list: RichMenuRecord[] = [];
    if (raw) {
      try {
        list = JSON.parse(raw);
      } catch {
        list = [];
      }
    }

    const idx = list.findIndex((m) => m.id === menu.id);
    if (idx !== -1) {
      list[idx] = { ...list[idx], ...menu, status: "DRAFT" }; // reset to DRAFT on edit
    } else {
      list.push({ ...menu, status: "DRAFT" });
    }

    const saveRes = await saveSystemSetting("line_rich_menus", JSON.stringify(list));
    if (!saveRes.success) {
      return { success: false, error: saveRes.error };
    }
    return { success: true };
  } catch (error: unknown) {
    console.error("[LINE Settings Action] Failed to save draft:", error);
    return { success: false, error: "Failed to save rich menu draft." };
  }
}

/**
 * Deletes one Rich Menu draft/profile from system_settings.line_rich_menus.
 */
export async function deleteRichMenuDraftAction(id: string): Promise<{
  success: boolean;
  deleted?: boolean;
  remainingMenus?: RichMenuRecord[];
  error?: string;
}> {
  try {
    const cleanId = id.trim();
    if (!cleanId) {
      return { success: false, error: "Rich Menu profile id is required." };
    }

    const { getSystemSetting, saveSystemSetting } = await import("@/app/actions/systemSettings");
    const raw = await getSystemSetting("line_rich_menus");
    let list: RichMenuRecord[] = [];
    if (raw) {
      try {
        list = JSON.parse(raw) as RichMenuRecord[];
      } catch {
        list = [];
      }
    }

    const remainingMenus = list.filter((menu) => menu.id !== cleanId);
    const saveRes = await saveSystemSetting("line_rich_menus", JSON.stringify(remainingMenus));
    if (!saveRes.success) {
      return { success: false, error: saveRes.error };
    }

    return {
      success: true,
      deleted: remainingMenus.length !== list.length,
      remainingMenus,
    };
  } catch (error: unknown) {
    console.error("[LINE Settings Action] Failed to delete rich menu draft:", error);
    return { success: false, error: "Failed to delete rich menu draft." };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Rich Menu Conditions — Switching Rules System
// ─────────────────────────────────────────────────────────────────────────────

export interface RichMenuCondition {
  id: string;
  name: string;
  description: string;
  trigger:
    | "ON_ACCOUNT_LINK"
    | "ON_ORDER_CONFIRM"
    | "ON_INSTALLATION_COMPLETE"
    | "DEFAULT_ALL";
  targetMenuId: string;
  priority: number;
  isActive: boolean;
  createdAt: string;
}

/**
 * Read all saved switching conditions from system_settings.
 */
export async function getRichMenuConditionsAction(): Promise<RichMenuCondition[]> {
  try {
    const { getSystemSetting } = await import("@/app/actions/systemSettings");
    const raw = await getSystemSetting("line_rich_menu_conditions");
    if (!raw) return [];
    return JSON.parse(raw) as RichMenuCondition[];
  } catch (err) {
    console.error("[LINE Settings] Failed to get conditions:", err);
    return [];
  }
}

/**
 * Upsert a single condition by id. List is re-sorted by priority on save.
 */
export async function saveRichMenuConditionAction(
  condition: RichMenuCondition
): Promise<{ success: boolean; error?: string }> {
  try {
    const { getSystemSetting, saveSystemSetting } = await import("@/app/actions/systemSettings");
    const raw = await getSystemSetting("line_rich_menu_conditions");
    let list: RichMenuCondition[] = [];
    if (raw) { try { list = JSON.parse(raw); } catch { list = []; } }

    const idx = list.findIndex((c) => c.id === condition.id);
    if (idx !== -1) {
      list[idx] = condition;
    } else {
      list.push(condition);
    }
    list.sort((a, b) => a.priority - b.priority);

    const res = await saveSystemSetting("line_rich_menu_conditions", JSON.stringify(list));
    return res.success ? { success: true } : { success: false, error: res.error };
  } catch (err: unknown) {
    console.error("[LINE Settings] Failed to save rich menu condition:", err);
    return { success: false, error: "Failed to save rich menu condition." };
  }
}

/**
 * Delete a single condition by id.
 */
export async function deleteRichMenuConditionAction(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { getSystemSetting, saveSystemSetting } = await import("@/app/actions/systemSettings");
    const raw = await getSystemSetting("line_rich_menu_conditions");
    let list: RichMenuCondition[] = [];
    if (raw) { try { list = JSON.parse(raw); } catch { list = []; } }

    const filtered = list.filter((c) => c.id !== id);
    const res = await saveSystemSetting("line_rich_menu_conditions", JSON.stringify(filtered));
    return res.success ? { success: true } : { success: false, error: res.error };
  } catch (err: unknown) {
    console.error("[LINE Settings] Failed to delete rich menu condition:", err);
    return { success: false, error: "Failed to delete rich menu condition." };
  }
}

/**
 * Bulk-delete multiple Rich Menu profiles by their IDs.
 * Orphaned conditions referencing deleted profiles are preserved (flagged by UI).
 */
export async function deleteManyRichMenuProfilesAction(
  ids: string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const { getSystemSetting, saveSystemSetting } = await import("@/app/actions/systemSettings");
    const raw = await getSystemSetting("line_rich_menus");
    let list: RichMenuRecord[] = [];
    if (raw) { try { list = JSON.parse(raw); } catch { list = []; } }

    const filtered = list.filter((m) => !ids.includes(m.id));
    const res = await saveSystemSetting("line_rich_menus", JSON.stringify(filtered));
    return res.success ? { success: true } : { success: false, error: res.error };
  } catch (err: unknown) {
    console.error("[LINE Settings] Failed to delete rich menu profiles:", err);
    return { success: false, error: "Failed to delete rich menu profiles." };
  }
}
