import "server-only";

import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { and, asc, eq, inArray, isNull, notInArray, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  installationAuditEvents,
  installationChecklistItems,
  installationEvidence,
  installationJobTickets,
  installationTasks,
  installationWorkflowProjects,
  fieldVisits,
  jobAssignments,
  proposals,
  users,
} from "@/db/schema";
import { getOrCreateDriveFolder, getOrCreateQuotationDeliveryDriveHierarchy, uploadBufferToDriveFolder } from "@/lib/googleDrive";
import { generateProjectHandoverPdf } from "@/lib/handoverPdfGenerator";
import { publishPortalStateChanged } from "@/lib/portalEvents";
import { broadcastEvent } from "@/lib/sse-publisher";
import { validateUploadFile } from "@/lib/fileValidation";
import { ZodError } from "zod";
import { enqueueIntegrationEvent } from "@/lib/integrationOutbox";
import { isOpsProjectStateAtLeast } from "@/lib/opsV2State";
import { sendConfiguredTemplateEmail } from "@/lib/email";
import { getPreferredTaskCodesForVisitType, getTechnicianTaskAccess, type TechnicianTaskAccess } from "@/lib/techPortalAccess";
import { canReviewInstallation, type InstallationActor } from "@/lib/installationAccess";
import {
  INSTALLATION_FIELD_STAGES,
  LEGACY_TECH_PORTAL_PHASES,
  TECH_PRE_FLIGHT_CHECKS,
  TECH_PRE_FLIGHT_VERSION,
  type TechDashboardTask,
  type TechPhaseState,
  type TechPortalPhaseDefinition,
  type TechPortalPhaseCode,
  type TechOperationSource,
  type TechnicianGps,
  type TechTaskState,
  type TechTestValues,
} from "@/types/techPortal";

type JsonRecord = Record<string, unknown>;

