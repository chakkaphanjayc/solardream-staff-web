import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import { installationAuditEvents, installationChecklistItems, installationEvidence } from "@/db/schema";
import { requireTaskMutationAccess } from "@/lib/installationAccess";
import { parseCoordinate } from "@/lib/installationDtos";
import { validateUploadContentLength, validateUploadFile } from "@/lib/fileValidation";
import { publishPortalStateChanged } from "@/lib/portalEvents";
import { enqueueIntegrationEvent } from "@/lib/integrationOutbox";
import { createAdminClient } from "@/utils/supabase/server";
import { getImageInfo, transformImage } from "@/lib/cloudflare-images";

const MAX_BYTES = 12 * 1024 * 1024;
const MAX_DIMENSION = 12_000;
const MAX_PIXELS = 40_000_000;
type EvidenceImageKind = "jpeg" | "png" | "webp" | "heic";

function isEvidenceImageKind(kind: string): kind is EvidenceImageKind {
  return kind === "jpeg" || kind === "png" || kind === "webp" || kind === "heic";
}

async function normalizeEvidence(bytes: Buffer, kind: EvidenceImageKind) {
  const metadata = await getImageInfo(bytes);
  if (!metadata.width || !metadata.height || metadata.width > MAX_DIMENSION || metadata.height > MAX_DIMENSION) throw new Error("Unsupported image dimensions.");
  if (kind === "png") return { bytes: await transformImage(bytes, { format: "png" }), contentType: "image/png", extension: "png" };
  if (kind === "webp") return { bytes: await transformImage(bytes, { format: "webp", quality: 90 }), contentType: "image/webp", extension: "webp" };
  return { bytes: await transformImage(bytes, { format: "jpeg", quality: 92 }), contentType: "image/jpeg", extension: "jpg" };
}

