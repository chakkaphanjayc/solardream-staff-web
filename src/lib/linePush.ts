import { db } from "@/db";
import { eq } from "drizzle-orm";
import { users, proposals } from "@/db/schema";
import { getCatalogProduct } from "@/lib/erpnextCatalog";
import { getLineIntegrationConfig, isLineLiveMutationEnabled } from "@/lib/lineApi";

type LineMessage = Record<string, unknown>;
type LinePushResult = {
  success: boolean;
  simulated?: boolean;
  skipped?: boolean;
  recipient?: string;
  lineUserId?: string;
  richMenuId?: string;
  linkedCount?: number;
  failedCount?: number;
  skippedCount?: number;
  status?: number;
  data?: unknown;
  error?: string;
};

export type ShippingNotificationResult = {
  success: boolean;
  error?: string;
  recipientName?: string;
  recipientLineId?: string;
  result?: LinePushResult;
};

export type LowStockAlertResult = {
  success: boolean;
  error?: string;
  targetRecipient?: string;
  productName?: string;
  stock?: number;
  result?: LinePushResult;
};

const LINE_REQUEST_TIMEOUT_MS = 8_000;
const MAX_LINE_ERROR_BODY_CHARS = 2_000;

export function isValidLineUserId(value: string) {
  return /^U[0-9a-f]{32}$/i.test(value.trim());
}

function isLiveLineOutboundAllowed() {
  return isLineLiveMutationEnabled();
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

async function getAccessToken() {
  return (await getLineIntegrationConfig()).accessToken;
}

async function readLineErrorText(response: Response) {
  const errorText = await response.text().catch(() => "");
  return errorText.slice(0, MAX_LINE_ERROR_BODY_CHARS);
}

/**
 * Sends a push message to a specific LINE User ID or Group ID using the LINE Messaging API.
 * Handles official LINE API requests and fails closed when the token is absent.
 */
export async function pushMessageToLine(lineUserId: string, messages: LineMessage[]): Promise<LinePushResult> {
  if (!isValidLineUserId(lineUserId)) {
    return {
      success: true,
      skipped: true,
      recipient: lineUserId,
      error: "Stored LINE user ID is not valid.",
    };
  }

  const accessToken = await getAccessToken();
  
  console.info("[LINE Push] Attempting outbound push", {
    recipient: lineUserId.length > 8 ? `${lineUserId.slice(0, 4)}…${lineUserId.slice(-4)}` : "masked",
    messageCount: messages.length,
    messageTypes: messages.map((message) => typeof message.type === "string" ? message.type : "unknown"),
  });

  if (!isLiveLineOutboundAllowed() || !accessToken || accessToken === "mock_access_token") {
    console.warn("[LINE Push] Outbound push was not sent. Live LINE delivery is production-only and requires a configured token.");
    return {
      success: false,
      simulated: false,
      recipient: lineUserId,
      error: "LINE channel access token is not configured.",
    };
  }

  const url = "https://api.line.me/v2/bot/message/push";
  
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        to: lineUserId,
        messages,
      }),
      signal: AbortSignal.timeout(LINE_REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      const errorText = await readLineErrorText(response);
      console.error(`[LINE Push] Error response from LINE API:`, errorText);
      return {
        success: false,
        status: response.status,
        error: errorText,
      };
    }

    const data = await response.json().catch(() => ({}));
    return {
      success: true,
      simulated: false,
      recipient: lineUserId,
      data,
    };
  } catch (error: unknown) {
    console.error("[LINE Push] Network or connection error:", error);
    return {
      success: false,
      error: getErrorMessage(error, "Unknown push error"),
    };
  }
}

/**
 * Links a specific LINE Rich Menu ID to a user's LINE account.
 */
