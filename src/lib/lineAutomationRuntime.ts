import "server-only";

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { chatThreads, difyConversations, difyIntegrations, lineAutomationRules, lineAutomationRuns, lineContentItems, lineCustomerTags, lineRichMenuDefinitions, userNotifications, users } from "@/db/schema";
import { decryptDifySecret, runDifyMessage, type DifyAppType } from "@/lib/dify";
import { compileLineContentDocument, lineContentDocumentSchema } from "@/lib/lineContentSchema";
import { evaluateAutomationRules, lineAutomationRuleConfigSchema, lineConversationStatusSchema, type AutomationEvaluation, type LineAutomationAction, type LineAutomationContext, type LineAutomationRule } from "@/lib/lineAutomationEngine";
import { linkRichMenuToUser } from "@/lib/linePush";

type JsonRecord = Record<string, unknown>;

export type PublishedLineAutomationInput = LineAutomationContext & {
  customerId?: string | null;
  conversationKey?: string | null;
  userIdentifier: string;
};

export type PublishedLineAutomationResult = {
  handled: boolean;
  messages: JsonRecord[];
  matchedRules: string[];
  evaluation: AutomationEvaluation;
  warnings: string[];
  handedOff: boolean;
};

function toRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function toEngineRule(row: typeof lineAutomationRules.$inferSelect): LineAutomationRule | null {
  if (row.status !== "PUBLISHED" || !row.enabled) return null;
  const parsed = lineAutomationRulesConfig(row.publishedConfig);
  if (!parsed) return null;
  return { id: row.id, name: row.name, ...parsed, priority: row.priority, stopProcessing: row.stopProcessing, cooldownSeconds: row.cooldownSeconds, enabled: row.enabled, lastExecutedAt: row.lastExecutedAt?.toISOString() ?? null };
}

function lineAutomationRulesConfig(value: unknown) {
  const parsed = lineAutomationRuleConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export async function loadPublishedLineAutomationRules(): Promise<LineAutomationRule[]> {
  try {
    const rows = await db.query.lineAutomationRules.findMany({ where: and(eq(lineAutomationRules.status, "PUBLISHED"), eq(lineAutomationRules.enabled, true)), orderBy: [asc(lineAutomationRules.priority)], limit: 200 });
    return rows.map(toEngineRule).filter((rule): rule is LineAutomationRule => Boolean(rule));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("line_automation_rules") && !message.includes("DATABASE_URL is not set")) console.error("Failed to load published LINE automation rules:", message);
    return [];
  }
}

function isBusinessHours() {
  const timezone = process.env.LINE_AUTOMATION_TIMEZONE || "Asia/Bangkok";
  const start = Number.parseInt(process.env.LINE_BUSINESS_HOURS_START || "09", 10);
  const end = Number.parseInt(process.env.LINE_BUSINESS_HOURS_END || "18", 10);
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "2-digit", hour12: false }).format(new Date()));
  return Number.isFinite(hour) && hour >= Math.min(start, 23) && hour < Math.min(Math.max(end, start + 1), 24);
}

async function getPublishedContentMessages(contentId: string, values: Readonly<Record<string, string>>) {
  const row = await db.query.lineContentItems.findFirst({ where: and(eq(lineContentItems.id, contentId), eq(lineContentItems.status, "PUBLISHED")) });
  if (!row || !row.publishedDocument) return null;
  const document = lineContentDocumentSchema.safeParse(row.publishedDocument);
  if (!document.success) return null;
  return compileLineContentDocument(document.data, values);
}

async function getCustomerTags(customerId: string | null | undefined) {
  if (!customerId) return [] as string[];
  try {
    const rows = await db.query.lineCustomerTags.findMany({ where: eq(lineCustomerTags.customerId, customerId), columns: { tag: true }, limit: 100 });
    return rows.map((row) => row.tag);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("line_customer_tags") && !message.includes("DATABASE_URL is not set")) console.warn("Failed to load LINE customer tags for automation:", message);
    return [] as string[];
  }
}

async function getDifyConversation(input: PublishedLineAutomationInput, integrationId: string, integrationVersion: number) {
  if (!input.customerId || !input.conversationKey) return null;
  const session = await db.query.difyConversations.findFirst({
    where: and(eq(difyConversations.customerId, input.customerId), eq(difyConversations.conversationKey, input.conversationKey), eq(difyConversations.integrationId, integrationId)),
  });
  return session?.integrationVersion === integrationVersion ? session.difyConversationId : null;
}

async function saveDifyConversation(input: PublishedLineAutomationInput, integrationId: string, integrationVersion: number, conversationId: string) {
  if (!input.customerId || !input.conversationKey || !conversationId) return;
  await db.insert(difyConversations).values({ customerId: input.customerId, conversationKey: input.conversationKey, integrationId, integrationVersion, difyConversationId: conversationId }).onConflictDoUpdate({
    target: [difyConversations.customerId, difyConversations.conversationKey, difyConversations.integrationId],
    set: { integrationVersion, difyConversationId: conversationId, updatedAt: new Date() },
  });
}

