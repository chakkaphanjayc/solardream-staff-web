"use client";

import Dexie, { type Table } from "dexie";
import { TECH_SYNC_PAYLOAD_SCHEMA_VERSION, type TechSyncState } from "@solar-dream/contracts/tech-sync";

import type {
  TechDashboardResponse,
  TechDashboardTask,
  TechOperationSource,
  TechPortalPhaseCode,
  TechPreFlightCheckKey,
  TechTestValues,
  TechnicianGps,
} from "@/types/techPortal";

export type TechOutboxStatus = "PENDING" | "PENDING_AUTH" | "SYNCING" | "SYNCED" | "FAILED" | "CONFLICT" | "REJECTED";

type TechOutboxBase = {
  id: string;
  taskId: string;
  fieldVisitId?: string | null;
  idempotencyKey: string;
  source: TechOperationSource;
  sequence: number;
  status: TechOutboxStatus;
  createdAt: string;
  updatedAt: string;
  attempts: number;
  lastError: string | null;
  result: unknown | null;
  syncState: TechSyncState;
  actorUserId: string | null;
  deviceId: string;
  baseVersion: string | null;
  payloadSchemaVersion: number;
  dependencyReferences: string[];
  clientCreatedAt: string;
  nextAttemptAt: string | null;
  serverAcknowledged: boolean;
  erpApplied: boolean;
  canonicalVersion: string | null;
  receivedAt: string | null;
};

export type TechOfflineOperation =
  | (TechOutboxBase & {
      type: "JOB_STARTED";
      payload: {
        taskId: string;
        preflightVersion: string;
        checks: Record<TechPreFlightCheckKey, boolean>;
        gps: TechnicianGps;
      };
    })
  | (TechOutboxBase & {
      type: "QC_EVIDENCE_UPLOADED";
      payload: {
        taskId: string;
        phase: TechPortalPhaseCode;
        gps: TechnicianGps;
        capturedAt: string;
        localEvidenceId: string;
        clientSha256: string;
      };
      file: Blob | null;
      fileName: string;
      contentType: string;
    })
  | (TechOutboxBase & {
      type: "QC_PHASE_COMPLETED";
      payload: {
        taskId: string;
        phase: TechPortalPhaseCode;
        testValues: TechTestValues;
        evidenceIds: string[];
        evidenceLocalIds: string[];
      };
    })
  | (TechOutboxBase & {
      type: "HANDOVER_CAPTURED";
      payload: {
        taskId: string;
        signatureBase64: string;
        gps: TechnicianGps;
        notes?: string;
      };
    })
  | (TechOutboxBase & {
      type: "ASSET_REGISTERED";
      payload: {
        taskId: string;
        projectId: string;
        productName: string;
        serialNumber: string;
        catalogProductId?: string | null;
        verificationStatus?: "VERIFIED" | "UNVERIFIED";
        productWarrantyProvider?: string | null;
        productWarrantyMonths?: number | null;
      };
    });

type TechOfflineOperationMetadataInput = Partial<Pick<
  TechOutboxBase,
  "actorUserId" | "baseVersion" | "dependencyReferences"
>>;

export type TechOfflineOperationInput =
  | (Pick<Extract<TechOfflineOperation, { type: "JOB_STARTED" }>, "type" | "taskId" | "fieldVisitId" | "idempotencyKey" | "payload"> & TechOfflineOperationMetadataInput)
  | (Omit<Pick<Extract<TechOfflineOperation, { type: "QC_EVIDENCE_UPLOADED" }>, "type" | "taskId" | "fieldVisitId" | "idempotencyKey" | "payload" | "file" | "fileName" | "contentType">, "file"> & { file: Blob } & TechOfflineOperationMetadataInput)
  | (Pick<Extract<TechOfflineOperation, { type: "QC_PHASE_COMPLETED" }>, "type" | "taskId" | "fieldVisitId" | "idempotencyKey" | "payload"> & TechOfflineOperationMetadataInput)
  | (Pick<Extract<TechOfflineOperation, { type: "HANDOVER_CAPTURED" }>, "type" | "taskId" | "fieldVisitId" | "idempotencyKey" | "payload"> & TechOfflineOperationMetadataInput)
  | (Pick<Extract<TechOfflineOperation, { type: "ASSET_REGISTERED" }>, "type" | "taskId" | "fieldVisitId" | "idempotencyKey" | "payload"> & TechOfflineOperationMetadataInput);

type CachedTechTask = {
  taskId: string;
  cacheScope: string;
  dashboardDate: string;
  task: TechDashboardTask;
  cachedAt: string;
};

type TechEvidenceLink = {
  localEvidenceId: string;
  taskId: string;
  phase: TechPortalPhaseCode;
  serverEvidenceId: string;
  sha256: string | null;
  linkedAt: string;
};