export async function linkRichMenuToUser(lineUserId: string, richMenuId: string): Promise<LinePushResult> {
  const accessToken = await getAccessToken();
  
  console.log(`[LINE Rich Menu] Linking Rich Menu ${richMenuId} to user ${lineUserId}`);

  if (!isLineLiveMutationEnabled() || !accessToken || accessToken === "mock_access_token") {
    console.warn("[LINE Rich Menu] Token is missing/mock. Rich menu link was not sent.");
    return { success: false, simulated: false, lineUserId, richMenuId, error: "LINE channel access token is not configured." };
  }

  const url = `https://api.line.me/v2/bot/user/${lineUserId}/richmenu/${richMenuId}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(LINE_REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      const errorText = await readLineErrorText(response);
      console.error(`[LINE Rich Menu] Error linking rich menu:`, errorText);
      return {
        success: false,
        status: response.status,
        error: errorText,
      };
    }

    return { success: true, simulated: false, lineUserId, richMenuId };
  } catch (error: unknown) {
    console.error("[LINE Rich Menu] Connection error linking menu:", error);
    return {
      success: false,
      error: getErrorMessage(error, "Unknown error linking rich menu"),
    };
  }
}

export async function linkRichMenuToUsers(lineUserIds: string[], richMenuId: string): Promise<LinePushResult> {
  const uniqueUserIds = Array.from(new Set(lineUserIds.map((id) => id.trim()).filter(Boolean)));
  const validUserIds = uniqueUserIds.filter((lineUserId) => /^U[0-9a-f]{32}$/i.test(lineUserId));
  const skippedCount = uniqueUserIds.length - validUserIds.length;
  if (validUserIds.length === 0) {
    return { success: true, simulated: false, richMenuId, linkedCount: 0, skippedCount };
  }

  const accessToken = await getAccessToken();
  if (!isLineLiveMutationEnabled() || !accessToken || accessToken === "mock_access_token") {
    console.warn("[LINE Rich Menu] Token is missing/mock. Bulk rich menu link was not sent.");
    return {
      success: false,
      simulated: false,
      richMenuId,
      linkedCount: 0,
      failedCount: validUserIds.length,
      skippedCount,
      error: "LINE channel access token is not configured.",
    };
  }

  const url = "https://api.line.me/v2/bot/richmenu/bulk/link";

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        richMenuId,
        userIds: validUserIds,
      }),
      signal: AbortSignal.timeout(LINE_REQUEST_TIMEOUT_MS),
    });

    if (response.ok) {
      return { success: true, simulated: false, richMenuId, linkedCount: validUserIds.length, skippedCount };
    }

    const errorText = await readLineErrorText(response);
    console.warn("[LINE Rich Menu] Bulk link failed, falling back to per-user linking:", errorText);

    const results = await Promise.allSettled(
      validUserIds.map((lineUserId) => linkRichMenuToUser(lineUserId, richMenuId)),
    );

    const failed = results.filter((result) => result.status === "rejected" || (result.status === "fulfilled" && !result.value.success));
    return {
      success: failed.length === 0,
      simulated: false,
      richMenuId,
      linkedCount: validUserIds.length - failed.length,
      failedCount: failed.length,
      skippedCount,
      error: failed.length === 0 ? undefined : errorText,
    };
  } catch (error: unknown) {
    console.error("[LINE Rich Menu] Connection error bulk linking menu:", error);
    return {
      success: false,
      error: getErrorMessage(error, "Unknown error bulk linking rich menu"),
    };
  }
}

/**
 * Unlinks the active Rich Menu from a user's LINE account.
 */
export async function unlinkRichMenuFromUser(lineUserId: string): Promise<LinePushResult> {
  const accessToken = await getAccessToken();
  
  console.log(`[LINE Rich Menu] Unlinking Rich Menu from user ${lineUserId}`);

  if (!isLineLiveMutationEnabled() || !accessToken || accessToken === "mock_access_token") {
    console.warn("[LINE Rich Menu] Token is missing/mock. Rich menu unlink was not sent.");
    return { success: false, simulated: false, lineUserId, error: "LINE channel access token is not configured." };
  }

  const url = `https://api.line.me/v2/bot/user/${lineUserId}/richmenu`;

  try {
    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(LINE_REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      const errorText = await readLineErrorText(response);
      console.error(`[LINE Rich Menu] Error unlinking rich menu:`, errorText);
      return {
        success: false,
        status: response.status,
        error: errorText,
      };
    }

    return { success: true, simulated: false, lineUserId };
  } catch (error: unknown) {
    console.error("[LINE Rich Menu] Connection error unlinking menu:", error);
    return {
      success: false,
      error: getErrorMessage(error, "Unknown error unlinking rich menu"),
    };
  }
}

