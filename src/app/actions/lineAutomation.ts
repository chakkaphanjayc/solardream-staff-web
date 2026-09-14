"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { lineAutomationRules, lineAutomationRuns } from "@/db/schema";
import { requireAdminPermission, ADMIN_PERMISSIONS } from "@/lib/admin-permissions";
import {
  evaluateAutomationRules,
  lineConversationStatusSchema,
  lineAutomationRuleConfigSchema,
  type LineAutomationContext,
  type LineAutomationRule,
  type LineAutomationRuleConfig,
} from "@/lib/lineAutomationEngine";
import { recordAuditEventBestEffort } from "@/lib/auditLog";

const ruleInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  config: lineAutomationRuleConfigSchema,
  priority: z.number().int().min(0).max(10000),
  stopProcessing: z.boolean(),
  cooldownSeconds: z.number().int().min(0).max(86400),
  enabled: z.boolean(),
  expectedRowVersion: z.number().int().min(1).optional(),
});

type RuleRow = typeof lineAutomationRules.$inferSelect;

export type LineAutomationRuleDto = {
  id: string;
  name: string;
  draftConfig: LineAutomationRuleConfig;
  publishedConfig: LineAutomationRuleConfig | null;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  priority: number;
  stopProcessing: boolean;
  cooldownSeconds: number;
  enabled: boolean;
  executionCount: number;
  lastExecutedAt: string | null;
  lastError: string | null;
  draftVersion: number;
  publishedVersion: number | null;
  rowVersion: number;
  updatedAt: string;
};

function isMissingAutomationSchemaError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("line_automation_rules") || message.includes("DATABASE_URL is not set");
}

