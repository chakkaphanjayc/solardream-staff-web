import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { sendConfiguredTemplateEmail } from "@/lib/email";
import type { EmailTemplateKey } from "@/lib/emailTemplates";
import { getLineIntegrationConfig } from "@/lib/lineApi";

type NotificationData = Record<string, unknown>;

type NotificationChannel = "email" | "line";

type NotificationChannelResult = {
  channel: NotificationChannel;
  success: boolean;
  skipped?: boolean;
  status?: number;
  error?: string;
};

export type DispatchNotificationResult = {
  userId: string;
  templateContext: string;
  email: NotificationChannelResult;
  line: NotificationChannelResult;
};

type LineTextMessage = {
  type: "text";
  text: string;
};

type LineFlexMessage = {
  type: "flex";
  altText: string;
  contents: Record<string, unknown>;
};

type LineMessage = LineTextMessage | LineFlexMessage;

const LINE_PUSH_ENDPOINT = "https://api.line.me/v2/bot/message/push";
const LINE_REQUEST_TIMEOUT_MS = 8_000;
const MAX_LINE_ERROR_BODY_CHARS = 2_000;

const EMAIL_AUTOMATION_BY_CONTEXT: Record<string, EmailTemplateKey> = {
  QUOTATION_READY: "proposal_ready",
  PAYMENT_RECEIVED: "payment_confirmed",
  SERVICE_STATUS_UPDATED: "service_request_confirmed",
  INSTALLATION_STATUS_UPDATED: "project_completed",
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatThb(value: unknown) {
  const amount = getNumber(value);
  return amount === null
    ? null
    : new Intl.NumberFormat("th-TH", {
        style: "currency",
        currency: "THB",
        maximumFractionDigits: 0,
      }).format(amount);
}

async function getLineAccessToken() {
  return (await getLineIntegrationConfig()).accessToken;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLineMuted(preferences: unknown) {
  if (!isRecord(preferences)) return false;

  const nested = preferences.notification_preferences;
  const nestedLinePreference = isRecord(nested) ? nested.line : undefined;

  return (
    preferences.line === false ||
    preferences.line_notifications === false ||
    preferences.lineNotifications === false ||
    preferences.mute_line === true ||
    preferences.lineMuted === true ||
    nestedLinePreference === false
  );
}

function textBlock(text: string, options: Record<string, unknown> = {}) {
  return {
    type: "text",
    text,
    wrap: true,
    ...options,
  };
}

function buildFlexMessage(input: {
  altText: string;
  title: string;
  body: string;
  rows?: Array<{ label: string; value: string }>;
  actionUrl?: string | null;
}) {
  return {
    type: "flex",
    altText: input.altText,
    contents: {
      type: "bubble",
      size: "mega",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          textBlock("SolarDream", {
            size: "xs",
            weight: "bold",
            color: "#0D9488",
          }),
          textBlock(input.title, {
            size: "lg",
            weight: "bold",
            color: "#0F172A",
          }),
          textBlock(input.body, {
            size: "sm",
            color: "#475569",
          }),
          ...(input.rows?.length
            ? [{
                type: "box",
                layout: "vertical",
                spacing: "sm",
                margin: "md",
                contents: input.rows.map((row) => ({
                  type: "box",
                  layout: "baseline",
                  spacing: "sm",
                  contents: [
                    textBlock(row.label, {
                      flex: 2,
                      size: "xs",
                      color: "#64748B",
                    }),
                    textBlock(row.value, {
                      flex: 4,
                      size: "sm",
                      weight: "bold",
                      color: "#0F172A",
                    }),
                  ],
                })),
              }]
            : []),
        ],
      },
      ...(input.actionUrl
        ? {
            footer: {
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "button",
                  style: "primary",
                  color: "#0D9488",
                  action: {
                    type: "uri",
                    label: "Open SolarDream",
                    uri: input.actionUrl,
                  },
                },
              ],
            },
          }
        : {}),
    },
  } satisfies LineFlexMessage;
}