export async function setDefaultRichMenuForAllUsers(richMenuId: string): Promise<LinePushResult> {
  const accessToken = await getAccessToken();

  if (!isLineLiveMutationEnabled() || !accessToken || accessToken === "mock_access_token") {
    console.warn("[LINE Rich Menu] Token is missing/mock. Default rich menu link was not sent.");
    return { success: false, simulated: false, richMenuId, error: "LINE channel access token is not configured." };
  }

  const url = `https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(LINE_REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      const errorText = await readLineErrorText(response);
      console.error(`[LINE Rich Menu] Error setting default rich menu:`, errorText);
      return {
        success: false,
        status: response.status,
        error: errorText,
      };
    }

    return { success: true, simulated: false, richMenuId };
  } catch (error: unknown) {
    console.error("[LINE Rich Menu] Connection error setting default rich menu:", error);
    return {
      success: false,
      error: getErrorMessage(error, "Unknown error setting default rich menu"),
    };
  }
}

export async function clearDefaultRichMenuForAllUsers(): Promise<LinePushResult> {
  const accessToken = await getAccessToken();

  if (!isLineLiveMutationEnabled() || !accessToken || accessToken === "mock_access_token") {
    console.warn("[LINE Rich Menu] Token is missing/mock. Default rich menu clear was not sent.");
    return { success: false, simulated: false, error: "LINE channel access token is not configured." };
  }

  const url = "https://api.line.me/v2/bot/user/all/richmenu";

  try {
    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(LINE_REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      const errorText = await readLineErrorText(response);
      console.error(`[LINE Rich Menu] Error clearing default rich menu:`, errorText);
      return {
        success: false,
        status: response.status,
        error: errorText,
      };
    }

    return { success: true, simulated: false };
  } catch (error: unknown) {
    console.error("[LINE Rich Menu] Connection error clearing default rich menu:", error);
    return {
      success: false,
      error: getErrorMessage(error, "Unknown error clearing default rich menu"),
    };
  }
}

/**
 * Triggered when shipping status changes. Pulls details and pushes a shipping Flex Message.
 */
export async function triggerShippingUpdateNotification(proposalId: string): Promise<ShippingNotificationResult> {
  try {
    const proposal = await db.query.proposals.findFirst({
      where: eq(proposals.id, proposalId),
    });

    if (!proposal) {
      return { success: false, error: "Proposal not found" };
    }

    const userObj = await db.query.users.findFirst({
      where: eq(users.id, proposal.userId),
    });

    if (!userObj) {
      return { success: false, error: "Associated user not found" };
    }

    if (!userObj.lineUserId) {
      return {
        success: false,
        error: `User ${userObj.email} is not linked to a LINE account. Outbound skipped.`,
      };
    }

    // Build shipping tracking Flex Message
    const orderId = `SD-${proposal.id.slice(0, 8).toUpperCase()}`;
    const trackingNo = proposal.shippingTrackingNumber?.trim();
    if (!trackingNo) {
      return {
        success: false,
        error: "Proposal has no shipping tracking number. Outbound skipped.",
      };
    }
    const trackingUrl = `https://www.flashexpress.co.th/tracking?keyword=${trackingNo}`;
    
    const flexMessage = {
      type: "flex",
      altText: `แจ้งเตือนเลขพัสดุของคุณ: ออเดอร์ #${orderId}`,
      contents: {
        type: "bubble",
        header: {
          type: "box",
          layout: "vertical",
          backgroundColor: "#0F172A",
          contents: [
            {
              type: "text",
              text: "🚚 การจัดส่งสินค้า (Fulfillment)",
              color: "#B7D1EA",
              weight: "bold",
              size: "sm",
            },
            {
              type: "text",
              text: `ออเดอร์ #${orderId} จัดส่งแล้ว`,
              color: "#FFFFFF",
              weight: "bold",
              size: "lg",
              margin: "sm",
            },
          ],
        },
        body: {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "text",
              text: "พัสดุของคุณกำลังเดินทาง! กรุณาใช้เลขพัสดุด้านล่างในการติดตามสถานะการจัดส่ง",
              size: "xs",
              color: "#475569",
              wrap: true,
            },
            {
              type: "box",
              layout: "horizontal",
              margin: "lg",
              contents: [
                {
                  type: "text",
                  text: "ผู้จัดส่ง:",
                  color: "#475569",
                  size: "sm",
                },
                {
                  type: "text",
                  text: "Flash Express",
                  color: "#0F172A",
                  size: "sm",
                  align: "end",
                  weight: "bold",
                },
              ],
            },
            {
              type: "box",
              layout: "horizontal",
              margin: "sm",
              contents: [
                {
                  type: "text",
                  text: "เลขพัสดุ:",
                  color: "#475569",
                  size: "sm",
                },
                {
                  type: "text",
                  text: trackingNo,
                  color: "#1CBBBB",
                  size: "sm",
                  align: "end",
                  weight: "bold",
                },
              ],
            },
          ],
        },
        footer: {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "button",
              action: {
                type: "uri",
                label: "เช็คสถานะขนส่ง",
                uri: trackingUrl,
              },
              style: "primary",
              color: "#B7D1EA",
            },
          ],
        },
      },
    };

    const result = await pushMessageToLine(userObj.lineUserId, [flexMessage]);
    return {
      success: result.success,
      recipientName: userObj.fullName || userObj.email,
      recipientLineId: userObj.lineUserId,
      result,
    };
  } catch (err: unknown) {
    console.error("Shipping update notification failed:", err);
    return {
      success: false,
      error: getErrorMessage(err, "Unknown notification error"),
    };
  }
}