function normalizeRule(row: RuleRow): LineAutomationRuleDto | null {
  const draft = lineAutomationRuleConfigSchema.safeParse(row.draftConfig);
  const published = row.publishedConfig === null ? { success: true as const, data: null } : lineAutomationRuleConfigSchema.safeParse(row.publishedConfig);
  const status = row.status === "DRAFT" || row.status === "PUBLISHED" || row.status === "ARCHIVED" ? row.status : null;
  if (!draft.success || (!published.success && row.publishedConfig !== null) || !status) return null;
  return {
    id: row.id,
    name: row.name,
    draftConfig: draft.data,
    publishedConfig: published.success ? published.data : null,
    status,
    priority: row.priority,
    stopProcessing: row.stopProcessing,
    cooldownSeconds: row.cooldownSeconds,
    enabled: row.enabled,
    executionCount: row.executionCount,
    lastExecutedAt: row.lastExecutedAt?.toISOString() ?? null,
    lastError: row.lastError,
    draftVersion: row.draftVersion,
    publishedVersion: row.publishedVersion,
    rowVersion: row.rowVersion,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toEngineRule(rule: LineAutomationRuleDto, mode: "draft" | "published"): LineAutomationRule | null {
  const config = mode === "draft" ? rule.draftConfig : rule.publishedConfig;
  if (!config) return null;
  return { id: rule.id, name: rule.name, ...config, priority: rule.priority, stopProcessing: rule.stopProcessing, cooldownSeconds: rule.cooldownSeconds, enabled: rule.enabled, lastExecutedAt: rule.lastExecutedAt };
}

export async function listLineAutomationRules() {
  try {
    await requireAdminPermission(ADMIN_PERMISSIONS.lineAutomationView);
    const rows = await db.query.lineAutomationRules.findMany({ orderBy: [ascPriority(), desc(lineAutomationRules.updatedAt)], limit: 200 });
    return { success: true as const, rules: rows.map(normalizeRule).filter((rule): rule is LineAutomationRuleDto => Boolean(rule)) };
  } catch (error: unknown) {
    if (!isMissingAutomationSchemaError(error)) console.error("Failed to list LINE automation rules:", error);
    return { success: false as const, rules: [] as LineAutomationRuleDto[], error: "LINE automation is not available. Apply the Admin Console migration and try again." };
  }
}

function ascPriority() {
  return sql`${lineAutomationRules.priority} ASC`;
}

export async function saveLineAutomationRuleDraft(input: unknown) {
  try {
    const actor = await requireAdminPermission(ADMIN_PERMISSIONS.lineAutomationEdit);
    const parsed = ruleInputSchema.safeParse(input);
    if (!parsed.success) return { success: false as const, error: parsed.error.issues[0]?.message || "Invalid automation rule." };
    const rule = parsed.data;
    const row = await db.transaction(async (tx) => {
      const existing = rule.id ? await tx.query.lineAutomationRules.findFirst({ where: eq(lineAutomationRules.id, rule.id) }) : null;
      if (rule.id && !existing) throw new Error("Automation rule not found.");
      if (existing && rule.expectedRowVersion !== undefined && existing.rowVersion !== rule.expectedRowVersion) throw new Error("This rule changed in another tab. Reload it before saving.");
      if (existing) {
        const [updated] = await tx.update(lineAutomationRules).set({ name: rule.name, draftConfig: rule.config, status: "DRAFT", priority: rule.priority, stopProcessing: rule.stopProcessing, cooldownSeconds: rule.cooldownSeconds, enabled: rule.enabled, draftVersion: existing.draftVersion + 1, rowVersion: existing.rowVersion + 1, updatedByUserId: actor.id, lastError: null }).where(and(eq(lineAutomationRules.id, existing.id), eq(lineAutomationRules.rowVersion, existing.rowVersion))).returning();
        if (!updated) throw new Error("The rule changed before it could be saved.");
        return updated;
      }
      const [created] = await tx.insert(lineAutomationRules).values({ name: rule.name, draftConfig: rule.config, status: "DRAFT", priority: rule.priority, stopProcessing: rule.stopProcessing, cooldownSeconds: rule.cooldownSeconds, enabled: rule.enabled, draftVersion: 1, rowVersion: 1, createdByUserId: actor.id, updatedByUserId: actor.id }).returning();
      if (!created) throw new Error("The automation rule could not be created.");
      return created;
    });
    const dto = normalizeRule(row);
    await recordAuditEventBestEffort({ actorUserId: actor.id, actorType: "ADMIN", action: rule.id ? "UPDATE_LINE_AUTOMATION_DRAFT" : "CREATE_LINE_AUTOMATION_DRAFT", resourceType: "LINE_AUTOMATION_RULE", resourceId: row.id, metadata: { priority: rule.priority, enabled: rule.enabled, version: row.draftVersion } });
    revalidatePath("/en/admin/line/automation");
    revalidatePath("/th/admin/line/automation");
    return dto ? { success: true as const, rule: dto } : { success: false as const, error: "Saved rule has an invalid schema." };
  } catch (error: unknown) {
    if (!isMissingAutomationSchemaError(error)) console.error("Failed to save LINE automation rule:", error);
    return { success: false as const, error: error instanceof Error ? error.message : "Could not save the automation rule." };
  }
}

export async function publishLineAutomationRule(id: string, expectedRowVersion: number) {
  try {
    const actor = await requireAdminPermission(ADMIN_PERMISSIONS.lineAutomationPublish);
    const parsed = z.object({ id: z.string().uuid(), expectedRowVersion: z.number().int().min(1) }).safeParse({ id, expectedRowVersion });
    if (!parsed.success) return { success: false as const, error: "Invalid rule publication request." };
    const row = await db.transaction(async (tx) => {
      const existing = await tx.query.lineAutomationRules.findFirst({ where: eq(lineAutomationRules.id, parsed.data.id) });
      if (!existing) throw new Error("Automation rule not found.");
      if (existing.rowVersion !== parsed.data.expectedRowVersion) throw new Error("This rule changed in another tab. Reload it before publishing.");
      const config = lineAutomationRuleConfigSchema.parse(existing.draftConfig);
      const [updated] = await tx.update(lineAutomationRules).set({ publishedConfig: config, publishedVersion: existing.draftVersion, status: "PUBLISHED", rowVersion: existing.rowVersion + 1, updatedByUserId: actor.id }).where(and(eq(lineAutomationRules.id, existing.id), eq(lineAutomationRules.rowVersion, existing.rowVersion))).returning();
      if (!updated) throw new Error("The rule changed before it could be published.");
      return updated;
    });
    const dto = normalizeRule(row);
    await recordAuditEventBestEffort({ actorUserId: actor.id, actorType: "ADMIN", action: "PUBLISH_LINE_AUTOMATION_RULE", resourceType: "LINE_AUTOMATION_RULE", resourceId: id, metadata: { version: row.publishedVersion } });
    revalidatePath("/en/admin/line/automation");
    revalidatePath("/th/admin/line/automation");
    return dto ? { success: true as const, rule: dto } : { success: false as const, error: "Published rule could not be read back." };
  } catch (error: unknown) {
    if (!isMissingAutomationSchemaError(error)) console.error("Failed to publish LINE automation rule:", error);
    return { success: false as const, error: error instanceof Error ? error.message : "Could not publish the automation rule." };
  }
}

const simulationSchema = z.object({
  text: z.string().max(2000),
  eventType: z.enum(["follow", "message", "postback", "accountLink", "event", "schedule"]),
  postbackData: z.string().max(500).nullable().optional(),
  tags: z.array(z.string().max(80)).max(100),
  fields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
  eventFields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
  isBusinessHours: z.boolean(),
  humanTakeover: z.boolean(),
  accountLinked: z.boolean().default(false),
  conversationStatus: lineConversationStatusSchema.default("UNASSIGNED"),
  mode: z.enum(["draft", "published"]),
  ruleIds: z.array(z.string().uuid()).max(200).optional(),
});

export async function simulateLineAutomation(input: unknown) {
  try {
    const actor = await requireAdminPermission(ADMIN_PERMISSIONS.lineTest);
    const parsed = simulationSchema.safeParse(input);
    if (!parsed.success) return { success: false as const, error: parsed.error.issues[0]?.message || "Invalid simulation context." };
    const selectedRows = parsed.data.ruleIds?.length
      ? await db.query.lineAutomationRules.findMany({ where: inArray(lineAutomationRules.id, parsed.data.ruleIds), limit: 200 })
      : await db.query.lineAutomationRules.findMany({ where: eq(lineAutomationRules.status, "PUBLISHED"), orderBy: [ascPriority()], limit: 200 });
    const rules = selectedRows.map(normalizeRule).filter((rule): rule is LineAutomationRuleDto => Boolean(rule));
    const engineRules = rules.map((rule) => toEngineRule(rule, parsed.data.mode)).filter((rule): rule is LineAutomationRule => Boolean(rule));
    const context: LineAutomationContext = { text: parsed.data.text, eventType: parsed.data.eventType, postbackData: parsed.data.postbackData, tags: parsed.data.tags, fields: parsed.data.fields, eventFields: parsed.data.eventFields, isBusinessHours: parsed.data.isBusinessHours, humanTakeover: parsed.data.humanTakeover, accountLinked: parsed.data.accountLinked, conversationStatus: parsed.data.conversationStatus };
    const result = evaluateAutomationRules(engineRules, context);
    const [run] = await db.insert(lineAutomationRuns).values({ runType: "SIMULATION", context: { ...parsed.data, ruleIds: rules.map((rule) => rule.id) }, result: result as unknown as Record<string, unknown>, createdByUserId: actor.id }).returning({ id: lineAutomationRuns.id });
    await recordAuditEventBestEffort({ actorUserId: actor.id, actorType: "ADMIN", action: "SIMULATE_LINE_AUTOMATION", resourceType: "LINE_AUTOMATION", resourceId: run?.id || null, metadata: { mode: parsed.data.mode, matchedRuleCount: result.matchedRules.length, actionCount: result.actions.length } });
    return { success: true as const, runId: run?.id || null, result };
  } catch (error: unknown) {
    if (!isMissingAutomationSchemaError(error)) console.error("Failed to simulate LINE automation:", error);
    return { success: false as const, error: error instanceof Error ? error.message : "Could not run the automation simulation." };
  }
}
