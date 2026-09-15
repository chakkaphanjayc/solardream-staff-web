type JsonObject = Record<string, unknown>;

export type InstallationAuditReplayRecord = {
  eventType: string;
  proposalId: string;
  taskId: string | null;
  checklistItemId: string | null;
  payload: unknown;
};

export type InstallationAuditReplayExpectation = {
  eventType: string;
  proposalId: string;
  taskId?: string | null;
  checklistItemId?: string | null;
  payload?: JsonObject;
};

export class InstallationIdempotencyConflictError extends Error {
  constructor() {
    super("Idempotency key is already bound to a different installation command.");
    this.name = "InstallationIdempotencyConflictError";
  }
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function payloadMatches(actual: unknown, expected: JsonObject | undefined) {
  if (!expected) return true;
  const actualObject = isJsonObject(actual) ? actual : {};
  return Object.entries(expected).every(([key, value]) => Object.is(actualObject[key], value));
}

export function assertInstallationAuditReplay(
  existing: InstallationAuditReplayRecord | null | undefined,
  expected: InstallationAuditReplayExpectation,
) {
  if (!existing) return false;

  const sameResource = existing.eventType === expected.eventType
    && existing.proposalId === expected.proposalId
    && (expected.taskId === undefined || existing.taskId === expected.taskId)
    && (expected.checklistItemId === undefined || existing.checklistItemId === expected.checklistItemId)
    && payloadMatches(existing.payload, expected.payload);

  if (!sameResource) throw new InstallationIdempotencyConflictError();
  return true;
}
