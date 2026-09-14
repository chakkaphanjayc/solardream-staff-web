"use client";

import Dexie, { type Table } from "dexie";

import type {
  TechDashboardResponse,
  TechDashboardTask,
  TechOperationSource,
  TechPortalPhaseCode,
  TechPreFlightCheckKey,
  TechTestValues,
  TechnicianGps,
} from "@/types/techPortal";

export type TechOutboxStatus = "PENDING" | "SYNCING" | "SYNCED" | "FAILED" | "CONFLICT";

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
      file: Blob;
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

export type TechOfflineOperationInput =
  | Pick<Extract<TechOfflineOperation, { type: "JOB_STARTED" }>, "type" | "taskId" | "fieldVisitId" | "idempotencyKey" | "payload">
  | Pick<Extract<TechOfflineOperation, { type: "QC_EVIDENCE_UPLOADED" }>, "type" | "taskId" | "fieldVisitId" | "idempotencyKey" | "payload" | "file" | "fileName" | "contentType">
  | Pick<Extract<TechOfflineOperation, { type: "QC_PHASE_COMPLETED" }>, "type" | "taskId" | "fieldVisitId" | "idempotencyKey" | "payload">
  | Pick<Extract<TechOfflineOperation, { type: "HANDOVER_CAPTURED" }>, "type" | "taskId" | "fieldVisitId" | "idempotencyKey" | "payload">
  | Pick<Extract<TechOfflineOperation, { type: "ASSET_REGISTERED" }>, "type" | "taskId" | "fieldVisitId" | "idempotencyKey" | "payload">;

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
  syncing: number;
  failed: number;
  conflicts: number;
};

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
  }
}

export const techPortalDb = new TechPortalDatabase();

function storageAvailable() {
  return typeof indexedDB !== "undefined";
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

export async function cacheTechnicianDashboard(payload: TechDashboardResponse) {
  if (!storageAvailable()) return;
  const cachedAt = nowIso();
  await techPortalDb.transaction("rw", techPortalDb.tasks, techPortalDb.outbox, techPortalDb.evidenceLinks, techPortalDb.drafts, techPortalDb.settings, async () => {
    const currentScope = await techPortalDb.settings.get("cacheScope");
    if (currentScope && currentScope.value !== payload.cacheScope) {
      await techPortalDb.tasks.clear();
      await techPortalDb.outbox.clear();
      await techPortalDb.evidenceLinks.clear();
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
    await techPortalDb.settings.put({ key: "dashboardDate", value: payload.date });
    await techPortalDb.settings.put({ key: "dashboardReadOnly", value: payload.readOnly ? "true" : "false" });
    await techPortalDb.settings.put({ key: "dashboardCachedAt", value: cachedAt });
  });
}

export async function getCachedTechnicianDashboard(): Promise<{ date: string; tasks: TechDashboardTask[]; cacheScope: string; readOnly: boolean } | null> {
  if (!storageAvailable()) return null;
  const scope = await techPortalDb.settings.get("cacheScope");
  const date = await techPortalDb.settings.get("dashboardDate");
  const readOnly = await techPortalDb.settings.get("dashboardReadOnly");
  if (typeof scope?.value !== "string" || typeof date?.value !== "string") return null;
  const rows = await techPortalDb.tasks.toArray();
  if (rows.length === 0) return null;
  return {
    date: date.value,
    cacheScope: scope.value,
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
  const sequence = await getNextSequence();
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
  };
  await techPortalDb.outbox.put(stored);
  await requestTechBackgroundSync();
  return stored;
}

async function normalizeStaleSyncingOperations() {
  const staleAt = Date.now() - 5 * 60 * 1000;
  const syncing = await techPortalDb.outbox.where("status").equals("SYNCING").toArray();
  await Promise.all(syncing.filter((operation) => Date.parse(operation.updatedAt) < staleAt).map((operation) =>
    techPortalDb.outbox.put({ ...operation, status: "PENDING", updatedAt: nowIso(), lastError: "Sync resumed after an interrupted attempt." }),
  ));
}

export async function getTechOfflineSummary(): Promise<TechOfflineSummary> {
  if (!storageAvailable()) return { pending: 0, syncing: 0, failed: 0, conflicts: 0 };
  await normalizeStaleSyncingOperations();
  const operations = await techPortalDb.outbox.toArray();
  return operations.reduce<TechOfflineSummary>((summary, operation) => {
    if (operation.status === "PENDING") summary.pending += 1;
    if (operation.status === "SYNCING") summary.syncing += 1;
    if (operation.status === "FAILED") summary.failed += 1;
    if (operation.status === "CONFLICT") summary.conflicts += 1;
    return summary;
  }, { pending: 0, syncing: 0, failed: 0, conflicts: 0 });
}

export async function getPendingTechHandoverTaskIds() {
  if (!storageAvailable()) return [];
  const operations = await techPortalDb.outbox.toArray();
  return Array.from(new Set(operations
    .filter((operation) => operation.type === "HANDOVER_CAPTURED" && ["PENDING", "SYNCING", "FAILED", "CONFLICT"].includes(operation.status))
    .map((operation) => operation.taskId)));
}

export async function retryTechConflicts() {
  if (!storageAvailable()) return;
  const conflicts = await techPortalDb.outbox.where("status").equals("CONFLICT").toArray();
  await Promise.all(conflicts.map((operation) => techPortalDb.outbox.put({
    ...operation,
    status: "PENDING",
    updatedAt: nowIso(),
    lastError: null,
  })));
}

async function getEvidenceLinks(localIds: readonly string[]) {
  if (localIds.length === 0) return [];
  const links = await techPortalDb.evidenceLinks.bulkGet([...localIds]);
  return links.filter((link): link is TechEvidenceLink => Boolean(link));
}

type ReplayResult =
  | { kind: "SUCCESS"; status: number; result: unknown; evidenceId?: string }
  | { kind: "WAIT"; message: string }
  | { kind: "FAILURE"; status: number; message: string };

async function replayOperation(operation: TechOfflineOperation): Promise<ReplayResult> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return { kind: "WAIT", message: "The device is offline." };

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 45_000);
  let response: Response;
  try {
    if (operation.type === "QC_EVIDENCE_UPLOADED") {
      const form = new FormData();
      form.set("operation", JSON.stringify({
        type: operation.type,
        operationId: operation.idempotencyKey,
        taskId: operation.taskId,
        fieldVisitId: operation.fieldVisitId || null,
        payload: operation.payload,
      }));
      form.set("file", operation.file, operation.fileName);
      response = await fetch("/api/tech/sync", { method: "POST", body: form, credentials: "same-origin", signal: controller.signal });
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: operation.type,
          operationId: operation.idempotencyKey,
          taskId: operation.taskId,
          fieldVisitId: operation.fieldVisitId || null,
          payload,
        }),
        signal: controller.signal,
      });
    }

    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message = getApiMessage(body, `Sync failed (${response.status}).`);
      return { kind: "FAILURE", status: response.status, message };
    }
    const result = body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>).result
      : null;
    const candidateEvidenceId = result && typeof result === "object" && !Array.isArray(result)
      ? (result as Record<string, unknown>).evidenceId
      : undefined;
    const evidenceId = typeof candidateEvidenceId === "string" ? candidateEvidenceId : undefined;
    return { kind: "SUCCESS", status: response.status, result, ...(evidenceId ? { evidenceId } : {}) };
  } finally {
    window.clearTimeout(timeout);
  }
}

