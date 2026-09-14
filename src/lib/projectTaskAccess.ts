export type InstallationSnapshotActor = {
  userId: string;
  mode: "GUEST" | "MEMBER" | "INSTALLER" | "REVIEWER";
  role: "USER" | "CUSTOMER" | "INSTALLER" | "STAFF" | "MANAGER" | "ADMIN" | "SUPER_ADMIN";
};

export type ProjectTaskCapabilityInput = {
  actor: InstallationSnapshotActor;
  assignedUserId: string | null;
  taskStatus: string;
  dependencyReady: boolean;
  evidenceReady: boolean;
  checklistReady: boolean;
};

export type ProjectTaskCapabilities = {
  canView: boolean;
  canExecute: boolean;
  canUploadEvidence: boolean;
  canComplete: boolean;
  canReview: boolean;
  canReject: boolean;
  canAmend: boolean;
  isAssignedActor: boolean;
  dependencyReady: boolean;
  evidenceReady: boolean;
  checklistReady: boolean;
  lockedReason: string | null;
};

export type ChecklistReadinessItem = { required: boolean; evidenceRequired: boolean; status: string; outcome: string | null; evidenceReady: boolean };

export function deriveChecklistReadiness(items: ChecklistReadinessItem[]) {
  return {
    evidenceReady: items.every((item) => !item.evidenceRequired || item.outcome === "NA" || item.status === "VERIFIED" || item.evidenceReady),
    checklistReady: items.every((item) => !item.required || (item.status === "VERIFIED" && (item.outcome === "PASS" || item.outcome === "NA"))),
  };
}

const REVIEW_ROLES = new Set(["STAFF", "MANAGER", "ADMIN", "SUPER_ADMIN"]);

export function deriveProjectTaskAccess(input: ProjectTaskCapabilityInput): ProjectTaskCapabilities {
  const reviewer = input.actor.mode === "REVIEWER" && REVIEW_ROLES.has(input.actor.role);
  const assigned = input.actor.mode === "INSTALLER" && input.assignedUserId === input.actor.userId;
  const active = input.taskStatus === "OPEN";
  const executable = assigned && active && input.dependencyReady;
  const readOnly = input.actor.mode === "GUEST" || input.actor.mode === "MEMBER";
  const canView = readOnly || reviewer || assigned;
  let lockedReason: string | null = null;
  if (readOnly) lockedReason = "READ_ONLY";
  else if (input.actor.mode === "INSTALLER" && !assigned) lockedReason = "NOT_ASSIGNED";
  else if (!active) lockedReason = "TASK_NOT_ACTIVE";
  else if (!input.dependencyReady) lockedReason = "DEPENDENCY_INCOMPLETE";
  else if (assigned && !input.checklistReady) lockedReason = "CHECKLIST_INCOMPLETE";
  else if (assigned && !input.evidenceReady) lockedReason = "EVIDENCE_NOT_READY";
  return {
    canView,
    canExecute: executable,
    canUploadEvidence: executable,
    canComplete: executable && input.checklistReady && input.evidenceReady,
    canReview: reviewer,
    canReject: reviewer,
    canAmend: reviewer,
    isAssignedActor: assigned,
    dependencyReady: input.dependencyReady,
    evidenceReady: input.evidenceReady,
    checklistReady: input.checklistReady,
    lockedReason,
  };
}