function getDifyInputs(mapping: Record<string, unknown>, input: PublishedLineAutomationInput) {
  const values: Record<string, string | number | boolean | null> = {};
  for (const [key, source] of Object.entries(mapping)) {
    const sourceKey = typeof source === "string" ? source : "";
    const candidate = sourceKey === "text" ? input.text : sourceKey === "user" ? input.userIdentifier : input.fields[sourceKey];
    values[key] = candidate === undefined ? null : typeof candidate === "string" || typeof candidate === "number" || typeof candidate === "boolean" || candidate === null ? candidate : String(candidate);
  }
  return values;
}

async function executeAction(action: LineAutomationAction, input: PublishedLineAutomationInput, warnings: string[]) {
  if (action.type === "sendText") return [{ type: "text", text: action.text } as JsonRecord];
  if (action.type === "sendContent") {
    try {
      const messages = await getPublishedContentMessages(action.contentId, { customer_name: input.fields.customerName ? String(input.fields.customerName) : "there", user: input.userIdentifier });
      if (!messages) warnings.push(`Published content ${action.contentId} was not found or failed validation.`);
      return (messages || []).map((message) => message as unknown as JsonRecord);
    } catch {
      warnings.push(`Published content ${action.contentId} could not be compiled.`);
      return [];
    }
  }
  if (action.type === "invokeDify") {
    try {
      const row = await db.query.difyIntegrations.findFirst({ where: and(eq(difyIntegrations.id, action.integrationId), eq(difyIntegrations.enabled, true)) });
      if (!row) {
        warnings.push(`Dify integration ${action.integrationId} is not enabled.`);
        return [];
      }
      const conversationId = await getDifyConversation(input, row.id, row.configVersion);
      const result = await runDifyMessage({ baseUrl: row.baseUrl, apiKey: decryptDifySecret(row.apiKeyCiphertext), appType: row.appType as DifyAppType, timeoutMs: row.timeoutMs }, input.text, input.userIdentifier, conversationId, getDifyInputs(toRecord(row.inputMapping), input));
      if (result.success && result.answer) {
        if (result.conversationId) await saveDifyConversation(input, row.id, row.configVersion, result.conversationId);
        return [{ type: "text", text: result.answer }];
      }
      warnings.push(result.error || "Dify returned no answer.");
      if (row.fallbackContentId) {
        const fallback = await getPublishedContentMessages(row.fallbackContentId, { customer_name: input.fields.customerName ? String(input.fields.customerName) : "there", user: input.userIdentifier });
        return (fallback || []).map((message) => message as unknown as JsonRecord);
      }
      return [];
    } catch {
      warnings.push("Dify could not be invoked; no unapproved fallback was generated.");
      return [];
    }
  }
  if (action.type === "handoff") {
    if (input.customerId && input.conversationKey) {
      await db.update(chatThreads).set({ automationEnabled: false, status: "UNASSIGNED", humanTakeoverAt: new Date(), humanTakeoverBy: null, lastReplySource: "RULE", updatedAt: new Date() }).where(and(eq(chatThreads.customerId, input.customerId), eq(chatThreads.conversationKey, input.conversationKey), eq(chatThreads.isArchived, false)));
    }
    warnings.push(`Human handoff requested: ${action.reason}`);
    return [];
  }
  if (action.type === "setAutomation") {
    if (input.customerId && input.conversationKey) {
      await db.update(chatThreads).set({ automationEnabled: action.enabled, humanTakeoverAt: action.enabled ? null : new Date(), humanTakeoverBy: null, lastReplySource: "RULE", updatedAt: new Date() }).where(and(eq(chatThreads.customerId, input.customerId), eq(chatThreads.conversationKey, input.conversationKey), eq(chatThreads.isArchived, false)));
    }
    return [];
  }
  if (action.type === "addTag" || action.type === "removeTag") {
    if (!input.customerId) {
      warnings.push(`Customer tag action ${action.type} requires a linked customer.`);
      return [];
    }
    if (action.type === "addTag") {
      await db.insert(lineCustomerTags).values({ customerId: input.customerId, tag: action.tag }).onConflictDoNothing();
    } else {
      await db.delete(lineCustomerTags).where(and(eq(lineCustomerTags.customerId, input.customerId), eq(lineCustomerTags.tag, action.tag)));
    }
    return [];
  }
  if (action.type === "assignStaff") {
    if (!input.customerId || !input.conversationKey) {
      warnings.push("Staff assignment requires a linked LINE conversation.");
      return [];
    }
    const staff = await db.query.users.findFirst({ where: and(eq(users.id, action.staffId), eq(users.isActive, true), inArray(users.role, ["ADMIN", "STAFF", "MANAGER", "SUPER_ADMIN"])), columns: { id: true } });
    if (!staff) {
      warnings.push(`Staff member ${action.staffId} is not an active staff account.`);
      return [];
    }
    await db.update(chatThreads).set({ staffId: staff.id, status: "OPEN", updatedAt: new Date(), lastReplySource: "RULE" }).where(and(eq(chatThreads.customerId, input.customerId), eq(chatThreads.conversationKey, input.conversationKey), eq(chatThreads.isArchived, false)));
    return [];
  }
  if (action.type === "setRichMenu") {
    if (!/^U[0-9a-zA-Z_-]{1,199}$/.test(input.userIdentifier)) {
      warnings.push("Rich Menu assignment requires a LINE user conversation.");
      return [];
    }
    const definition = zUuid(action.richMenuId)
      ? await db.query.lineRichMenuDefinitions.findFirst({ where: and(eq(lineRichMenuDefinitions.id, action.richMenuId), eq(lineRichMenuDefinitions.status, "PUBLISHED")), columns: { lineRichMenuId: true } })
      : null;
    const richMenuId = definition?.lineRichMenuId || action.richMenuId;
    if (!/^richmenu-[0-9a-f-]{20,}$/i.test(richMenuId)) {
      warnings.push("Rich Menu assignment requires a published Rich Menu definition or a valid LINE Rich Menu ID.");
      return [];
    }
    const result = await linkRichMenuToUser(input.userIdentifier, richMenuId);
    if (!result.success) warnings.push(result.error || "Rich Menu assignment failed.");
    return [];
  }
  if (action.type === "notify") {
    const staff = await db.query.users.findMany({ where: and(eq(users.isActive, true), inArray(users.role, ["ADMIN", "STAFF", "MANAGER", "SUPER_ADMIN"])), columns: { id: true }, limit: 100 });
    if (staff.length) {
      await db.insert(userNotifications).values(staff.map((member) => ({ userId: member.id, featureKey: "line-automation", title: "LINE automation notification", link: "/admin/messages", message: action.message })));
    } else {
      warnings.push(`No active staff accounts were available for the ${action.channel} notification.`);
    }
    return [];
  }
  return [];
}

function zUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function executePublishedLineAutomation(input: PublishedLineAutomationInput, rules: readonly LineAutomationRule[]) {
  const evaluationInput = input.customerId && input.tags.length === 0
    ? { ...input, tags: await getCustomerTags(input.customerId) }
    : input;
  const evaluation = evaluateAutomationRules(rules, evaluationInput);
  if (!evaluation.matchedRules.length) return null;
  const warnings: string[] = [];
  const messages: JsonRecord[] = [];
  let handedOff = false;
  for (const entry of evaluation.actions) {
    if (entry.action.type === "handoff") handedOff = true;
    messages.push(...await executeAction(entry.action, input, warnings));
  }
  if (handedOff && input.customerId && input.conversationKey) {
    await db.update(chatThreads).set({ automationEnabled: false, status: "UNASSIGNED", humanTakeoverAt: null, humanTakeoverBy: null, lastReplySource: "RULE", updatedAt: new Date() }).where(and(eq(chatThreads.customerId, input.customerId), eq(chatThreads.conversationKey, input.conversationKey), eq(chatThreads.isArchived, false)));
  }
  const result: PublishedLineAutomationResult = { handled: true, messages: messages.slice(0, 5), matchedRules: evaluation.matchedRules, evaluation, warnings, handedOff };
  await Promise.all(evaluation.matchedRules.map((ruleId) => db.update(lineAutomationRules).set({ executionCount: sql`${lineAutomationRules.executionCount} + 1`, lastExecutedAt: new Date(), lastError: warnings.length ? warnings.join(" ").slice(0, 1000) : null }).where(eq(lineAutomationRules.id, ruleId))));
  await db.insert(lineAutomationRuns).values({ runType: "WEBHOOK", context: { eventType: input.eventType, text: input.text.slice(0, 2000), userIdentifier: input.userIdentifier, conversationKey: input.conversationKey || null }, result: result as unknown as JsonRecord });
  return result;
}

export function buildPublishedLineAutomationContext({ eventType, text, postbackData, tags = [], fields = {}, eventFields = {}, humanTakeover = false, accountLinked = false, conversationStatus = "UNASSIGNED" }: { eventType: LineAutomationContext["eventType"]; text: string; postbackData?: string | null; tags?: readonly string[]; fields?: LineAutomationContext["fields"]; eventFields?: LineAutomationContext["eventFields"]; humanTakeover?: boolean; accountLinked?: boolean; conversationStatus?: LineAutomationContext["conversationStatus"] }): LineAutomationContext {
  return { eventType, text, postbackData, tags, fields, eventFields, isBusinessHours: isBusinessHours(), humanTakeover, accountLinked, conversationStatus: lineConversationStatusSchema.parse(conversationStatus) };
}