export type TechTaskDraft = {
  taskId: string;
  preflightChecks: Partial<Record<TechPreFlightCheckKey, boolean>>;
  testValues: Partial<Record<TechPortalPhaseCode, Record<string, string>>>;
  handoverNotes: string;
  updatedAt: string;
};

type TechSetting = {
  key: string;
  value: string | number;
};

export type TechOfflineSummary = {
  pending: number;
  pendingAuth: number;
  syncing: number;
  failed: number;
  retryAvailable: number;
  conflicts: number;
  rejected: number;
  pendingServer: number;
  pendingErp: number;
};

export type TechStorageWarning = "NONE" | "NEAR_LIMIT" | "FULL";

export type TechStorageStatus = {
  supported: boolean;
  usageBytes: number | null;
  quotaBytes: number | null;
  availableBytes: number | null;
  usageRatio: number | null;
  persisted: boolean | null;
  persistSupported: boolean;
  warning: TechStorageWarning;
};

const EMPTY_TECH_OFFLINE_SUMMARY: TechOfflineSummary = {
  pending: 0,
  pendingAuth: 0,
  syncing: 0,
  failed: 0,
  retryAvailable: 0,
  conflicts: 0,
  rejected: 0,
  pendingServer: 0,
  pendingErp: 0,
};

const EMPTY_TECH_STORAGE_STATUS: TechStorageStatus = {
  supported: false,
  usageBytes: null,
  quotaBytes: null,
  availableBytes: null,
  usageRatio: null,
  persisted: null,
  persistSupported: false,
  warning: "NONE",
};

const STORAGE_NEAR_LIMIT_RATIO = 0.8;
const STORAGE_FULL_RATIO = 0.95;
const STORAGE_HEADROOM_BYTES = 1 * 1024 * 1024;
const STORAGE_NEAR_LIMIT_BYTES = 5 * 1024 * 1024;

export class TechOfflineStorageError extends Error {
  readonly code = "QUOTA_EXCEEDED" as const;

  constructor() {
    super("The device does not have enough local storage for this evidence file. Sync pending work or free device storage, then try again.");
    this.name = "TechOfflineStorageError";
  }
}

function getLegacySyncState(status: TechOutboxStatus): TechSyncState {
  if (status === "SYNCING") return "UPLOADING";
  if (status === "SYNCED") return "SYNCED";
  if (status === "CONFLICT") return "CONFLICT";
  if (status === "REJECTED") return "REJECTED";
  if (status === "PENDING_AUTH") return "PENDING_AUTH";
  if (status === "FAILED") return "RETRY_AVAILABLE";
  return "LOCAL_SAVED";
}

class TechPortalDatabase extends Dexie {
  tasks!: Table<CachedTechTask, string>;
  outbox!: Table<TechOfflineOperation, string>;
  evidenceLinks!: Table<TechEvidenceLink, string>;
  drafts!: Table<TechTaskDraft, string>;
  settings!: Table<TechSetting, string>;

  constructor() {
    super("solardream-tech-portal");
    this.version(1).stores({
      tasks: "taskId, cacheScope, cachedAt",
      outbox: "id, taskId, status, createdAt",
      evidenceLinks: "localEvidenceId, taskId, phase",
      drafts: "taskId, updatedAt",
      settings: "key",
    });
    this.version(2).stores({
      tasks: "taskId, cacheScope, cachedAt",
      outbox: "id, taskId, status, createdAt, syncState, nextAttemptAt",
      evidenceLinks: "localEvidenceId, taskId, phase",
      drafts: "taskId, updatedAt",
      settings: "key",
    }).upgrade(async (transaction) => {
      const actorSetting = await transaction.table("settings").get("actorUserId") as TechSetting | undefined;
      const legacyActorUserId = typeof actorSetting?.value === "string" && actorSetting.value.trim()
        ? actorSetting.value.trim()
        : null;
      await transaction.table("outbox").toCollection().modify((operation: TechOfflineOperation) => {
        const legacyStatus = operation.status || "PENDING";
        operation.syncState = operation.syncState || getLegacySyncState(legacyStatus);
        operation.actorUserId = typeof operation.actorUserId === "string" && operation.actorUserId.trim()
          ? operation.actorUserId.trim()
          : legacyActorUserId;
        operation.deviceId = typeof operation.deviceId === "string" && operation.deviceId.trim() ? operation.deviceId : "legacy-device";
        operation.baseVersion = typeof operation.baseVersion === "string" ? operation.baseVersion : null;
        operation.payloadSchemaVersion = typeof operation.payloadSchemaVersion === "number" ? operation.payloadSchemaVersion : TECH_SYNC_PAYLOAD_SCHEMA_VERSION;
        operation.dependencyReferences = Array.isArray(operation.dependencyReferences)
          ? operation.dependencyReferences.filter((reference): reference is string => typeof reference === "string")
          : [];
        operation.clientCreatedAt = typeof operation.clientCreatedAt === "string" ? operation.clientCreatedAt : operation.createdAt;
        operation.nextAttemptAt = typeof operation.nextAttemptAt === "string" ? operation.nextAttemptAt : null;
        operation.serverAcknowledged = operation.serverAcknowledged === true;
        operation.erpApplied = operation.erpApplied === true;
        operation.canonicalVersion = typeof operation.canonicalVersion === "string" ? operation.canonicalVersion : null;
        operation.receivedAt = typeof operation.receivedAt === "string" ? operation.receivedAt : null;
      });
    });
  }
}

