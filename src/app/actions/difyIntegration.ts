"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { difyIntegrations } from "@/db/schema";
import { ADMIN_PERMISSIONS, requireAdminPermission } from "@/lib/admin-permissions";
import { decryptDifySecret, encryptDifySecret, maskDifySecret, runDifyMessage, testDifyConnection, validateDifyBaseUrl, type DifyAppType } from "@/lib/dify";
import { recordAuditEventBestEffort } from "@/lib/auditLog";

const difyInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(100),
  baseUrl: z.string().trim().min(1).max(500),
  appType: z.enum(["chat", "completion"]),
  apiKey: z.string().trim().max(500).optional().default(""),
  inputMapping: z.record(z.string().trim().min(1).max(80), z.string().trim().max(200)).refine((value) => Object.keys(value).length <= 20, "Use no more than 20 input mappings."),
  timeoutMs: z.number().int().min(1000).max(60000),
  fallbackContentId: z.string().uuid().nullable().optional(),
  enabled: z.boolean(),
});

export type DifyIntegrationDto = {
  id: string;
  name: string;
  baseUrl: string;
  appType: DifyAppType;
  apiKeyMasked: string | null;
  inputMapping: Record<string, string>;
  timeoutMs: number;
  fallbackContentId: string | null;
  enabled: boolean;
  lastTestedAt: string | null;
  lastTestStatus: string | null;
  lastTestError: string | null;
  updatedAt: string;
};

type DifyRow = typeof difyIntegrations.$inferSelect;

function isMissingDifySchemaError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("dify_integrations") || message.includes("DATABASE_URL is not set");
}

