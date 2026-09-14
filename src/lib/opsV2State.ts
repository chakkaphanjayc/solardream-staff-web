import type { OpsActor, OpsCapability, OpsProjectState } from "@/types/ops-v2";

const TRANSITIONS: Readonly<Record<OpsProjectState, readonly OpsProjectState[]>> = {
  NEW: ["SITE_REVIEW"],
  SITE_REVIEW: ["ENGINEERING"],
  ENGINEERING: ["MATERIAL_PREPARATION"],
  MATERIAL_PREPARATION: ["READY_TO_SCHEDULE"],
  READY_TO_SCHEDULE: ["SCHEDULED"],
  SCHEDULED: ["IN_PROGRESS"],
  IN_PROGRESS: ["QA_COMMISSIONING"],
  QA_COMMISSIONING: ["HANDOVER"],
  HANDOVER: ["WARRANTY_ACTIVATION"],
  WARRANTY_ACTIVATION: ["COMPLETED"],
  COMPLETED: [],
};

const PROJECT_STATE_ORDER: Readonly<Record<OpsProjectState, number>> = {
  NEW: 0,
  SITE_REVIEW: 1,
  ENGINEERING: 2,
  MATERIAL_PREPARATION: 3,
  READY_TO_SCHEDULE: 4,
  SCHEDULED: 5,
  IN_PROGRESS: 6,
  QA_COMMISSIONING: 7,
  HANDOVER: 8,
  WARRANTY_ACTIVATION: 9,
  COMPLETED: 10,
};

export class OpsDomainError extends Error {
  readonly code:
    | "INVALID_TRANSITION"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "DEPENDENCY_BLOCKED"
    | "INVALID_INPUT";

  constructor(
    code: OpsDomainError["code"],
    message: string,
  ) {
    super(message);
    this.name = "OpsDomainError";
    this.code = code;
  }
}

export function canTransitionProjectState(
  from: OpsProjectState,
  to: OpsProjectState,
): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertProjectTransition(
  from: OpsProjectState,
  to: OpsProjectState,
) {
  if (!canTransitionProjectState(from, to)) {
    throw new OpsDomainError(
      "INVALID_TRANSITION",
      "Project cannot transition from " + from + " to " + to + ".",
    );
  }
}

/**
 * During the strangler rollout, the canonical lifecycle is authoritative even
 * when an older task row has not yet been rewritten to COMPLETED.
 */
export function isOpsProjectStateAtLeast(current: string, milestone: OpsProjectState) {
  const currentRank = PROJECT_STATE_ORDER[current as OpsProjectState];
  return currentRank !== undefined && currentRank >= PROJECT_STATE_ORDER[milestone];
}

export function isOpsProjectDependencySatisfied(current: string, dependencyCode: string) {
  const milestoneByDependency: Readonly<Record<string, OpsProjectState>> = {
    SITE_REVIEW: "ENGINEERING",
    ENGINEERING: "MATERIAL_PREPARATION",
    MATERIAL_PREPARATION: "READY_TO_SCHEDULE",
    INSTALLATION_EXECUTION: "QA_COMMISSIONING",
    QA_COMMISSIONING: "HANDOVER",
    HANDOVER: "WARRANTY_ACTIVATION",
  };
  const milestone = milestoneByDependency[dependencyCode];
  return milestone ? isOpsProjectStateAtLeast(current, milestone) : false;
}

const ROLE_CAPABILITIES: Readonly<Record<string, readonly OpsCapability[]>> = {
  ADMIN: [
    "project.read",
    "project.transition",
    "visit.read",
    "visit.schedule",
    "assignment.manage",
    "material.read",
    "material.manage",
    "field.execute",
    "field.review",
    "asset.read",
    "asset.register",
    "warranty.read",
    "warranty.activate",
    "service_case.read",
    "service_case.manage",
    "integration.read",
    "integration.replay",
  ],
  SUPER_ADMIN: [
    "project.read",
    "project.transition",
    "visit.read",
    "visit.schedule",
    "assignment.manage",
    "material.read",
    "material.manage",
    "field.execute",
    "field.review",
    "asset.read",
    "asset.register",
    "warranty.read",
    "warranty.activate",
    "service_case.read",
    "service_case.manage",
    "integration.read",
    "integration.replay",
  ],
  MANAGER: [
    "project.read",
    "project.transition",
    "visit.read",
    "visit.schedule",
    "assignment.manage",
    "material.read",
    "material.manage",
    "field.review",
    "asset.read",
    "asset.register",
    "warranty.read",
    "warranty.activate",
    "service_case.read",
    "service_case.manage",
    "integration.read",
  ],
  STAFF: [
    "project.read",
    "visit.read",
    "field.review",
    "asset.read",
    "warranty.read",
    "service_case.read",
  ],
  OPERATIONS: [
    "project.read",
    "project.transition",
    "visit.read",
    "visit.schedule",
    "assignment.manage",
    "material.read",
    "material.manage",
    "field.review",
    "asset.read",
    "asset.register",
    "warranty.read",
    "warranty.activate",
    "service_case.read",
    "service_case.manage",
  ],
  ENGINEER: ["project.read", "visit.read", "field.review", "asset.read"],
  SCHEDULER: ["project.read", "visit.read", "visit.schedule", "assignment.manage"],
  WAREHOUSE: ["project.read", "material.read", "material.manage", "asset.read"],
  INSTALLER: ["project.read", "visit.read", "field.execute", "asset.read", "asset.register", "warranty.read"],
  TECHNICIAN: ["project.read", "visit.read", "field.execute", "asset.read", "asset.register", "warranty.read"],
  SUPPORT: ["project.read", "asset.read", "warranty.read", "service_case.read", "service_case.manage"],
  CUSTOMER: ["project.read", "asset.read", "warranty.read", "service_case.read"],
  GUEST: ["project.read", "asset.read", "warranty.read"],
};

export function getRoleCapabilities(role: string): readonly OpsCapability[] {
  return ROLE_CAPABILITIES[role] || [];
}

export function hasOpsCapability(
  actor: OpsActor,
  capability: OpsCapability,
): boolean {
  return actor.capabilities?.includes("*") === true
    || actor.capabilities?.includes(capability) === true
    || getRoleCapabilities(actor.role).includes(capability);
}
