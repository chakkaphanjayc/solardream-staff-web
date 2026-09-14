export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type AuditMetadata = Record<string, JsonValue>;

export type AuditActorType =
  | "ANONYMOUS"
  | "USER"
  | "STAFF"
  | "ADMIN"
  | "SYSTEM"
  | "INTEGRATION";

export type AuditOutcome = "SUCCESS" | "FAILURE" | "DENIED";

export type AuditLogRow = {
  id: string;
  occurredAt: string;
  actorUserId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  actorType: AuditActorType;
  action: string;
  resourceType: string;
  resourceId: string | null;
  outcome: AuditOutcome;
  route: string | null;
  method: string | null;
  requestId: string | null;
  ipHash: string | null;
  userAgentHash: string | null;
  metadata: AuditMetadata;
};

export type AuditLogResult = {
  success: boolean;
  storageReady: boolean;
  rows: AuditLogRow[];
  error: string | null;
};