function buildQuotationFlexMessage(data: NotificationData) {
  const documentNo = getString(data.document_no ?? data.documentNo ?? data.quotation_no);
  const actionUrl = getString(data.action_url ?? data.actionUrl);
  return buildFlexMessage({
    altText: "Your SolarDream quotation is ready",
    title: "Quotation ready",
    body: "Your solar quotation is ready for review.",
    rows: [
      ...(documentNo ? [{ label: "Document", value: documentNo }] : []),
      ...(formatThb(data.amount) ? [{ label: "Amount", value: formatThb(data.amount) as string }] : []),
    ],
    actionUrl,
  });
}

function buildPaymentReceivedFlexMessage(data: NotificationData) {
  const documentNo = getString(data.document_no ?? data.documentNo ?? data.payment_no);
  const actionUrl = getString(data.action_url ?? data.actionUrl);
  return buildFlexMessage({
    altText: "SolarDream payment received",
    title: "Payment received",
    body: "We have received your payment and updated your request.",
    rows: [
      ...(documentNo ? [{ label: "Reference", value: documentNo }] : []),
      ...(formatThb(data.amount) ? [{ label: "Amount", value: formatThb(data.amount) as string }] : []),
    ],
    actionUrl,
  });
}

function buildStatusFlexMessage(templateContext: string, data: NotificationData) {
  const title = getString(data.title) ?? "Request updated";
  const message = getString(data.message) ?? "Your SolarDream request status has been updated.";
  const status = getString(data.status);
  const actionUrl = getString(data.action_url ?? data.actionUrl);
  return buildFlexMessage({
    altText: title,
    title,
    body: message,
    rows: status ? [{ label: "Status", value: status }] : undefined,
    actionUrl,
  });
}

function buildLineMessage(templateContext: string, data: NotificationData): LineMessage {
  switch (templateContext.toUpperCase()) {
    case "QUOTATION_READY":
      return buildQuotationFlexMessage(data);
    case "PAYMENT_RECEIVED":
      return buildPaymentReceivedFlexMessage(data);
    case "SERVICE_STATUS_UPDATED":
    case "INSTALLATION_STATUS_UPDATED":
      return buildStatusFlexMessage(templateContext, data);
    default: {
      const title = getString(data.title) ?? "SolarDream update";
      const message = getString(data.message) ?? `Notification: ${templateContext}`;
      return buildFlexMessage({
        altText: title,
        title,
        body: message,
        actionUrl: getString(data.action_url ?? data.actionUrl),
      });
    }
  }
}

async function dispatchEmail(email: string, templateContext: string, data: NotificationData): Promise<NotificationChannelResult> {
  const templateKey = EMAIL_AUTOMATION_BY_CONTEXT[templateContext];
  if (!templateKey) {
    const error = `No email automation is mapped for ${templateContext}.`;
    console.warn("[NotificationOrchestrator] Email skipped.", { templateContext, error });
    return { channel: "email", success: false, skipped: true, error };
  }

  try {
    const result = await sendConfiguredTemplateEmail({
      templateKey,
      to: email,
      values: data,
    });

    if (!result.success) {
      const error = "error" in result ? result.error : result.reason;
      return {
        channel: "email",
        success: false,
        skipped: "reason" in result,
        error,
      };
    }

    return { channel: "email", success: true };
  } catch (error) {
    console.warn("[NotificationOrchestrator] Listmonk email dispatch failed.", error);
    return {
      channel: "email",
      success: false,
      error: getErrorMessage(error, "Listmonk email dispatch failed."),
    };
  }
}