export const techPortalDb = new TechPortalDatabase();

function storageAvailable() {
  return typeof indexedDB !== "undefined";
}

function getStorageManager(): StorageManager | null {
  if (typeof navigator === "undefined" || !("storage" in navigator)) return null;
  return navigator.storage;
}

export async function requestTechPersistentStorage() {
  const storage = getStorageManager();
  if (!storage || typeof storage.persist !== "function") return false;
  try {
    if (typeof storage.persisted === "function" && await storage.persisted()) return true;
    return await storage.persist();
  } catch {
    return false;
  }
}

export async function getTechStorageStatus(): Promise<TechStorageStatus> {
  if (!storageAvailable()) return { ...EMPTY_TECH_STORAGE_STATUS };
  const storage = getStorageManager();
  if (!storage || typeof storage.estimate !== "function") return { ...EMPTY_TECH_STORAGE_STATUS };

  try {
    const estimate = await storage.estimate();
    const usageBytes = typeof estimate.usage === "number" && Number.isFinite(estimate.usage) ? Math.max(0, estimate.usage) : null;
    const quotaBytes = typeof estimate.quota === "number" && Number.isFinite(estimate.quota) && estimate.quota > 0 ? estimate.quota : null;
    const availableBytes = usageBytes !== null && quotaBytes !== null ? Math.max(0, quotaBytes - usageBytes) : null;
    const usageRatio = usageBytes !== null && quotaBytes !== null ? Math.min(1, Math.max(0, usageBytes / quotaBytes)) : null;
    const persisted = typeof storage.persisted === "function" ? await storage.persisted().catch(() => null) : null;
    const warning: TechStorageWarning = availableBytes === 0 || (usageRatio !== null && usageRatio >= STORAGE_FULL_RATIO)
      ? "FULL"
      : (availableBytes !== null && availableBytes <= STORAGE_NEAR_LIMIT_BYTES) || (usageRatio !== null && usageRatio >= STORAGE_NEAR_LIMIT_RATIO)
        ? "NEAR_LIMIT"
        : "NONE";
    return {
      supported: true,
      usageBytes,
      quotaBytes,
      availableBytes,
      usageRatio,
      persisted,
      persistSupported: typeof storage.persist === "function",
      warning,
    };
  } catch {
    return { ...EMPTY_TECH_STORAGE_STATUS, supported: true, persistSupported: typeof storage.persist === "function" };
  }
}

async function ensureTechStorageCapacity(requiredBytes: number) {
  if (requiredBytes <= 0) return;
  await requestTechPersistentStorage();
  const status = await getTechStorageStatus();
  if (status.availableBytes !== null && status.availableBytes < requiredBytes + STORAGE_HEADROOM_BYTES) {
    throw new TechOfflineStorageError();
  }
}

function isQuotaExceededError(error: unknown) {
  return error instanceof DOMException && error.name === "QuotaExceededError"
    || error instanceof Error && /quota|storage space/i.test(error.message);
}

function makeId(prefix: string) {
  const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function nowIso() {
  return new Date().toISOString();
}

function getApiMessage(value: unknown, fallback: string) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const error = (value as Record<string, unknown>).error;
    if (typeof error === "string" && error.trim()) return error;
  }
  return fallback;
}

async function getNextSequence() {
  const current = await techPortalDb.settings.get("sequence");
  const currentValue = typeof current?.value === "number" ? current.value : 0;
  const next = Math.max(Date.now(), currentValue + 1);
  await techPortalDb.settings.put({ key: "sequence", value: next });
  return next;
}

async function getOrCreateDeviceId() {
  const current = await techPortalDb.settings.get("deviceId");
  if (typeof current?.value === "string" && current.value.trim()) return current.value;
  const deviceId = makeId("device");
  await techPortalDb.settings.put({ key: "deviceId", value: deviceId });
  return deviceId;
}

async function getActiveActorUserId() {
  const active = await techPortalDb.settings.get("activeActorUserId");
  if (active) return typeof active.value === "string" && active.value.trim() ? active.value.trim() : null;
  const legacy = await techPortalDb.settings.get("actorUserId");
  return typeof legacy?.value === "string" && legacy.value.trim() ? legacy.value.trim() : null;
}

export async function setTechPortalActiveActor(actorUserId: string | null) {
  if (!storageAvailable()) return;
  await techPortalDb.settings.put({ key: "activeActorUserId", value: actorUserId?.trim() || "" });
}

