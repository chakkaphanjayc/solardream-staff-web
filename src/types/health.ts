export type HealthStatus = "ok" | "degraded" | "down";

export interface DatabaseHealth {
  status: "connected" | "disconnected" | "error";
  latencyMs?: number;
  error?: string;
}

export interface PublicDatabaseHealth {
  status: DatabaseHealth["status"];
  latencyMs?: number;
}

export interface SystemMemoryInfo {
  rssMB: number;
  heapTotalMB: number;
  heapUsedMB: number;
  externalMB: number;
}

export interface HealthDiagnostics {
  uptimeSeconds: number;
  environment: string;
  memory: SystemMemoryInfo;
  version?: string;
}

export interface HealthStatusResponse {
  status: HealthStatus;
  timestamp: string;
  database: PublicDatabaseHealth;
  diagnostics?: HealthDiagnostics;
}
