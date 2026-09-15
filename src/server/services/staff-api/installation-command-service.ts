import "server-only";

import {
  erpNextGateway,
  ERPNextGatewayError,
  type ERPNextGateway,
} from "@/server/services/integrations/erpnext-gateway";

export type InstallationCommandState = "ERP_APPLIED" | "PENDING_ERP";

export type InstallationCommandResult<TResult> = {
  state: InstallationCommandState;
  provider: "ERPNext";
  result: TResult | null;
};

export type InstallationCommandGateway = Pick<
  ERPNextGateway,
  | "isConfigured"
  | "completeInstallationChecklistItem"
  | "completeInstallationTask"
  | "reviewInstallationEvidence"
  | "amendInstallationChecklistItem"
>;

function text(value: string | null | undefined) {
  return value?.trim() || "";
}

function required(value: string | null | undefined, field: string) {
  const normalized = text(value);
  if (!normalized) {
    throw new ERPNextGatewayError("VALIDATION", `${field} is required for an installation command.`);
  }
  return normalized;
}

function requiredIdempotencyKey(value: string) {
  const key = required(value, "An idempotency key");
  if (!/^[A-Za-z0-9._:-]{16,160}$/.test(key)) {
    throw new ERPNextGatewayError("VALIDATION", "The installation command idempotency key is invalid.");
  }
  return key;
}

export function isInstallationCommandApiEnabled() {
  return process.env.ERPNEXT_INSTALLATION_SYNC_ENABLED?.trim().toLowerCase() === "true"
    && process.env.ERPNEXT_INSTALLATION_COMMANDS_ENABLED?.trim().toLowerCase() === "true";
}

export function getInstallationCommandState(input: {
  enabled: boolean;
  configured: boolean;
}): InstallationCommandState {
  return input.enabled && input.configured ? "ERP_APPLIED" : "PENDING_ERP";
}

export class StaffInstallationCommandService {
  constructor(private readonly gateway: InstallationCommandGateway = erpNextGateway) {}

  isEnabled() {
    return isInstallationCommandApiEnabled();
  }

  private async execute<TResult>(
    operation: (gateway: InstallationCommandGateway) => Promise<TResult>,
  ): Promise<InstallationCommandResult<TResult>> {
    const state = getInstallationCommandState({
      enabled: this.isEnabled(),
      configured: this.gateway.isConfigured(),
    });
    if (state === "PENDING_ERP") {
      return { state, provider: "ERPNext", result: null };
    }
    return {
      state,
      provider: "ERPNext",
      result: await operation(this.gateway),
    };
  }

  async completeChecklistItem(input: {
    taskId: string;
    itemCode: string;
    outcome: "PASS" | "FAIL" | "NA";
    remarks?: string | null;
    evidenceHash?: string | null;
    evidenceMime?: string | null;
    idempotencyKey: string;
  }) {
    const taskId = required(input.taskId, "The ERPNext Task ID");
    const itemCode = required(input.itemCode, "The checklist item code");
    const idempotencyKey = requiredIdempotencyKey(input.idempotencyKey);
    const outcome = input.outcome === "PASS" ? "Pass" : input.outcome === "FAIL" ? "Fail" : "N/A";
    const remarks = text(input.remarks);
    if (outcome === "N/A" && !remarks) {
      throw new ERPNextGatewayError("VALIDATION", "N/A checklist commands require a reason.");
    }
    return this.execute((gateway) => gateway.completeInstallationChecklistItem({
      taskId,
      itemCode,
      outcome,
      remarks: remarks || null,
      evidenceHash: text(input.evidenceHash) || null,
      evidenceMime: text(input.evidenceMime) || null,
      idempotencyKey,
    }));
  }

  async completeTask(input: { taskId: string; idempotencyKey: string }) {
    const taskId = required(input.taskId, "The ERPNext Task ID");
    const idempotencyKey = requiredIdempotencyKey(input.idempotencyKey);
    return this.execute((gateway) => gateway.completeInstallationTask({ taskId, idempotencyKey }));
  }

  async reviewEvidence(input: {
    taskId: string;
    itemCode: string;
    decision: "READY" | "REJECTED";
    reason: string;
    evidenceHash: string;
    idempotencyKey: string;
  }) {
    const taskId = required(input.taskId, "The ERPNext Task ID");
    const itemCode = required(input.itemCode, "The checklist item code");
    const reason = required(input.reason, "The evidence review reason");
    const evidenceHash = required(input.evidenceHash, "The evidence SHA-256");
    const idempotencyKey = requiredIdempotencyKey(input.idempotencyKey);
    return this.execute((gateway) => gateway.reviewInstallationEvidence({
      taskId,
      itemCode,
      decision: input.decision === "READY" ? "Approved" : "Rejected",
      reason,
      evidenceHash,
      idempotencyKey,
    }));
  }

  async amendChecklistItem(input: {
    taskId: string;
    itemCode: string;
    newItemCode?: string | null;
    label: string;
    evidenceRequired: boolean;
    allowsNa: boolean;
    reason: string;
    idempotencyKey: string;
  }) {
    const taskId = required(input.taskId, "The ERPNext Task ID");
    const itemCode = required(input.itemCode, "The checklist item code");
    const newItemCode = text(input.newItemCode);
    const label = required(input.label, "The amended checklist label");
    const reason = required(input.reason, "The amendment reason");
    const idempotencyKey = requiredIdempotencyKey(input.idempotencyKey);
    return this.execute((gateway) => gateway.amendInstallationChecklistItem({
      taskId,
      itemCode,
      newItemCode: newItemCode || null,
      label,
      evidenceRequired: input.evidenceRequired,
      allowsNa: input.allowsNa,
      reason,
      idempotencyKey,
    }));
  }
}

export const staffInstallationCommandService = new StaffInstallationCommandService();