function getDefaultDependencyReferences(operation: TechOfflineOperationInput) {
  if (operation.type === "QC_PHASE_COMPLETED") {
    return operation.payload.evidenceLocalIds.map((localEvidenceId) => `evidence:${localEvidenceId}`);
  }
  return [];
}

export async function cacheTechnicianDashboard(payload: TechDashboardResponse) {
  if (!storageAvailable()) return;
  const cachedAt = nowIso();
  await techPortalDb.transaction("rw", techPortalDb.tasks, techPortalDb.outbox, techPortalDb.evidenceLinks, techPortalDb.drafts, techPortalDb.settings, async () => {
    const currentScope = await techPortalDb.settings.get("cacheScope");
    if (currentScope && currentScope.value !== payload.cacheScope) {
      await techPortalDb.tasks.clear();
      await techPortalDb.drafts.clear();
    }
    await techPortalDb.tasks.clear();
    await techPortalDb.tasks.bulkPut(payload.tasks.map((task) => ({
      taskId: task.taskId,
      cacheScope: payload.cacheScope,
      dashboardDate: payload.date,
      task,
      cachedAt,
    })));
    await techPortalDb.settings.put({ key: "cacheScope", value: payload.cacheScope });
    if (payload.actorUserId) {
      await techPortalDb.settings.put({ key: "actorUserId", value: payload.actorUserId });
      await techPortalDb.settings.put({ key: "activeActorUserId", value: payload.actorUserId });
    }
    await techPortalDb.settings.put({ key: "dashboardDate", value: payload.date });
    await techPortalDb.settings.put({ key: "dashboardReadOnly", value: payload.readOnly ? "true" : "false" });
    await techPortalDb.settings.put({ key: "dashboardCachedAt", value: cachedAt });

    // A successful authenticated dashboard load proves that the current
    // session can resume commands paused by an earlier auth challenge. Keep
    // the command and its blob; only move it back to the normal retry queue.
    const authPending = payload.actorUserId
      ? (await techPortalDb.outbox.where("status").equals("PENDING_AUTH").toArray()).filter((operation) => operation.actorUserId === payload.actorUserId)
      : [];
    await Promise.all(authPending.map((operation) => techPortalDb.outbox.put({
      ...operation,
      status: "PENDING",
      syncState: "LOCAL_SAVED",
      updatedAt: nowIso(),
      lastError: null,
      nextAttemptAt: null,
    })));
  });
}

export async function getCachedTechnicianDashboard(expectedActorUserId?: string | null): Promise<{ date: string; tasks: TechDashboardTask[]; cacheScope: string; readOnly: boolean; actorUserId?: string } | null> {
  if (!storageAvailable()) return null;
  const scope = await techPortalDb.settings.get("cacheScope");
  const date = await techPortalDb.settings.get("dashboardDate");
  const readOnly = await techPortalDb.settings.get("dashboardReadOnly");
  const actorUserId = await techPortalDb.settings.get("actorUserId");
  if (typeof scope?.value !== "string" || typeof date?.value !== "string") return null;
  const cachedActorUserId = typeof actorUserId?.value === "string" && actorUserId.value.trim() ? actorUserId.value.trim() : null;
  if (expectedActorUserId !== undefined && cachedActorUserId !== expectedActorUserId) return null;
  const rows = await techPortalDb.tasks.toArray();
  if (rows.length === 0) return null;
  return {
    date: date.value,
    cacheScope: scope.value,
    ...(cachedActorUserId ? { actorUserId: cachedActorUserId } : {}),
    // Before reviewer mode existed, this endpoint only returned data to
    // installers. Preserve that installer cache's offline behavior until the
    // next authenticated response writes the explicit mode flag.
    readOnly: readOnly?.value === "true",
    tasks: rows.filter((row) => row.cacheScope === scope.value).map((row) => row.task),
  };
}

export async function updateCachedTechnicianTask(taskId: string, update: (task: TechDashboardTask) => TechDashboardTask) {
  if (!storageAvailable()) return;
  const cached = await techPortalDb.tasks.get(taskId);
  if (!cached) return;
  await techPortalDb.tasks.put({ ...cached, task: update(cached.task), cachedAt: nowIso() });
}

export async function getTechTaskDraft(taskId: string) {
  if (!storageAvailable()) return null;
  return techPortalDb.drafts.get(taskId);
}

export async function saveTechTaskDraft(draft: Omit<TechTaskDraft, "updatedAt">) {
  if (!storageAvailable()) return;
  await techPortalDb.drafts.put({ ...draft, updatedAt: nowIso() });
}

export async function clearTechTaskDraft(taskId: string) {
  if (!storageAvailable()) return;
  await techPortalDb.drafts.delete(taskId);
}