function normalizeDify(row: DifyRow): DifyIntegrationDto | null {
  if (row.appType !== "chat" && row.appType !== "completion") return null;
  return {
    id: row.id,
    name: row.name,
    baseUrl: row.baseUrl,
    appType: row.appType,
    apiKeyMasked: row.apiKeyLast4 ? maskDifySecret(`********${row.apiKeyLast4}`) : null,
    inputMapping: row.inputMapping,
    timeoutMs: row.timeoutMs,
    fallbackContentId: row.fallbackContentId,
    enabled: row.enabled,
    lastTestedAt: row.lastTestedAt?.toISOString() ?? null,
    lastTestStatus: row.lastTestStatus,
    lastTestError: row.lastTestError,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listDifyIntegrations() {
  try {
    await requireAdminPermission(ADMIN_PERMISSIONS.lineIntegrationsView);
    const rows = await db.query.difyIntegrations.findMany({ orderBy: [desc(difyIntegrations.updatedAt)], limit: 50 });
    return { success: true as const, integrations: rows.map(normalizeDify).filter((item): item is DifyIntegrationDto => Boolean(item)) };
  } catch (error: unknown) {
    if (!isMissingDifySchemaError(error)) console.error("Failed to list Dify integrations:", error);
    return { success: false as const, integrations: [] as DifyIntegrationDto[], error: "Dify integrations are not available. Apply the Admin Console migration and try again." };
  }
}

export async function saveDifyIntegration(input: unknown) {
  try {
    const actor = await requireAdminPermission(ADMIN_PERMISSIONS.lineIntegrationsEdit);
    const parsed = difyInputSchema.safeParse(input);
    if (!parsed.success) return { success: false as const, error: parsed.error.issues[0]?.message || "Invalid Dify connection settings." };
    const values = parsed.data;
    const validated = validateDifyBaseUrl(values.baseUrl);
    if (!validated.ok) return { success: false as const, error: validated.error };

    const row = await db.transaction(async (tx) => {
      const existing = values.id ? await tx.query.difyIntegrations.findFirst({ where: eq(difyIntegrations.id, values.id) }) : null;
      if (values.id && !existing) throw new Error("Dify integration not found.");
      let encryptedKey = existing?.apiKeyCiphertext || "";
      let last4 = existing?.apiKeyLast4 || "";
      if (values.apiKey) {
        encryptedKey = encryptDifySecret(values.apiKey);
        last4 = values.apiKey.slice(-4);
      }
      if (!encryptedKey || !last4) throw new Error("Enter the Dify API key before saving this connection.");
      const data = { name: values.name, baseUrl: validated.url, appType: values.appType, apiKeyCiphertext: encryptedKey, apiKeyLast4: last4, inputMapping: values.inputMapping, configVersion: existing ? existing.configVersion + 1 : 1, timeoutMs: values.timeoutMs, fallbackContentId: values.fallbackContentId ?? null, enabled: values.enabled, updatedByUserId: actor.id };
      if (existing) {
        const [updated] = await tx.update(difyIntegrations).set(data).where(eq(difyIntegrations.id, existing.id)).returning();
        if (!updated) throw new Error("Dify integration could not be updated.");
        return updated;
      }
      const [created] = await tx.insert(difyIntegrations).values({ ...data, createdByUserId: actor.id }).returning();
      if (!created) throw new Error("Dify integration could not be created.");
      return created;
    });
    const dto = normalizeDify(row);
    await recordAuditEventBestEffort({ actorUserId: actor.id, actorType: "ADMIN", action: values.id ? "UPDATE_DIFY_INTEGRATION" : "CREATE_DIFY_INTEGRATION", resourceType: "DIFY_INTEGRATION", resourceId: row.id, metadata: { baseUrl: row.baseUrl, appType: row.appType, enabled: row.enabled } });
    revalidatePath("/en/admin/line/connections");
    revalidatePath("/th/admin/line/connections");
    return dto ? { success: true as const, integration: dto } : { success: false as const, error: "Saved Dify connection could not be read back." };
  } catch (error: unknown) {
    if (!isMissingDifySchemaError(error)) console.error("Failed to save Dify integration:", error);
    return { success: false as const, error: error instanceof Error ? error.message : "Could not save the Dify connection." };
  }
}

export async function testDifyIntegration(id: string) {
  try {
    const actor = await requireAdminPermission(ADMIN_PERMISSIONS.lineIntegrationsEdit);
    const parsedId = z.string().uuid().safeParse(id);
    if (!parsedId.success) return { success: false as const, error: "Invalid Dify integration ID." };
    const row = await db.query.difyIntegrations.findFirst({ where: eq(difyIntegrations.id, parsedId.data) });
    if (!row) return { success: false as const, error: "Dify integration not found." };
    const apiKey = decryptDifySecret(row.apiKeyCiphertext);
    const result = await testDifyConnection({ baseUrl: row.baseUrl, apiKey, appType: row.appType as DifyAppType, timeoutMs: row.timeoutMs });
    await db.update(difyIntegrations).set({ lastTestedAt: new Date(), lastTestStatus: result.success ? "CONNECTED" : "FAILED", lastTestError: result.success ? null : result.error, updatedByUserId: actor.id }).where(eq(difyIntegrations.id, row.id));
    await recordAuditEventBestEffort({ actorUserId: actor.id, actorType: "ADMIN", action: "TEST_DIFY_INTEGRATION", resourceType: "DIFY_INTEGRATION", resourceId: row.id, outcome: result.success ? "SUCCESS" : "FAILURE", metadata: { status: result.status } });
    revalidatePath("/en/admin/line/connections");
    revalidatePath("/th/admin/line/connections");
    return result.success ? { success: true as const, status: result.status } : { success: false as const, error: result.error };
  } catch (error: unknown) {
    if (!isMissingDifySchemaError(error)) console.error("Failed to test Dify integration:", error);
    return { success: false as const, error: error instanceof Error ? error.message : "Could not test the Dify connection." };
  }
}

export async function simulateDifyConversation(input: { id: string; query: string; user: string; conversationId?: string | null }) {
  try {
    await requireAdminPermission(ADMIN_PERMISSIONS.lineTest);
    const parsed = z.object({ id: z.string().uuid(), query: z.string().trim().min(1).max(2000), user: z.string().trim().min(1).max(200), conversationId: z.string().trim().max(200).nullable().optional() }).safeParse(input);
    if (!parsed.success) return { success: false as const, error: "Enter a test message and user identifier." };
    const row = await db.query.difyIntegrations.findFirst({ where: and(eq(difyIntegrations.id, parsed.data.id), eq(difyIntegrations.enabled, true)) });
    if (!row) return { success: false as const, error: "The Dify integration is not enabled." };
    const apiKey = decryptDifySecret(row.apiKeyCiphertext);
    const result = await runDifyMessage({ baseUrl: row.baseUrl, apiKey, appType: row.appType as DifyAppType, timeoutMs: row.timeoutMs }, parsed.data.query, parsed.data.user, parsed.data.conversationId);
    return result.success ? { success: true as const, answer: result.answer, conversationId: result.conversationId, messageId: result.messageId, status: result.status } : { success: false as const, error: result.error };
  } catch (error: unknown) {
    if (!isMissingDifySchemaError(error)) console.error("Failed to simulate Dify conversation:", error);
    return { success: false as const, error: error instanceof Error ? error.message : "Could not run the Dify simulation." };
  }
}
