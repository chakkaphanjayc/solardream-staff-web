"use server";

import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { revalidatePath } from "next/cache";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { lineRichMenuDefinitions, lineRichMenuVersions } from "@/db/schema";
import { ADMIN_PERMISSIONS, requireAdminPermission } from "@/lib/admin-permissions";
import { compileLineRichMenuPayload, lineRichMenuDocumentSchema, RICH_MENU_CANVAS, type LineRichMenuDocument } from "@/lib/lineRichMenuSchema";
import { getLineIntegrationConfig, isLineLiveMutationEnabled, LINE_API_BASE_URL, LINE_DATA_API_BASE_URL, requestLineApi } from "@/lib/lineApi";
import { setDefaultRichMenuForAllUsers } from "@/lib/linePush";
import { recordAuditEventBestEffort } from "@/lib/auditLog";

const MAX_ARTWORK_BYTES = 10 * 1024 * 1024;
const artworkInputSchema = z.object({
  id: z.string().uuid().optional(),
  internalName: z.string().trim().min(1).max(120),
  audience: z.string().trim().min(1).max(80),
  isDefault: z.boolean(),
  artworkUrl: z.string().url().max(2048).nullable().optional(),
  document: lineRichMenuDocumentSchema,
  expectedRowVersion: z.number().int().min(1).optional(),
});

export type LineRichMenuDefinitionDto = {
  id: string;
  internalName: string;
  audience: string;
  isDefault: boolean;
  status: "DRAFT" | "PUBLISHED" | "SCHEDULED" | "ARCHIVED";
  artworkUrl: string | null;
  draftDocument: LineRichMenuDocument;
  publishedDocument: LineRichMenuDocument | null;
  lineRichMenuId: string | null;
  previousLineRichMenuId: string | null;
  draftVersion: number;
  publishedVersion: number | null;
  rowVersion: number;
  updatedAt: string;
};

function isMissingRichMenuSchemaError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("line_rich_menu_definitions") || message.includes("DATABASE_URL is not set");
}

function normalizeDefinition(row: typeof lineRichMenuDefinitions.$inferSelect): LineRichMenuDefinitionDto | null {
  const draft = lineRichMenuDocumentSchema.safeParse(row.draftDocument);
  const published = row.publishedDocument === null ? { success: true as const, data: null } : lineRichMenuDocumentSchema.safeParse(row.publishedDocument);
  const status = row.status === "DRAFT" || row.status === "PUBLISHED" || row.status === "SCHEDULED" || row.status === "ARCHIVED" ? row.status : null;
  if (!draft.success || (!published.success && row.publishedDocument !== null) || !status) return null;
  return { id: row.id, internalName: row.internalName, audience: row.audience, isDefault: row.isDefault, status, artworkUrl: row.artworkUrl, draftDocument: draft.data, publishedDocument: published.success ? published.data : null, lineRichMenuId: row.lineRichMenuId, previousLineRichMenuId: row.previousLineRichMenuId, draftVersion: row.draftVersion, publishedVersion: row.publishedVersion, rowVersion: row.rowVersion, updatedAt: row.updatedAt.toISOString() };
}

export async function listLineRichMenuDefinitions() {
  try {
    await requireAdminPermission(ADMIN_PERMISSIONS.lineRichMenuView);
    const rows = await db.query.lineRichMenuDefinitions.findMany({ orderBy: [desc(lineRichMenuDefinitions.updatedAt)], limit: 100 });
    return { success: true as const, definitions: rows.map(normalizeDefinition).filter((definition): definition is LineRichMenuDefinitionDto => Boolean(definition)) };
  } catch (error: unknown) {
    if (!isMissingRichMenuSchemaError(error)) console.error("Failed to list LINE Rich Menu definitions:", error);
    return { success: false as const, definitions: [] as LineRichMenuDefinitionDto[], error: "Rich Menu builder is not available. Apply the Admin Console migration and try again." };
  }
}