export class TechPortalError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "TechPortalError";
  }
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function getText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function getNullableNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getIsoDate(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function getProposalConfig(proposal: typeof proposals.$inferSelect) {
  return asRecord(proposal.configurationData);
}

function getInstallationAddress(proposal: typeof proposals.$inferSelect) {
  const config = getProposalConfig(proposal);
  return getText(proposal.installationMapAddress)
    || getText(config.installationMapAddress)
    || getText(config.installationAddress)
    || getText(config.address)
    || getText(config.location)
    || "Customer site location";
}

function getInstallationCoordinates(proposal: typeof proposals.$inferSelect) {
  const config = getProposalConfig(proposal);
  const latitude = getNullableNumber(proposal.installationLatitude ?? config.latitude ?? config.lat);
  const longitude = getNullableNumber(proposal.installationLongitude ?? config.longitude ?? config.lng);
  return latitude !== null && longitude !== null ? { latitude, longitude } : null;
}

function getMapsUrl(proposal: typeof proposals.$inferSelect) {
  const coordinates = getInstallationCoordinates(proposal);
  if (!coordinates) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${coordinates.latitude},${coordinates.longitude}`)}`;
}

function getCustomerName(customer: typeof users.$inferSelect) {
  return getText(customer.fullName) || getText(customer.name) || getText(customer.email) || "Customer";
}

function getPhaseDefinition(phase: TechPortalPhaseCode) {
  const definition = [...INSTALLATION_FIELD_STAGES, ...LEGACY_TECH_PORTAL_PHASES]
    .find((candidate) => candidate.code === phase);
  if (!definition) throw new TechPortalError("Installation phase is not supported.", 400);
  return definition;
}

function getTaskPhaseDefinitions(sourceVersion: number) {
  return sourceVersion >= 2 ? INSTALLATION_FIELD_STAGES : LEGACY_TECH_PORTAL_PHASES;
}

function getEventPayload(event: typeof installationAuditEvents.$inferSelect | null | undefined) {
  return asRecord(event?.payload);
}

function getPhaseEvent(events: typeof installationAuditEvents.$inferSelect[], phase: TechPortalPhaseCode) {
  return events.find((event) => {
    if (event.eventType !== "QC_PHASE_COMPLETED") return false;
    const payload = getEventPayload(event);
    return getText(payload.phase) === phase;
  }) || null;
}

function getEvidenceUrl(
  evidence: typeof installationEvidence.$inferSelect,
  events: typeof installationAuditEvents.$inferSelect[],
) {
  if (evidence.storageProvider === "GOOGLE_DRIVE") {
    return evidence.storageFileId.startsWith("http")
      ? evidence.storageFileId
      : `https://drive.google.com/file/d/${encodeURIComponent(evidence.storageFileId)}/preview`;
  }
  const event = events.find((candidate) => {
    if (candidate.eventType !== "TECH_EVIDENCE_UPLOADED") return false;
    return getText(getEventPayload(candidate).evidenceId) === evidence.id;
  });
  return getText(getEventPayload(event).fileUrl) || null;
}

async function ensureTechChecklistItems(taskId: string, phaseDefinitions: readonly TechPortalPhaseDefinition[]) {
  const existing = await db.query.installationChecklistItems.findMany({
    where: eq(installationChecklistItems.taskId, taskId),
    orderBy: [asc(installationChecklistItems.sequence)],
  });
  const missing = phaseDefinitions.filter((phase) => !existing.some((item) =>
    item.itemCode === phase.itemCode || phase.aliases.includes(item.itemCode),
  ));
  if (missing.length > 0) {
    await db.insert(installationChecklistItems).values(missing.map((phase) => ({
      taskId,
      itemCode: phase.itemCode,
      label: phase.title,
      sequence: phase.sequence,
      required: true,
      evidenceRequired: phase.evidenceRequired,
      allowsNa: false,
      status: "OPEN",
    }))).onConflictDoNothing({
      target: [installationChecklistItems.taskId, installationChecklistItems.itemCode],
    });
  }
  return db.query.installationChecklistItems.findMany({
    where: eq(installationChecklistItems.taskId, taskId),
    orderBy: [asc(installationChecklistItems.sequence)],
  });
}

async function getTaskAuditEvents(taskId: string) {
  return db.query.installationAuditEvents.findMany({
    where: eq(installationAuditEvents.taskId, taskId),
    orderBy: [asc(installationAuditEvents.occurredAt)],
  });
}

async function getIdempotencyEvent(taskId: string, idempotencyKey: string, expectedEventType: string) {
  const existing = await db.query.installationAuditEvents.findFirst({
    where: eq(installationAuditEvents.idempotencyKey, idempotencyKey),
  });
  if (!existing) return null;
  if (existing.taskId !== taskId || existing.eventType !== expectedEventType) {
    throw new TechPortalError("This idempotency key has already been used for another operation.", 409);
  }
  return existing;
}

function parseGpsPayload(value: unknown): TechnicianGps | null {
  const payload = asRecord(value);
  const latitude = getNullableNumber(payload.latitude);
  const longitude = getNullableNumber(payload.longitude);
  if (latitude === null || longitude === null) return null;
  const accuracy = getNullableNumber(payload.accuracy);
  return {
    latitude,
    longitude,
    ...(accuracy === null ? {} : { accuracy }),
    capturedAt: getText(payload.capturedAt) || new Date().toISOString(),
  };
}

function getStringBooleanRecord(value: unknown) {
  const record = asRecord(value);
  return Object.fromEntries(Object.entries(record).map(([key, item]) => [key, item === true])) as Record<string, boolean>;
}

function getTestValues(value: unknown): TechTestValues {
  const record = asRecord(value);
  return Object.fromEntries(Object.entries(record).filter(([, item]) =>
    typeof item === "string" || typeof item === "number" || typeof item === "boolean",
  )) as TechTestValues;
}

function getPhaseState(
  phase: TechPortalPhaseDefinition,
  items: typeof installationChecklistItems.$inferSelect[],
  evidenceByItem: Map<string, (typeof installationEvidence.$inferSelect)[]>,
  events: typeof installationAuditEvents.$inferSelect[],
): TechPhaseState {
  const item = items.find((candidate) => candidate.itemCode === phase.itemCode || phase.aliases.includes(candidate.itemCode));
  if (!item) throw new TechPortalError(`Checklist item for ${phase.title} is unavailable.`, 500);
  const evidence = evidenceByItem.get(item.id) || [];
  const phaseEvent = getPhaseEvent(events, phase.code);
  const payload = getEventPayload(phaseEvent);
  return {
    code: phase.code,
    title: phase.title,
    checklistItemId: item.id,
    evidenceRequired: phase.evidenceRequired,
    evidenceReady: evidence.some((candidate) => candidate.status === "READY"),
    evidence: evidence.map((candidate) => ({
      id: candidate.id,
      status: candidate.status,
      sha256: candidate.sha256,
      byteSize: candidate.byteSize,
      contentType: candidate.contentType,
      capturedAt: getIsoDate(candidate.capturedAt),
      fileUrl: getEvidenceUrl(candidate, events),
    })),
    completed: Boolean(phaseEvent),
    completedAt: getIsoDate(phaseEvent?.occurredAt),
    qualityInspectionId: getText(payload.qualityInspectionId) || item.erpnextQualityInspectionId || null,
    testValues: getTestValues(payload.testValues),
  };
}

export async function loadTechnicianTaskState(access: TechnicianTaskAccess): Promise<TechTaskState> {
  const phaseDefinitions = getTaskPhaseDefinitions(access.project.sourceVersion);
  const [items, events] = await Promise.all([
    ensureTechChecklistItems(access.task.id, phaseDefinitions),
    getTaskAuditEvents(access.task.id),
  ]);
  const evidenceRows = items.length > 0
    ? await db.query.installationEvidence.findMany({
      where: inArray(installationEvidence.checklistItemId, items.map((item) => item.id)),
    })
    : [];
  const evidenceByItem = new Map<string, (typeof installationEvidence.$inferSelect)[]>();
  for (const evidence of evidenceRows) {
    const current = evidenceByItem.get(evidence.checklistItemId) || [];
    current.push(evidence);
    evidenceByItem.set(evidence.checklistItemId, current);
  }
  const preflightEvent = events.find((event) => event.eventType === "JOB_STARTED") || null;
  const preflightPayload = getEventPayload(preflightEvent);
  const handoverEvent = events.find((event) => event.eventType === "HANDOVER_COMPLETED") || null;
  const handoverPayload = getEventPayload(handoverEvent);
  const coordinates = getInstallationCoordinates(access.proposal);

  return {
    taskId: access.task.id,
    projectId: access.project.id,
    fieldVisitId: access.fieldVisitId,
    erpnextTaskId: access.task.erpnextTaskId,
    projectCode: access.project.projectCode,
    taskCode: access.task.taskCode,
    title: access.task.title,
    status: access.task.status,
    erpnextSync: {
      projectStatus: access.project.erpnextSyncStatus,
      taskStatus: access.task.erpnextSyncStatus,
      error: access.task.erpnextSyncError || access.project.erpnextSyncError || null,
      lastSyncedAt: getIsoDate(access.task.erpnextLastSyncedAt || access.project.lastSyncedAt),
    },
    permit: {
      status: access.project.permitStatus,
      authority: access.project.permitAuthority,
      applicationNumber: access.project.permitApplicationNumber,
      submittedAt: getIsoDate(access.project.permitSubmittedAt),
      approvedAt: getIsoDate(access.project.permitApprovedAt),
    },
    customer: {
      name: getCustomerName(access.customer),
      email: access.customer.email,
      phone: access.customer.phoneNumber,
      address: getInstallationAddress(access.proposal),
      mapsUrl: getMapsUrl(access.proposal),
    },
    phases: phaseDefinitions.map((phase) => getPhaseState(phase, items, evidenceByItem, events)),
    preflight: preflightEvent ? {
      version: getText(preflightPayload.version) || TECH_PRE_FLIGHT_VERSION,
      checks: getStringBooleanRecord(preflightPayload.checks),
      timesheetId: access.task.erpnextTimesheetId || getText(preflightPayload.timesheetId) || null,
      gps: parseGpsPayload(preflightPayload.gps) || (coordinates ? { ...coordinates, capturedAt: preflightEvent.occurredAt.toISOString() } : null),
      startedAt: preflightEvent.occurredAt.toISOString(),
    } : null,
    handover: handoverEvent ? {
      completedAt: handoverEvent.occurredAt.toISOString(),
      pdfUrl: getText(handoverPayload.drivePdfUrl) || getText(handoverPayload.erpFileUrl) || null,
      sha256: getText(handoverPayload.sha256) || null,
    } : null,
  };
}

function getLocalDateKey(date: Date, timeZone = process.env.SOLARDREAM_TIME_ZONE?.trim() || "Asia/Bangkok") {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

export async function loadTechnicianDashboard(actor: InstallationActor): Promise<{ date: string; cacheScope: string; readOnly: boolean; tasks: TechDashboardTask[] }> {
  const today = getLocalDateKey(new Date());
  const readOnly = canReviewInstallation(actor);
  const canonicalAssignmentRows = !readOnly
    ? await db.select({
      taskId: jobAssignments.taskId,
      fieldVisitId: jobAssignments.visitId,
      projectId: fieldVisits.projectId,
      visitType: fieldVisits.visitType,
    })
      .from(jobAssignments)
      .innerJoin(fieldVisits, eq(jobAssignments.visitId, fieldVisits.id))
      .where(and(
        eq(jobAssignments.assigneeUserId, actor.userId),
        inArray(jobAssignments.status, ["ASSIGNED", "ACCEPTED", "IN_PROGRESS"]),
        inArray(fieldVisits.status, ["PLANNED", "CONFIRMED", "IN_PROGRESS"]),
      ))
    : [];
  const tasklessAssignments = canonicalAssignmentRows.filter((row) => !row.taskId);
  const tasklessProjectIds = [...new Set(tasklessAssignments.map((row) => row.projectId))];
  const tasklessTaskCodes = [...new Set(
    tasklessAssignments.flatMap((row) => getPreferredTaskCodesForVisitType(row.visitType)),
  )];
  const tasklessTasks = tasklessProjectIds.length > 0 && tasklessTaskCodes.length > 0
    ? await db.select({
      id: installationTasks.id,
      projectId: installationTasks.projectId,
      taskCode: installationTasks.taskCode,
    })
      .from(installationTasks)
      .where(and(
        inArray(installationTasks.projectId, tasklessProjectIds),
        inArray(installationTasks.taskCode, tasklessTaskCodes),
        notInArray(installationTasks.status, ["COMPLETED", "CANCELLED"]),
      ))
      .orderBy(asc(installationTasks.sequence), asc(installationTasks.createdAt))
    : [];
  const tasklessTasksByProject = new Map<string, Array<(typeof tasklessTasks)[number]>>();
  for (const task of tasklessTasks) {
    const projectTasks = tasklessTasksByProject.get(task.projectId) || [];
    projectTasks.push(task);
    tasklessTasksByProject.set(task.projectId, projectTasks);
  }
  const resolvedCanonicalRows: Array<{ taskId: string; fieldVisitId: string }> = [];
  for (const row of canonicalAssignmentRows) {
    if (row.taskId && row.fieldVisitId) {
      resolvedCanonicalRows.push({ taskId: row.taskId, fieldVisitId: row.fieldVisitId });
      continue;
    }
    const projectTasks = tasklessTasksByProject.get(row.projectId) || [];
    const task = getPreferredTaskCodesForVisitType(row.visitType)
      .map((taskCode) => projectTasks.find((candidate) => candidate.taskCode === taskCode))
      .find((candidate): candidate is (typeof tasklessTasks)[number] => Boolean(candidate));
    if (task && row.fieldVisitId) resolvedCanonicalRows.push({ taskId: task.id, fieldVisitId: row.fieldVisitId });
  }
  const canonicalTaskIds = [...new Set(resolvedCanonicalRows.map((row) => row.taskId))];
  const fieldVisitByTaskId = new Map<string, string>();
  for (const row of resolvedCanonicalRows) {
    if (!fieldVisitByTaskId.has(row.taskId)) fieldVisitByTaskId.set(row.taskId, row.fieldVisitId);
  }
  const assignedTaskFilter = canonicalTaskIds.length > 0
    ? or(eq(installationTasks.assignedUserId, actor.userId), inArray(installationTasks.id, canonicalTaskIds))
    : eq(installationTasks.assignedUserId, actor.userId);
  const rows = await db.select({
    task: installationTasks,
    project: installationWorkflowProjects,
    proposal: proposals,
    customer: users,
    jobTicket: installationJobTickets,
  })
    .from(installationTasks)
    .innerJoin(installationWorkflowProjects, eq(installationTasks.projectId, installationWorkflowProjects.id))
    .innerJoin(proposals, eq(installationWorkflowProjects.proposalId, proposals.id))
    .innerJoin(users, eq(proposals.userId, users.id))
    .leftJoin(installationJobTickets, eq(installationWorkflowProjects.proposalId, installationJobTickets.quotationId))
    .where(readOnly
      ? notInArray(installationTasks.status, ["COMPLETED", "CANCELLED"])
      : and(
        assignedTaskFilter,
        notInArray(installationTasks.status, ["COMPLETED", "CANCELLED"]),
      ))
    .orderBy(asc(installationTasks.sequence), asc(installationTasks.createdAt));

  const todayRows = rows.filter((row) => {
    if (!row.jobTicket?.scheduledDate) return true;
    return getLocalDateKey(row.jobTicket.scheduledDate) === today;
  });
  const tasks = await Promise.all(todayRows.map(async (row) => {
    const state = await loadTechnicianTaskState({
      ...row,
      actor,
      fieldVisitId: fieldVisitByTaskId.get(row.task.id) || null,
    });
    return {
      ...state,
      scheduledDate: getIsoDate(row.jobTicket?.scheduledDate),
      assignedUserId: row.task.assignedUserId,
      isScheduledToday: Boolean(row.jobTicket?.scheduledDate),
    };
  }));
  return {
    date: today,
    cacheScope: createHash("sha256").update(`solardream-tech-cache:${actor.userId}:${readOnly ? "review" : "assigned"}`).digest("hex"),
    readOnly,
    tasks,
  };
}

function assertPreFlightChecks(checks: Record<string, boolean>) {
  const expectedKeys = TECH_PRE_FLIGHT_CHECKS.map((check) => check.key);
  const actualKeys = Object.keys(checks);
  if (actualKeys.length !== expectedKeys.length || expectedKeys.some((key) => checks[key] !== true)) {
    throw new TechPortalError("Every ISO 45001 pre-flight and inventory check must be completed.", 422);
  }
  if (actualKeys.some((key) => !expectedKeys.includes(key as (typeof expectedKeys)[number]))) {
    throw new TechPortalError("The pre-flight checklist version is not recognized.", 422);
  }
}

function normalizedGps(gps: TechnicianGps) {
  if (!Number.isFinite(gps.latitude) || gps.latitude < -90 || gps.latitude > 90 || !Number.isFinite(gps.longitude) || gps.longitude < -180 || gps.longitude > 180) {
    throw new TechPortalError("Valid technician GPS coordinates are required.", 422);
  }
  return gps;
}

function safeFileSegment(value: string) {
  return value.trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").slice(0, 80) || "task";
}

export async function uploadTechnicianEvidence(input: {
  access: TechnicianTaskAccess;
  phase: TechPortalPhaseCode;
  idempotencyKey: string;
  file: File;
  gps: TechnicianGps;
  source?: TechOperationSource;
}) {
  const existing = await getIdempotencyEvent(input.access.task.id, input.idempotencyKey, "TECH_EVIDENCE_UPLOADED");
  if (existing) {
    const payload = getEventPayload(existing);
    const storedPhase = getText(payload.phase);
    return {
      reused: true,
      evidenceId: getText(payload.evidenceId) || null,
      phase: (storedPhase || input.phase) as TechPortalPhaseCode,
      sha256: getText(payload.sha256) || null,
      fileUrl: getText(payload.fileUrl) || null,
    };
  }
  const state = await loadTechnicianTaskState(input.access);
  const phaseState = state.phases.find((candidate) => candidate.code === input.phase);
  if (!phaseState) throw new TechPortalError("Installation phase is not supported.", 400);
  const gps = normalizedGps(input.gps);
  const source = input.source || "PWA_ONLINE";
  let validated: Awaited<ReturnType<typeof validateUploadFile>>;
  try {
    validated = await validateUploadFile({
      file: input.file,
      allowedKinds: ["jpeg", "png", "webp", "heic"],
      fallbackName: "technician-qc-evidence",
      maxBytes: 10 * 1024 * 1024,
    });
  } catch {
    throw new TechPortalError("The QC image is invalid or exceeds the 10 MB limit.", 400);
  }
  const bytes = Buffer.from(await input.file.arrayBuffer());
  const fileName = [
    "QC",
    safeFileSegment(input.access.project.projectCode),
    safeFileSegment(input.access.task.taskCode),
    input.phase,
    validated.sha256.slice(0, 16),
  ].join("_") + `.${validated.extension}`;
  const hierarchy = await getOrCreateQuotationDeliveryDriveHierarchy(
    input.access.customer.id,
    input.access.project.proposalId,
  );
  const qcFolder = await getOrCreateDriveFolder(
    hierarchy.quotationFolder.folderId,
    `QC_${safeFileSegment(input.access.project.projectCode)}`,
  );
  const uploaded = await uploadBufferToDriveFolder({
    folder: qcFolder,
    fileBuffer: bytes,
    mimeType: validated.contentType,
    fileName,
  });
  const createdAt = new Date();

  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`technician:evidence:${input.access.task.id}:${validated.sha256}`}))`);
    const duplicate = await tx.query.installationAuditEvents.findFirst({ where: eq(installationAuditEvents.idempotencyKey, input.idempotencyKey) });
    if (duplicate) {
      const payload = getEventPayload(duplicate);
      const storedPhase = getText(payload.phase);
      return { reused: true, evidenceId: getText(payload.evidenceId) || null, phase: (storedPhase || input.phase) as TechPortalPhaseCode, sha256: getText(payload.sha256) || null, fileUrl: getText(payload.fileUrl) || null };
    }
    const item = await tx.query.installationChecklistItems.findFirst({ where: eq(installationChecklistItems.id, phaseState.checklistItemId) });
    if (!item) throw new TechPortalError("Checklist item is unavailable.", 409);
    const existingEvidence = await tx.query.installationEvidence.findFirst({
      where: and(eq(installationEvidence.checklistItemId, item.id), eq(installationEvidence.sha256, validated.sha256)),
    });
    const evidence = existingEvidence || (await tx.insert(installationEvidence).values({
      checklistItemId: item.id,
      storageProvider: "GOOGLE_DRIVE",
      storageFileId: uploaded.fileId,
      contentType: validated.contentType,
      byteSize: bytes.length,
      sha256: validated.sha256,
      status: "READY",
      latitude: gps.latitude,
      longitude: gps.longitude,
      capturedAt: new Date(gps.capturedAt),
      uploadedByUserId: input.access.actor.userId,
    }).returning())[0];
    if (!evidence) throw new TechPortalError("Evidence record could not be created.", 500);
    const [auditEvent] = await tx.insert(installationAuditEvents).values({
      proposalId: input.access.project.proposalId,
      taskId: input.access.task.id,
      checklistItemId: item.id,
      eventType: "TECH_EVIDENCE_UPLOADED",
      actorUserId: input.access.actor.userId,
      idempotencyKey: input.idempotencyKey,
      payload: {
        evidenceId: evidence.id,
        phase: input.phase,
        fileId: uploaded.fileId,
        fileUrl: uploaded.fileUrl,
        sha256: evidence.sha256,
        byteSize: evidence.byteSize,
        gps,
        capturedAt: gps.capturedAt,
        source,
      },
      occurredAt: createdAt,
    }).returning({ id: installationAuditEvents.id });
    if (!auditEvent) throw new TechPortalError("Evidence audit event could not be created.", 500);
    await enqueueIntegrationEvent(tx, {
      topic: "installation.evidence.ready",
      aggregateType: "INSTALLATION_PROJECT",
      aggregateId: input.access.project.proposalId,
      payload: {
        auditEventId: auditEvent.id,
        localProjectId: input.access.project.id,
        localTaskId: input.access.task.id,
        evidenceId: evidence.id,
        phase: input.phase,
        fileUrl: uploaded.fileUrl,
        fileId: uploaded.fileId,
        sha256: evidence.sha256,
        source,
      },
      dedupeKey: `installation.evidence.ready:${input.idempotencyKey}`,
    });
    return { reused: false, evidenceId: evidence.id, phase: input.phase, sha256: evidence.sha256, fileUrl: uploaded.fileUrl };
  });
  await publishPortalStateChanged(input.access.project.proposalId, "TECH_QC_EVIDENCE_UPLOADED");
  return result;
}

function normalizeTestValues(phase: TechPortalPhaseCode, values: TechTestValues) {
  const definition = getPhaseDefinition(phase);
  const normalized: TechTestValues = { ...values };
  for (const required of definition.requiredTestValues) {
    const raw = values[required.key];
    if (required.valueType === "text") {
      if (typeof raw !== "string" || raw.trim().length < required.min || raw.trim().length > required.max) {
        throw new TechPortalError(`${required.label} must be between ${required.min} and ${required.max} characters.`, 422);
      }
      normalized[required.key] = raw.trim();
      continue;
    }
    if (raw === undefined || raw === null || raw === "" || typeof raw === "boolean") {
      throw new TechPortalError(`${required.label} is required before this phase can be completed.`, 422);
    }
    const numeric = Number(raw);
    if (!Number.isFinite(numeric) || numeric < required.min || numeric > required.max) {
      throw new TechPortalError(`${required.label} must be between ${required.min} and ${required.max} ${required.unit}.`, 422);
    }
    normalized[required.key] = numeric;
  }
  return normalized;
}

export async function completeTechnicianQc(input: {
  access: TechnicianTaskAccess;
  phase: TechPortalPhaseCode;
  testValues: TechTestValues;
  evidenceIds: string[];
  idempotencyKey: string;
  source?: TechOperationSource;
}) {
  const existing = await getIdempotencyEvent(input.access.task.id, input.idempotencyKey, "QC_PHASE_COMPLETED");
  if (existing) {
    const payload = getEventPayload(existing);
    return {
      reused: true,
      phase: input.phase,
      qualityInspectionId: getText(payload.qualityInspectionId) || null,
      completedAt: existing.occurredAt.toISOString(),
    };
  }
  const state = await loadTechnicianTaskState(input.access);
  const phaseIndex = state.phases.findIndex((candidate) => candidate.code === input.phase);
  const phaseState = state.phases[phaseIndex];
  if (!phaseState) throw new TechPortalError("Installation phase is not supported.", 400);
  if (state.preflight === null) throw new TechPortalError("Complete the JSA and inventory check before QC execution.", 409);
  if (state.phases.slice(0, phaseIndex).some((candidate) => !candidate.completed)) {
    throw new TechPortalError("Complete the previous installation phase first.", 409);
  }
  if (phaseState.completed) throw new TechPortalError("This QC phase has already been completed.", 409);
  const readyEvidence = phaseState.evidence.filter((evidence) => evidence.status === "READY" && phaseState.evidenceReady && (
    input.evidenceIds.length === 0 || input.evidenceIds.includes(evidence.id)
  ));
  if (phaseState.evidenceRequired && readyEvidence.length === 0) {
    throw new TechPortalError("At least one approved QC photo is required for this phase.", 422);
  }
  if (input.evidenceIds.some((id) => !phaseState.evidence.some((evidence) => evidence.id === id))) {
    throw new TechPortalError("One or more QC photos do not belong to this phase.", 422);
  }
  const normalizedValues = normalizeTestValues(input.phase, input.testValues);
  const source = input.source || "PWA_ONLINE";
  const completedAt = new Date();
  const verificationHash = createHash("sha256").update(JSON.stringify({
    phase: input.phase,
    values: normalizedValues,
    evidence: readyEvidence.map((evidence) => evidence.sha256),
  })).digest("hex");
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`technician:qc:${input.access.task.id}:${input.phase}`}))`);
    const duplicate = await tx.query.installationAuditEvents.findFirst({ where: eq(installationAuditEvents.idempotencyKey, input.idempotencyKey) });
    if (duplicate) {
      const payload = getEventPayload(duplicate);
      return { reused: true, phase: input.phase, qualityInspectionId: getText(payload.qualityInspectionId) || null, completedAt: duplicate.occurredAt.toISOString() };
    }
    await tx.update(installationChecklistItems).set({
      status: "VERIFIED",
      outcome: "PASS",
      verifiedAt: completedAt,
      verifiedByUserId: input.access.actor.userId,
      verificationHash,
    }).where(eq(installationChecklistItems.id, phaseState.checklistItemId));
    if (input.phase === "PERMIT_APPLICATION") {
      await tx.update(installationWorkflowProjects).set({
        permitStatus: "SUBMITTED",
        permitAuthority: String(normalizedValues.permitAuthority),
        permitApplicationNumber: String(normalizedValues.permitApplicationNumber),
        permitSubmittedAt: completedAt,
        updatedAt: completedAt,
      }).where(eq(installationWorkflowProjects.id, input.access.project.id));
    }
    const [auditEvent] = await tx.insert(installationAuditEvents).values({
      proposalId: input.access.project.proposalId,
      taskId: input.access.task.id,
      checklistItemId: phaseState.checklistItemId,
      eventType: "QC_PHASE_COMPLETED",
      actorUserId: input.access.actor.userId,
      idempotencyKey: input.idempotencyKey,
      payload: {
        phase: input.phase,
        testValues: normalizedValues,
        evidenceIds: readyEvidence.map((evidence) => evidence.id),
        evidenceHashes: readyEvidence.map((evidence) => evidence.sha256),
        verificationHash,
        source,
      },
      occurredAt: completedAt,
    }).returning({ id: installationAuditEvents.id });
    if (!auditEvent) throw new TechPortalError("QC audit event could not be created.", 500);
    await enqueueIntegrationEvent(tx, {
      topic: "installation.qc.completed",
      aggregateType: "INSTALLATION_PROJECT",
      aggregateId: input.access.project.proposalId,
      payload: {
        auditEventId: auditEvent.id,
        localProjectId: input.access.project.id,
        localTaskId: input.access.task.id,
        checklistItemId: phaseState.checklistItemId,
        phase: input.phase,
        testValues: normalizedValues,
        evidenceIds: readyEvidence.map((evidence) => evidence.id),
        evidenceHashes: readyEvidence.map((evidence) => evidence.sha256),
        source,
      },
      dedupeKey: `installation.qc.completed:${input.idempotencyKey}`,
    });
    return { reused: false, phase: input.phase, qualityInspectionId: null, completedAt: completedAt.toISOString() };
  });
  await publishPortalStateChanged(input.access.project.proposalId, "TECH_QC_PHASE_COMPLETED");
  return result;
}

