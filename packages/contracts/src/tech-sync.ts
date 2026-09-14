export const TECH_SYNC_STATES = [
  "LOCAL_SAVED",
  "PENDING_NETWORK",
  "PENDING_AUTH",
  "UPLOADING",
  "PENDING_SERVER",
  "PENDING_ERP",
  "SYNCED",
  "CONFLICT",
  "REJECTED",
  "RETRY_AVAILABLE",
] as const;

export type TechSyncState = (typeof TECH_SYNC_STATES)[number];

export const TECH_COMMAND_TYPES = [
  "JOB_STARTED",
  "QC_EVIDENCE_UPLOADED",
  "QC_PHASE_COMPLETED",
  "HANDOVER_CAPTURED",
  "ASSET_REGISTERED",
] as const;

export type TechCommandType = (typeof TECH_COMMAND_TYPES)[number];

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type TechSyncCommand<TPayload extends JsonValue = JsonValue> = {
  commandId: string;
  idempotencyKey: string;
  commandType: TechCommandType;
  taskId: string;
  fieldVisitId: string | null;
  actorUserId: string;
  deviceId: string;
  baseVersion: string | null;
  payloadSchemaVersion: number;
  dependencyReferences: readonly string[];
  clientCreatedAt: string;
  payload: TPayload;
};

export type TechCommandAck = {
  commandId: string;
  state: Extract<TechSyncState, "PENDING_SERVER" | "PENDING_ERP" | "SYNCED" | "CONFLICT" | "REJECTED">;
  serverAcknowledged: boolean;
  erpApplied: boolean;
  canonicalVersion: string | null;
  receivedAt: string;
  message: string | null;
};

export type TechSyncResponse = {
  success: boolean;
  results: readonly TechCommandAck[];
  retryAfterSeconds?: number;
};
