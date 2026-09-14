"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { difyIntegrations, lineAutomationRules, lineContentItems, lineContentVersions } from "@/db/schema";
import { requireAdminPermission, ADMIN_PERMISSIONS } from "@/lib/admin-permissions";
import {
  compileLineContentDocument,
  lineContentDocumentSchema,
  LINE_CONTENT_TYPES,
  type LineContentDocument,
  type LineContentType,
} from "@/lib/lineContentSchema";
import { lineAutomationRuleConfigSchema } from "@/lib/lineAutomationEngine";
import { recordAuditEventBestEffort } from "@/lib/auditLog";

const contentTypeSchema = z.enum(LINE_CONTENT_TYPES);
const localeSchema = z.enum(["th", "en"]);

const contentDraftSchema = z.object({
  id: z.string().uuid().optional(),
  internalName: z.string().trim().min(1).max(120),
  contentType: contentTypeSchema,
  category: z.string().trim().min(1).max(80),
  tags: z.array(z.string().trim().min(1).max(40)).max(20),
  locale: localeSchema,
  document: lineContentDocumentSchema,
  expectedRowVersion: z.number().int().min(1).optional(),
});

type ContentDraftInput = z.infer<typeof contentDraftSchema>;

export type LineContentItemDto = {
  id: string;
  internalName: string;
  contentType: LineContentType;
  category: string;
  tags: string[];
  locale: "th" | "en";
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  thumbnailUrl: string | null;
  draftDocument: LineContentDocument;
  publishedDocument: LineContentDocument | null;
  draftVersion: number;
  publishedVersion: number | null;
  rowVersion: number;
  createdAt: string;
  updatedAt: string;
};

function isMissingContentSchemaError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("line_content_items") || message.includes("line_automation_rules") || message.includes("dify_integrations") || message.includes("DATABASE_URL is not set");
}

function safeContentType(value: string): LineContentType | null {
  return (LINE_CONTENT_TYPES as readonly string[]).includes(value) ? value as LineContentType : null;
}

function safeContentLocale(value: string): "th" | "en" | null {
  return value === "th" || value === "en" ? value : null;
}

