import { NextRequest, NextResponse } from "next/server";
import { createHash, createHmac } from "crypto";
import { getSystemSetting } from "@/app/actions/systemSettings";
import { db } from "@/db";
import { and, desc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { chatMessages, chatThreads, lineCustomerTags, lineWebhookEvents, users, proposals } from "@/db/schema";
import { applyResolvedRichMenuToUser } from "@/lib/richMenuScheduler";
import { isRequestContentLengthExceeded } from "@/lib/requestSize";
import { timingSafeStringEqual } from "@/lib/secretAuth";
import { listCatalogProducts } from "@/lib/erpnextCatalog";
import { getLineIntegrationConfig, isLineLiveMutationEnabled } from "@/lib/lineApi";
import {
  LINE_MAX_QUICK_REPLY_ITEMS,
  resolveLineTriggerConfig,
  resolveQuickButtonValue,
  sortLineQuickButtons,
  type LineQuickButton,
  type LineTriggerConfig,
} from "@/lib/lineAutomationConfig";
import { getLineAutomationConfig } from "@/lib/lineAutomationServer";
import { buildPublishedLineAutomationContext, executePublishedLineAutomation, loadPublishedLineAutomationRules } from "@/lib/lineAutomationRuntime";

type JsonRecord = Record<string, unknown>;
type LineMessage = JsonRecord;
type LineReplyResult = JsonRecord;
type LineUserSummary = {
  id?: string;
  fullName?: string | null;
  name?: string | null;
  email?: string | null;
};
type ProposalSummary = {
  id?: string;
  erpnextQuotationId?: string | null;
  status?: string | null;
  dispatchStatus?: string | null;
  projectStatus?: string | null;
  currentMilestoneStep?: number | string | null;
  systemSizeKwp?: number | null;
  totalPrice?: number | null;
};
type ProductSummary = {
  id?: string | null;
  brand?: string | null;
  model?: string | null;
  imageUrl?: string | null;
  description?: string | null;
  price?: number | string | null;
  stock?: number | null;
};
type LineWebhookCommand = "account-link" | "order" | "installation" | "points" | "stock" | "promo";

const LINE_WEBHOOK_OUTBOUND_TIMEOUT_MS = 8_000;
const MAX_LINE_WEBHOOK_ERROR_BODY_CHARS = 2_000;
const MAX_LINE_WEBHOOK_BODY_BYTES = 1024 * 1024;
const WEBHOOK_PROCESSING_STALE_MS = 5 * 60 * 1000;
const MAX_WEBHOOK_ATTEMPTS = 5;

function getWebhookEventId(event: JsonRecord, eventIndex: number, rawBody: string) {
  const providerId = asString(event.webhookEventId).trim();
  if (providerId) return providerId;
  return `derived-${createHash("sha256").update(`${rawBody}:${eventIndex}`).digest("hex")}`;
}

function getConversationKey(event: JsonRecord, fallback: string) {
  const source = asRecord(event.source);
  return asString(source.userId) || asString(source.groupId) || asString(source.roomId) || fallback;
}

function getProviderTimestamp(event: JsonRecord) {
  const value = event.timestamp;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? String(Math.trunc(value)) : null;
}

function redactWebhookEvidence(event: JsonRecord): JsonRecord {
  const evidence = { ...event };
  delete evidence.replyToken;
  return evidence;
}

function isMissingWebhookSchemaError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("line_webhook_events") || message.includes("DATABASE_URL is not set");
}

function isMissingChatConsoleSchemaError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return [
    "conversation_key",
    "automation_enabled",
    "human_takeover_at",
    "human_takeover_by",
    "last_reply_source",
    "external_message_id",
    "content_type",
    "line_customer_tags",
  ].some((column) => message.includes(column));
}

async function claimWebhookEvent(eventId: string, event: JsonRecord, eventIndex: number, requestId: string | null) {
  try {
    const existing = await db.query.lineWebhookEvents.findFirst({ where: eq(lineWebhookEvents.eventId, eventId) });
    if (existing?.status === "PROCESSED" || existing?.status === "DEAD_LETTER" || existing?.replyAttemptedAt) return false;
    if (existing?.status === "PROCESSING") {
      const isFresh = existing.updatedAt && Date.now() - existing.updatedAt.getTime() < WEBHOOK_PROCESSING_STALE_MS;
      if (isFresh) return false;
    }
    if (!existing) {
      const [inserted] = await db.insert(lineWebhookEvents).values({
        eventId,
        webhookRequestId: requestId,
        eventIndex,
        providerTimestamp: getProviderTimestamp(event),
        attemptCount: 1,
        signatureVerified: true,
        status: "PROCESSING",
        conversationKey: getConversationKey(event, eventId),
        payload: redactWebhookEvidence(event),
      }).onConflictDoNothing().returning({ eventId: lineWebhookEvents.eventId });
      if (inserted) return true;
    }
    const [claimed] = await db.update(lineWebhookEvents).set({ status: "PROCESSING", signatureVerified: true, webhookRequestId: requestId, eventIndex, providerTimestamp: getProviderTimestamp(event), attemptCount: sql`${lineWebhookEvents.attemptCount} + 1`, conversationKey: getConversationKey(event, eventId), payload: redactWebhookEvidence(event), errorMessage: null, processedAt: null, updatedAt: new Date() }).where(and(eq(lineWebhookEvents.eventId, eventId), inArray(lineWebhookEvents.status, ["RECEIVED", "RETRY"]))).returning({ eventId: lineWebhookEvents.eventId });
    if (claimed) return true;
    const [reclaimed] = await db.update(lineWebhookEvents).set({ status: "PROCESSING", signatureVerified: true, webhookRequestId: requestId, eventIndex, providerTimestamp: getProviderTimestamp(event), attemptCount: sql`${lineWebhookEvents.attemptCount} + 1`, conversationKey: getConversationKey(event, eventId), payload: redactWebhookEvidence(event), errorMessage: null, processedAt: null, updatedAt: new Date() }).where(and(eq(lineWebhookEvents.eventId, eventId), eq(lineWebhookEvents.status, "PROCESSING"), lte(lineWebhookEvents.updatedAt, new Date(Date.now() - WEBHOOK_PROCESSING_STALE_MS)))).returning({ eventId: lineWebhookEvents.eventId });
    return Boolean(reclaimed);
  } catch (error: unknown) {
    if (isMissingWebhookSchemaError(error)) {
      console.warn("[LINE Webhook] Durable event storage is unavailable; process the Admin Console migration before relying on idempotency.");
      return true;
    }
    throw error;
  }
}

async function markWebhookEvent(eventId: string, status: "PROCESSED" | "RETRY" | "DEAD_LETTER", errorMessage?: string) {
  try {
    if (status === "RETRY") {
      const existing = await db.query.lineWebhookEvents.findFirst({ where: eq(lineWebhookEvents.eventId, eventId) });
      status = existing && (existing.attemptCount >= MAX_WEBHOOK_ATTEMPTS || existing.replyAttemptedAt) ? "DEAD_LETTER" : "RETRY";
    }
    await db.update(lineWebhookEvents).set({ status, errorMessage: errorMessage?.slice(0, 1000) || null, processedAt: status === "PROCESSED" ? new Date() : null, updatedAt: new Date() }).where(eq(lineWebhookEvents.eventId, eventId));
  } catch (error: unknown) {
    if (!isMissingWebhookSchemaError(error)) throw error;
  }
}

async function claimReplyAttempt(eventId: string, replyToken: string) {
  if (!replyToken) return false;
  try {
    const [claimed] = await db.update(lineWebhookEvents).set({ replyTokenHash: createHash("sha256").update(replyToken).digest("hex"), replyAttemptedAt: new Date(), replyStatus: "ATTEMPTED", updatedAt: new Date() }).where(and(eq(lineWebhookEvents.eventId, eventId), isNull(lineWebhookEvents.replyAttemptedAt))).returning({ eventId: lineWebhookEvents.eventId });
    return Boolean(claimed);
  } catch (error: unknown) {
    if (isMissingWebhookSchemaError(error)) return true;
    throw error;
  }
}