/**
 * Triggered when stock falls below order threshold. Alert pushes to admin user or group ID.
 */
export async function triggerLowStockGroupAlert(productId: string): Promise<LowStockAlertResult> {
  try {
    const product = await getCatalogProduct(productId);

    if (!product) {
      return { success: false, error: "Product not found" };
    }

    const adminRecipient = process.env.LINE_ADMIN_GROUP_ID || process.env.LINE_DEVELOPER_USER_ID;
    if (!adminRecipient) {
      return {
        success: false,
        error: "LINE admin recipient is not configured.",
      };
    }
    const currentStock = product.stock;

    const alertText = `🚨 [Low Stock Alert] สินค้าในคลังอยู่ในระดับต่ำกว่ากำหนด!\n\n📦 สินค้า: ${product.brand} - ${product.model}\n📝 รหัสสินค้า: ${product.erpnextItemCode}\n⚠️ สต็อกคงเหลือ: ${currentStock} ชิ้น (จุดสั่งซื้อ < 5 ชิ้น)\n\nกรุณาเข้าสู่ระบบคลังสินค้า ERP เพื่อดำเนินการสั่งซื้อสินค้าทดแทนโดยด่วนครับ`;

    const message = {
      type: "text",
      text: alertText,
    };

    const result = await pushMessageToLine(adminRecipient, [message]);
    return {
      success: result.success,
      targetRecipient: adminRecipient,
      productName: `${product.brand} ${product.model}`,
      stock: currentStock,
      result,
    };
  } catch (err: unknown) {
    console.error("Low stock group alert failed:", err);
    return {
      success: false,
      error: getErrorMessage(err, "Unknown stock alert error"),
    };
  }
}