function getObservedClientIp(headers: Headers) {
  const candidates = [
    headers.get("x-real-ip"),
    headers.get("x-forwarded-for")?.split(",")[0],
    headers.get("cf-connecting-ip"),
  ];
  for (const candidate of candidates) {
    const normalized = candidate?.trim() || "";
    if (normalized && isIP(normalized) > 0) return normalized.slice(0, 128);
  }
  return null;
}

function handoverNotificationKey(idempotencyKey: string) {
  return `TECH_HANDOVER_EMAIL:${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 48)}`;
}

function getExistingHandoverResult(event: typeof installationAuditEvents.$inferSelect, notification: typeof installationAuditEvents.$inferSelect | null | undefined) {
  const payload = getEventPayload(event);
  const notificationPayload = getEventPayload(notification);
  return {
    reused: true,
    taskId: event.taskId,
    projectId: getText(payload.projectId) || getText(payload.localProjectId) || null,
    pdfUrl: getText(payload.drivePdfUrl) || null,
    erpFileUrl: getText(payload.erpFileUrl) || null,
    sha256: getText(payload.sha256) || null,
    completedAt: event.occurredAt.toISOString(),
    emailDispatched: notification?.eventType === "HANDOVER_NOTIFICATION_DISPATCHED" || notificationPayload.emailDispatched === true,
    emailWarning: notification?.eventType === "HANDOVER_NOTIFICATION_FAILED" ? getText(notificationPayload.reason) || "Customer email was not dispatched." : null,
  };
}