export async function enqueueTechOperation(
  operation: TechOfflineOperationInput,
) {
  if (!storageAvailable()) throw new Error("OFFLINE_STORAGE_UNAVAILABLE");
  if (operation.type === "QC_EVIDENCE_UPLOADED") await ensureTechStorageCapacity(operation.file.size);
  const [sequence, deviceId, actorUserId] = await Promise.all([
    getNextSequence(),
    getOrCreateDeviceId(),
    getActiveActorUserId(),
  ]);
  const timestamp = nowIso();
  const stored: TechOfflineOperation = {
    ...operation,
    id: makeId("tech-op"),
    source: "PWA_OFFLINE" as const,
    sequence,
    status: "PENDING" as const,
    createdAt: timestamp,
    updatedAt: timestamp,
    attempts: 0,
    lastError: null,
    result: null,
    syncState: "LOCAL_SAVED",
    actorUserId: operation.actorUserId ?? actorUserId,
    deviceId,
    baseVersion: operation.baseVersion ?? null,
    payloadSchemaVersion: TECH_SYNC_PAYLOAD_SCHEMA_VERSION,
    dependencyReferences: operation.dependencyReferences ?? getDefaultDependencyReferences(operation),
    clientCreatedAt: timestamp,
    nextAttemptAt: null,
    serverAcknowledged: false,
    erpApplied: false,
    canonicalVersion: null,
    receivedAt: null,
  };
  try {
    await techPortalDb.outbox.put(stored);
  } catch (error: unknown) {
    if (isQuotaExceededError(error)) throw new TechOfflineStorageError();
    throw error;
  }
  await requestTechBackgroundSync();
  return stored;
}

async function normalizeStaleSyncingOperations() {
  const staleAt = Date.now() - 5 * 60 * 1000;
  const syncing = await techPortalDb.outbox.where("status").equals("SYNCING").toArray();
  await Promise.all(syncing.filter((operation) => Date.parse(operation.updatedAt) < staleAt).map((operation) =>
    techPortalDb.outbox.put({ ...operation, status: "PENDING", syncState: "PENDING_NETWORK", updatedAt: nowIso(), lastError: "Sync resumed after an interrupted attempt.", nextAttemptAt: null }),
  ));
}

export async function getTechOfflineSummary(): Promise<TechOfflineSummary> {
  if (!storageAvailable()) return { ...EMPTY_TECH_OFFLINE_SUMMARY };
  await normalizeStaleSyncingOperations();
  const activeActorUserId = await getActiveActorUserId();
  if (!activeActorUserId) return { ...EMPTY_TECH_OFFLINE_SUMMARY };
  const operations = (await techPortalDb.outbox.toArray()).filter((operation) => operation.actorUserId === activeActorUserId);
  return operations.reduce<TechOfflineSummary>((summary, operation) => {
    if (operation.status === "PENDING" || operation.syncState === "LOCAL_SAVED" || operation.syncState === "PENDING_NETWORK") summary.pending += 1;
    if (operation.status === "PENDING_AUTH" || operation.syncState === "PENDING_AUTH") summary.pendingAuth += 1;
    if (operation.status === "SYNCING" || operation.syncState === "UPLOADING") summary.syncing += 1;
    if (operation.status === "FAILED" || operation.syncState === "RETRY_AVAILABLE") {
      summary.failed += 1;
      summary.retryAvailable += 1;
    }
    if (operation.status === "CONFLICT" || operation.syncState === "CONFLICT") summary.conflicts += 1;
    if (operation.status === "REJECTED" || operation.syncState === "REJECTED") summary.rejected += 1;
    if (operation.syncState === "PENDING_SERVER") summary.pendingServer += 1;
    if (operation.syncState === "PENDING_ERP") summary.pendingErp += 1;
    return summary;
  }, { ...EMPTY_TECH_OFFLINE_SUMMARY });
}

export async function getPendingTechHandoverTaskIds() {
  if (!storageAvailable()) return [];
  const activeActorUserId = await getActiveActorUserId();
  if (!activeActorUserId) return [];
  const operations = (await techPortalDb.outbox.toArray()).filter((operation) => operation.actorUserId === activeActorUserId);
  return Array.from(new Set(operations
    .filter((operation) => operation.type === "HANDOVER_CAPTURED" && (
      ["PENDING", "PENDING_AUTH", "SYNCING", "FAILED", "CONFLICT"].includes(operation.status)
      || ["LOCAL_SAVED", "PENDING_NETWORK", "PENDING_AUTH", "UPLOADING", "RETRY_AVAILABLE", "CONFLICT", "PENDING_SERVER", "PENDING_ERP"].includes(operation.syncState)
    ))
    .map((operation) => operation.taskId)));
}

export async function retryTechConflicts() {
  if (!storageAvailable()) return;
  const activeActorUserId = await getActiveActorUserId();
  if (!activeActorUserId) return;
  const conflicts = (await techPortalDb.outbox.where("status").equals("CONFLICT").toArray()).filter((operation) => operation.actorUserId === activeActorUserId);
  await Promise.all(conflicts.map((operation) => techPortalDb.outbox.put({
    ...operation,
    status: "PENDING",
    syncState: "LOCAL_SAVED",
    updatedAt: nowIso(),
    lastError: null,
    nextAttemptAt: null,
  })));
}