async function markReplyAttempt(eventId: string, status: "SENT" | "FAILED") {
  try {
    await db.update(lineWebhookEvents).set({ replyStatus: status, updatedAt: new Date() }).where(eq(lineWebhookEvents.eventId, eventId));
  } catch (error: unknown) {
    if (!isMissingWebhookSchemaError(error)) throw error;
  }
}

async function persistInboundLineMessage({ event, eventId, lineUserId, dbUser, messageText, message }: { event: JsonRecord; eventId: string; lineUserId: string; dbUser: { id: string }; messageText: string; message: JsonRecord }) {
  if (!lineUserId || !dbUser.id || !messageText) return { humanTakeover: false, threadId: null as string | null, inserted: false, conversationStatus: "UNASSIGNED" as const, tags: [] as string[] };
  const conversationKey = getConversationKey(event, `line-user:${lineUserId}`);
  const result = await db.transaction(async (tx) => {
    let thread = await tx.query.chatThreads.findFirst({ where: and(eq(chatThreads.customerId, dbUser.id), eq(chatThreads.conversationKey, conversationKey)) });
    if (!thread) {
      const [created] = await tx.insert(chatThreads).values({ customerId: dbUser.id, conversationKey, topic: "LINE conversation", status: "UNASSIGNED", isArchived: false }).onConflictDoNothing().returning();
      thread = created ?? await tx.query.chatThreads.findFirst({ where: and(eq(chatThreads.customerId, dbUser.id), eq(chatThreads.conversationKey, conversationKey)) });
    }
    if (!thread) throw new Error("LINE conversation thread could not be created.");
    const [inserted] = await tx.insert(chatMessages).values({ threadId: thread.id, senderId: dbUser.id, message: messageText, referenceType: "NONE", referenceId: null, isRead: false, isInternalNote: false, source: "LINE", contentType: asString(message.type, "TEXT").toUpperCase(), payload: message, externalMessageId: eventId }).onConflictDoNothing({ target: chatMessages.externalMessageId }).returning({ id: chatMessages.id });
    await tx.update(chatThreads).set({ updatedAt: new Date(), lastReplySource: "LINE" }).where(eq(chatThreads.id, thread.id));
    const tagRows = await tx.query.lineCustomerTags.findMany({ where: eq(lineCustomerTags.customerId, dbUser.id), columns: { tag: true }, limit: 100 });
    return { humanTakeover: !thread.automationEnabled, threadId: thread.id, inserted: Boolean(inserted), conversationStatus: thread.status, tags: tagRows.map((row) => row.tag) };
  });
  return result;
}

