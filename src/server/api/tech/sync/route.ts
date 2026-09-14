import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { validateUploadContentLength } from "@/lib/fileValidation";
import { getTechnicianTaskAccess } from "@/lib/techPortalAccess";
import {
  completeTechnicianHandover,
  completeTechnicianQc,
  getTechPortalFailure,
  getTechnicianAccessError,
  startTechnicianJob,
  uploadTechnicianEvidence,
} from "@/lib/techPortal";
import { registerInstalledAsset } from "@/server/services/ops-v2/asset-warranty-service";
import { requireOpsV2Feature } from "@/server/services/ops-v2/api-response";
import {
  handoverSchema,
  qcCompleteSchema,
  startJobSchema,
  technicianGpsSchema,
  techIdempotencyKeySchema,
  techPhaseSchema,
  techTaskIdSchema,
} from "@/lib/techPortalDtos";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const syncTypeSchema = z.enum([
  "JOB_STARTED",
  "QC_EVIDENCE_UPLOADED",
  "QC_PHASE_COMPLETED",
  "HANDOVER_CAPTURED",
  "ASSET_REGISTERED",
]);

const syncEnvelopeSchema = z.object({
  type: syncTypeSchema,
  operationId: techIdempotencyKeySchema,
  taskId: techTaskIdSchema,
  fieldVisitId: techTaskIdSchema.nullable().optional(),
  payload: z.unknown(),
});

const evidenceSyncPayloadSchema = z.object({
  taskId: techTaskIdSchema,
  phase: techPhaseSchema,
  gps: technicianGpsSchema,
  capturedAt: z.string().trim().min(1).max(80).refine((value) => Number.isFinite(Date.parse(value)), "A valid capture timestamp is required."),
});

const assetSyncPayloadSchema = z.object({
  taskId: techTaskIdSchema,
  projectId: techTaskIdSchema,
  productName: z.string().trim().min(1).max(240),
  serialNumber: z.string().trim().min(2).max(160),
  catalogProductId: z.string().trim().max(160).optional().nullable(),
  verificationStatus: z.enum(["VERIFIED", "UNVERIFIED"]).optional(),
  productWarrantyProvider: z.string().trim().max(160).optional().nullable(),
  productWarrantyMonths: z.number().int().min(1).max(240).optional().nullable(),
});

class TechSyncValidationError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = "TechSyncValidationError";
  }
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function parseEnvelope(value: unknown) {
  const parsed = syncEnvelopeSchema.safeParse(value);
  if (!parsed.success) throw new TechSyncValidationError("The offline sync envelope is invalid.");
  return parsed.data;
}

async function getAccess(taskId: string, statuses: readonly string[], fieldVisitId?: string | null) {
  const accessResult = await getTechnicianTaskAccess(taskId, statuses, fieldVisitId || undefined);
  if (accessResult.kind !== "OK") {
    const failure = getTechnicianAccessError(accessResult);
    throw Object.assign(new Error(failure?.error || "Technician access denied."), {
      status: failure?.status || 403,
    });
  }
  return accessResult.access;
}