async function getEvidenceLinks(localIds: readonly string[]) {
  if (localIds.length === 0) return [];
  const links = await techPortalDb.evidenceLinks.bulkGet([...localIds]);
  return links.filter((link): link is TechEvidenceLink => Boolean(link));
}

type ReplayResult =
  | { kind: "SUCCESS"; status: number; result: unknown; evidenceId?: string; syncState: Extract<TechSyncState, "PENDING_SERVER" | "PENDING_ERP" | "SYNCED">; serverAcknowledged: boolean; erpApplied: boolean; canonicalVersion: string | null; receivedAt: string; message: string | null }
  | { kind: "WAIT"; message: string }
  | { kind: "AUTH"; status: number; message: string }
  | { kind: "FAILURE"; status: number; message: string };

function isTechSyncAckState(value: unknown): value is Extract<TechSyncState, "PENDING_SERVER" | "PENDING_ERP" | "SYNCED"> {
  return value === "PENDING_SERVER" || value === "PENDING_ERP" || value === "SYNCED";
}

function parseTechSyncAck(value: unknown, responseStatus: number) {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const ack = record.ack && typeof record.ack === "object" && !Array.isArray(record.ack)
    ? record.ack as Record<string, unknown>
    : {};
  const state = isTechSyncAckState(ack.state) ? ack.state : "PENDING_SERVER";
  const receivedAt = typeof ack.receivedAt === "string" && Number.isFinite(Date.parse(ack.receivedAt))
    ? ack.receivedAt
    : nowIso();
  return {
    syncState: state,
    serverAcknowledged: ack.serverAcknowledged !== false,
    erpApplied: ack.erpApplied === true,
    canonicalVersion: typeof ack.canonicalVersion === "string" ? ack.canonicalVersion : null,
    receivedAt,
    message: typeof ack.message === "string" ? ack.message : responseStatus === 200 ? null : `Sync accepted with status ${responseStatus}.`,
  };
}

function buildSyncEnvelope(operation: TechOfflineOperation, payload: Record<string, unknown>) {
  return {
    commandId: operation.idempotencyKey,
    commandType: operation.type,
    idempotencyKey: operation.idempotencyKey,
    type: operation.type,
    operationId: operation.idempotencyKey,
    taskId: operation.taskId,
    fieldVisitId: operation.fieldVisitId || null,
    actorUserId: operation.actorUserId,
    deviceId: operation.deviceId,
    baseVersion: operation.baseVersion,
    payloadSchemaVersion: operation.payloadSchemaVersion,
    dependencyReferences: operation.dependencyReferences,
    clientCreatedAt: operation.clientCreatedAt,
    payload,
  };
}

async function replayOperation(operation: TechOfflineOperation): Promise<ReplayResult> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return { kind: "WAIT", message: "The device is offline." };

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 45_000);
  let response: Response;
  try {
    if (operation.type === "QC_EVIDENCE_UPLOADED") {
      if (!operation.file) return { kind: "FAILURE", status: 422, message: "The local QC image is no longer available. Capture the evidence again." };
      const form = new FormData();
      form.set("operation", JSON.stringify(buildSyncEnvelope(operation, operation.payload)));
      form.set("file", operation.file, operation.fileName);
      response = await fetch("/api/tech/sync", {
        method: "POST",
        body: form,
        credentials: "same-origin",
        headers: { Accept: "application/json", "Idempotency-Key": operation.idempotencyKey },
        signal: controller.signal,
      });
    } else {
      let payload: Record<string, unknown> = { ...operation.payload };
      if (operation.type === "QC_PHASE_COMPLETED") {
        const links = await getEvidenceLinks(operation.payload.evidenceLocalIds);
        if (links.length !== operation.payload.evidenceLocalIds.length) {
          return { kind: "WAIT", message: "Waiting for QC photos to finish syncing." };
        }
        payload = {
          ...payload,
          evidenceIds: Array.from(new Set([...operation.payload.evidenceIds, ...links.map((link) => link.serverEvidenceId)])),
        };
        delete payload.evidenceLocalIds;
      }
      response = await fetch("/api/tech/sync", {
        method: "POST",
        credentials: "same-origin",
        headers: { Accept: "application/json", "Content-Type": "application/json", "Idempotency-Key": operation.idempotencyKey },
        body: JSON.stringify(buildSyncEnvelope(operation, payload)),
        signal: controller.signal,
      });
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() || "";
    if (!contentType.includes("application/json")) {
      const looksLikeAuthChallenge = response.status === 401 || response.status === 403 || response.redirected || contentType.includes("text/html");
      return looksLikeAuthChallenge
        ? { kind: "AUTH", status: response.status || 401, message: "The staff session expired. Sign in again to resume synchronization." }
        : { kind: "FAILURE", status: response.status || 502, message: "The sync service returned a non-JSON response." };
    }
    const body: unknown = await response.json().catch(() => null);
    if (response.status === 401) return { kind: "AUTH", status: response.status, message: getApiMessage(body, "The staff session expired. Sign in again to resume synchronization.") };
    if (!response.ok) {
      const message = getApiMessage(body, `Sync failed (${response.status}).`);
      return { kind: "FAILURE", status: response.status, message };
    }
    if (!body || typeof body !== "object" || Array.isArray(body) || (body as Record<string, unknown>).success !== true) {
      return { kind: "FAILURE", status: 502, message: "The sync service returned an invalid acknowledgement." };
    }
    const result = body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>).result
      : null;
    const candidateEvidenceId = result && typeof result === "object" && !Array.isArray(result)
      ? (result as Record<string, unknown>).evidenceId
      : undefined;
    const evidenceId = typeof candidateEvidenceId === "string" ? candidateEvidenceId : undefined;
    return { kind: "SUCCESS", status: response.status, result, ...(evidenceId ? { evidenceId } : {}), ...parseTechSyncAck(body, response.status) };
  } finally {
    window.clearTimeout(timeout);
  }
}