export type TechSyncResult = TechOfflineSummary & {
  synced: number;
  authRequired: boolean;
  lastError: string | null;
};

export async function syncTechOutbox(): Promise<TechSyncResult> {
  const empty: TechSyncResult = { pending: 0, syncing: 0, failed: 0, conflicts: 0, synced: 0, authRequired: false, lastError: null };
  if (!storageAvailable() || (typeof navigator !== "undefined" && !navigator.onLine)) return empty;
  await normalizeStaleSyncingOperations();
  const operations = await techPortalDb.outbox.toArray();
  const candidates = operations
    .filter((operation) => operation.status === "PENDING" || operation.status === "FAILED")
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
      await techPortalDb.outbox.put({ ...attemptedOperation, status: "PENDING", updatedAt: nowIso(), lastError: replay.message });
      blockedTasks.add(operation.taskId);
      lastError = replay.message;
      continue;
    }
    if (replay.kind === "SUCCESS") {
      await techPortalDb.outbox.put({ ...attemptedOperation, status: "SYNCED", updatedAt: nowIso(), lastError: null, result: replay.result });
      if (operation.type === "QC_EVIDENCE_UPLOADED" && replay.evidenceId) {
        await techPortalDb.evidenceLinks.put({
          localEvidenceId: operation.payload.localEvidenceId,
          taskId: operation.taskId,
          phase: operation.payload.phase,
          serverEvidenceId: replay.evidenceId,
          sha256: operation.payload.clientSha256 || null,
          linkedAt: nowIso(),
        });
      }
      synced += 1;
      continue;
    }
    const status: TechOutboxStatus = replay.status === 409 ? "CONFLICT" : "FAILED";
    await techPortalDb.outbox.put({ ...attemptedOperation, status, updatedAt: nowIso(), lastError: replay.message });
    blockedTasks.add(operation.taskId);
    lastError = replay.message;
    if (replay.status === 401 || replay.status === 403) authRequired = true;
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
