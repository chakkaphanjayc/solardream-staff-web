import type { TechSyncState } from "@solar-dream/contracts/tech-sync";

export type TechOutboxStatus = "PENDING" | "PENDING_AUTH" | "SYNCING" | "SYNCED" | "FAILED" | "CONFLICT" | "REJECTED";
export type TechSyncAckState = Extract<TechSyncState, "PENDING_SERVER" | "PENDING_ERP" | "SYNCED">;
export type TechSyncResponseClass = "AUTH" | "NON_JSON" | "JSON";

export function getLegacyTechSyncState(status: TechOutboxStatus): TechSyncState {
  if (status === "SYNCING") return "UPLOADING";
  if (status === "SYNCED") return "SYNCED";
  if (status === "CONFLICT") return "CONFLICT";
  if (status === "REJECTED") return "REJECTED";
  if (status === "PENDING_AUTH") return "PENDING_AUTH";
  if (status === "FAILED") return "RETRY_AVAILABLE";
  return "LOCAL_SAVED";
}

export function isTechSyncAckState(value: unknown): value is TechSyncAckState {
  return value === "PENDING_SERVER" || value === "PENDING_ERP" || value === "SYNCED";
}

export function getTechRetryDelayMs(attempts: number) {
  const boundedAttempt = Math.min(Math.max(attempts, 1), 10);
  return Math.min(15 * 60 * 1000, 2 ** boundedAttempt * 1000);
}

export function classifyTechSyncResponse(input: {
  status: number;
  contentType: string | null | undefined;
  redirected?: boolean;
}): TechSyncResponseClass {
  const contentType = input.contentType?.toLowerCase() || "";
  const isJson = contentType.includes("application/json") || contentType.includes("application/problem+json");
  if (input.redirected || input.status === 401 || contentType.includes("text/html") || (input.status === 403 && !isJson)) return "AUTH";
  if (isJson) return "JSON";
  return "NON_JSON";
}