export type TechSyncResult = TechOfflineSummary & {
  synced: number;
  authRequired: boolean;
  lastError: string | null;
};

type SyncAvailability =
  | { kind: "READY" }
  | { kind: "OFFLINE"; message: string }
  | { kind: "AUTH"; message: string };

async function probeSyncAvailability(): Promise<SyncAvailability> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return { kind: "OFFLINE", message: "The device is offline." };
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch("/api/health/live", {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    const contentType = response.headers.get("content-type")?.toLowerCase() || "";
    if (response.status === 401 || response.status === 403 || response.redirected || contentType.includes("text/html")) {
      return { kind: "AUTH", message: "The staff session expired. Sign in again to resume synchronization." };
    }
    if (!response.ok || !contentType.includes("application/json")) {
      return { kind: "OFFLINE", message: "The staff service is not reachable yet." };
    }
    const body: unknown = await response.json().catch(() => null);
    if (body && typeof body === "object" && !Array.isArray(body) && (body as Record<string, unknown>).status === "ok") {
      return { kind: "READY" };
    }
    return { kind: "OFFLINE", message: "The staff service is not ready yet." };
  } catch {
    return { kind: "OFFLINE", message: "The staff service is not reachable yet." };
  } finally {
    window.clearTimeout(timeout);
  }
}

async function pauseOperationsForAuth(message: string) {
  const activeActorUserId = await getActiveActorUserId();
  if (!activeActorUserId) return;
  const operations = await techPortalDb.outbox.toArray();
  const pending = operations.filter((operation) => operation.actorUserId === activeActorUserId && (operation.status === "PENDING" || operation.status === "FAILED"));
  await Promise.all(pending.map((operation) => techPortalDb.outbox.put({
    ...operation,
    status: "PENDING_AUTH",
    syncState: "PENDING_AUTH",
    updatedAt: nowIso(),
    lastError: message,
    nextAttemptAt: null,
  })));
}

function nextRetryAt(attempts: number) {
  const boundedAttempt = Math.min(Math.max(attempts, 1), 8);
  const delay = Math.min(15 * 60 * 1000, 2 ** boundedAttempt * 1000);
  return new Date(Date.now() + delay).toISOString();
}