export async function uploadLineRichMenuArtwork(formData: FormData) {
  try {
    await requireAdminPermission(ADMIN_PERMISSIONS.lineRichMenuEdit);
    const file = formData.get("file");
    if (!(file instanceof File)) return { success: false as const, error: "Choose a Rich Menu artwork file." };
    if (file.size > MAX_ARTWORK_BYTES) return { success: false as const, error: "Artwork must be 10 MB or smaller." };
    const { validateUploadFile } = await import("@/lib/fileValidation");
    const validated = await validateUploadFile({ file, allowedKinds: ["jpeg", "png", "webp"], fallbackName: "rich-menu-artwork", maxBytes: MAX_ARTWORK_BYTES });
    const bytes = Buffer.from(await file.arrayBuffer());
    const metadata = await sharp(bytes).metadata();
    if (!metadata.width || !metadata.height) return { success: false as const, error: "Artwork dimensions could not be read." };
    const aspect = metadata.width / metadata.height;
    const expectedAspect = RICH_MENU_CANVAS.width / RICH_MENU_CANVAS.height;
    if (Math.abs(aspect - expectedAspect) > 0.02) return { success: false as const, error: `Crop artwork to the LINE Rich Menu ratio ${RICH_MENU_CANVAS.width}:${RICH_MENU_CANVAS.height} before uploading.` };
    const { createAdminClient } = await import("@/utils/supabase/server");
    const storagePath = `rich-menu-builder/${randomUUID()}.${validated.extension}`;
    const storage = createAdminClient();
    const upload = await storage.storage.from("proposals").upload(storagePath, bytes, { contentType: validated.contentType, cacheControl: "31536000", upsert: false });
    if (upload.error) return { success: false as const, error: "Artwork could not be stored." };
    const { data: publicData } = storage.storage.from("proposals").getPublicUrl(storagePath);
    return { success: true as const, url: publicData.publicUrl, fileName: validated.safeFileName, width: metadata.width, height: metadata.height };
  } catch (error: unknown) {
    console.error("Failed to upload LINE Rich Menu artwork:", error instanceof Error ? error.message : "Unknown upload error");
    return { success: false as const, error: "Artwork could not be uploaded." };
  }
}

export async function saveLineRichMenuDraft(input: unknown) {
  try {
    const actor = await requireAdminPermission(ADMIN_PERMISSIONS.lineRichMenuEdit);
    const parsed = artworkInputSchema.safeParse(input);
    if (!parsed.success) return { success: false as const, error: parsed.error.issues[0]?.message || "Invalid Rich Menu draft." };
    const values = parsed.data;
    const row = await db.transaction(async (tx) => {
      const existing = values.id ? await tx.query.lineRichMenuDefinitions.findFirst({ where: eq(lineRichMenuDefinitions.id, values.id) }) : null;
      if (values.id && !existing) throw new Error("Rich Menu definition not found.");
      if (existing && values.expectedRowVersion !== undefined && existing.rowVersion !== values.expectedRowVersion) throw new Error("This Rich Menu changed in another tab. Reload it before saving.");
      if (values.isDefault) {
        await tx.update(lineRichMenuDefinitions).set({ isDefault: false, rowVersion: sql`${lineRichMenuDefinitions.rowVersion} + 1`, updatedByUserId: actor.id }).where(values.id ? and(eq(lineRichMenuDefinitions.isDefault, true), ne(lineRichMenuDefinitions.id, values.id)) : eq(lineRichMenuDefinitions.isDefault, true));
      }
      if (existing) {
        const [updated] = await tx.update(lineRichMenuDefinitions).set({ internalName: values.internalName, audience: values.audience, isDefault: values.isDefault, status: "DRAFT", artworkUrl: values.artworkUrl ?? null, draftDocument: values.document, draftVersion: existing.draftVersion + 1, rowVersion: existing.rowVersion + 1, updatedByUserId: actor.id }).where(and(eq(lineRichMenuDefinitions.id, existing.id), eq(lineRichMenuDefinitions.rowVersion, existing.rowVersion))).returning();
        if (!updated) throw new Error("The Rich Menu changed before it could be saved.");
        await tx.insert(lineRichMenuVersions).values({ definitionId: updated.id, version: updated.draftVersion, state: "DRAFT", document: values.document, artworkUrl: values.artworkUrl ?? null, createdByUserId: actor.id });
        return updated;
      }
      const [created] = await tx.insert(lineRichMenuDefinitions).values({ internalName: values.internalName, audience: values.audience, isDefault: values.isDefault, status: "DRAFT", artworkUrl: values.artworkUrl ?? null, draftDocument: values.document, draftVersion: 1, rowVersion: 1, createdByUserId: actor.id, updatedByUserId: actor.id }).returning();
      if (!created) throw new Error("The Rich Menu draft could not be created.");
      await tx.insert(lineRichMenuVersions).values({ definitionId: created.id, version: 1, state: "DRAFT", document: values.document, artworkUrl: values.artworkUrl ?? null, createdByUserId: actor.id });
      return created;
    });
    const definition = normalizeDefinition(row);
    await recordAuditEventBestEffort({ actorUserId: actor.id, actorType: "ADMIN", action: values.id ? "UPDATE_LINE_RICH_MENU_DRAFT" : "CREATE_LINE_RICH_MENU_DRAFT", resourceType: "LINE_RICH_MENU", resourceId: row.id, metadata: { audience: values.audience, version: row.draftVersion } });
    revalidatePath("/en/admin/line/rich-menu");
    revalidatePath("/th/admin/line/rich-menu");
    return definition ? { success: true as const, definition } : { success: false as const, error: "Saved Rich Menu has an invalid schema." };
  } catch (error: unknown) {
    if (!isMissingRichMenuSchemaError(error)) console.error("Failed to save LINE Rich Menu draft:", error);
    return { success: false as const, error: error instanceof Error ? error.message : "Could not save Rich Menu draft." };
  }
}

function isAllowedArtworkUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return false;
    const configuredSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseHost = configuredSupabaseUrl ? new URL(configuredSupabaseUrl).hostname.toLowerCase() : "";
    return Boolean(supabaseHost && url.hostname.toLowerCase() === supabaseHost);
  } catch {
    return false;
  }
}

async function fetchArtwork(value: string) {
  if (!isAllowedArtworkUrl(value)) throw new Error("Artwork must be hosted in the configured private storage bucket.");
  const response = await fetch(value, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error("Artwork could not be downloaded from storage.");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > MAX_ARTWORK_BYTES) throw new Error("Artwork is larger than 10 MB.");
  const metadata = await sharp(bytes).metadata();
  if (!metadata.width || !metadata.height) throw new Error("Artwork dimensions could not be read.");
  const aspect = metadata.width / metadata.height;
  if (Math.abs(aspect - RICH_MENU_CANVAS.width / RICH_MENU_CANVAS.height) > 0.02) throw new Error("Artwork does not match the LINE Rich Menu ratio.");
  return sharp(bytes).resize(RICH_MENU_CANVAS.width, RICH_MENU_CANVAS.height, { fit: "cover", position: "center" }).jpeg({ quality: 90, progressive: true }).toBuffer();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function publishLineRichMenu(id: string, expectedRowVersion: number) {
  try {
    const actor = await requireAdminPermission(ADMIN_PERMISSIONS.lineRichMenuPublish);
    if (!isLineLiveMutationEnabled()) return { success: false as const, error: "Live LINE menu mutations are disabled outside an explicitly enabled production environment." };
    const parsed = z.object({ id: z.string().uuid(), expectedRowVersion: z.number().int().min(1) }).safeParse({ id, expectedRowVersion });
    if (!parsed.success) return { success: false as const, error: "Invalid Rich Menu publication request." };
    const existing = await db.query.lineRichMenuDefinitions.findFirst({ where: eq(lineRichMenuDefinitions.id, parsed.data.id) });
    if (!existing) return { success: false as const, error: "Rich Menu definition not found." };
    if (existing.rowVersion !== parsed.data.expectedRowVersion) return { success: false as const, error: "This Rich Menu changed in another tab. Reload it before publishing." };
    const document = lineRichMenuDocumentSchema.parse(existing.draftDocument);
    if (!existing.artworkUrl) return { success: false as const, error: "Upload artwork before publishing." };
    const artwork = await fetchArtwork(existing.artworkUrl);
    const config = await getLineIntegrationConfig();
    if (!config.accessToken) return { success: false as const, error: "LINE channel access token is not configured." };
    const metadata = await requestLineApi<{ richMenuId?: unknown }>("/v2/bot/richmenu", { method: "POST", body: JSON.stringify(compileLineRichMenuPayload(document)) }, { accessToken: config.accessToken, baseUrl: LINE_API_BASE_URL });
    if (!metadata.success) return { success: false as const, error: metadata.error };
    const metadataRecord = asRecord(metadata.data);
    const lineRichMenuIdValue = metadataRecord.richMenuId;
    const lineRichMenuId = typeof lineRichMenuIdValue === "string" ? lineRichMenuIdValue : "";
    if (!lineRichMenuId) return { success: false as const, error: "LINE did not return a Rich Menu ID." };
    const upload = await fetch(`${LINE_DATA_API_BASE_URL}/v2/bot/richmenu/${encodeURIComponent(lineRichMenuId)}/content`, { method: "POST", headers: { Authorization: `Bearer ${config.accessToken}`, "Content-Type": "image/jpeg" }, body: new Uint8Array(artwork), signal: AbortSignal.timeout(10_000) });
    if (!upload.ok) {
      await requestLineApi(`/v2/bot/richmenu/${encodeURIComponent(lineRichMenuId)}`, { method: "DELETE" }, { accessToken: config.accessToken, baseUrl: LINE_API_BASE_URL });
      return { success: false as const, error: "LINE rejected the Rich Menu artwork. No partial menu was kept." };
    }
    const documentRecord = document as unknown as Record<string, unknown>;
    const [updated] = await db.update(lineRichMenuDefinitions).set({ publishedDocument: documentRecord, publishedVersion: existing.draftVersion, status: "PUBLISHED", previousLineRichMenuId: existing.lineRichMenuId, lineRichMenuId, rowVersion: existing.rowVersion + 1, updatedByUserId: actor.id }).where(and(eq(lineRichMenuDefinitions.id, existing.id), eq(lineRichMenuDefinitions.rowVersion, existing.rowVersion))).returning();
    if (!updated) return { success: false as const, error: "The local Rich Menu changed after LINE accepted the menu. Keep the external ID for reconciliation." };
    await db.insert(lineRichMenuVersions).values({ definitionId: updated.id, version: existing.draftVersion, state: "PUBLISHED", document: documentRecord, artworkUrl: existing.artworkUrl, lineRichMenuId, createdByUserId: actor.id }).onConflictDoNothing();
    await recordAuditEventBestEffort({ actorUserId: actor.id, actorType: "ADMIN", action: "PUBLISH_LINE_RICH_MENU", resourceType: "LINE_RICH_MENU", resourceId: existing.id, metadata: { lineRichMenuId, version: existing.draftVersion, audience: existing.audience } });
    revalidatePath("/en/admin/line/rich-menu");
    revalidatePath("/th/admin/line/rich-menu");
    const definition = normalizeDefinition(updated);
    return definition ? { success: true as const, definition } : { success: false as const, error: "Published Rich Menu could not be read back." };
  } catch (error: unknown) {
    if (!isMissingRichMenuSchemaError(error)) console.error("Failed to publish LINE Rich Menu:", error instanceof Error ? error.message : "Unknown publication error");
    return { success: false as const, error: error instanceof Error ? error.message : "Could not publish Rich Menu." };
  }
}

export async function archiveLineRichMenu(id: string) {
  try {
    const actor = await requireAdminPermission(ADMIN_PERMISSIONS.lineRichMenuEdit);
    const parsed = z.string().uuid().safeParse(id);
    if (!parsed.success) return { success: false as const, error: "Invalid Rich Menu ID." };
    const [updated] = await db.update(lineRichMenuDefinitions).set({ status: "ARCHIVED", rowVersion: sql`${lineRichMenuDefinitions.rowVersion} + 1`, updatedByUserId: actor.id }).where(eq(lineRichMenuDefinitions.id, parsed.data)).returning({ id: lineRichMenuDefinitions.id });
    if (!updated) return { success: false as const, error: "Rich Menu definition not found." };
    await recordAuditEventBestEffort({ actorUserId: actor.id, actorType: "ADMIN", action: "ARCHIVE_LINE_RICH_MENU", resourceType: "LINE_RICH_MENU", resourceId: parsed.data });
    revalidatePath("/en/admin/line/rich-menu");
    revalidatePath("/th/admin/line/rich-menu");
    return { success: true as const };
  } catch (error: unknown) {
    if (!isMissingRichMenuSchemaError(error)) console.error("Failed to archive LINE Rich Menu:", error);
    return { success: false as const, error: error instanceof Error ? error.message : "Could not archive Rich Menu." };
  }
}

export async function rollbackLineRichMenu(id: string, expectedRowVersion: number) {
  try {
    const actor = await requireAdminPermission(ADMIN_PERMISSIONS.lineRichMenuPublish);
    if (!isLineLiveMutationEnabled()) return { success: false as const, error: "Live LINE menu mutations are disabled outside an explicitly enabled production environment." };
    const parsed = z.object({ id: z.string().uuid(), expectedRowVersion: z.number().int().min(1) }).safeParse({ id, expectedRowVersion });
    if (!parsed.success) return { success: false as const, error: "Invalid Rich Menu rollback request." };
    const existing = await db.query.lineRichMenuDefinitions.findFirst({ where: eq(lineRichMenuDefinitions.id, parsed.data.id) });
    if (!existing) return { success: false as const, error: "Rich Menu definition not found." };
    if (existing.rowVersion !== parsed.data.expectedRowVersion) return { success: false as const, error: "This Rich Menu changed in another tab. Reload it before rollback." };
    if (!existing.isDefault) return { success: false as const, error: "Only the reviewed default menu can be rolled back here. Use the audience scheduler for targeted assignments." };
    if (!existing.lineRichMenuId || !existing.previousLineRichMenuId) return { success: false as const, error: "No previous published Rich Menu is available for rollback." };
    const previousVersion = await db.query.lineRichMenuVersions.findFirst({
      where: and(eq(lineRichMenuVersions.definitionId, existing.id), eq(lineRichMenuVersions.lineRichMenuId, existing.previousLineRichMenuId), eq(lineRichMenuVersions.state, "PUBLISHED")),
      orderBy: [desc(lineRichMenuVersions.version)],
    });
    if (!previousVersion) return { success: false as const, error: "The previous Rich Menu revision is not available for reconciliation." };
    const previousDocument = lineRichMenuDocumentSchema.safeParse(previousVersion.document);
    if (!previousDocument.success) return { success: false as const, error: "The previous Rich Menu revision failed validation." };

    const lineResult = await setDefaultRichMenuForAllUsers(existing.previousLineRichMenuId);
    if (!lineResult.success) return { success: false as const, error: lineResult.error || "LINE did not accept the rollback." };
    const [updated] = await db.update(lineRichMenuDefinitions).set({ publishedDocument: previousDocument.data, publishedVersion: previousVersion.version, status: "PUBLISHED", previousLineRichMenuId: existing.lineRichMenuId, lineRichMenuId: existing.previousLineRichMenuId, rowVersion: existing.rowVersion + 1, updatedByUserId: actor.id }).where(and(eq(lineRichMenuDefinitions.id, existing.id), eq(lineRichMenuDefinitions.rowVersion, existing.rowVersion))).returning();
    if (!updated) return { success: false as const, error: "LINE was rolled back, but the local record changed before it could be reconciled." };
    await recordAuditEventBestEffort({ actorUserId: actor.id, actorType: "ADMIN", action: "ROLLBACK_LINE_RICH_MENU", resourceType: "LINE_RICH_MENU", resourceId: existing.id, metadata: { restoredLineRichMenuId: existing.previousLineRichMenuId, replacedLineRichMenuId: existing.lineRichMenuId, version: previousVersion.version } });
    revalidatePath("/en/admin/line/rich-menu");
    revalidatePath("/th/admin/line/rich-menu");
    const definition = normalizeDefinition(updated);
    return definition ? { success: true as const, definition } : { success: false as const, error: "Rolled back Rich Menu could not be read back." };
  } catch (error: unknown) {
    if (!isMissingRichMenuSchemaError(error)) console.error("Failed to roll back LINE Rich Menu:", error instanceof Error ? error.message : "Unknown rollback error");
    return { success: false as const, error: error instanceof Error ? error.message : "Could not roll back Rich Menu." };
  }
}

export async function getLineRichMenuHistory(id: string) {
  try {
    await requireAdminPermission(ADMIN_PERMISSIONS.lineRichMenuView);
    const parsed = z.string().uuid().safeParse(id);
    if (!parsed.success) return { success: false as const, versions: [], error: "Invalid Rich Menu ID." };
    const versions = await db.query.lineRichMenuVersions.findMany({ where: eq(lineRichMenuVersions.definitionId, parsed.data), orderBy: [desc(lineRichMenuVersions.version), desc(lineRichMenuVersions.createdAt)], limit: 50 });
    return { success: true as const, versions: versions.map((version) => ({ id: version.id, version: version.version, state: version.state, lineRichMenuId: version.lineRichMenuId, createdAt: version.createdAt.toISOString() })) };
  } catch (error: unknown) {
    if (!isMissingRichMenuSchemaError(error)) console.error("Failed to load LINE Rich Menu history:", error);
    return { success: false as const, versions: [], error: "Rich Menu history is not available." };
  }
}