async function dispatchLine(userId: string, lineUserId: string, templateContext: string, data: NotificationData): Promise<NotificationChannelResult> {
  const accessToken = await getLineAccessToken();
  if (!accessToken || accessToken === "mock_access_token") {
    return {
      channel: "line",
      success: false,
      skipped: true,
      error: "LINE channel access token is not configured.",
    };
  }

  try {
    const response = await fetch(LINE_PUSH_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        to: lineUserId,
        messages: [buildLineMessage(templateContext, data)],
      }),
      signal: AbortSignal.timeout(LINE_REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      const errorText = (await response.text().catch(() => "")).slice(0, MAX_LINE_ERROR_BODY_CHARS);
      if (response.status === 400) {
        console.warn("[NotificationOrchestrator] User blocked LINE or cannot receive push messages.", {
          userId,
          status: response.status,
          error: errorText,
        });
        await db
          .update(users)
          .set({ isLineBlocked: true, updatedAt: new Date() })
          .where(eq(users.id, userId));
      } else {
        console.warn("[NotificationOrchestrator] LINE push rejected.", {
          userId,
          status: response.status,
          error: errorText,
        });
      }

      return {
        channel: "line",
        success: false,
        status: response.status,
        error: errorText || `LINE push failed with status ${response.status}.`,
      };
    }

    return { channel: "line", success: true, status: response.status };
  } catch (error) {
    console.warn("[NotificationOrchestrator] LINE push failed.", error);
    return {
      channel: "line",
      success: false,
      error: getErrorMessage(error, "LINE push failed."),
    };
  }
}

function settledChannelResult(
  settled: PromiseSettledResult<NotificationChannelResult> | undefined,
  fallback: NotificationChannelResult,
) {
  if (!settled) return fallback;
  if (settled.status === "fulfilled") return settled.value;
  return {
    ...fallback,
    success: false,
    error: getErrorMessage(settled.reason, fallback.error ?? "Notification dispatch failed."),
  };
}

export async function dispatchNotification(
  userId: string,
  templateContext: string,
  data: NotificationData = {},
): Promise<DispatchNotificationResult> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      id: true,
      email: true,
      lineUserId: true,
      isLineBlocked: true,
      consentPreferences: true,
      preferredLanguage: true,
    },
  });

  const normalizedContext = templateContext.trim().toUpperCase();
  const notificationData = {
    ...data,
    lang: user?.preferredLanguage === "th" ? "th" : "en",
  };
  const emailFallback: NotificationChannelResult = {
    channel: "email",
    success: false,
    error: "Email dispatch did not run.",
  };
  const lineFallback: NotificationChannelResult = {
    channel: "line",
    success: false,
    skipped: true,
    error: "LINE dispatch did not run.",
  };

  if (!user?.email) {
    const error = `User ${userId} was not found or has no email address.`;
    console.warn("[NotificationOrchestrator] Dispatch skipped.", { userId, templateContext: normalizedContext, error });
    return {
      userId,
      templateContext: normalizedContext,
      email: { ...emailFallback, error },
      line: { ...lineFallback, error },
    };
  }

  const tasks: Array<Promise<NotificationChannelResult>> = [
    dispatchEmail(user.email, normalizedContext, notificationData),
  ];

  const shouldSendLine = Boolean(user.lineUserId) && !user.isLineBlocked && !isLineMuted(user.consentPreferences);
  if (shouldSendLine && user.lineUserId) {
    tasks.push(dispatchLine(user.id, user.lineUserId, normalizedContext, notificationData));
  }

  const [emailResult, lineResult] = await Promise.allSettled(tasks);

  return {
    userId,
    templateContext: normalizedContext,
    email: settledChannelResult(emailResult, emailFallback),
    line: shouldSendLine
      ? settledChannelResult(lineResult, lineFallback)
      : {
          channel: "line",
          success: true,
          skipped: true,
          error: user.isLineBlocked
            ? "LINE notifications skipped because the user is marked as blocked."
            : isLineMuted(user.consentPreferences)
              ? "LINE notifications skipped because the user muted LINE alerts."
              : "LINE notifications skipped because the user has not linked LINE.",
        },
  };
}