function normalizeItem(row: typeof lineContentItems.$inferSelect): LineContentItemDto | null {
  const contentType = safeContentType(row.contentType);
  const locale = safeContentLocale(row.locale);
  const status = row.status === "DRAFT" || row.status === "PUBLISHED" || row.status === "ARCHIVED" ? row.status : null;
  const draftDocument = lineContentDocumentSchema.safeParse(row.draftDocument);
  const publishedDocument = row.publishedDocument === null ? { success: true as const, data: null } : lineContentDocumentSchema.safeParse(row.publishedDocument);
  if (!contentType || !locale || !status || !draftDocument.success || (!publishedDocument.success && row.publishedDocument !== null)) return null;

  return {
    id: row.id,
    internalName: row.internalName,
    contentType,
    category: row.category,
    tags: row.tags,
    locale,
    status,
    thumbnailUrl: row.thumbnailUrl,
    draftDocument: draftDocument.data,
    publishedDocument: publishedDocument.success ? publishedDocument.data : null,
    draftVersion: row.draftVersion,
    publishedVersion: row.publishedVersion,
    rowVersion: row.rowVersion,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function validateDocumentForType(contentType: LineContentType, document: LineContentDocument) {
  const types = new Set(document.components.map((component) => component.type));
  if (contentType === "TEXT" && !types.has("text")) return "Text content needs at least one text component.";
  if (contentType === "IMAGE" && !types.has("image")) return "Image content needs an image component.";
  if (contentType === "CAROUSEL" && !types.has("carousel")) return "Carousel content needs a carousel component.";
  if (contentType === "QUICK_REPLY" && !types.has("quickReplies")) return "Quick reply content needs a quick replies component.";
  return null;
}

export async function listLineContent(input: { query?: string; status?: "all" | "DRAFT" | "PUBLISHED" | "ARCHIVED"; locale?: "all" | "th" | "en" } = {}) {
  try {
    await requireAdminPermission(ADMIN_PERMISSIONS.lineContentView);
    const filters = [];
    const query = input.query?.trim();
    if (query) filters.push(or(ilike(lineContentItems.internalName, `%${query}%`), ilike(lineContentItems.category, `%${query}%`)));
    if (input.status && input.status !== "all") filters.push(eq(lineContentItems.status, input.status));
    if (input.locale && input.locale !== "all") filters.push(eq(lineContentItems.locale, input.locale));
    const rows = await db.query.lineContentItems.findMany({
      where: filters.length ? and(...filters) : undefined,
      orderBy: [desc(lineContentItems.updatedAt)],
      limit: 200,
    });
    return { success: true as const, items: rows.map(normalizeItem).filter((item): item is LineContentItemDto => Boolean(item)) };
  } catch (error: unknown) {
    if (!isMissingContentSchemaError(error)) console.error("Failed to list LINE content:", error);
    return { success: false as const, items: [] as LineContentItemDto[], error: "LINE content library is not available. Apply the Admin Console migration and try again." };
  }
}

export async function getLineContentItem(id: string) {
  try {
    await requireAdminPermission(ADMIN_PERMISSIONS.lineContentView);
    const parsedId = z.string().uuid().safeParse(id);
    if (!parsedId.success) return { success: false as const, error: "Invalid content ID." };
    const row = await db.query.lineContentItems.findFirst({ where: eq(lineContentItems.id, parsedId.data) });
    const item = row ? normalizeItem(row) : null;
    return item ? { success: true as const, item } : { success: false as const, error: "Content item not found or has an invalid schema." };
  } catch (error: unknown) {
    if (!isMissingContentSchemaError(error)) console.error("Failed to load LINE content:", error);
    return { success: false as const, error: "LINE content library is not available." };
  }
}

async function validateDraft(input: ContentDraftInput) {
  const typeError = validateDocumentForType(input.contentType, input.document);
  if (typeError) return typeError;
  try {
    compileLineContentDocument(input.document);
    return null;
  } catch (error: unknown) {
    return error instanceof Error ? error.message : "The LINE content schema is invalid.";
  }
}

export async function saveLineContentDraft(input: unknown) {
  try {
    const actor = await requireAdminPermission(ADMIN_PERMISSIONS.lineContentEdit);
    const parsed = contentDraftSchema.safeParse(input);
    if (!parsed.success) return { success: false as const, error: parsed.error.issues[0]?.message || "Invalid content draft." };
    const draft = parsed.data;
    const validationError = await validateDraft(draft);
    if (validationError) return { success: false as const, error: validationError };

    const item = await db.transaction(async (tx) => {
      const existing = draft.id ? await tx.query.lineContentItems.findFirst({ where: eq(lineContentItems.id, draft.id) }) : null;
      if (draft.id && !existing) throw new Error("Content item not found.");
      if (existing && draft.expectedRowVersion !== undefined && existing.rowVersion !== draft.expectedRowVersion) {
        throw new Error("This content changed in another tab. Reload it before saving.");
      }
      if (existing) {
        const nextVersion = existing.draftVersion + 1;
        const [updated] = await tx.update(lineContentItems).set({
          internalName: draft.internalName,
          contentType: draft.contentType,
          category: draft.category,
          tags: draft.tags,
          locale: draft.locale,
          status: existing.status === "ARCHIVED" ? "DRAFT" : "DRAFT",
          draftDocument: draft.document,
          draftVersion: nextVersion,
          rowVersion: existing.rowVersion + 1,
          updatedByUserId: actor.id,
          archivedAt: null,
        }).where(and(eq(lineContentItems.id, existing.id), eq(lineContentItems.rowVersion, existing.rowVersion))).returning();
        if (!updated) throw new Error("The draft was changed before it could be saved.");
        await tx.insert(lineContentVersions).values({ itemId: updated.id, version: nextVersion, state: "DRAFT", schemaVersion: 1, document: draft.document, compiledPayload: compileLineContentDocument(draft.document), createdByUserId: actor.id });
        return updated;
      }
      const [created] = await tx.insert(lineContentItems).values({
        internalName: draft.internalName,
        contentType: draft.contentType,
        category: draft.category,
        tags: draft.tags,
        locale: draft.locale,
        status: "DRAFT",
        draftDocument: draft.document,
        draftVersion: 1,
        rowVersion: 1,
        createdByUserId: actor.id,
        updatedByUserId: actor.id,
      }).returning();
      if (!created) throw new Error("The content draft could not be created.");
      await tx.insert(lineContentVersions).values({ itemId: created.id, version: 1, state: "DRAFT", schemaVersion: 1, document: draft.document, compiledPayload: compileLineContentDocument(draft.document), createdByUserId: actor.id });
      return created;
    });

    const normalized = normalizeItem(item);
    await recordAuditEventBestEffort({ actorUserId: actor.id, actorType: "ADMIN", action: draft.id ? "UPDATE_LINE_CONTENT_DRAFT" : "CREATE_LINE_CONTENT_DRAFT", resourceType: "LINE_CONTENT", resourceId: item.id, metadata: { contentType: draft.contentType, locale: draft.locale, version: item.draftVersion } });
    revalidatePath("/en/admin/line/content");
    revalidatePath("/th/admin/line/content");
    return normalized ? { success: true as const, item: normalized } : { success: false as const, error: "Saved draft has an invalid schema." };
  } catch (error: unknown) {
    if (!isMissingContentSchemaError(error)) console.error("Failed to save LINE content draft:", error);
    return { success: false as const, error: error instanceof Error ? error.message : "Could not save LINE content draft." };
  }
}

export async function publishLineContent(id: string, expectedRowVersion: number) {
  try {
    const actor = await requireAdminPermission(ADMIN_PERMISSIONS.lineContentPublish);
    const parsed = z.object({ id: z.string().uuid(), expectedRowVersion: z.number().int().min(1) }).safeParse({ id, expectedRowVersion });
    if (!parsed.success) return { success: false as const, error: "Invalid content publication request." };
    const published = await db.transaction(async (tx) => {
      const existing = await tx.query.lineContentItems.findFirst({ where: eq(lineContentItems.id, parsed.data.id) });
      if (!existing) throw new Error("Content item not found.");
      if (existing.rowVersion !== parsed.data.expectedRowVersion) throw new Error("This content changed in another tab. Reload it before publishing.");
      const document = lineContentDocumentSchema.parse(existing.draftDocument);
      const compiledPayload = compileLineContentDocument(document);
      const [updated] = await tx.update(lineContentItems).set({ publishedDocument: document, publishedVersion: existing.draftVersion, status: "PUBLISHED", rowVersion: existing.rowVersion + 1, updatedByUserId: actor.id }).where(and(eq(lineContentItems.id, existing.id), eq(lineContentItems.rowVersion, existing.rowVersion))).returning();
      if (!updated) throw new Error("The content changed before it could be published.");
      await tx.insert(lineContentVersions).values({ itemId: updated.id, version: existing.draftVersion, state: "PUBLISHED", schemaVersion: 1, document, compiledPayload, createdByUserId: actor.id }).onConflictDoNothing();
      return updated;
    });
    const item = normalizeItem(published);
    await recordAuditEventBestEffort({ actorUserId: actor.id, actorType: "ADMIN", action: "PUBLISH_LINE_CONTENT", resourceType: "LINE_CONTENT", resourceId: parsed.data.id, metadata: { version: published.publishedVersion } });
    revalidatePath("/en/admin/line/content");
    revalidatePath("/th/admin/line/content");
    return item ? { success: true as const, item } : { success: false as const, error: "Published content could not be read back." };
  } catch (error: unknown) {
    if (!isMissingContentSchemaError(error)) console.error("Failed to publish LINE content:", error);
    return { success: false as const, error: error instanceof Error ? error.message : "Could not publish LINE content." };
  }
}

export async function duplicateLineContent(id: string) {
  try {
    const actor = await requireAdminPermission(ADMIN_PERMISSIONS.lineContentEdit);
    const parsedId = z.string().uuid().safeParse(id);
    if (!parsedId.success) return { success: false as const, error: "Invalid content ID." };
    const result = await db.transaction(async (tx) => {
      const source = await tx.query.lineContentItems.findFirst({ where: eq(lineContentItems.id, parsedId.data) });
      if (!source) throw new Error("Content item not found.");
      const copyName = `${source.internalName} copy ${Date.now()}`.slice(0, 120);
      const [created] = await tx.insert(lineContentItems).values({ internalName: copyName, contentType: source.contentType, category: source.category, tags: source.tags, locale: source.locale, status: "DRAFT", thumbnailUrl: source.thumbnailUrl, draftDocument: source.draftDocument, draftVersion: 1, rowVersion: 1, createdByUserId: actor.id, updatedByUserId: actor.id }).returning();
      if (!created) throw new Error("The content copy could not be created.");
      await tx.insert(lineContentVersions).values({ itemId: created.id, version: 1, state: "DRAFT", schemaVersion: 1, document: source.draftDocument, compiledPayload: compileLineContentDocument(source.draftDocument), createdByUserId: actor.id });
      return created;
    });
    await recordAuditEventBestEffort({ actorUserId: actor.id, actorType: "ADMIN", action: "DUPLICATE_LINE_CONTENT", resourceType: "LINE_CONTENT", resourceId: result.id, metadata: { sourceId: parsedId.data } });
    revalidatePath("/en/admin/line/content");
    revalidatePath("/th/admin/line/content");
    const item = normalizeItem(result);
    return item ? { success: true as const, item } : { success: false as const, error: "The content copy has an invalid schema." };
  } catch (error: unknown) {
    if (!isMissingContentSchemaError(error)) console.error("Failed to duplicate LINE content:", error);
    return { success: false as const, error: error instanceof Error ? error.message : "Could not duplicate LINE content." };
  }
}

export async function archiveLineContent(id: string) {
  try {
    const actor = await requireAdminPermission(ADMIN_PERMISSIONS.lineContentEdit);
    const parsedId = z.string().uuid().safeParse(id);
    if (!parsedId.success) return { success: false as const, error: "Invalid content ID." };
    const [updated] = await db.update(lineContentItems).set({ status: "ARCHIVED", archivedAt: new Date(), rowVersion: sql`${lineContentItems.rowVersion} + 1`, updatedByUserId: actor.id }).where(eq(lineContentItems.id, parsedId.data)).returning();
    if (!updated) return { success: false as const, error: "Content item not found." };
    await recordAuditEventBestEffort({ actorUserId: actor.id, actorType: "ADMIN", action: "ARCHIVE_LINE_CONTENT", resourceType: "LINE_CONTENT", resourceId: parsedId.data });
    revalidatePath("/en/admin/line/content");
    revalidatePath("/th/admin/line/content");
    return { success: true as const };
  } catch (error: unknown) {
    if (!isMissingContentSchemaError(error)) console.error("Failed to archive LINE content:", error);
    return { success: false as const, error: error instanceof Error ? error.message : "Could not archive LINE content." };
  }
}

export async function getLineContentHistory(id: string) {
  try {
    await requireAdminPermission(ADMIN_PERMISSIONS.lineContentView);
    const parsedId = z.string().uuid().safeParse(id);
    if (!parsedId.success) return { success: false as const, versions: [], error: "Invalid content ID." };
    const versions = await db.query.lineContentVersions.findMany({ where: eq(lineContentVersions.itemId, parsedId.data), orderBy: [desc(lineContentVersions.version), desc(lineContentVersions.createdAt)], limit: 50 });
    return { success: true as const, versions: versions.map((version) => ({ id: version.id, version: version.version, state: version.state, createdAt: version.createdAt.toISOString(), createdByUserId: version.createdByUserId })) };
  } catch (error: unknown) {
    if (!isMissingContentSchemaError(error)) console.error("Failed to load LINE content history:", error);
    return { success: false as const, versions: [], error: "Content history is not available." };
  }
}

export type LineContentUsageReference = {
  kind: "automation" | "difyFallback";
  id: string;
  label: string;
  status: string;
};

function referencesContent(config: unknown, contentId: string) {
  const parsed = lineAutomationRuleConfigSchema.safeParse(config);
  return parsed.success && parsed.data.actions.some((action) => action.type === "sendContent" && action.contentId === contentId);
}

export async function getLineContentUsageReferences(id: string) {
  try {
    await requireAdminPermission(ADMIN_PERMISSIONS.lineContentView);
    const parsedId = z.string().uuid().safeParse(id);
    if (!parsedId.success) return { success: false as const, references: [] as LineContentUsageReference[], error: "Invalid content ID." };
    const [rules, integrations] = await Promise.all([
      db.query.lineAutomationRules.findMany({ orderBy: [desc(lineAutomationRules.updatedAt)], limit: 200 }),
      db.query.difyIntegrations.findMany({ orderBy: [desc(difyIntegrations.updatedAt)], limit: 100 }),
    ]);
    const references: LineContentUsageReference[] = [
      ...rules
        .filter((rule) => referencesContent(rule.draftConfig, parsedId.data) || referencesContent(rule.publishedConfig, parsedId.data))
        .map((rule) => ({ kind: "automation" as const, id: rule.id, label: rule.name, status: rule.status })),
      ...integrations
        .filter((integration) => integration.fallbackContentId === parsedId.data)
        .map((integration) => ({ kind: "difyFallback" as const, id: integration.id, label: integration.name, status: integration.enabled ? "ENABLED" : "DISABLED" })),
    ];
    return { success: true as const, references };
  } catch (error: unknown) {
    if (!isMissingContentSchemaError(error)) console.error("Failed to load LINE content usage references:", error);
    return { success: false as const, references: [] as LineContentUsageReference[], error: "Usage references are not available until the Admin Console migration is applied." };
  }
}
