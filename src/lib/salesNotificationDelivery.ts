import "server-only";

import { and, eq, or } from "drizzle-orm";

import { db } from "@/db";
import { inboundRequests, integrationOutbox, paymentRequests, proposals, users } from "@/db/schema";
import { getDiscordWebhookUrl, sendDiscordSalesLifecycleNotification } from "@/lib/discord";
import { pushMessageToLine } from "@/lib/linePush";
import { getConfiguredPublicSiteUrl } from "@/lib/siteUrl";
import {
  getSalesNotificationEventForTopic,
  SALES_NOTIFICATION_EVENT_META,
  type SalesNotificationEvent,
} from "@/lib/salesNotificationConfig";
import { getSalesNotificationConfig } from "@/lib/salesNotificationServer";

type OutboxEvent = typeof integrationOutbox.$inferSelect;
type JsonRecord = Record<string, unknown>;

type NotificationTarget = {
  event: SalesNotificationEvent;
  customerName: string;
  email: string | null;
  lineUserId: string | null;
  lineBlocked: boolean;
  consentPreferences: unknown;
  preferredLanguage: "th" | "en";
  reference: string;
  amount: number | null;
  status: string | null;
  requestType: string | null;
  actionUrl: string | null;
};

type ChannelResult = {
  channel: "line" | "discord";
  success: boolean;
  skipped?: boolean;
  error?: string;
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function getPreferredLanguage(value: unknown): "th" | "en" {
  return value === "en" ? "en" : "th";
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

function getUserColumns() {
  return {
    name: true,
    fullName: true,
    email: true,
    lineUserId: true,
    isLineBlocked: true,
    consentPreferences: true,
    preferredLanguage: true,
  } as const;
}

async function findUserForLeadContact(email: string | null, phone: string | null) {
  const conditions = [
    email ? eq(users.email, email) : null,
    phone ? eq(users.phoneNumber, phone) : null,
  ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));

  if (conditions.length === 0) return null;

  return db.query.users.findFirst({
    where: conditions.length === 1 ? conditions[0] : or(...conditions),
    columns: getUserColumns(),
  });
}

function buildTargetFromUser(input: {
  event: SalesNotificationEvent;
  customerName: string;
  reference: string;
  amount: number | null;
  status: string | null;
  requestType: string | null;
  actionUrl: string | null;
  user?: {
    name: string | null;
    fullName: string;
    email: string;
    lineUserId: string | null;
    isLineBlocked: boolean;
    consentPreferences: unknown;
    preferredLanguage: string;
  } | null;
  email?: string | null;
}): NotificationTarget {
  const user = input.user;
  return {
    event: input.event,
    customerName: user?.fullName || user?.name || input.customerName,
    email: user?.email || input.email || null,
    lineUserId: user?.lineUserId || null,
    lineBlocked: user?.isLineBlocked || false,
    consentPreferences: user?.consentPreferences,
    preferredLanguage: getPreferredLanguage(user?.preferredLanguage),
    reference: input.reference,
    amount: input.amount,
    status: input.status,
    requestType: input.requestType,
    actionUrl: input.actionUrl,
  };
}

async function loadNotificationTarget(event: OutboxEvent, notificationEvent: SalesNotificationEvent) {
  const payload = isRecord(event.payload) ? event.payload : {};
  const publicSiteUrl = getConfiguredPublicSiteUrl();

  if (notificationEvent === "LEAD_RECEIVED") {
    const request = await db.query.inboundRequests.findFirst({
      where: eq(inboundRequests.id, event.aggregateId),
    });
    if (!request) return null;

    const user = await findUserForLeadContact(request.email, request.phone);
    return buildTargetFromUser({
      event: notificationEvent,
      customerName: request.customerName,
      email: request.email,
      reference: `LEAD-${request.id.slice(0, 8).toUpperCase()}`,
      amount: null,
      status: request.status,
      requestType: request.requestType,
      actionUrl: `${publicSiteUrl}/th/contact`,
      user,
    });
  }

  const proposal = await db.query.proposals.findFirst({
    where: eq(proposals.id, event.aggregateId),
    columns: {
      id: true,
      totalPrice: true,
      status: true,
      magicTokenSlug: true,
      requestType: true,
      userId: true,
    },
    with: {
      user: {
        columns: getUserColumns(),
      },
    },
  });
  if (!proposal) return null;

  const paymentRequestId = getText(payload.paymentRequestId);
  const paymentRequest = paymentRequestId
    ? await db.query.paymentRequests.findFirst({
        where: and(
          eq(paymentRequests.id, paymentRequestId),
          eq(paymentRequests.proposalId, proposal.id),
        ),
        columns: {
          id: true,
          title: true,
          amountRequested: true,
          status: true,
        },
      })
    : null;
  const reference = paymentRequest
    ? `PAY-${paymentRequest.id.slice(0, 8).toUpperCase()}`
    : `QT-${proposal.id.slice(0, 8).toUpperCase()}`;
  const actionUrl = paymentRequest
    ? `${publicSiteUrl}/checkout/${encodeURIComponent(proposal.id)}/payment`
    : `${publicSiteUrl}/th/portal/${encodeURIComponent(proposal.id)}`;

  return buildTargetFromUser({
    event: notificationEvent,
    customerName: proposal.user?.fullName || proposal.user?.name || "Customer",
    email: proposal.user?.email || null,
    reference,
    amount: paymentRequest ? getNumber(paymentRequest.amountRequested) : getNumber(proposal.totalPrice),
    status: paymentRequest?.status || proposal.status,
    requestType: proposal.requestType,
    actionUrl,
    user: proposal.user,
  });
}

function formatAmount(amount: number | null, language: "th" | "en") {
  if (amount === null) return "";
  return new Intl.NumberFormat(language === "th" ? "th-TH" : "en-US", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(amount);
}

function buildLineMessage(target: NotificationTarget) {
  const amount = formatAmount(target.amount, target.preferredLanguage);
  const action = target.actionUrl ? `\n${target.preferredLanguage === "th" ? "เปิดรายละเอียด" : "Open details"}: ${target.actionUrl}` : "";

  if (target.preferredLanguage === "en") {
    switch (target.event) {
      case "LEAD_RECEIVED":
        return `SolarDream received your request. Our team will contact you shortly.${action}`;
      case "QUOTATION_READY":
        return `Your SolarDream quotation is ready for review. Reference: ${target.reference}.${action}`;
      case "QUOTATION_ACCEPTED":
        return `Your SolarDream quotation was accepted successfully. Reference: ${target.reference}.${action}`;
      case "PAYMENT_REQUESTED":
        return `A SolarDream payment request is ready. ${amount ? `Amount: ${amount}. ` : ""}Reference: ${target.reference}.${action}`;
      case "PAYMENT_REVIEW_REQUIRED":
        return `We received your payment proof and sent it for verification. Reference: ${target.reference}.${action}`;
      case "PAYMENT_RECEIVED":
        return `Your SolarDream payment was received and verified. ${amount ? `Amount: ${amount}. ` : ""}Reference: ${target.reference}.${action}`;
    }
  }

  switch (target.event) {
    case "LEAD_RECEIVED":
      return `SolarDream ได้รับคำขอของคุณแล้ว ทีมงานจะติดต่อกลับโดยเร็ว${action}`;
    case "QUOTATION_READY":
      return `ใบเสนอราคา SolarDream พร้อมให้ตรวจสอบแล้ว เลขอ้างอิง ${target.reference}${action}`;
    case "QUOTATION_ACCEPTED":
      return `ยืนยันการตอบรับใบเสนอราคา SolarDream แล้ว เลขอ้างอิง ${target.reference}${action}`;
    case "PAYMENT_REQUESTED":
      return `มีคำขอชำระเงิน SolarDream พร้อมให้ดำเนินการ${amount ? ` จำนวน ${amount}` : ""} เลขอ้างอิง ${target.reference}${action}`;
    case "PAYMENT_REVIEW_REQUIRED":
      return `เราได้รับหลักฐานการชำระเงินของคุณแล้ว และกำลังส่งให้ทีมงานตรวจสอบ เลขอ้างอิง ${target.reference}${action}`;
    case "PAYMENT_RECEIVED":
      return `ยืนยันการชำระเงิน SolarDream แล้ว${amount ? ` จำนวน ${amount}` : ""} เลขอ้างอิง ${target.reference}${action}`;
  }
}

async function dispatchLine(target: NotificationTarget): Promise<ChannelResult> {
  if (!target.lineUserId) {
    return { channel: "line", success: true, skipped: true, error: "Customer has not linked a LINE account." };
  }
  if (target.lineBlocked) {
    return { channel: "line", success: true, skipped: true, error: "Customer is marked as blocked by LINE." };
  }
  if (isLineMuted(target.consentPreferences)) {
    return { channel: "line", success: true, skipped: true, error: "Customer muted LINE notifications." };
  }

  const result = await pushMessageToLine(target.lineUserId, [{
    type: "text",
    text: buildLineMessage(target),
  }]);
  if (!result.success && result.error === "LINE channel access token is not configured.") {
    return { channel: "line", success: true, skipped: true, error: result.error };
  }
  if (!result.success && result.status === 400) {
    await db.update(users)
      .set({ isLineBlocked: true, updatedAt: new Date() })
      .where(eq(users.lineUserId, target.lineUserId));
  }

  return {
    channel: "line",
    success: result.success,
    error: result.success ? undefined : result.error || "LINE notification failed.",
  };
}

async function dispatchDiscord(target: NotificationTarget): Promise<ChannelResult> {
  const webhookUrl = await getDiscordWebhookUrl();
  if (!webhookUrl) {
    return {
      channel: "discord",
      success: true,
      skipped: true,
      error: "Discord webhook is not configured.",
    };
  }

  const success = await sendDiscordSalesLifecycleNotification({
    eventLabel: SALES_NOTIFICATION_EVENT_META[target.event].label,
    customerName: target.customerName,
    reference: target.reference,
    description: SALES_NOTIFICATION_EVENT_META[target.event].description,
    amount: target.amount,
    status: target.status,
    requestType: target.requestType,
    actionUrl: target.actionUrl,
  });

  return {
    channel: "discord",
    success,
    error: success ? undefined : "Discord notification was not delivered.",
  };
}

async function dispatchChannels(target: NotificationTarget) {
  const config = await getSalesNotificationConfig();
  const rule = config.rules[target.event];
  if (!config.enabled || !rule) return;

  const tasks: Array<Promise<ChannelResult>> = [];
  if (config.lineEnabled && rule.line) tasks.push(dispatchLine(target));
  if (config.discordEnabled && rule.discord) tasks.push(dispatchDiscord(target));

  const results = await Promise.allSettled(tasks);
  const failures = results.filter(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (failures.length > 0) {
    console.warn("[Sales Notifications] A channel dispatch failed.", {
      event: target.event,
      failures: failures.map((failure) => failure.reason instanceof Error ? failure.reason.message : "Unknown error"),
    });
  }

  const failedChannels = results.flatMap((result) => {
    if (result.status === "rejected") return [result.reason instanceof Error ? result.reason.message : "Unknown error"];
    return result.value.success ? [] : [result.value.error || `${result.value.channel} notification failed.`];
  });
  if (failedChannels.length > 0) {
    throw new Error(failedChannels.join("; "));
  }
}

export async function deliverSalesNotificationEvent(event: OutboxEvent) {
  const notificationEvent = getSalesNotificationEventForTopic(event.topic);
  if (!notificationEvent) return;

  const target = await loadNotificationTarget(event, notificationEvent);
  if (!target) {
    console.warn("[Sales Notifications] Notification target was not found.", {
      topic: event.topic,
      aggregateId: event.aggregateId,
    });
    return;
  }

  await dispatchChannels(target);
}

export async function sendSalesNotificationTest(input: {
  channel: "line" | "discord";
  lineUserId?: string;
}) {
  const target: NotificationTarget = {
    event: "QUOTATION_READY",
    customerName: "SolarDream test customer",
    email: null,
    lineUserId: input.lineUserId?.trim() || null,
    lineBlocked: false,
    consentPreferences: null,
    preferredLanguage: "en",
    reference: "TEST-NOTIFICATION",
    amount: 149000,
    status: "TEST",
    requestType: "Installation",
    actionUrl: `${getConfiguredPublicSiteUrl()}/th/portal/test-notification`,
  };

  if (input.channel === "line") return dispatchLine(target);

  const success = await sendDiscordSalesLifecycleNotification({
    eventLabel: "Quotation ready",
    customerName: target.customerName,
    reference: target.reference,
    description: "This is a test notification from the SolarDream admin console.",
    amount: target.amount,
    status: target.status,
    requestType: target.requestType,
    actionUrl: target.actionUrl,
  });
  return {
    channel: "discord" as const,
    success,
    error: success ? undefined : "Discord notification was not delivered.",
  } satisfies ChannelResult;
}
