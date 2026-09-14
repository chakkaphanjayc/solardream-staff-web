export const OPS_PROJECT_STATES = [
  "NEW",
  "SITE_REVIEW",
  "ENGINEERING",
  "MATERIAL_PREPARATION",
  "READY_TO_SCHEDULE",
  "SCHEDULED",
  "IN_PROGRESS",
  "QA_COMMISSIONING",
  "HANDOVER",
  "WARRANTY_ACTIVATION",
  "COMPLETED",
] as const;

export type OpsProjectState = (typeof OPS_PROJECT_STATES)[number];

export const FIELD_VISIT_STATUSES = [
  "PLANNED",
  "CONFIRMED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
] as const;

export type FieldVisitStatus = (typeof FIELD_VISIT_STATUSES)[number];

export const JOB_ASSIGNMENT_STATUSES = [
  "ASSIGNED",
  "ACCEPTED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
  "SUPERSEDED",
] as const;

export type JobAssignmentStatus = (typeof JOB_ASSIGNMENT_STATUSES)[number];

export const MATERIAL_REQUIREMENT_STATUSES = [
  "ESTIMATED",
  "REQUIRED",
  "RESERVED",
  "PICKED",
  "ISSUED",
  "SHORT",
  "CANCELLED",
] as const;

export type MaterialRequirementStatus = (typeof MATERIAL_REQUIREMENT_STATUSES)[number];

export const SERVICE_CASE_STATUSES = [
  "NEW",
  "TRIAGED",
  "SCHEDULED",
  "IN_PROGRESS",
  "WAITING_CUSTOMER",
  "RESOLVED",
  "CLOSED",
  "CANCELLED",
] as const;

export type ServiceCaseStatus = (typeof SERVICE_CASE_STATUSES)[number];

export const WARRANTY_DECISIONS = [
  "COVERED",
  "EXPIRED",
  "NOT_COVERED",
  "REVIEW_REQUIRED",
] as const;

export type WarrantyDecision = (typeof WARRANTY_DECISIONS)[number];

export type OpsRole =
  | "ADMIN"
  | "OPERATIONS"
  | "ENGINEER"
  | "SCHEDULER"
  | "WAREHOUSE"
  | "TECHNICIAN"
  | "SUPPORT"
  | "CUSTOMER"
  | "GUEST";

export type OpsV2FeatureFlag =
  | "OPS_V2_PROJECTS"
  | "OPS_V2_PROJECT_WORKSPACE"
  | "OPS_V2_SCHEDULING"
  | "OPS_V2_FIELD"
  | "OPS_V2_ASSETS"
  | "OPS_V2_WARRANTY"
  | "OPS_V2_AFTER_SALES"
  | "OPS_V2_CUSTOMER_PORTAL";

export type OpsCapability =
  | "project.read"
  | "project.transition"
  | "visit.read"
  | "visit.schedule"
  | "assignment.manage"
  | "material.read"
  | "material.manage"
  | "field.execute"
  | "field.review"
  | "asset.read"
  | "asset.register"
  | "warranty.read"
  | "warranty.activate"
  | "service_case.read"
  | "service_case.manage"
  | "integration.read"
  | "integration.replay";

export type OpsActor = {
  userId: string;
  role: string;
  capabilities?: readonly string[];
};

export type OpsProjectTransitionCommand = {
  projectId: string;
  to: OpsProjectState;
  idempotencyKey: string;
  reason?: string;
  source?: string;
};

export type OpsSiteInput = {
  customerId: string;
  label: string;
  addressLine1: string;
  addressLine2?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  country?: string;
  latitude?: number | null;
  longitude?: number | null;
  accessNotes?: string | null;
  sourceKey?: string | null;
  sourceReferences?: Record<string, unknown>;
};

export type OpsProjectSummary = {
  id: string;
  projectCode: string;
  proposalId: string;
  customerId: string | null;
  siteId: string | null;
  lifecycleState: OpsProjectState;
  legacyStatus: string;
  erpnextSyncStatus: string;
  permitStatus: string;
  createdAt: string;
  updatedAt: string;
};

export type OpsApiErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID_INPUT"
  | "INVALID_TRANSITION"
  | "CONFLICT"
  | "DEPENDENCY_BLOCKED"
  | "INTERNAL_ERROR";