export async function POST(request: NextRequest) {
  try {
    const length = validateUploadContentLength(request.headers, MAX_BYTES + 256 * 1024);
    if (!length.ok) return NextResponse.json({ success: false, error: length.error }, { status: length.status });
    const form = await request.formData();
    const itemId = String(form.get("itemId") || "").trim();
    const idempotencyKey = request.headers.get("idempotency-key")?.trim() || String(form.get("idempotencyKey") || "").trim();
    const file = form.get("file");
    if (!itemId || idempotencyKey.length < 16 || !(file instanceof File)) return NextResponse.json({ success: false, error: "Invalid request." }, { status: 400 });
    const item = await db.query.installationChecklistItems.findFirst({ where: eq(installationChecklistItems.id, itemId) });
    if (!item || item.status === "VERIFIED") return NextResponse.json({ success: false, error: "Checklist item is unavailable." }, { status: 409 });
    const access = await requireTaskMutationAccess(item.taskId);
    if (!access) return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });
    const validated = await validateUploadFile({ file, allowedKinds: ["jpeg", "png", "webp", "heic"], maxBytes: MAX_BYTES, fallbackName: "installation-evidence" });
    const bytes = Buffer.from(await file.arrayBuffer());
    const rawSha256 = createHash("sha256").update(bytes).digest("hex");
    const latitude = parseCoordinate(form.get("latitude"), -90, 90);
    const longitude = parseCoordinate(form.get("longitude"), -180, 180);
    const capturedRaw = String(form.get("capturedAt") || "").trim();
    const capturedAt = capturedRaw ? new Date(capturedRaw) : null;
    if (capturedAt && Number.isNaN(capturedAt.getTime())) throw new Error("Invalid capture time.");
    const quarantinePath = `quarantine/${access.proposalId}/${item.id}/${rawSha256}.${validated.extension}`;
    const storage = createAdminClient();
    const uploaded = await storage.storage.from("installation-evidence").upload(quarantinePath, bytes, { contentType: validated.contentType, upsert: false });
    if (uploaded.error && !uploaded.error.message.toLowerCase().includes("exists")) throw new Error("Evidence storage failed.");
    let quarantined: typeof installationEvidence.$inferSelect;
    try {
      [quarantined] = await db.insert(installationEvidence).values({ checklistItemId: item.id, storageProvider: "SUPABASE_PRIVATE", storageFileId: quarantinePath, contentType: validated.contentType, byteSize: bytes.length, sha256: rawSha256, status: "QUARANTINED", latitude, longitude, capturedAt, uploadedByUserId: access.actor.userId }).onConflictDoUpdate({ target: [installationEvidence.checklistItemId, installationEvidence.sha256], set: { status: "QUARANTINED", storageFileId: quarantinePath } }).returning();
    } catch (error: unknown) {
      await storage.storage.from("installation-evidence").remove([quarantinePath]);
      throw error;
    }
    let normalized: Awaited<ReturnType<typeof normalizeEvidence>>;
    try {
      if (!isEvidenceImageKind(validated.kind)) throw new Error("Unsupported image type.");
      normalized = await normalizeEvidence(bytes, validated.kind);
    } catch {
      await db.update(installationEvidence).set({ status: "REJECTED" }).where(eq(installationEvidence.id, quarantined.id));
      await storage.storage.from("installation-evidence").remove([quarantinePath]);
      const status = validated.kind === "heic" ? 415 : 400;
      return NextResponse.json({ success: false, error: validated.kind === "heic" ? "HEIC decoding is unavailable." : "Image decoding failed." }, { status });
    }
    if (normalized.bytes.length > MAX_BYTES) {
      await db.update(installationEvidence).set({ status: "REJECTED" }).where(eq(installationEvidence.id, quarantined.id));
      await storage.storage.from("installation-evidence").remove([quarantinePath]);
      return NextResponse.json({ success: false, error: "Normalized image is too large." }, { status: 413 });
    }
    const sha256 = createHash("sha256").update(normalized.bytes).digest("hex");
    const readyPath = `ready/${access.proposalId}/${item.id}/${sha256}.${normalized.extension}`;
    const readyUpload = await storage.storage.from("installation-evidence").upload(readyPath, normalized.bytes, { contentType: normalized.contentType, upsert: false });
    if (readyUpload.error && !readyUpload.error.message.toLowerCase().includes("exists")) {
      await db.update(installationEvidence).set({ status: "REJECTED" }).where(eq(installationEvidence.id, quarantined.id));
      await storage.storage.from("installation-evidence").remove([quarantinePath]);
      throw new Error("Normalized evidence storage failed.");
    }
    let evidence: typeof installationEvidence.$inferSelect;
    try {
      [evidence] = await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`installation:evidence:${item.id}:${sha256}`}))`);
        const existing = await tx.query.installationEvidence.findFirst({ where: and(eq(installationEvidence.checklistItemId, item.id), eq(installationEvidence.sha256, sha256)) });
        if (existing && existing.id !== quarantined.id) {
          await tx.delete(installationEvidence).where(eq(installationEvidence.id, quarantined.id));
          return [existing];
        }
        const [ready] = await tx.update(installationEvidence).set({ storageFileId: readyPath, contentType: normalized.contentType, byteSize: normalized.bytes.length, sha256, status: "READY" }).where(eq(installationEvidence.id, quarantined.id)).returning();
        const [auditEvent] = await tx.insert(installationAuditEvents).values({ proposalId: access.proposalId, taskId: item.taskId, checklistItemId: item.id, eventType: "EVIDENCE_READY", actorUserId: access.actor.userId, idempotencyKey, payload: { evidenceId: ready.id, sha256, byteSize: normalized.bytes.length, normalized: true } }).returning({ id: installationAuditEvents.id });
        if (!auditEvent) throw new Error("Evidence audit event could not be created.");
        await enqueueIntegrationEvent(tx, {
          topic: "installation.evidence.ready",
          aggregateType: "INSTALLATION_PROJECT",
          aggregateId: access.proposalId,
          payload: {
            auditEventId: auditEvent.id,
            localTaskId: item.taskId,
            checklistItemId: item.id,
            evidenceId: ready.id,
            storageFileId: readyPath,
            sha256,
            source: "SERVER_UPLOAD",
          },
          dedupeKey: `installation.evidence.ready:${idempotencyKey}`,
        });
        return [ready];
      });
    } catch (error: unknown) {
      await db.update(installationEvidence).set({ status: "REJECTED" }).where(eq(installationEvidence.id, quarantined.id)).catch(() => undefined);
      await storage.storage.from("installation-evidence").remove([quarantinePath, readyPath]);
      throw error;
    }
    await storage.storage.from("installation-evidence").remove([quarantinePath]);
    await publishPortalStateChanged(access.proposalId, "INSTALLATION_EVIDENCE_READY");
    return NextResponse.json({ success: true, evidence: { id: evidence.id, sha256: evidence.sha256, status: evidence.status } });
  } catch (error: unknown) {
    console.error("[Installation Evidence]", error);
    return NextResponse.json({ success: false, error: "Evidence upload failed." }, { status: 400 });
  }
}
