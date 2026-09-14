export const STAFF_PERMISSION_OPTIONS = [
  "crm:read",
  "crm:read:own",
  "quotations:read",
  "quotations:read:own",
  "payments:read",
  "projects:read",
  "projects:read:own",
  "projects:read:all",
  "tasks:read",
  "tasks:read:own",
  "tasks:read:all",
  "tickets:read",
  "tickets:read:own",
  "tickets:write",
  "assets:read",
  "external:work:read",
  "external:evidence:read",
  "*",
] as const;

export type StaffPermission = (typeof STAFF_PERMISSION_OPTIONS)[number];
export type StaffScopeMode = "ALL" | "OWN";
export type StaffResource = "crm" | "quotations" | "projects" | "tasks" | "tickets" | "payments" | "assets";
export type ExternalScopeType = "PROJECT" | "TASK" | "PROPOSAL";

export type DeveloperRole = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  permissions: string[];
  scopeMode: StaffScopeMode;
  isSystem: boolean;
  isActive: boolean;
  assignmentCount: number;
  updatedAt: string;
};

export type DeveloperStaffMember = {
  id: string;
  email: string;
  name: string;
  role: string;
  department: string;
  isActive: boolean;
};

export type DeveloperAssignment = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  roleId: string;
  roleCode: string;
  roleName: string;
  scopeMode: StaffScopeMode;
  expiresAt: string | null;
  isActive: boolean;
};

export type DeveloperProjectOption = {
  id: string;
  projectCode: string;
  proposalId: string;
  customerName: string;
  status: string;
};

export type DeveloperTaskOption = {
  id: string;
  title: string;
  taskCode: string;
  projectId: string;
  projectCode: string;
  proposalId: string;
  status: string;
};

export type DeveloperSalesProposal = {
  id: string;
  customerName: string;
  status: string;
  salesOwnerId: string | null;
};

export type DeveloperExternalAccount = {
  id: string;
  displayName: string;
  email: string | null;
  companyName: string | null;
  scopeType: ExternalScopeType;
  scopeId: string;
  permissions: string[];
  expiresAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export type DeveloperAccessState = {
  roles: DeveloperRole[];
  staff: DeveloperStaffMember[];
  assignments: DeveloperAssignment[];
  projects: DeveloperProjectOption[];
  tasks: DeveloperTaskOption[];
  salesProposals: DeveloperSalesProposal[];
  externalAccounts: DeveloperExternalAccount[];
};

export type ExternalWorkView = {
  account: {
    id: string;
    displayName: string;
    companyName: string | null;
    scopeType: ExternalScopeType;
    expiresAt: string;
    permissions: string[];
  };
  project: { id: string; projectCode: string; status: string; customerName: string; proposalId: string } | null;
  tasks: Array<{ id: string; taskCode: string; title: string; status: string }>;
};