export async function POST(request: NextRequest) {
  const isMultipart = request.headers.get("content-type")?.toLowerCase().includes("multipart/form-data") === true;
  if (isMultipart) {
    const contentLength = validateUploadContentLength(request.headers, MAX_UPLOAD_BYTES + 768 * 1024);
    if (!contentLength.ok) {
      return NextResponse.json({ success: false, error: contentLength.error }, { status: contentLength.status });
    }
  }

  try {
    let envelope: ReturnType<typeof parseEnvelope>;
    let file: File | null = null;

    if (isMultipart) {
      const form = await request.formData();
      const rawEnvelope = String(form.get("operation") || "");
      try {
        envelope = parseEnvelope(JSON.parse(rawEnvelope));
      } catch (error: unknown) {
        if (error instanceof TechSyncValidationError) throw error;
        throw new TechSyncValidationError("The offline sync envelope is invalid.");
      }
      const candidate = form.get("file");
      file = candidate instanceof File ? candidate : null;
    } else {
      envelope = parseEnvelope(await request.json().catch(() => null));
    }

    if (envelope.type === "ASSET_REGISTERED") {
      const fieldFeatureResponse = await requireOpsV2Feature("OPS_V2_FIELD");
      if (fieldFeatureResponse) return fieldFeatureResponse;
      const assetFeatureResponse = await requireOpsV2Feature("OPS_V2_ASSETS");
      if (assetFeatureResponse) return assetFeatureResponse;
    }

    if (envelope.type === "JOB_STARTED") {
      const parsed = startJobSchema.safeParse({
        ...asRecord(envelope.payload),
        taskId: envelope.taskId,
        idempotencyKey: envelope.operationId,
        source: "PWA_OFFLINE",
      });
      if (!parsed.success) return NextResponse.json({ success: false, error: "The offline start-job payload is invalid." }, { status: 400 });
      const access = await getAccess(envelope.taskId, ["OPEN", "IN_PROGRESS"], envelope.fieldVisitId);
      const result = await startTechnicianJob({
        access,
        checks: parsed.data.checks,
        preflightVersion: parsed.data.preflightVersion,
        gps: parsed.data.gps,
        idempotencyKey: envelope.operationId,
        source: "PWA_OFFLINE",
      });
      return NextResponse.json({ success: true, synced: true, operationId: envelope.operationId, result }, { headers: { "Cache-Control": "no-store" } });
    }

    if (envelope.type === "QC_EVIDENCE_UPLOADED") {
      if (!file) return NextResponse.json({ success: false, error: "An offline QC image is required." }, { status: 400 });
      const parsed = evidenceSyncPayloadSchema.safeParse({ ...asRecord(envelope.payload), taskId: envelope.taskId });
      if (!parsed.success) return NextResponse.json({ success: false, error: "The offline QC evidence payload is invalid." }, { status: 400 });
      const access = await getAccess(envelope.taskId, ["IN_PROGRESS"], envelope.fieldVisitId);
      const result = await uploadTechnicianEvidence({
        access,
        phase: parsed.data.phase,
        idempotencyKey: envelope.operationId,
        file,
        gps: parsed.data.gps,
        source: "PWA_OFFLINE",
      });
      return NextResponse.json({ success: true, synced: true, operationId: envelope.operationId, result }, { headers: { "Cache-Control": "no-store" } });
    }

    if (envelope.type === "QC_PHASE_COMPLETED") {
      const parsed = qcCompleteSchema.safeParse({
        ...asRecord(envelope.payload),
        taskId: envelope.taskId,
        idempotencyKey: envelope.operationId,
        source: "PWA_OFFLINE",
      });
      if (!parsed.success) return NextResponse.json({ success: false, error: "The offline QC completion payload is invalid." }, { status: 400 });
      const access = await getAccess(envelope.taskId, ["IN_PROGRESS"], envelope.fieldVisitId);
      const result = await completeTechnicianQc({
        access,
        phase: parsed.data.phase,
        testValues: parsed.data.testValues,
        evidenceIds: parsed.data.evidenceIds,
        idempotencyKey: envelope.operationId,
        source: "PWA_OFFLINE",
      });
      return NextResponse.json({ success: true, synced: true, operationId: envelope.operationId, result }, { headers: { "Cache-Control": "no-store" } });
    }

    if (envelope.type === "ASSET_REGISTERED") {
      const parsed = assetSyncPayloadSchema.safeParse({
        ...asRecord(envelope.payload),
        taskId: envelope.taskId,
      });
      if (!parsed.success) return NextResponse.json({ success: false, error: "The offline asset payload is invalid." }, { status: 400 });
      const access = await getAccess(envelope.taskId, ["IN_PROGRESS", "COMPLETED"], envelope.fieldVisitId);
      if (parsed.data.projectId !== access.project.id) {
        return NextResponse.json({ success: false, error: "The asset project does not match the assigned visit." }, { status: 409 });
      }
      const result = await registerInstalledAsset(access.actor, {
        ...parsed.data,
        projectId: access.project.id,
        idempotencyKey: envelope.operationId,
      });
      return NextResponse.json({ success: true, synced: true, operationId: envelope.operationId, result }, { headers: { "Cache-Control": "no-store" } });
    }

    const parsed = handoverSchema.safeParse({
      ...asRecord(envelope.payload),
      taskId: envelope.taskId,
      idempotencyKey: envelope.operationId,
      source: "PWA_OFFLINE",
    });
    if (!parsed.success) return NextResponse.json({ success: false, error: "The offline handover payload is invalid." }, { status: 400 });
    const access = await getAccess(envelope.taskId, ["IN_PROGRESS", "COMPLETED"], envelope.fieldVisitId);
    const result = await completeTechnicianHandover({
      access,
      signatureBase64: parsed.data.signatureBase64,
      gps: parsed.data.gps,
      notes: parsed.data.notes,
      idempotencyKey: envelope.operationId,
      requestHeaders: request.headers,
      source: "PWA_OFFLINE",
    });
    return NextResponse.json({ success: true, synced: true, operationId: envelope.operationId, result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    const status = error && typeof error === "object" && typeof (error as { status?: unknown }).status === "number"
      ? (error as { status: number }).status
      : undefined;
    if (status) return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Technician access denied." }, { status });
    console.error("[Technician Portal Sync] Failed to replay offline operation.", error);
    const failure = getTechPortalFailure(error, "The offline operation could not be synchronized.");
    return NextResponse.json({ success: false, error: failure.error }, { status: failure.status });
  }
}