export async function syncTechOutbox(options: { forceRetry?: boolean } = {}): Promise<TechSyncResult> {
  const empty: TechSyncResult = { ...EMPTY_TECH_OFFLINE_SUMMARY, synced: 0, authRequired: false, lastError: null };
  if (!storageAvailable()) return empty;
  const availability = await probeSyncAvailability();
  if (availability.kind === "OFFLINE") return { ...await getTechOfflineSummary(), synced: 0, authRequired: false, lastError: availability.message };
  if (availability.kind === "AUTH") {
    await pauseOperationsForAuth(availability.message);
    return { ...await getTechOfflineSummary(), synced: 0, authRequired: true, lastError: availability.message };
  }
  const activeActorUserId = await getActiveActorUserId();
  if (!activeActorUserId) {
    const allOperations = await techPortalDb.outbox.toArray();
    const hasQueuedOperations = allOperations.some((operation) => operation.status !== "SYNCED" || operation.syncState !== "SYNCED");
    return { ...empty, authRequired: hasQueuedOperations, lastError: hasQueuedOperations ? "Sign in again to resume the technician's offline work." : null };
  }
  await normalizeStaleSyncingOperations();
  const operations = (await techPortalDb.outbox.toArray()).filter((operation) => operation.actorUserId === activeActorUserId);
  const now = Date.now();
  const candidates = operations
    .filter((operation) => operation.status === "PENDING" || operation.status === "FAILED")
    .filter((operation) => options.forceRetry || !operation.nextAttemptAt || !Number.isFinite(Date.parse(operation.nextAttemptAt)) || Date.parse(operation.nextAttemptAt) <= now)
    .sort((left, right) => left.sequence - right.sequence || Date.parse(left.createdAt) - Date.parse(right.createdAt));
  const blockedTasks = new Set<string>(operations
    .filter((operation) => operation.status === "CONFLICT" || operation.status === "SYNCING")
    .map((operation) => operation.taskId));
  let synced = 0;
  let lastError: string | null = null;
  let authRequired = false;

  for (const operation of candidates) {
    if (blockedTasks.has(operation.taskId)) continue;
    const attemptedOperation = { ...operation, status: "SYNCING" as const, updatedAt: nowIso(), attempts: operation.attempts + 1 };
    await techPortalDb.outbox.put(attemptedOperation);
    const replay = await replayOperation(attemptedOperation).catch((error: unknown) => ({
      kind: "FAILURE" as const,
      status: 503,
      message: error instanceof Error ? error.message : "The sync request failed.",
    }));
    if (replay.kind === "WAIT") {
      await techPortalDb.outbox.put({ ...attemptedOperation, status: "PENDING", syncState: "PENDING_NETWORK", updatedAt: nowIso(), lastError: replay.message, nextAttemptAt: nextRetryAt(attemptedOperation.attempts) });
      blockedTasks.add(operation.taskId);
      lastError = replay.message;
      continue;
    }
    if (replay.kind === "AUTH") {
      await techPortalDb.outbox.put({ ...attemptedOperation, status: "PENDING_AUTH", syncState: "PENDING_AUTH", updatedAt: nowIso(), lastError: replay.message, nextAttemptAt: null });
      blockedTasks.add(operation.taskId);
      authRequired = true;
      lastError = replay.message;
      continue;
    }
    if (replay.kind === "SUCCESS") {
      const status: TechOutboxStatus = "SYNCED";
      const serverConfirmedEvidence = operation.type === "QC_EVIDENCE_UPLOADED" && Boolean(replay.evidenceId && replay.serverAcknowledged);
      const syncedOperation: TechOfflineOperation = {
        ...attemptedOperation,
        status,
        syncState: replay.syncState,
        updatedAt: nowIso(),
        lastError: null,
        result: replay.result,
        nextAttemptAt: null,
        serverAcknowledged: replay.serverAcknowledged,
        erpApplied: replay.erpApplied,
        canonicalVersion: replay.canonicalVersion,
        receivedAt: replay.receivedAt,
        ...(serverConfirmedEvidence ? { file: null } : {}),
      };
      if (operation.type === "QC_EVIDENCE_UPLOADED" && replay.evidenceId && serverConfirmedEvidence) {
        await techPortalDb.transaction("rw", techPortalDb.outbox, techPortalDb.evidenceLinks, async () => {
          await techPortalDb.outbox.put(syncedOperation);
          await techPortalDb.evidenceLinks.put({
            localEvidenceId: operation.payload.localEvidenceId,
            taskId: operation.taskId,
            phase: operation.payload.phase,
            serverEvidenceId: replay.evidenceId!,
            sha256: operation.payload.clientSha256 || null,
            linkedAt: nowIso(),
          });
        });
      } else {
        await techPortalDb.outbox.put(syncedOperation);
      }
      synced += 1;
      continue;
    }
    const status: TechOutboxStatus = replay.status === 409 ? "CONFLICT" : replay.status === 403 ? "REJECTED" : "FAILED";
    const syncState: TechSyncState = status === "CONFLICT" ? "CONFLICT" : status === "REJECTED" ? "REJECTED" : "RETRY_AVAILABLE";
    await techPortalDb.outbox.put({ ...attemptedOperation, status, syncState, updatedAt: nowIso(), lastError: replay.message, nextAttemptAt: status === "FAILED" ? nextRetryAt(attemptedOperation.attempts) : null });
    blockedTasks.add(operation.taskId);
    lastError = replay.message;
    if (replay.status === 401) authRequired = true;
  }

  return { ...await getTechOfflineSummary(), synced, authRequired, lastError };
}

export async function requestTechBackgroundSync() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const syncRegistration = registration as ServiceWorkerRegistration & {
      sync?: { register: (tag: string) => Promise<void> };
    };
    await syncRegistration.sync?.register("tech-portal-outbox");
  } catch {
    // Page lifecycle events remain the fallback for browsers without Background Sync.
  }
}

export async function clearTechOfflineData() {
  if (!storageAvailable()) return;
  await techPortalDb.transaction("rw", techPortalDb.tasks, techPortalDb.outbox, techPortalDb.evidenceLinks, techPortalDb.drafts, techPortalDb.settings, async () => {
    await Promise.all([
      techPortalDb.tasks.clear(),
      techPortalDb.outbox.clear(),
      techPortalDb.evidenceLinks.clear(),
      techPortalDb.drafts.clear(),
      techPortalDb.settings.clear(),
    ]);
  });
}