async function canSendAutomationReply(threadId: string | null) {
  if (!threadId) return true;
  try {
    const thread = await db.query.chatThreads.findFirst({
      where: eq(chatThreads.id, threadId),
      columns: { automationEnabled: true },
    });
    return thread?.automationEnabled !== false;
  } catch (error: unknown) {
    console.warn("[LINE Webhook] Could not re-check automation ownership before reply; suppressing automated response.", error instanceof Error ? error.message : "Unknown error");
    return false;
  }
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function cleanSettingValue(value: string | null, fallback = ""): string {
  const cleaned = (value || "").trim().replace(/^['"]|['"]$/g, "").trim();
  return cleaned || fallback;
}

function getWebhookCommand(trigger: LineTriggerConfig | null): LineWebhookCommand | null {
  if (!trigger || trigger.kind === "custom") return null;
  if (trigger.kind === "link") return "account-link";
  return trigger.kind;
}

function asDisplayString(value: string | number | null | undefined, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  const normalized = String(value).trim();
  return normalized || fallback;
}

function asDisplayNumber(value: number | string | null | undefined, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

async function readLineWebhookErrorText(response: Response) {
  const text = await response.text().catch(() => "");
  return text.slice(0, MAX_LINE_WEBHOOK_ERROR_BODY_CHARS);
}

// Send reply message to LINE API
async function sendLineReply(replyToken: string, messages: LineMessage[], accessToken: string): Promise<LineReplyResult> {
  const url = "https://api.line.me/v2/bot/message/reply";
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      replyToken,
      messages,
    }),
    signal: AbortSignal.timeout(LINE_WEBHOOK_OUTBOUND_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorText = await readLineWebhookErrorText(response);
    console.error("LINE reply API error:", errorText);
    throw new Error(`LINE API replied with status ${response.status}`);
  }

  return await response.json().catch(() => ({})) as LineReplyResult;
}

async function sendLineReplyOnce(eventId: string, replyToken: string, messages: LineMessage[], accessToken: string) {
  if (!(await claimReplyAttempt(eventId, replyToken))) return;
  try {
    await sendLineReply(replyToken, messages, accessToken);
    await markReplyAttempt(eventId, "SENT");
  } catch (error: unknown) {
    await markReplyAttempt(eventId, "FAILED");
    throw error;
  }
}

// Fetch Account Link Token from LINE API
async function getLineLinkToken(lineUserId: string, accessToken: string): Promise<string> {
  const url = `https://api.line.me/v2/bot/user/${lineUserId}/linkToken`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    signal: AbortSignal.timeout(LINE_WEBHOOK_OUTBOUND_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorText = await readLineWebhookErrorText(response);
    console.error("LINE linkToken API error:", errorText);
    throw new Error(`LINE API linkToken failed: ${response.statusText}`);
  }

  const data = asRecord(await response.json().catch(() => ({})));
  return typeof data.linkToken === "string" ? data.linkToken : "";
}

// Map database proposal status to Thai translation
function mapStatusToThai(status: string | null | undefined): string {
  const mapped: Record<string, string> = {
    DRAFT: "แบบร่างใบเสนอราคา",
    PENDING_DISPATCH: "รอทีมงานเตรียมเอกสาร",
    AWAITING_STAFF_SIGNATURE: "รอเจ้าหน้าที่ลงนามอนุมัติ",
    AWAITING_CLIENT_SIGNATURE: "รอลูกค้าพิจารณาและลงนาม",
    CLIENT_SIGNED_PENDING_REVIEW: "ลูกค้าลงนามแล้ว รอทีมงานตรวจรับ",
    FULLY_SIGNED: "ลงนามครบถ้วนแล้ว",
    DISPATCHED: "ส่งเอกสารให้ลูกค้าแล้ว",
    PENDING: "รอตรวจสอบความถูกต้อง",
    ACTIVE: "อยู่ระหว่างดำเนินโครงการ",
    SIGNED: "ลงนามสัญญาเรียบร้อยแล้ว",
    PAID: "ชำระเงินเรียบร้อยแล้ว",
    COMPLETED: "ส่งมอบงานเรียบร้อยแล้ว",
    OVERDUE: "มียอดชำระค้างส่ง",
    CANCELLED: "ยกเลิกโครงการ",
  };
  return status ? (mapped[status.toUpperCase()] || "อยู่ระหว่างเตรียมโครงการ") : "อยู่ระหว่างเตรียมโครงการ";
}

function getLocalizedSiteUrl(siteUrl: string, path: string) {
  const cleanSiteUrl = siteUrl.replace(/\/$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${cleanSiteUrl}/th${cleanPath}`;
}

function formatKwp(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(2)} kWp` : "รอข้อมูล";
}

function formatThb(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value)
    ? `฿${Math.round(value).toLocaleString("th-TH")}`
    : "รอสรุปราคา";
}

function getLineDisplayName(user: LineUserSummary | null | undefined) {
  return user ? (user.fullName || user.name || user.email || "สมาชิก SolarDream") : "สมาชิก SolarDream";
}

function getProposalDisplayId(proposal: ProposalSummary | null | undefined) {
  if (!proposal) return "ยังไม่มีใบเสนอราคา";
  return proposal.erpnextQuotationId || `QT-${String(proposal.id).slice(0, 8).toUpperCase()}`;
}

function mapInstallationStatusToThai(proposal: ProposalSummary | null | undefined) {
  const status = String(proposal?.projectStatus || proposal?.status || "").toUpperCase();
  const mapped: Record<string, string> = {
    WAITING_SURVEY: "รอนัดสำรวจหน้างาน",
    SURVEY_SCHEDULED: "นัดสำรวจหน้างานแล้ว",
    DESIGN_REVIEW: "วิศวกรกำลังตรวจแบบ",
    INSTALLATION_READY: "เตรียมทีมติดตั้ง",
    INSTALLING: "กำลังติดตั้ง",
    IN_PROGRESS: "กำลังดำเนินงาน",
    INSPECTION: "รอตรวจรับระบบ",
    HANDOVER_READY: "พร้อมส่งมอบ",
    HANDOVER_COMPLETED: "ส่งมอบงานเรียบร้อยแล้ว",
    COMPLETED: "ส่งมอบงานเรียบร้อยแล้ว",
  };

  return mapped[status] || "รอทีมงานอัปเดตสถานะติดตั้ง";
}

// Helper to resolve LINE Flex JSON templates with dynamic replacement placeholders
async function resolveFlexTemplate(
  settingKey: string,
  replacements: Record<string, string>,
  arrayReplacements: Record<string, unknown[]>,
  fallbackGenerator: () => unknown,
  templateOverride?: string,
): Promise<unknown> {
  const template = templateOverride?.trim() || await getSystemSetting(settingKey);
  if (!template) return fallbackGenerator();

  try {
    let resolvedStr = template;
    for (const [key, val] of Object.entries(replacements)) {
      resolvedStr = resolvedStr.replaceAll(`{{${key}}}`, val);
    }
    for (const [key, arr] of Object.entries(arrayReplacements)) {
      const arrJson = JSON.stringify(arr);
      if (resolvedStr.includes(`"${key}"`)) {
        resolvedStr = resolvedStr.replace(`"${key}"`, arrJson.slice(1, -1));
      } else {
        resolvedStr = resolvedStr.replace(key, arrJson);
      }
    }
    return JSON.parse(resolvedStr);
  } catch (err) {
    console.error(`Failed to parse custom flex template for ${settingKey}:`, err);
    return fallbackGenerator();
  }
}

// Generate Flex Message for Account Linking initiation (ผูกบัญชี)
async function getAccountLinkFlexMessage(
  linkToken: string,
  customLoginUrl: string | null,
  siteUrl: string,
  templateOverride?: string,
  altText = "เชื่อมต่อบัญชี SolarDream ของคุณเข้ากับ LINE",
) {
  const loginBaseUrl = customLoginUrl || `${siteUrl}/login`;
  const separator = loginBaseUrl.includes("?") ? "&" : "?";
  const loginUrl = `${loginBaseUrl}${separator}linkToken=${linkToken}`;

  const contents = await resolveFlexTemplate(
    "line_flex_json_link",
    { loginUrl },
    {},
    () => getAccountLinkFlexMessageDefault(loginUrl).contents,
    templateOverride,
  );

  return {
    type: "flex",
    altText,
    contents
  };
}

function getAccountLinkFlexMessageDefault(loginUrl: string) {
  return {
    type: "flex",
    altText: "เชื่อมต่อบัญชี SolarDream ของคุณเข้ากับ LINE",
    contents: {
      type: "bubble",
      hero: {
        type: "image",
        url: "https://images.unsplash.com/photo-1509391366360-2e959784a276?auto=format&fit=crop&q=80&w=600",
        size: "full",
        aspectRatio: "20:13",
        aspectMode: "cover",
      },
      body: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#0F172A",
        contents: [
          {
            type: "text",
            text: "SolarDream Account Linking",
            color: "#B7D1EA",
            weight: "bold",
            size: "sm",
          },
          {
            type: "text",
            text: "เชื่อมต่อบัญชีของคุณ",
            color: "#FFFFFF",
            weight: "bold",
            size: "lg",
            margin: "sm",
          },
          {
            type: "text",
            text: "ผูกบัญชีสมาชิก SolarDream เข้ากับ LINE เพื่อตรวจเช็คสถานะใบเสนอราคา งานติดตั้ง และการอัปเดตจากทีมวิศวกรได้โดยตรงแบบเรียลไทม์",
            color: "#475569",
            size: "xs",
            margin: "md",
            wrap: true,
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#0F172A",
        contents: [
          {
            type: "button",
            action: {
              type: "uri",
              label: "เข้าสู่ระบบเพื่อผูกบัญชี",
              uri: loginUrl,
            },
            style: "primary",
            color: "#B7D1EA",
          },
        ],
      },
    },
  };
}

function getEmptyProgressFlexMessage(siteUrl: string) {
  return {
    type: "flex" as const,
    altText: "ยังไม่พบใบเสนอราคาของคุณ",
    contents: {
      type: "bubble" as const,
      body: {
        type: "box" as const,
        layout: "vertical" as const,
        backgroundColor: "#F0EEE9",
        contents: [
          {
            type: "text" as const,
            text: "SolarDream Progress",
            color: "#0369A1",
            weight: "bold" as const,
            size: "sm" as const,
          },
          {
            type: "text" as const,
            text: "ยังไม่พบใบเสนอราคาในบัญชีนี้",
            color: "#0F172A",
            weight: "bold" as const,
            size: "lg" as const,
            margin: "sm" as const,
            wrap: true,
          },
          {
            type: "text" as const,
            text: "หากคุณเพิ่งส่งคำขอจากหน้า Build หรือ Wizard กรุณาผูกบัญชีด้วยอีเมลเดียวกัน หรือเริ่มออกแบบระบบใหม่ได้ทันทีค่ะ",
            color: "#475569",
            size: "xs" as const,
            margin: "md" as const,
            wrap: true,
          },
        ],
      },
      footer: {
        type: "box" as const,
        layout: "vertical" as const,
        spacing: "sm" as const,
        contents: [
          {
            type: "button" as const,
            action: {
              type: "uri" as const,
              label: "เปิด Wizard ขอใบเสนอราคา",
              uri: getLocalizedSiteUrl(siteUrl, "/wizard"),
            },
            style: "primary" as const,
            color: "#0F172A",
          },
          {
            type: "button" as const,
            action: {
              type: "message" as const,
              label: "ผูกบัญชีสมาชิก",
              text: "ผูกบัญชีสมาชิก",
            },
            style: "secondary" as const,
          },
        ],
      },
    },
  };
}

async function applyProgressFlexTemplate(
  settingKey: string,
  templateOverride: string | undefined,
  replacements: Record<string, string>,
  arrayReplacements: Record<string, unknown[]>,
  fallback: JsonRecord,
  altText: string,
): Promise<JsonRecord> {
  if (!templateOverride?.trim()) return fallback;

  const contents = await resolveFlexTemplate(
    settingKey,
    replacements,
    arrayReplacements,
    () => fallback.contents,
    templateOverride,
  );
  return { type: "flex", altText, contents };
}

async function getQuotationProgressFlexMessage(
  user: LineUserSummary | null | undefined,
  latestProposal: ProposalSummary | null | undefined,
  siteUrl: string,
  templateOverride?: string,
  altText?: string,
) {
  if (!latestProposal) return getEmptyProgressFlexMessage(siteUrl);

  const proposalId = getProposalDisplayId(latestProposal);
  const statusSource = latestProposal.dispatchStatus || latestProposal.status;
  const statusVal = mapStatusToThai(statusSource);
  const portalUrl = getLocalizedSiteUrl(siteUrl, "/proposals");

  const fallbackMessage: JsonRecord = {
    type: "flex" as const,
    altText: `สถานะใบเสนอราคา ${proposalId}`,
    contents: {
      type: "bubble" as const,
      header: {
        type: "box" as const,
        layout: "vertical" as const,
        backgroundColor: "#0F172A",
        contents: [
          {
            type: "text" as const,
            text: "Quotation Progress",
            color: "#B7D1EA",
            weight: "bold" as const,
            size: "sm" as const,
          },
          {
            type: "text" as const,
            text: proposalId,
            color: "#FFFFFF",
            weight: "bold" as const,
            size: "xl" as const,
            margin: "sm" as const,
            wrap: true,
          },
        ],
      },
      body: {
        type: "box" as const,
        layout: "vertical" as const,
        backgroundColor: "#FFFFFF",
        spacing: "md" as const,
        contents: [
          {
            type: "box" as const,
            layout: "vertical" as const,
            backgroundColor: "#F0EEE9",
            cornerRadius: "lg" as const,
            paddingAll: "md" as const,
            contents: [
              {
                type: "text" as const,
                text: "สถานะล่าสุด",
                color: "#64748B",
                size: "xs" as const,
              },
              {
                type: "text" as const,
                text: statusVal,
                color: "#0369A1",
                weight: "bold" as const,
                size: "md" as const,
                margin: "xs" as const,
                wrap: true,
              },
            ],
          },
          {
            type: "box" as const,
            layout: "horizontal" as const,
            contents: [
              { type: "text" as const, text: "ลูกค้า", color: "#64748B", size: "sm" as const },
              { type: "text" as const, text: getLineDisplayName(user), color: "#0F172A", weight: "bold" as const, size: "sm" as const, align: "end" as const, wrap: true },
            ],
          },
          {
            type: "box" as const,
            layout: "horizontal" as const,
            contents: [
              { type: "text" as const, text: "ขนาดระบบ", color: "#64748B", size: "sm" as const },
              { type: "text" as const, text: formatKwp(latestProposal.systemSizeKwp), color: "#0F172A", weight: "bold" as const, size: "sm" as const, align: "end" as const },
            ],
          },
          {
            type: "box" as const,
            layout: "horizontal" as const,
            contents: [
              { type: "text" as const, text: "มูลค่าโดยประมาณ", color: "#64748B", size: "sm" as const },
              { type: "text" as const, text: formatThb(latestProposal.totalPrice), color: "#0F172A", weight: "bold" as const, size: "sm" as const, align: "end" as const },
            ],
          },
        ],
      },
      footer: {
        type: "box" as const,
        layout: "vertical" as const,
        contents: [
          {
            type: "button" as const,
            action: {
              type: "uri" as const,
              label: "เปิด My Proposals",
              uri: portalUrl,
            },
            style: "primary" as const,
            color: "#0F172A",
          },
        ],
      },
    },
  };
  return applyProgressFlexTemplate(
    "line_flex_json_order",
    templateOverride,
    {
      orderId: proposalId,
      status: statusVal,
      trackingNumber: "",
      trackingUrl: portalUrl,
      userName: getLineDisplayName(user),
      systemSizeKwp: formatKwp(latestProposal.systemSizeKwp),
    },
    { order_items_placeholder: [] },
    fallbackMessage,
    altText || `สถานะใบเสนอราคา ${proposalId}`,
  );
}

async function getInstallationProgressFlexMessage(
  user: LineUserSummary | null | undefined,
  latestProposal: ProposalSummary | null | undefined,
  siteUrl: string,
  templateOverride?: string,
  altText = "สถานะงานติดตั้ง SolarDream",
) {
  if (!latestProposal) return getEmptyProgressFlexMessage(siteUrl);

  const step = Math.max(1, Math.min(5, Number(latestProposal.currentMilestoneStep || 1)));
  const statusVal = mapInstallationStatusToThai(latestProposal);

  const milestoneRows = [
    "สำรวจหน้างาน",
    "สรุปแบบและอุปกรณ์",
    "ติดตั้งระบบ",
    "ตรวจรับความปลอดภัย",
    "ส่งมอบโครงการ",
  ].map((label, index) => ({
    type: "box" as const,
    layout: "horizontal" as const,
    margin: index === 0 ? "none" as const : "sm" as const,
    contents: [
      {
        type: "text" as const,
        text: index + 1 <= step ? "●" : "○",
        color: index + 1 <= step ? "#0369A1" : "#CBD5E1",
        size: "sm" as const,
        flex: 0,
      },
      {
        type: "text" as const,
        text: label,
        color: index + 1 <= step ? "#0F172A" : "#94A3B8",
        weight: index + 1 === step ? "bold" as const : "regular" as const,
        size: "xs" as const,
        margin: "sm" as const,
      },
    ],
  }));

  const fallbackMessage: JsonRecord = {
    type: "flex" as const,
    altText,
    contents: {
      type: "bubble" as const,
      header: {
        type: "box" as const,
        layout: "vertical" as const,
        backgroundColor: "#0F172A",
        contents: [
          {
            type: "text" as const,
            text: "Installation Tracker",
            color: "#B7D1EA",
            weight: "bold" as const,
            size: "sm" as const,
          },
          {
            type: "text" as const,
            text: statusVal,
            color: "#FFFFFF",
            weight: "bold" as const,
            size: "lg" as const,
            margin: "sm" as const,
            wrap: true,
          },
        ],
      },
      body: {
        type: "box" as const,
        layout: "vertical" as const,
        backgroundColor: "#FFFFFF",
        spacing: "md" as const,
        contents: [
          {
            type: "text" as const,
            text: `${getProposalDisplayId(latestProposal)} · ${formatKwp(latestProposal.systemSizeKwp)}`,
            color: "#475569",
            size: "xs" as const,
            weight: "bold" as const,
            wrap: true,
          },
          {
            type: "box" as const,
            layout: "vertical" as const,
            backgroundColor: "#F0EEE9",
            cornerRadius: "lg" as const,
            paddingAll: "md" as const,
            contents: milestoneRows,
          },
          {
            type: "text" as const,
            text: "ทีมงานจะอัปเดตสถานะงานจริงหลังยืนยันใบเสนอราคาและเริ่มแผนติดตั้งค่ะ",
            color: "#64748B",
            size: "xs" as const,
            wrap: true,
          },
        ],
      },
      footer: {
        type: "box" as const,
        layout: "vertical" as const,
        contents: [
          {
            type: "button" as const,
            action: {
              type: "uri" as const,
              label: "เปิดหน้าติดตามโครงการ",
              uri: getLocalizedSiteUrl(siteUrl, "/proposals"),
            },
            style: "primary" as const,
            color: "#0F172A",
          },
        ],
      },
    },
  };
  return applyProgressFlexTemplate(
    "line_flex_json_installation",
    templateOverride,
    {
      installationStatus: statusVal,
      orderId: getProposalDisplayId(latestProposal),
      systemSizeKwp: formatKwp(latestProposal.systemSizeKwp),
      trackingUrl: getLocalizedSiteUrl(siteUrl, "/proposals"),
      userName: getLineDisplayName(user),
    },
    {},
    fallbackMessage,
    altText,
  );
}

// Generate Flex Message for member points (ดูคะแนนสะสม)
function getPointsFlexMessageDefault(name: string, points: number, tier: string, couponRedeemUrl: string) {
  return {
    type: "flex" as const,
    altText: "คะแนนสะสมและระดับสมาชิกของคุณ",
    contents: {
      type: "bubble" as const,
      body: {
        type: "box" as const,
        layout: "vertical" as const,
        backgroundColor: "#0F172A",
        contents: [
          {
            type: "box" as const,
            layout: "horizontal" as const,
            contents: [
              {
                type: "text" as const,
                text: "SolarDream Member",
                color: "#B7D1EA",
                weight: "bold" as const,
                size: "sm" as const,
              },
              {
                type: "text" as const,
                text: tier,
                color: "#D8A87B",
                weight: "bold" as const,
                size: "xs" as const,
                align: "end" as const,
              },
            ],
          },
          {
            type: "text" as const,
            text: name,
            color: "#FFFFFF",
            weight: "bold" as const,
            size: "lg" as const,
            margin: "xxl" as const,
          },
          {
            type: "box" as const,
            layout: "horizontal" as const,
            margin: "md" as const,
            contents: [
              {
                type: "text" as const,
                text: "คะแนนสะสมคงเหลือ",
                color: "#B7D1EA",
                size: "sm" as const,
              },
              {
                type: "text" as const,
                text: `${points.toLocaleString()} PTS`,
                color: "#FFFFFF",
                weight: "bold" as const,
                size: "lg" as const,
                align: "end" as const,
              },
            ],
          },
          {
            type: "separator" as const,
            margin: "lg" as const,
            color: "#475569",
          },
          {
            type: "box" as const,
            layout: "vertical" as const,
            margin: "lg" as const,
            contents: [
              {
                type: "text" as const,
                text: "คะแนนของคุณมีอายุถึงวันที่ 31 ธ.ค. 2026",
                color: "#475569",
                size: "xs" as const,
              },
            ],
          },
        ],
      },
      footer: {
        type: "box" as const,
        layout: "vertical" as const,
        backgroundColor: "#0F172A",
        contents: [
          {
            type: "button" as const,
            action: {
              type: "uri" as const,
              label: "แลกคูปองพิเศษ",
              uri: couponRedeemUrl,
            },
            style: "primary" as const,
            color: "#B7D1EA",
          },
        ],
      },
    },
  };
}

async function getPointsFlexMessage(
  user: LineUserSummary | null | undefined,
  points: number,
  tier: string,
  siteUrl: string,
  templateOverride?: string,
  altText = "คะแนนสะสมและระดับสมาชิกของคุณ",
) {
  const name = asDisplayString(user?.fullName || user?.name || user?.email, "คุณ สมชาย ใจดี");
  const couponRedeemUrl = `${siteUrl}/profile/coupons`;

  const contents = await resolveFlexTemplate(
    "line_flex_json_points",
    {
      userName: name,
      userPoints: points.toLocaleString(),
      userTier: tier,
      couponRedeemUrl
    },
    {},
    () => getPointsFlexMessageDefault(name, points, tier, couponRedeemUrl).contents,
    templateOverride,
  );

  return {
    type: "flex" as const,
    altText,
    contents
  };
}

// Generate Flex Message for stock check (เช็คสต็อก)
function getStockFlexMessageDefault(contents: unknown[]) {
  return {
    type: "flex" as const,
    altText: "เช็คสต็อกสินค้าคงเหลือ (ERP)",
    contents: {
      type: "bubble" as const,
      header: {
        type: "box" as const,
        layout: "vertical" as const,
        backgroundColor: "#0F172A",
        contents: [
          {
            type: "text" as const,
            text: "📦 สต็อกคลังสินค้า ERP",
            color: "#B7D1EA",
            weight: "bold" as const,
            size: "sm" as const
          },
          {
            type: "text" as const,
            text: "รายการสต็อกสินค้าเรียลไทม์",
            color: "#FFFFFF",
            weight: "bold" as const,
            size: "md" as const,
            margin: "sm" as const
          }
        ]
      },
      body: {
        type: "box" as const,
        layout: "vertical" as const,
        backgroundColor: "#0F172A",
        contents: [
          {
            type: "text" as const,
            text: "สถานะรายการสินค้าแนะนำประจำวันนี้:",
            size: "xs" as const,
            color: "#475569",
            margin: "none" as const
          },
          {
            type: "separator" as const,
            margin: "md" as const,
            color: "#475569"
          },
          ...contents
        ]
      },
      footer: {
        type: "box" as const,
        layout: "vertical" as const,
        backgroundColor: "#0F172A",
        contents: [
          {
            type: "button" as const,
            action: {
              type: "message" as const,
              label: "สอบถามสินค้าเพิ่ม",
              text: "ติดต่อแอดมิน"
            },
            style: "primary" as const,
            color: "#B7D1EA"
          }
        ]
      }
    }
  };
}

async function getStockFlexMessage(
  productsList: ProductSummary[],
  templateOverride?: string,
  altText = "เช็คสต็อกสินค้าคงเหลือ (ERP)",
) {
  const displayProducts = productsList.slice(0, 3);

  const productRows = displayProducts.map((p) => {
    const stock = asDisplayNumber(p.stock);
    const isLow = stock <= 3;
    const isOut = stock === 0;
    const stockColor = isOut ? "#EF4444" : isLow ? "#F59E0B" : "#10B981";
    const stockStatus = isOut ? "สินค้าหมด" : isLow ? `คงเหลือต่ำ (${stock})` : `มีสินค้า (${stock})`;
    return {
      type: "box" as const,
      layout: "horizontal" as const,
      margin: "md" as const,
      contents: [
        {
          type: "box" as const,
          layout: "vertical" as const,
          flex: 3,
          contents: [
            {
              type: "text" as const,
              text: `${asDisplayString(p.brand, "SolarDream")} ${asDisplayString(p.model, "Product")}`,
              size: "xs" as const,
              color: "#FFFFFF",
              weight: "bold" as const,
              wrap: true
            }
          ]
        },
        {
          type: "box" as const,
          layout: "vertical" as const,
          flex: 2,
          contents: [
            {
              type: "text" as const,
              text: stockStatus,
              size: "xs" as const,
              color: stockColor,
              weight: "bold" as const,
              align: "end" as const
            }
          ]
        }
      ]
    };
  });

  const contents = await resolveFlexTemplate(
    "line_flex_json_stock",
    {},
    {
      products_placeholder: productRows
    },
    () => getStockFlexMessageDefault(productRows).contents,
    templateOverride,
  );

  return {
    type: "flex" as const,
    altText,
    contents
  };
}

// Generate Carousel Flex Message for promotions (ดูโปรโมชั่น)
function getPromotionsCarouselMessageDefault(displayProducts: ProductSummary[], siteUrl: string) {
  const bubbles = displayProducts.map((p) => {
    const detailUrl = `${siteUrl}/catalog/${asDisplayString(p.id, "product")}`;
    const brand = asDisplayString(p.brand, "SolarDream");
    const model = asDisplayString(p.model, "Clean energy solution");
    const price = asDisplayNumber(p.price);
    return {
      type: "bubble" as const,
      size: "micro" as const,
      hero: {
        type: "image" as const,
        url: p.imageUrl || "https://images.unsplash.com/photo-1509391366360-2e959784a276?auto=format&fit=crop&q=80&w=400",
        size: "full" as const,
        aspectRatio: "20:13" as const,
        aspectMode: "cover" as const
      },
      body: {
        type: "box" as const,
        layout: "vertical" as const,
        backgroundColor: "#0F172A",
        contents: [
          {
            type: "text" as const,
            text: brand,
            weight: "bold" as const,
            size: "xxs" as const,
            color: "#B7D1EA"
          },
          {
            type: "text" as const,
            text: model,
            weight: "bold" as const,
            size: "xs" as const,
            color: "#FFFFFF",
            margin: "xs" as const,
            wrap: true
          },
          {
            type: "text" as const,
            text: `${price.toLocaleString()} THB`,
            weight: "bold" as const,
            size: "xs" as const,
            color: "#D8A87B",
            margin: "xs" as const
          }
        ]
      },
      footer: {
        type: "box" as const,
        layout: "vertical" as const,
        backgroundColor: "#0F172A",
        contents: [
          {
            type: "button" as const,
            action: {
              type: "uri" as const,
              label: "ดูรายละเอียด",
              uri: detailUrl
            },
            style: "primary" as const,
            color: "#B7D1EA",
            height: "sm" as const
          }
        ]
      }
    };
  });

  return {
    type: "flex" as const,
    altText: "โปรโมชั่นและสินค้าขายดีประจำเดือนนี้ 🔥",
    contents: {
      type: "carousel" as const,
      contents: bubbles
    }
  };
}

async function getPromotionsCarouselMessage(
  productsList: ProductSummary[],
  siteUrl: string,
  templateOverride?: string,
  altText = "โปรโมชั่นและสินค้าขายดีประจำเดือนนี้ 🔥",
) {
  const displayProducts = productsList.slice(0, 5);
  if (displayProducts.length === 0) {
    return {
      type: "text" as const,
      text: "ขณะนี้ยังไม่พบสินค้าที่เปิดขายใน ERPNext",
    };
  }

  const template = templateOverride?.trim() || await getSystemSetting("line_flex_json_promo");
  if (!template) {
    return getPromotionsCarouselMessageDefault(displayProducts, siteUrl);
  }

  try {
    const bubbles = displayProducts.map((p) => {
      const detailUrl = `${siteUrl}/catalog/${asDisplayString(p.id, "product")}`;
      const singleBubble = template
        .replaceAll("{{brand}}", asDisplayString(p.brand, "SolarDream"))
        .replaceAll("{{model}}", asDisplayString(p.model, "Clean energy solution"))
        .replaceAll("{{price}}", asDisplayNumber(p.price).toLocaleString())
        .replaceAll("{{imageUrl}}", p.imageUrl || "https://images.unsplash.com/photo-1509391366360-2e959784a276?auto=format&fit=crop&q=80&w=400")
        .replaceAll("{{detailUrl}}", detailUrl);
      return JSON.parse(singleBubble);
    });

    return {
      type: "flex" as const,
      altText,
      contents: {
        type: "carousel" as const,
        contents: bubbles
      }
    };
  } catch (err) {
    console.error("Failed to parse custom promotions carousel bubble template:", err);
    return getPromotionsCarouselMessageDefault(displayProducts, siteUrl);
  }
}

function getCustomTriggerMessage(trigger: LineTriggerConfig, siteUrl: string): LineMessage {
  try {
    const resolved = trigger.flexJson.replaceAll("{{siteUrl}}", siteUrl.replace(/\/$/, ""));
    const parsed: unknown = JSON.parse(resolved);
    const parsedRecord = asRecord(parsed);
    if (parsedRecord.type === "flex" && parsedRecord.contents) {
      return {
        ...parsedRecord,
        altText: asString(parsedRecord.altText, trigger.altText || trigger.name),
      };
    }
    return {
      type: "flex",
      altText: trigger.altText || trigger.name,
      contents: parsed,
    };
  } catch (error) {
    console.error(`[LINE Webhook] Failed to parse custom Flex trigger ${trigger.id}:`, error);
    return {
      type: "text",
      text: "ขออภัยค่ะ ไม่สามารถสร้างข้อความตอบกลับจาก Trigger นี้ได้ในขณะนี้",
    };
  }
}

function getConfiguredQuickReply(quickButtons: LineQuickButton[], siteUrl: string): JsonRecord | null {
  const items = sortLineQuickButtons(quickButtons)
    .filter((button) => button.enabled)
    .slice(0, LINE_MAX_QUICK_REPLY_ITEMS)
    .map((button) => {
      const value = resolveQuickButtonValue(button.value, siteUrl);
      return {
        type: "action" as const,
        action: button.action === "uri"
          ? { type: "uri" as const, label: button.label, uri: value }
          : { type: "message" as const, label: button.label, text: value },
      };
    });

  return items.length > 0 ? { items } : null;
}

function applyConfiguredQuickReply(
  message: LineMessage,
  quickButtons: LineQuickButton[],
  siteUrl: string,
): LineMessage {
  const quickReply = getConfiguredQuickReply(quickButtons, siteUrl);
  const messageWithoutQuickReply = { ...message };
  delete messageWithoutQuickReply.quickReply;

  return quickReply
    ? { ...messageWithoutQuickReply, quickReply }
    : messageWithoutQuickReply;
}

// Generate the configured Quick Reply Message
function getDefaultQuickReplyMessage(siteUrl: string, quickButtons: LineQuickButton[]) {
  const quickReply = getConfiguredQuickReply(quickButtons, siteUrl);

  const response: JsonRecord = {
    type: "text" as const,
    text: "ยินดีต้อนรับสู่ SolarDream ค่ะ เลือกเมนูด่วนเพื่อออกแบบระบบ ขอใบเสนอราคา หรือติดตามความคืบหน้าโครงการได้เลย",
    ...(quickReply ? { quickReply } : {}),
  };
  return response;
}

export async function POST(request: NextRequest) {
  const { channelSecret, accessToken: channelAccessToken } = await getLineIntegrationConfig();
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://solar-dream.org").replace(/^["']|["']$/g, "");
  const signatureHeader = request.headers.get("x-line-signature") || "";
  const isSimulated = request.headers.get("x-line-simulate") === "true"
    && process.env.NODE_ENV !== "production"
    && process.env.LINE_ALLOW_SIMULATED_WEBHOOKS === "true";

  if (isRequestContentLengthExceeded(request.headers, MAX_LINE_WEBHOOK_BODY_BYTES)) {
    return NextResponse.json(
      { success: false, error: "Webhook payload is too large." },
      { status: 413 },
    );
  }

  const rawBody = await request.text();

  // Validate Line Signature
  let isSignatureValid = false;
  if (channelSecret) {
    const generatedSignature = createHmac("sha256", channelSecret)
      .update(rawBody)
      .digest("base64");
    isSignatureValid = timingSafeStringEqual(signatureHeader, generatedSignature);
    if (!isSignatureValid) {
      console.warn("[LINE Webhook Warning] Signature mismatch. Webhook rejected.");
    }
  } else if (isSimulated) {
    isSignatureValid = true;
  } else {
    console.error("[LINE Webhook Error] LINE channel secret is not configured in API Setup or the server environment. Webhook verification will fail.");
  }

  if (!isSignatureValid) {
    console.warn("LINE webhook received an invalid signature. Webhook rejected.");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  try {
    const automation = await getLineAutomationConfig();
    const triggerConfigs = automation.triggers;
    const customLoginUrl = cleanSettingValue(automation.loginUrl);
    const publishedLineRules = await loadPublishedLineAutomationRules();

    let body: JsonRecord;
    try {
      body = asRecord(JSON.parse(rawBody));
    } catch {
      return NextResponse.json({ success: false, error: "Invalid webhook JSON payload." }, { status: 400 });
    }

    const events = (Array.isArray(body.events) ? body.events : [])
      .map((event, eventIndex) => ({ event: asRecord(event), eventIndex }))
      .filter(({ event }) => Object.keys(event).length > 0)
      // LINE normally preserves order in a delivery. Sorting by provider time
      // keeps a manually replayed batch deterministic without changing the
      // original event index used for derived idempotency IDs.
      .sort((left, right) => {
        const leftTimestamp = getProviderTimestamp(left.event);
        const rightTimestamp = getProviderTimestamp(right.event);
        if (!leftTimestamp || !rightTimestamp) return left.eventIndex - right.eventIndex;
        return Number(leftTimestamp) - Number(rightTimestamp) || left.eventIndex - right.eventIndex;
      });
    const processedReplies: JsonRecord[] = [];
    const requestId = request.headers.get("x-request-id");

    for (const { event, eventIndex } of events) {
      const eventId = getWebhookEventId(event, eventIndex, rawBody);
      const shouldProcess = await claimWebhookEvent(eventId, event, eventIndex, requestId);
      if (!shouldProcess) {
        processedReplies.push({ eventId, skipped: true, reason: "idempotent-replay-or-in-flight" });
        continue;
      }
      let eventCompleted = false;
      try {
      const eventType = asString(event.type);
      const message = asRecord(event.message);
      const replyToken = asString(event.replyToken);
      const messageType = asString(message.type);
      const isPostbackEvent = eventType === "message" && messageType === "postback";
      const shouldRunNonMessageAutomation = publishedLineRules.length > 0 && (isPostbackEvent || eventType === "follow" || (eventType !== "message" && eventType !== "accountLink"));
      if (shouldRunNonMessageAutomation) {
        const source = asRecord(event.source);
        const lineUserId = asString(source.userId);
        const postback = asRecord(event.postback);
        let automationUser: typeof users.$inferSelect | null = null;
        try {
          automationUser = lineUserId ? (await db.query.users.findFirst({ where: eq(users.lineUserId, lineUserId) })) ?? null : null;
        } catch (error: unknown) {
          console.warn("[LINE Webhook] Could not load the linked account for event automation.", error instanceof Error ? error.message : "Unknown error");
        }
        let existingConversation: typeof chatThreads.$inferSelect | null = null;
        if (automationUser) {
          try {
            existingConversation = (await db.query.chatThreads.findFirst({ where: and(eq(chatThreads.customerId, automationUser.id), eq(chatThreads.conversationKey, getConversationKey(event, `line-user:${lineUserId}`))) })) ?? null;
          } catch (error: unknown) {
            if (!isMissingChatConsoleSchemaError(error)) throw error;
          }
        }
        if (existingConversation?.automationEnabled === false) {
          processedReplies.push({ eventId, handledBy: "human-takeover", threadId: existingConversation.id });
          eventCompleted = true;
          continue;
        }
        const automationEventType = isPostbackEvent ? "postback" : eventType === "follow" ? "follow" : "event";
        const publishedAutomation = await executePublishedLineAutomation({
          ...buildPublishedLineAutomationContext({
            eventType: automationEventType,
            text: isPostbackEvent ? asString(postback.displayText) : "",
            postbackData: isPostbackEvent ? asString(postback.data) : null,
            fields: { lineUserId, customerId: automationUser?.id || "", customerName: automationUser?.fullName || automationUser?.name || "" },
            eventFields: { eventName: eventType, eventId, ...(event) },
            accountLinked: Boolean(automationUser),
            conversationStatus: existingConversation?.status || "UNASSIGNED",
            humanTakeover: existingConversation ? !Boolean(existingConversation.automationEnabled) : false,
          }),
          customerId: automationUser?.id || null,
          conversationKey: getConversationKey(event, `line-user:${lineUserId || eventId}`),
          userIdentifier: lineUserId || "line-webhook-user",
        }, publishedLineRules);
        if (publishedAutomation?.handled) {
          processedReplies.push({ eventId, handledBy: "published-automation", matchedRules: publishedAutomation.matchedRules, messages: publishedAutomation.messages, warnings: publishedAutomation.warnings });
          const automationStillEnabled = await canSendAutomationReply(existingConversation?.id ?? null);
          if (automationStillEnabled && !isSimulated && isLineLiveMutationEnabled() && channelAccessToken && publishedAutomation.messages.length && replyToken) {
            await sendLineReplyOnce(eventId, replyToken, publishedAutomation.messages, channelAccessToken);
          }
          eventCompleted = true;
          continue;
        }
      }
      // 1. Process Message text subclass
      if (eventType === "message" && asString(message.type) === "text") {
        const text = asString(message.text).trim();
        const source = asRecord(event.source);
        const lineUserId = asString(source.userId);

        if (automation.conversation.owner === "chatwoot") {
          const handoffMessage = {
            type: "text",
            text: "This LINE conversation is managed by Chatwoot.",
          };
          processedReplies.push({
            replyToken,
            handledBy: "chatwoot",
            message: handoffMessage,
          });
          // Chatwoot is the configured LINE channel owner. Acknowledge the
          // event without sending a second reply from SolarDream.
          eventCompleted = true;
          continue;
        }

        const matchedTrigger = resolveLineTriggerConfig(text, triggerConfigs);
        const command: LineWebhookCommand | null = getWebhookCommand(matchedTrigger);

        // Condition matching: check Account Linking keyword
        const isAccountLinkMatch = command === "account-link";

        if (isAccountLinkMatch) {
          let linkToken: string | null = null;
          if (channelAccessToken && lineUserId && !isSimulated && isLineLiveMutationEnabled()) {
            try {
              linkToken = await getLineLinkToken(lineUserId, channelAccessToken);
            } catch (err) {
              console.error("Failed to issue LINE linkToken:", err);
            }
          } else if (isSimulated) {
            linkToken = `sandboxLinkToken_${lineUserId || "line-user"}_${Date.now()}`;
          }

          if (!linkToken) {
            const unavailableMessage = {
              type: "text",
              text: "ขออภัยค่ะ ระบบผูกบัญชี LINE ยังไม่พร้อมใช้งานในขณะนี้ กรุณาลองใหม่อีกครั้งภายหลัง",
            };
            const configuredUnavailableMessage = applyConfiguredQuickReply(
              unavailableMessage,
              automation.quickButtons,
              siteUrl,
            );
            processedReplies.push({
              replyToken,
              message: configuredUnavailableMessage,
              accountLinkToken: null,
              error: "LINE link token could not be issued.",
            });

            if (!isSimulated && isLineLiveMutationEnabled() && channelAccessToken) {
              await sendLineReplyOnce(eventId, replyToken, [configuredUnavailableMessage], channelAccessToken);
            }
            eventCompleted = true;
            continue;
          }

          const liffId = (process.env.NEXT_PUBLIC_LINE_LIFF_ID || process.env.LINE_LIFF_ID || "").trim().replace(/^["']|["']$/g, "");
          const activeLoginUrl = liffId ? `https://liff.line.me/${liffId}` : customLoginUrl;

          const replyMessage = applyConfiguredQuickReply(await getAccountLinkFlexMessage(
            linkToken,
            activeLoginUrl,
            siteUrl,
            matchedTrigger?.flexJson,
            matchedTrigger?.altText,
          ), automation.quickButtons, siteUrl);
          processedReplies.push({
            replyToken,
            message: replyMessage,
            accountLinkToken: linkToken,
          });

          if (!isSimulated && isLineLiveMutationEnabled() && channelAccessToken) {
            await sendLineReplyOnce(eventId, replyToken, [replyMessage], channelAccessToken);
          }
          eventCompleted = true;
          continue;
        }
        // Standard profiles checks
        let dbUser = null;
        let latestOrder = null;
        let points: number | null = null;
        let tier: string | null = null;

        if (lineUserId && lineUserId !== "U1234567890abcdef1234567890abcdef") {
          try {
            // Find linked user from database using their LINE user ID
            dbUser = await db.query.users.findFirst({
              where: eq(users.lineUserId, lineUserId),
            });

            if (dbUser) {
              const userProposals = await db.query.proposals.findMany({
                where: eq(proposals.userId, dbUser.id),
                orderBy: [desc(proposals.createdAt)],
              });

              latestOrder = userProposals[0] || null;

              const totalSpent = userProposals.reduce((sum, p) => sum + p.totalPrice, 0);
              points = Math.floor(totalSpent / 1000);

              if (totalSpent > 500000) {
                tier = "PLATINUM MEMBER";
              } else if (totalSpent > 200000) {
                tier = "GOLD MEMBER";
              } else if (totalSpent > 0) {
                tier = "SILVER MEMBER";
              } else {
                tier = "BRONZE MEMBER";
              }
            }
          } catch (dbErr) {
            console.error("Webhook Drizzle queries failed for userId:", lineUserId, dbErr);
          }
        }

        let inboundChatState: { humanTakeover: boolean; threadId: string | null; inserted: boolean; conversationStatus: "UNASSIGNED" | "OPEN" | "RESOLVED" | "CLOSED"; tags: string[] } | null = null;
        if (dbUser) {
          try {
            inboundChatState = await persistInboundLineMessage({ event, eventId, lineUserId, dbUser, messageText: text, message });
          } catch (error: unknown) {
            if (!isMissingChatConsoleSchemaError(error)) throw error;
            console.warn("[LINE Webhook] Inbox persistence is unavailable until the Admin Console migration is applied.");
          }
        }
        if (inboundChatState?.humanTakeover) {
          processedReplies.push({ eventId, handledBy: "human-takeover", threadId: inboundChatState.threadId });
          eventCompleted = true;
          continue;
        }

        const publishedAutomation = publishedLineRules.length
          ? await executePublishedLineAutomation({
            ...buildPublishedLineAutomationContext({
              eventType: "message",
              text,
              fields: { lineUserId, customerId: dbUser?.id || "", customerName: dbUser?.fullName || dbUser?.name || "" },
              tags: inboundChatState?.tags || [],
              accountLinked: Boolean(dbUser),
              conversationStatus: inboundChatState?.conversationStatus || "UNASSIGNED",
              humanTakeover: false,
            }),
            customerId: dbUser?.id || null,
            conversationKey: getConversationKey(event, `line-user:${lineUserId || eventId}`),
            userIdentifier: lineUserId || "line-webhook-user",
          }, publishedLineRules)
          : null;
        if (publishedAutomation?.handled) {
          processedReplies.push({ eventId, handledBy: "published-automation", matchedRules: publishedAutomation.matchedRules, messages: publishedAutomation.messages, warnings: publishedAutomation.warnings });
          const automationStillEnabled = await canSendAutomationReply(inboundChatState?.threadId ?? null);
          if (!automationStillEnabled) {
            processedReplies.push({ eventId, handledBy: "human-takeover-before-send", threadId: inboundChatState?.threadId ?? null });
          }
          if (automationStillEnabled && !isSimulated && isLineLiveMutationEnabled() && channelAccessToken && publishedAutomation.messages.length && replyToken) {
            await sendLineReplyOnce(eventId, replyToken, publishedAutomation.messages, channelAccessToken);
          }
          eventCompleted = true;
          continue;
        }

        let replyMessage: LineMessage;

        const isOrderMatch = command === "order";
        const isInstallationMatch = command === "installation";
        const isPointsMatch = command === "points";
        const isStockMatch = command === "stock";
        const isPromoMatch = command === "promo";

        if (isStockMatch) {
          try {
            const { products: activeProducts } = await listCatalogProducts({ take: 3, sort: "newest" });
            replyMessage = await getStockFlexMessage(activeProducts, matchedTrigger?.flexJson, matchedTrigger?.altText);
          } catch (err) {
            console.error("Failed to query stock products:", err);
            replyMessage = await getStockFlexMessage([], matchedTrigger?.flexJson, matchedTrigger?.altText);
          }
        } else if (isPromoMatch) {
          try {
            const { products: promoProducts } = await listCatalogProducts({ take: 5, sort: "newest" });
            replyMessage = await getPromotionsCarouselMessage(promoProducts, siteUrl, matchedTrigger?.flexJson, matchedTrigger?.altText);
          } catch (err) {
            console.error("Failed to query promo products:", err);
            replyMessage = await getPromotionsCarouselMessage([], siteUrl, matchedTrigger?.flexJson, matchedTrigger?.altText);
          }
        } else if (isOrderMatch) {
          replyMessage = await getQuotationProgressFlexMessage(dbUser, latestOrder, siteUrl, matchedTrigger?.flexJson, matchedTrigger?.altText);
        } else if (isInstallationMatch) {
          replyMessage = await getInstallationProgressFlexMessage(dbUser, latestOrder, siteUrl, matchedTrigger?.flexJson, matchedTrigger?.altText);
        } else if (isPointsMatch && dbUser && points !== null && tier) {
          replyMessage = await getPointsFlexMessage(dbUser, points, tier, siteUrl, matchedTrigger?.flexJson, matchedTrigger?.altText);
        } else if (isPointsMatch) {
          replyMessage = { type: "text", text: "กรุณาผูกบัญชี SolarDream ก่อนตรวจสอบคะแนนสมาชิกค่ะ" };
        } else if (matchedTrigger?.kind === "custom") {
          replyMessage = getCustomTriggerMessage(matchedTrigger, siteUrl);
        } else {
          replyMessage = getDefaultQuickReplyMessage(siteUrl, automation.quickButtons);
        }

        replyMessage = applyConfiguredQuickReply(replyMessage, automation.quickButtons, siteUrl);

        processedReplies.push({
          replyToken,
          command: command || matchedTrigger?.id || "default",
          message: replyMessage,
          userInfo: dbUser ? { id: dbUser.id, name: dbUser.fullName || dbUser.name, email: dbUser.email } : null,
          orderInfo: latestOrder ? { id: latestOrder.id, status: latestOrder.status } : null,
        });

        if (!isSimulated && isLineLiveMutationEnabled() && channelAccessToken) {
          await sendLineReplyOnce(eventId, replyToken, [replyMessage], channelAccessToken);
        }
        eventCompleted = true;
      }

      // 2. Handle LINE accountLink callbacks events
      if (eventType === "accountLink") {
        const replyToken = asString(event.replyToken);
        const accountLink = asRecord(event.accountLink);
        const result = asString(accountLink.result); // "ok" or "failed"
        const nonce = asString(accountLink.nonce);
        const source = asRecord(event.source);
        const lineUserId = asString(source.userId);
        let linkedUser: typeof users.$inferSelect | null = null;

        let responseText = "";
        if (result === "ok") {
          responseText = "การเชื่อมต่อบัญชี SolarDream กับ LINE สำเร็จแล้วค่ะ ตอนนี้คุณสามารถติดตามใบเสนอราคา งานติดตั้ง และการอัปเดตจากทีม SolarDream ผ่านแชทนี้ได้ทันที";
          console.log(`[LINE Webhook] Account linked successfully. LINE User: ${lineUserId}, Nonce: ${nonce}`);
          try {
            // Find user by nonce, save lineUserId and clear the nonce
            const matchedUser = await db.query.users.findFirst({
              where: eq(users.lineLinkNonce, nonce),
            });

            if (matchedUser) {
              linkedUser = matchedUser;
              // 1. Clear this lineUserId from any other user record to avoid unique constraints violation
              await db.update(users)
                .set({ lineUserId: null })
                .where(eq(users.lineUserId, lineUserId));

              // 2. Save lineUserId for the matched user
              await db.update(users)
                .set({
                  lineUserId: lineUserId,
                })
                .where(eq(users.id, matchedUser.id));
              console.log(`[LINE Webhook] Saved lineUserId ${lineUserId} for user ${matchedUser.email}`);

              // Swapping rich menu dynamically from User Group -> active schedule/profile mapping.
              const richMenuResult = await applyResolvedRichMenuToUser(matchedUser.id);
              if (!richMenuResult.success) {
                console.warn("[LINE Webhook] Rich menu auto-apply after account link did not complete:", richMenuResult);
              }
            } else {
              console.warn(`[LINE Webhook] No user found matching nonce: ${nonce}`);
            }
          } catch (dbErr) {
            console.error("[LINE Webhook] Failed to save linked account details:", dbErr);
          }
        } else {
          responseText = "❌ ขออภัยค่ะ การผูกบัญชีเกิดข้อผิดพลาด กรุณาเข้าสู่ระบบและทำรายการใหม่อีกครั้ง";
          console.warn(`[LINE Webhook] Account linking failed for User: ${lineUserId}, Nonce: ${nonce}`);
        }

        const replyMessage = applyConfiguredQuickReply({
          type: "text",
          text: responseText,
        }, automation.quickButtons, siteUrl);

        let linkedConversation: typeof chatThreads.$inferSelect | null = null;
        if (linkedUser) {
          try {
            linkedConversation = await db.query.chatThreads.findFirst({
              where: and(
                eq(chatThreads.customerId, linkedUser.id),
                eq(chatThreads.conversationKey, getConversationKey(event, `line-user:${lineUserId || eventId}`)),
                eq(chatThreads.isArchived, false),
              ),
            }) ?? null;
          } catch (error: unknown) {
            if (!isMissingChatConsoleSchemaError(error)) throw error;
          }
        }

        const accountLinkAutomation = publishedLineRules.length
          ? await executePublishedLineAutomation({
            ...buildPublishedLineAutomationContext({
              eventType: "accountLink",
              text: responseText,
              fields: {
                lineUserId,
                customerId: linkedUser?.id || "",
                customerName: linkedUser?.fullName || linkedUser?.name || "",
                result,
              },
              eventFields: { eventName: eventType, eventId, result, nonce },
              accountLinked: result === "ok" && Boolean(linkedUser),
              conversationStatus: linkedConversation?.status || "UNASSIGNED",
              humanTakeover: linkedConversation ? !Boolean(linkedConversation.automationEnabled) : false,
            }),
            customerId: linkedUser?.id || null,
            conversationKey: getConversationKey(event, `line-user:${lineUserId || eventId}`),
            userIdentifier: lineUserId || `line-account-link:${eventId}`,
          }, publishedLineRules)
          : null;
        const replyMessages: LineMessage[] = accountLinkAutomation?.messages.length
          ? accountLinkAutomation.messages
          : [replyMessage];

        processedReplies.push({
          replyToken,
          message: replyMessages.length === 1 ? replyMessages[0] : replyMessages,
          accountLink: {
            result,
            nonce,
            lineUserId,
          },
          ...(accountLinkAutomation
            ? {
              handledBy: "published-automation",
              matchedRules: accountLinkAutomation.matchedRules,
              warnings: accountLinkAutomation.warnings,
            }
            : {}),
        });

        const automationStillEnabled = accountLinkAutomation?.handled
          ? await canSendAutomationReply(linkedConversation?.id ?? null)
          : true;
        if (!isSimulated && isLineLiveMutationEnabled() && channelAccessToken && automationStillEnabled) {
          await sendLineReplyOnce(eventId, replyToken, replyMessages, channelAccessToken);
        }
        eventCompleted = true;
      }
      if (!eventCompleted) eventCompleted = true;
      } catch (error: unknown) {
        await markWebhookEvent(eventId, "RETRY", error instanceof Error ? error.message : "Webhook event processing failed.");
        throw error;
      } finally {
        if (eventCompleted) await markWebhookEvent(eventId, "PROCESSED");
      }
    }

    return NextResponse.json({
      success: true,
      simulated: isSimulated,
      replies: processedReplies,
    });
  } catch (error: unknown) {
    console.error("Error processing LINE Webhook:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