export async function completeTechnicianHandover(input: {
  access: TechnicianTaskAccess;
  signatureBase64: string;
  gps: TechnicianGps;
  notes?: string;
  idempotencyKey: string;
  requestHeaders: Headers;
  source?: TechOperationSource;
}) {
  const existing = await getIdempotencyEvent(input.access.task.id, input.idempotencyKey, "HANDOVER_COMPLETED");
  if (existing) {
    const notification = await db.query.installationAuditEvents.findFirst({ where: eq(installationAuditEvents.idempotencyKey, handoverNotificationKey(input.idempotencyKey)) });
    return { ...getExistingHandoverResult(existing, notification), warrantyRegistration: null };
  }
  const state = await loadTechnicianTaskState(input.access);
  if (!["IN_PROGRESS", "COMPLETED"].includes(state.status)) {
    throw new TechPortalError("This task is not in progress and cannot be handed over.", 409);
  }
  if (!state.preflight) throw new TechPortalError("Complete the JSA and start the job before handover.", 409);
  if (state.phases.some((phase) => !phase.completed || (phase.evidenceRequired && !phase.evidenceReady))) {
    throw new TechPortalError("Complete all QC phases and required evidence before handover.", 409);
  }
  const projectTasks = await db.query.installationTasks.findMany({
    where: eq(installationTasks.projectId, input.access.project.id),
    columns: { id: true, taskCode: true, status: true },
  });
  const handoverOwnedTaskCodes = new Set(["INSTALLATION_EXECUTION", "QA_COMMISSIONING", "HANDOVER"]);
  const canonicalFieldExecutionReached = isOpsProjectStateAtLeast(input.access.project.lifecycleState, "IN_PROGRESS");
  if (projectTasks.some((task) => task.id !== input.access.task.id && !["COMPLETED", "CANCELLED"].includes(task.status) && (
    !handoverOwnedTaskCodes.has(task.taskCode)
    && !(canonicalFieldExecutionReached && ["SITE_REVIEW", "ENGINEERING", "MATERIAL_PREPARATION"].includes(task.taskCode))
  ))) {
    throw new TechPortalError("Complete the remaining project tasks before final handover.", 409);
  }
  const gps = normalizedGps(input.gps);
  const source = input.source || "PWA_ONLINE";
  const completedAt = new Date();
  const observedClientIp = getObservedClientIp(input.requestHeaders);
  const qcTestValues = Object.assign({}, ...state.phases.map((phase) => phase.testValues));
  const qcVerifiedItems = state.phases.map((phase) => {
    const values = Object.entries(phase.testValues).map(([key, value]) => `${key}: ${String(value)}`).join(", ");
    return `${phase.title} — PASS${values ? ` (${values})` : ""}`;
  });
  const pdf = await generateProjectHandoverPdf({
    projectCode: input.access.project.projectCode,
    taskTitle: input.access.task.title,
    customerName: state.customer.name,
    customerPhone: state.customer.phone,
    installationAddress: state.customer.address,
    systemSizeKwp: input.access.proposal.systemSizeKwp,
    panelCount: input.access.proposal.panelCount,
    technicianName: getCustomerName(await db.query.users.findFirst({ where: eq(users.id, input.access.actor.userId) }) || input.access.customer),
    completedAt,
    customerSignatureBase64: input.signatureBase64,
    qcVerifiedItems,
    qcTestValues,
    customerIp: observedClientIp,
    technicianGps: gps,
    notes: input.notes,
  });
  const hierarchy = await getOrCreateQuotationDeliveryDriveHierarchy(
    input.access.customer.id,
    input.access.project.proposalId,
  );
  const handoverFolder = await getOrCreateDriveFolder(
    hierarchy.quotationFolder.folderId,
    `Handover_${safeFileSegment(input.access.project.projectCode)}`,
  );
  const driveFile = await uploadBufferToDriveFolder({
    folder: handoverFolder,
    fileBuffer: pdf.pdfBuffer,
    mimeType: "application/pdf",
    fileName: pdf.filename,
  });

  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`technician:handover:${input.access.task.id}`}))`);
    const duplicate = await tx.query.installationAuditEvents.findFirst({ where: eq(installationAuditEvents.idempotencyKey, input.idempotencyKey) });
    if (duplicate) {
      const notification = await tx.query.installationAuditEvents.findFirst({ where: eq(installationAuditEvents.idempotencyKey, handoverNotificationKey(input.idempotencyKey)) });
      return getExistingHandoverResult(duplicate, notification);
    }
    await tx.update(installationTasks).set({
      status: "COMPLETED",
      completedAt,
      completedByUserId: input.access.actor.userId,
      updatedAt: completedAt,
    }).where(eq(installationTasks.id, input.access.task.id));
    await tx.update(installationTasks).set({
      status: "COMPLETED",
      completedAt,
      completedByUserId: input.access.actor.userId,
      updatedAt: completedAt,
    }).where(and(
      eq(installationTasks.projectId, input.access.project.id),
      inArray(installationTasks.taskCode, ["INSTALLATION_EXECUTION", "QA_COMMISSIONING", "HANDOVER"]),
      inArray(installationTasks.status, ["OPEN", "IN_PROGRESS"]),
    ));
    const lockedProject = await tx.query.installationWorkflowProjects.findFirst({
      where: eq(installationWorkflowProjects.id, input.access.project.id),
    });
    if (!lockedProject) throw new TechPortalError("Installation project not found.", 404);
    const lifecycleSteps = lockedProject.lifecycleState === "IN_PROGRESS"
      ? [{ from: "IN_PROGRESS", to: "QA_COMMISSIONING" }, { from: "QA_COMMISSIONING", to: "HANDOVER" }]
      : lockedProject.lifecycleState === "QA_COMMISSIONING"
        ? [{ from: "QA_COMMISSIONING", to: "HANDOVER" }]
        : [];
    const finalLifecycleState = lifecycleSteps.at(-1)?.to || lockedProject.lifecycleState;
    await tx.update(installationWorkflowProjects).set({
      status: "FINISHED",
      lifecycleState: finalLifecycleState,
      lifecycleVersion: lockedProject.lifecycleVersion + lifecycleSteps.length,
      ...(lifecycleSteps.length > 0 ? { lastTransitionAt: completedAt } : {}),
      updatedAt: completedAt,
    }).where(eq(installationWorkflowProjects.id, input.access.project.id));
    for (const [index, step] of lifecycleSteps.entries()) {
      const [stateAudit] = await tx.insert(installationAuditEvents).values({
        proposalId: lockedProject.proposalId,
        eventType: "PROJECT_STATE_CHANGED",
        actorUserId: input.access.actor.userId,
        idempotencyKey: input.idempotencyKey + ":project:" + step.to,
        payload: {
          from: step.from,
          to: step.to,
          source: "FIELD_HANDOVER",
          lifecycleVersion: lockedProject.lifecycleVersion + index + 1,
        },
        occurredAt: completedAt,
      }).returning({ id: installationAuditEvents.id });
      if (!stateAudit) throw new TechPortalError("Project lifecycle audit could not be created.", 500);
      await enqueueIntegrationEvent(tx, {
        topic: "installation.project.state_changed",
        aggregateType: "INSTALLATION_PROJECT",
        aggregateId: lockedProject.id,
        correlationId: input.idempotencyKey,
        payload: {
          projectId: lockedProject.id,
          proposalId: lockedProject.proposalId,
          auditEventId: stateAudit.id,
          from: step.from,
          to: step.to,
          lifecycleVersion: lockedProject.lifecycleVersion + index + 1,
        },
        dedupeKey: "installation.project.state_changed:" + input.idempotencyKey + ":handover:" + step.to,
      });
    }
    const activeVisit = await tx.query.fieldVisits.findFirst({
      where: input.access.fieldVisitId
        ? and(
          eq(fieldVisits.id, input.access.fieldVisitId),
          eq(fieldVisits.projectId, lockedProject.id),
          inArray(fieldVisits.status, ["CONFIRMED", "IN_PROGRESS"]),
        )
        : and(
          eq(fieldVisits.projectId, lockedProject.id),
          inArray(fieldVisits.status, ["CONFIRMED", "IN_PROGRESS"]),
        ),
    });
    if (activeVisit) {
      await tx.update(fieldVisits).set({ status: "COMPLETED", updatedAt: completedAt }).where(eq(fieldVisits.id, activeVisit.id));
      await tx.update(jobAssignments).set({
        status: "COMPLETED",
        completedAt,
        updatedAt: completedAt,
      }).where(and(
        eq(jobAssignments.visitId, activeVisit.id),
        eq(jobAssignments.assigneeUserId, input.access.actor.userId),
        inArray(jobAssignments.status, ["ASSIGNED", "ACCEPTED", "IN_PROGRESS"]),
      ));
    }
    const [auditEvent] = await tx.insert(installationAuditEvents).values({
      proposalId: input.access.project.proposalId,
      taskId: input.access.task.id,
      eventType: "HANDOVER_COMPLETED",
      actorUserId: input.access.actor.userId,
      idempotencyKey: input.idempotencyKey,
      payload: {
        localProjectId: input.access.project.id,
        localTaskId: input.access.task.id,
        erpnextProjectId: input.access.project.erpnextProjectId,
        erpnextTaskId: input.access.task.erpnextTaskId,
        driveFileId: driveFile.fileId,
        drivePdfUrl: driveFile.fileUrl,
        filename: pdf.filename,
        sha256: pdf.sha256Hash,
        signatureSha256: createHash("sha256").update(input.signatureBase64).digest("hex"),
        customerIp: observedClientIp,
        gps,
        notes: input.notes || null,
        completedAt: completedAt.toISOString(),
        source,
      },
      occurredAt: completedAt,
    }).returning({ id: installationAuditEvents.id });
    if (!auditEvent) throw new TechPortalError("Handover audit event could not be created.", 500);
    await enqueueIntegrationEvent(tx, {
      topic: "installation.handover.completed",
      aggregateType: "INSTALLATION_PROJECT",
      aggregateId: input.access.project.proposalId,
      payload: {
        auditEventId: auditEvent.id,
        localProjectId: input.access.project.id,
        localTaskId: input.access.task.id,
        actorUserId: input.access.actor.userId,
        driveFileId: driveFile.fileId,
        drivePdfUrl: driveFile.fileUrl,
        filename: pdf.filename,
        sha256: pdf.sha256Hash,
        gps,
        completedAt: completedAt.toISOString(),
        handoverIdempotencyKey: input.idempotencyKey,
        source,
      },
      dedupeKey: `installation.handover.completed:${input.idempotencyKey}`,
    });
    await enqueueIntegrationEvent(tx, {
      topic: "installation.warranty.requested",
      aggregateType: "INSTALLATION_PROJECT",
      aggregateId: input.access.project.proposalId,
      payload: {
        localProjectId: input.access.project.id,
        localTaskId: input.access.task.id,
        actorUserId: input.access.actor.userId,
        drivePdfUrl: driveFile.fileUrl,
        sha256: pdf.sha256Hash,
        gps,
        completedAt: completedAt.toISOString(),
        handoverIdempotencyKey: input.idempotencyKey,
        source,
      },
      dedupeKey: `installation.warranty.requested:${input.idempotencyKey}`,
    });
    return {
      reused: false,
      taskId: input.access.task.id,
      projectId: input.access.project.id,
      pdfUrl: driveFile.fileUrl,
      erpFileUrl: null,
      sha256: pdf.sha256Hash,
      completedAt: completedAt.toISOString(),
    };
  });

  const warrantyRegistration = null;

  let emailDispatched = false;
  let emailWarning: string | null = null;
  if (input.access.customer.email) {
    try {
      const email = await sendConfiguredTemplateEmail({
        templateKey: "project_completed",
        to: input.access.customer.email,
        values: {
          customer_name: state.customer.name,
          project_id: input.access.project.projectCode,
          action_url: driveFile.fileUrl,
          pdf_url: driveFile.fileUrl,
          certificate_hash: pdf.sha256Hash,
          warranty_years: "",
        },
      });
      if (email.success) emailDispatched = true;
      else emailWarning = "The handover was completed, but the customer email was not dispatched.";
    } catch (error: unknown) {
      console.warn("[Technician Portal] Customer handover email failed.", error);
      emailWarning = "The handover was completed, but the customer email was not dispatched.";
    }
  } else {
    emailWarning = "The handover was completed, but the customer email address is unavailable.";
  }
  await db.insert(installationAuditEvents).values({
    proposalId: input.access.project.proposalId,
    taskId: input.access.task.id,
    eventType: emailDispatched ? "HANDOVER_NOTIFICATION_DISPATCHED" : "HANDOVER_NOTIFICATION_FAILED",
    actorUserId: input.access.actor.userId,
    idempotencyKey: handoverNotificationKey(input.idempotencyKey),
    payload: {
      emailDispatched,
      recipient: input.access.customer.email || null,
      reason: emailWarning,
      pdfUrl: driveFile.fileUrl,
    },
    occurredAt: new Date(),
  }).onConflictDoNothing({ target: installationAuditEvents.idempotencyKey });
  await publishPortalStateChanged(input.access.project.proposalId, "TECH_HANDOVER_COMPLETED");
  broadcastEvent("PROJECT_STATUS_CHANGED", { id: input.access.project.id, title: input.access.project.projectCode, status: "FINISHED" });
  return { ...result, emailDispatched, emailWarning, warrantyRegistration };
}

export function getTechnicianAccessError(result: Awaited<ReturnType<typeof getTechnicianTaskAccess>>) {
  if (result.kind === "UNAUTHENTICATED") return { status: 401, error: "Authentication is required." };
  if (result.kind === "NOT_FOUND") return { status: 404, error: "Task not found." };
  if (result.kind === "FORBIDDEN") return { status: 403, error: "Technician access denied." };
  if (result.kind === "CONFLICT") {
    return {
      status: 409,
      error: result.reason === "DEPENDENCY_INCOMPLETE" ? "The previous installation task is not complete." : "This task is not available for this operation.",
    };
  }
  return null;
}

export function getTechPortalFailure(error: unknown, fallback: string) {
  if (error instanceof TechPortalError) return { status: error.status, error: error.message };
  if (error instanceof ZodError) return { status: 400, error: "The technician request payload is invalid." };
  return { status: 503, error: fallback };
}

export async function startTechnicianJob(input: {
  access: TechnicianTaskAccess;
  checks: Record<string, boolean>;
  preflightVersion: string;
  gps: TechnicianGps;
  idempotencyKey: string;
  source?: TechOperationSource;
}) {
  const existing = await getIdempotencyEvent(input.access.task.id, input.idempotencyKey, "JOB_STARTED");
  if (existing) {
    const payload = getEventPayload(existing);
    return {
      reused: true,
      taskId: input.access.task.id,
      timesheetId: getText(payload.timesheetId) || null,
      startedAt: existing.occurredAt.toISOString(),
    };
  }
  if (input.preflightVersion !== TECH_PRE_FLIGHT_VERSION) {
    throw new TechPortalError("The technician checklist version is out of date.", 409);
  }
  if (input.access.task.status !== "OPEN") {
    throw new TechPortalError("This task has already been started or closed.", 409);
  }
  assertPreFlightChecks(input.checks);
  const gps = normalizedGps(input.gps);
  const source = input.source || "PWA_ONLINE";
  const startedAt = new Date();
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`technician:start:${input.access.task.id}`}))`);
    const lockedTask = await tx.query.installationTasks.findFirst({ where: eq(installationTasks.id, input.access.task.id) });
    if (!lockedTask) throw new TechPortalError("Task not found.", 404);
    const duplicate = await tx.query.installationAuditEvents.findFirst({ where: eq(installationAuditEvents.idempotencyKey, input.idempotencyKey) });
    if (duplicate) {
      const payload = getEventPayload(duplicate);
      return { reused: true, taskId: lockedTask.id, timesheetId: getText(payload.timesheetId) || null, startedAt: duplicate.occurredAt.toISOString() };
    }
    if (lockedTask.status !== "OPEN") throw new TechPortalError("This task has already been started or closed.", 409);
    const [updatedTask] = await tx.update(installationTasks).set({ status: "IN_PROGRESS", updatedAt: startedAt }).where(eq(installationTasks.id, lockedTask.id)).returning();
    if (!updatedTask) throw new TechPortalError("Task could not be started.", 409);
    const lockedProject = await tx.query.installationWorkflowProjects.findFirst({ where: eq(installationWorkflowProjects.id, input.access.project.id) });
    if (!lockedProject) throw new TechPortalError("Installation project not found.", 404);
    const shouldAdvanceProject = lockedProject.lifecycleState === "SCHEDULED";
    await tx.update(installationWorkflowProjects).set({
      status: "IN_PROGRESS",
      ...(shouldAdvanceProject ? {
        lifecycleState: "IN_PROGRESS",
        lifecycleVersion: lockedProject.lifecycleVersion + 1,
        lastTransitionAt: startedAt,
      } : {}),
      updatedAt: startedAt,
    }).where(eq(installationWorkflowProjects.id, input.access.project.id));
    const activeVisit = await tx.query.fieldVisits.findFirst({
      where: input.access.fieldVisitId
        ? and(
          eq(fieldVisits.id, input.access.fieldVisitId),
          eq(fieldVisits.projectId, lockedProject.id),
          inArray(fieldVisits.status, ["CONFIRMED", "IN_PROGRESS"]),
        )
        : and(
          eq(fieldVisits.projectId, lockedProject.id),
          inArray(fieldVisits.status, ["CONFIRMED", "IN_PROGRESS"]),
        ),
    });
    if (activeVisit) {
      await tx.update(fieldVisits).set({ status: "IN_PROGRESS", updatedAt: startedAt }).where(eq(fieldVisits.id, activeVisit.id));
      await tx.update(jobAssignments).set({
        status: "IN_PROGRESS",
        startedAt,
        updatedAt: startedAt,
      }).where(and(
        eq(jobAssignments.visitId, activeVisit.id),
        input.access.fieldVisitId
          ? or(eq(jobAssignments.taskId, lockedTask.id), isNull(jobAssignments.taskId))
          : eq(jobAssignments.taskId, lockedTask.id),
        eq(jobAssignments.assigneeUserId, input.access.actor.userId),
        inArray(jobAssignments.status, ["ASSIGNED", "ACCEPTED", "IN_PROGRESS"]),
      ));
    }
    if (shouldAdvanceProject) {
      const [projectStateAudit] = await tx.insert(installationAuditEvents).values({
        proposalId: lockedProject.proposalId,
        eventType: "PROJECT_STATE_CHANGED",
        actorUserId: input.access.actor.userId,
        idempotencyKey: input.idempotencyKey + ":project",
        payload: {
          from: lockedProject.lifecycleState,
          to: "IN_PROGRESS",
          source: "FIELD_EXECUTION",
          lifecycleVersion: lockedProject.lifecycleVersion + 1,
        },
        occurredAt: startedAt,
      }).returning({ id: installationAuditEvents.id });
      if (!projectStateAudit) throw new TechPortalError("Project lifecycle audit could not be created.", 500);
      await enqueueIntegrationEvent(tx, {
        topic: "installation.project.state_changed",
        aggregateType: "INSTALLATION_PROJECT",
        aggregateId: lockedProject.id,
        correlationId: input.idempotencyKey,
        payload: {
          projectId: lockedProject.id,
          proposalId: lockedProject.proposalId,
          auditEventId: projectStateAudit.id,
          from: lockedProject.lifecycleState,
          to: "IN_PROGRESS",
          lifecycleVersion: lockedProject.lifecycleVersion + 1,
        },
        dedupeKey: "installation.project.state_changed:" + input.idempotencyKey,
      });
    }
    const [auditEvent] = await tx.insert(installationAuditEvents).values({
      proposalId: input.access.project.proposalId,
      taskId: input.access.task.id,
      eventType: "JOB_STARTED",
      actorUserId: input.access.actor.userId,
      idempotencyKey: input.idempotencyKey,
      payload: {
        version: input.preflightVersion,
        checks: input.checks,
        gps,
        startedAt: startedAt.toISOString(),
        source,
      },
      occurredAt: startedAt,
    }).returning({ id: installationAuditEvents.id });
    if (!auditEvent) throw new TechPortalError("Job start audit event could not be created.", 500);
    await enqueueIntegrationEvent(tx, {
      topic: "installation.job.started",
      aggregateType: "INSTALLATION_PROJECT",
      aggregateId: input.access.project.proposalId,
      payload: {
        auditEventId: auditEvent.id,
        localProjectId: input.access.project.id,
        localTaskId: input.access.task.id,
        actorUserId: input.access.actor.userId,
        startedAt: startedAt.toISOString(),
        gps,
        checks: input.checks,
        preflightVersion: input.preflightVersion,
        source,
      },
      dedupeKey: `installation.job.started:${input.idempotencyKey}`,
    });
    return { reused: false, taskId: updatedTask.id, timesheetId: null, startedAt: startedAt.toISOString() };
  });
  await publishPortalStateChanged(input.access.project.proposalId, "TECH_JOB_STARTED");
  broadcastEvent("PROJECT_STATUS_CHANGED", { id: input.access.task.id, title: input.access.task.title, status: "IN_PROGRESS" });
  return result;
}
