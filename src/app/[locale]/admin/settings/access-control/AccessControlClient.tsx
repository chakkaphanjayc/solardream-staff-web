"use client";

import { useMemo, useState } from "react";
import { Check, Copy, ExternalLink, KeyRound, Plus, RefreshCw, ShieldCheck, Trash2, UserRound, X } from "@/components/ui/icons";
import { toast } from "sonner";

import { STAFF_PERMISSION_OPTIONS } from "@/lib/developerAccessContracts";
import type {
  DeveloperAccessState,
  DeveloperAssignment,
  DeveloperExternalAccount,
  DeveloperRole,
  ExternalScopeType,
  StaffScopeMode,
} from "@/lib/developerAccessContracts";
import { cn } from "@/lib/utils";
import { AdminBulkActionBar } from "@/components/admin/AdminBulkActionBar";
import { AdminSelectionCheckbox } from "@/components/admin/AdminSelectionCheckbox";
import { useAdminSelection } from "@/hooks/useAdminSelection";

type AccessControlClientProps = {
  initialState: DeveloperAccessState;
  locale: "en" | "th";
};

type Tab = "roles" | "external";

const rolePermissionLabels: Record<string, string> = {
  "crm:read": "Read CRM",
  "crm:read:own": "Read owned CRM",
  "quotations:read": "Read quotations",
  "quotations:read:own": "Read owned quotations",
  "payments:read": "Read payment status",
  "projects:read": "Read projects",
  "projects:read:own": "Read assigned projects",
  "projects:read:all": "Read all projects",
  "tasks:read": "Read tasks",
  "tasks:read:own": "Read assigned tasks",
  "tasks:read:all": "Read all tasks",
  "tickets:read": "Read tickets",
  "tickets:read:own": "Read assigned tickets",
  "tickets:write": "Update tickets",
  "assets:read": "Read installed assets",
  "external:work:read": "External work view",
  "external:evidence:read": "External evidence view",
  "*": "All permissions",
};

function futureDateInput(days: number) {
  const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 16);
}

function displayDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "Never used";
}

function preferredExternalScopeType(state: DeveloperAccessState): ExternalScopeType {
  if (state.projects.length > 0) return "PROJECT";
  if (state.tasks.length > 0) return "TASK";
  if (state.salesProposals.length > 0) return "PROPOSAL";
  return "PROJECT";
}

export default function AccessControlClient({ initialState, locale }: AccessControlClientProps) {
  const [state, setState] = useState(initialState);
  const [tab, setTab] = useState<Tab>("roles");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [roleBeingEdited, setRoleBeingEdited] = useState<DeveloperRole | null>(null);
  const [roleCode, setRoleCode] = useState("");
  const [roleName, setRoleName] = useState("");
  const [roleDescription, setRoleDescription] = useState("");
  const [roleScopeMode, setRoleScopeMode] = useState<StaffScopeMode>("OWN");
  const [rolePermissions, setRolePermissions] = useState<string[]>(["crm:read"]);
  const [assignmentUserId, setAssignmentUserId] = useState("");
  const [assignmentRoleId, setAssignmentRoleId] = useState("");
  const [assignmentScope, setAssignmentScope] = useState<StaffScopeMode>("OWN");
  const [assignmentExpiry, setAssignmentExpiry] = useState("");
  const [externalName, setExternalName] = useState("");
  const [externalEmail, setExternalEmail] = useState("");
  const [externalCompany, setExternalCompany] = useState("");
  const [externalScopeType, setExternalScopeType] = useState<ExternalScopeType>(() => preferredExternalScopeType(initialState));
  const [externalScopeId, setExternalScopeId] = useState("");
  const [externalExpiry, setExternalExpiry] = useState(() => futureDateInput(14));
  const [externalPermissions, setExternalPermissions] = useState<string[]>(["external:work:read"]);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const activeRoles = useMemo(() => state.roles.filter((role) => role.isActive), [state.roles]);
  const roleSelection = useAdminSelection(state.roles.filter((role) => !role.isSystem).map((role) => role.id));
  const assignmentSelection = useAdminSelection(state.assignments.map((assignment) => assignment.id));
  const externalSelection = useAdminSelection(state.externalAccounts.map((account) => account.id));
  const selectedExternalOptions = useMemo(() => {
    if (externalScopeType === "TASK") {
      return state.tasks.map((task) => ({ id: task.id, label: `${task.projectCode} · ${task.taskCode} · ${task.title}` }));
    }
    if (externalScopeType === "PROPOSAL") {
      return state.salesProposals.map((proposal) => ({ id: proposal.id, label: `${proposal.customerName} · ${proposal.status}` }));
    }
    return state.projects.map((project) => ({ id: project.id, label: `${project.projectCode} · ${project.customerName}` }));
  }, [externalScopeType, state.projects, state.salesProposals, state.tasks]);

  const externalScopeLabel = externalScopeType === "TASK"
    ? "installation tasks"
    : externalScopeType === "PROPOSAL"
      ? "quotations / proposals"
      : "installation projects";

  async function refresh() {
    setIsRefreshing(true);
    try {
      const response = await fetch("/api/admin/developer/access", { cache: "no-store" });
      const payload: unknown = await response.json();
      if (!response.ok || !payload || typeof payload !== "object" || !Array.isArray((payload as { roles?: unknown }).roles)) throw new Error("Access data could not be refreshed.");
      setState(payload as DeveloperAccessState);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Access data could not be refreshed.");
    } finally {
      setIsRefreshing(false);
    }
  }

  async function mutate(body: Record<string, unknown>, successMessage: string) {
    setIsSaving(true);
    try {
      const response = await fetch("/api/admin/developer/access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message = payload && typeof payload === "object" && typeof (payload as { error?: unknown }).error === "string" ? (payload as { error: string }).error : "The access change could not be saved.";
        throw new Error(message);
      }
      toast.success(successMessage);
      await refresh();
      return payload;
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "The access change could not be saved.");
      return null;
    } finally {
      setIsSaving(false);
    }
  }

  async function bulkMutate(
    ids: readonly string[],
    action: "delete-role" | "revoke-assignment" | "revoke-external" | "delete-external",
    idField: "roleId" | "assignmentId" | "accountId",
    successMessage: string,
  ) {
    if (ids.length === 0) return;
    setIsSaving(true);
    try {
      const results = await Promise.all(ids.map(async (id) => {
        const response = await fetch("/api/admin/developer/access", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, [idField]: id }),
        });
        return response.ok;
      }));
      const successCount = results.filter(Boolean).length;
      if (successCount > 0) toast.success(`${successCount} ${successMessage}`);
      if (successCount < ids.length) toast.error(`${ids.length - successCount} access record(s) could not be updated.`);
      await refresh();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "The access changes could not be saved.");
    } finally {
      setIsSaving(false);
    }
  }

  const handleBulkDeleteRoles = () => {
    const ids = Array.from(roleSelection.selectedIds);
    if (ids.length === 0 || !window.confirm(`Delete ${ids.length} selected custom role${ids.length === 1 ? "" : "s"}?`)) return;
    roleSelection.clear();
    void bulkMutate(ids, "delete-role", "roleId", "custom role(s) deleted.");
  };

  const handleBulkRevokeAssignments = () => {
    const ids = Array.from(assignmentSelection.selectedIds);
    if (ids.length === 0 || !window.confirm(`Revoke ${ids.length} selected staff assignment${ids.length === 1 ? "" : "s"}?`)) return;
    assignmentSelection.clear();
    void bulkMutate(ids, "revoke-assignment", "assignmentId", "staff assignment(s) revoked.");
  };

  const handleBulkExternalAction = (action: "revoke-external" | "delete-external") => {
    const ids = Array.from(externalSelection.selectedIds);
    if (ids.length === 0 || !window.confirm(`${action === "delete-external" ? "Delete" : "Revoke"} ${ids.length} selected temporary account${ids.length === 1 ? "" : "s"}?`)) return;
    externalSelection.clear();
    void bulkMutate(ids, action, "accountId", action === "delete-external" ? "temporary account(s) deleted." : "temporary account(s) revoked.");
  };

  function editRole(role: DeveloperRole) {
    setRoleBeingEdited(role);
    setRoleCode(role.code);
    setRoleName(role.name);
    setRoleDescription(role.description || "");
    setRoleScopeMode(role.scopeMode);
    setRolePermissions(role.permissions);
  }

  function resetRole() {
    setRoleBeingEdited(null);
    setRoleCode("");
    setRoleName("");
    setRoleDescription("");
    setRoleScopeMode("OWN");
    setRolePermissions(["crm:read"]);
  }

  async function saveRole() {
    const result = await mutate({ action: "save-role", ...(roleBeingEdited ? { id: roleBeingEdited.id } : {}), code: roleCode, name: roleName, description: roleDescription || null, scopeMode: roleScopeMode, permissions: rolePermissions }, roleBeingEdited ? "Role updated." : "Role created.");
    if (result) resetRole();
  }

  async function createExternal() {
    const result = await mutate({ action: "create-external", displayName: externalName, email: externalEmail, companyName: externalCompany, scopeType: externalScopeType, scopeId: externalScopeId, permissions: externalPermissions, expiresAt: new Date(externalExpiry).toISOString(), locale }, "Temporary account created.");
    if (result && typeof result === "object" && typeof (result as { inviteUrl?: unknown }).inviteUrl === "string") setInviteUrl((result as { inviteUrl: string }).inviteUrl);
  }

  async function copyInvite() {
    if (!inviteUrl) return;
    try { await navigator.clipboard.writeText(inviteUrl); toast.success("Invite link copied."); } catch { toast.error("The invite link could not be copied."); }
  }

  function togglePermission(permission: string) {
    setRolePermissions((current) => current.includes(permission) ? current.filter((value) => value !== permission) : [...current, permission]);
  }

  function toggleExternalPermission(permission: string) {
    setExternalPermissions((current) => current.includes(permission) ? current.filter((value) => value !== permission) : [...current, permission]);
  }

  return (
    <main className="min-h-full bg-[#0d1117] p-5 text-[#c9d1d9] sm:p-8">
      <header className="mx-auto max-w-[1500px] border-b border-[#30363d] pb-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#7CA8D0]"><ShieldCheck className="size-4" aria-hidden="true" /> Developer / access control</div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#f0f6fc]">Staff roles and temporary access</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#8b949e]">Give Sales and Engineering the minimum view they need, then issue time-limited links for subcontractors without creating permanent staff accounts.</p>
          </div>
          <button type="button" onClick={() => void refresh()} disabled={isRefreshing} className="inline-flex h-9 items-center gap-2 self-start rounded-md border border-[#30363d] px-3 text-xs font-semibold text-[#c9d1d9] hover:border-[#8b949e] hover:text-[#f0f6fc]"><RefreshCw className={cn("size-3.5", isRefreshing && "animate-spin")} aria-hidden="true" /> Refresh</button>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <button type="button" onClick={() => setTab("roles")} className={cn("inline-flex h-9 items-center gap-2 rounded-md px-3 text-xs font-semibold", tab === "roles" ? "bg-[#7CA8D0]/15 text-[#d8b4fe]" : "text-[#8b949e] hover:bg-[#21262d] hover:text-[#f0f6fc]")}><UserRound className="size-3.5" aria-hidden="true" /> Staff roles</button>
          <button type="button" onClick={() => setTab("external")} className={cn("inline-flex h-9 items-center gap-2 rounded-md px-3 text-xs font-semibold", tab === "external" ? "bg-[#7CA8D0]/15 text-[#d8b4fe]" : "text-[#8b949e] hover:bg-[#21262d] hover:text-[#f0f6fc]")}><KeyRound className="size-3.5" aria-hidden="true" /> Temporary external accounts</button>
        </div>
      </header>

      {tab === "roles" ? (
        <div className="mx-auto mt-7 grid max-w-[1500px] gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <section className="space-y-6">
            <div className="rounded-md border border-[#30363d] bg-[#161b22]">
              <div className="border-b border-[#30363d] p-5"><h2 className="text-base font-semibold text-[#f0f6fc]">Role library</h2><p className="mt-1 text-xs leading-5 text-[#8b949e]">System roles are safe defaults. Custom roles can be removed when no staff account is using them.</p></div>
              <AdminBulkActionBar
                selectedCount={roleSelection.selectedCount}
                visibleCount={state.roles.filter((role) => !role.isSystem).length}
                allVisibleSelected={roleSelection.allVisibleSelected}
                someVisibleSelected={roleSelection.someVisibleSelected}
                onToggleVisible={roleSelection.toggleVisible}
                onClear={roleSelection.clear}
                isPending={isSaving}
                actions={[{ id: "delete", label: "Delete selected", icon: Trash2, tone: "danger", onClick: handleBulkDeleteRoles }]}
              />
              <div className="divide-y divide-[#30363d]">
                {state.roles.map((role) => <div key={role.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between"><div className="flex min-w-0 gap-3"><AdminSelectionCheckbox checked={roleSelection.isSelected(role.id)} onChange={() => roleSelection.toggle(role.id)} disabled={role.isSystem} label={`Select role ${role.name}`} /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs text-[#d8b4fe]">{role.code}</span><span className="rounded-full border border-[#30363d] px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-[#8b949e]">{role.scopeMode === "ALL" ? "All records" : "Own records"}</span>{role.isSystem ? <span className="rounded-full border border-[#238636]/50 bg-[#238636]/10 text-[#3fb950]">System</span> : null}</div><h3 className="mt-2 text-sm font-semibold text-[#f0f6fc]">{role.name}</h3><p className="mt-1 text-xs leading-5 text-[#8b949e]">{role.description || "No description."}</p><div className="mt-3 flex flex-wrap gap-1.5">{role.permissions.map((permission) => <span key={permission} className="rounded border border-[#30363d] bg-[#0d1117] px-2 py-1 text-[10px] text-[#8b949e]">{rolePermissionLabels[permission] || permission}</span>)}</div></div></div><div className="flex shrink-0 gap-2"><button type="button" onClick={() => editRole(role)} className="rounded-md border border-[#30363d] px-3 py-1.5 text-xs font-semibold text-[#8b949e] hover:border-[#58a6ff] hover:text-[#f0f6fc]">Edit</button>{!role.isSystem ? <button type="button" onClick={() => void mutate({ action: "delete-role", roleId: role.id }, "Role deleted.")} className="rounded-md border border-[#6e2a35] px-3 py-1.5 text-xs font-semibold text-[#C58F61] hover:bg-[#6e2a35]/20"><Trash2 className="size-3.5" aria-hidden="true" /></button> : null}</div></div>)}
              </div>
            </div>

            <div className="rounded-md border border-[#30363d] bg-[#161b22]">
              <div className="border-b border-[#30363d] p-5"><h2 className="text-base font-semibold text-[#f0f6fc]">Sales ownership</h2><p className="mt-1 text-xs leading-5 text-[#8b949e]">Assign quotations to a salesperson so an OWN-scoped Sales role sees only its customer work.</p></div>
              <div className="divide-y divide-[#30363d]">{state.salesProposals.map((proposal) => <div key={proposal.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="truncate text-sm font-semibold text-[#f0f6fc]">{proposal.customerName}</p><p className="mt-1 font-mono text-[11px] text-[#8b949e]">{proposal.id} · {proposal.status}</p></div><select value={proposal.salesOwnerId || ""} onChange={(event) => void mutate({ action: "assign-sales-owner", proposalId: proposal.id, salesOwnerId: event.target.value || null }, "Sales owner updated.")} className="h-9 w-full rounded-md border border-[#30363d] bg-[#0d1117] px-3 text-xs text-[#f0f6fc] outline-none focus:border-[#58a6ff] sm:w-56"><option value="">Unassigned</option>{state.staff.filter((staff) => staff.department === "SALES" || staff.role === "MANAGER" || staff.role === "ADMIN" || staff.role === "SUPER_ADMIN").map((staff) => <option key={staff.id} value={staff.id}>{staff.name}</option>)}</select></div>)}{state.salesProposals.length === 0 ? <div className="p-8 text-center text-sm text-[#8b949e]">No quotations are available for ownership assignment.</div> : null}</div>
            </div>

            <div className="rounded-md border border-[#30363d] bg-[#161b22]">
              <div className="flex flex-col gap-2 border-b border-[#30363d] p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-base font-semibold text-[#f0f6fc]">Staff assignments</h2><p className="mt-1 text-xs leading-5 text-[#8b949e]">A Sales or Engineer assignment defaults to owned records. An expiry can temporarily remove access.</p></div><span className="text-xs text-[#8b949e]">{state.assignments.length} active assignments</span></div>
              <AdminBulkActionBar selectedCount={assignmentSelection.selectedCount} visibleCount={state.assignments.length} allVisibleSelected={assignmentSelection.allVisibleSelected} someVisibleSelected={assignmentSelection.someVisibleSelected} onToggleVisible={assignmentSelection.toggleVisible} onClear={assignmentSelection.clear} isPending={isSaving} actions={[{ id: "revoke", label: "Revoke selected", icon: ShieldCheck, tone: "danger", onClick: handleBulkRevokeAssignments }]} />
              <div className="divide-y divide-[#30363d]">{state.assignments.map((assignment) => <div key={assignment.id} className="flex items-center gap-3"><AdminSelectionCheckbox checked={assignmentSelection.isSelected(assignment.id)} onChange={() => assignmentSelection.toggle(assignment.id)} label={`Select assignment ${assignment.userName}`} /><div className="min-w-0 flex-1"><AssignmentRow assignment={assignment} onRevoke={() => void mutate({ action: "revoke-assignment", assignmentId: assignment.id }, "Staff access revoked.")} /></div></div>)}{state.assignments.length === 0 ? <div className="p-8 text-center text-sm text-[#8b949e]">No explicit assignments yet. The application will use the department fallback until one is assigned.</div> : null}</div>
            </div>
          </section>

          <aside className="space-y-6">
            <section className="rounded-md border border-[#30363d] bg-[#161b22] p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="text-base font-semibold text-[#f0f6fc]">{roleBeingEdited ? "Edit role" : "Create custom role"}</h2><p className="mt-1 text-xs leading-5 text-[#8b949e]">Keep permissions explicit and review the scope before assigning.</p></div>{roleBeingEdited ? <button type="button" onClick={resetRole} className="rounded-md p-1 text-[#8b949e] hover:bg-[#21262d] hover:text-[#f0f6fc]" aria-label="Close role editor"><X className="size-4" aria-hidden="true" /></button> : null}</div><div className="mt-5 space-y-4"><Field label="Role code"><input value={roleCode} onChange={(event) => setRoleCode(event.target.value)} placeholder="FIELD_COORDINATOR" className={inputClass} /></Field><Field label="Display name"><input value={roleName} onChange={(event) => setRoleName(event.target.value)} placeholder="Field coordinator" className={inputClass} /></Field><Field label="Description"><textarea value={roleDescription} onChange={(event) => setRoleDescription(event.target.value)} rows={3} className={inputClass} /></Field><Field label="Default record scope"><select value={roleScopeMode} onChange={(event) => setRoleScopeMode(event.target.value as StaffScopeMode)} className={inputClass}><option value="OWN">Owned / assigned records</option><option value="ALL">All records</option></select></Field><fieldset><legend className="mb-2 text-xs font-semibold text-[#c9d1d9]">Permissions</legend><div className="grid gap-2">{STAFF_PERMISSION_OPTIONS.map((permission) => <label key={permission} className="flex items-center gap-2 text-xs text-[#8b949e]"><input type="checkbox" checked={rolePermissions.includes(permission)} onChange={() => togglePermission(permission)} className="size-3.5 accent-[#7CA8D0]" />{rolePermissionLabels[permission] || permission}</label>)}</div></fieldset></div><div className="mt-5 flex gap-2"><button type="button" onClick={() => void saveRole()} disabled={isSaving} className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-md bg-[#238636] text-xs font-semibold text-white hover:bg-[#2ea043] disabled:opacity-60"><Check className="size-3.5" aria-hidden="true" />{roleBeingEdited ? "Save role" : "Create role"}</button>{roleBeingEdited ? <button type="button" onClick={resetRole} className="h-9 rounded-md border border-[#30363d] px-3 text-xs font-semibold text-[#8b949e] hover:text-[#f0f6fc]">Cancel</button> : null}</div></section>

            <section className="rounded-md border border-[#30363d] bg-[#161b22] p-5"><h2 className="text-base font-semibold text-[#f0f6fc]">Assign staff access</h2><p className="mt-1 text-xs leading-5 text-[#8b949e]">This controls the staff workspaces. Admin accounts retain Developer access.</p><div className="mt-5 space-y-4"><Field label="Staff account"><select value={assignmentUserId} onChange={(event) => setAssignmentUserId(event.target.value)} className={inputClass}><option value="">Select a staff account</option>{state.staff.map((staff) => <option key={staff.id} value={staff.id}>{staff.name} · {staff.department}</option>)}</select></Field><Field label="Role"><select value={assignmentRoleId} onChange={(event) => setAssignmentRoleId(event.target.value)} className={inputClass}><option value="">Select a role</option>{activeRoles.map((role) => <option key={role.id} value={role.id}>{role.name} ({role.code})</option>)}</select></Field><Field label="Assignment scope"><select value={assignmentScope} onChange={(event) => setAssignmentScope(event.target.value as StaffScopeMode)} className={inputClass}><option value="OWN">Only owned / assigned work</option><option value="ALL">All work in this area</option></select></Field><Field label="Optional expiry"><input type="datetime-local" value={assignmentExpiry} onChange={(event) => setAssignmentExpiry(event.target.value)} className={inputClass} /></Field></div><button type="button" onClick={() => void mutate({ action: "assign-role", userId: assignmentUserId, roleId: assignmentRoleId, scopeMode: assignmentScope, expiresAt: assignmentExpiry ? new Date(assignmentExpiry).toISOString() : null }, "Staff access assigned.")} disabled={isSaving || !assignmentUserId || !assignmentRoleId} className="mt-5 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-[#21262d] text-xs font-semibold text-[#f0f6fc] hover:bg-[#30363d] disabled:cursor-not-allowed disabled:opacity-50"><Plus className="size-3.5" aria-hidden="true" /> Assign role</button></section>
          </aside>
        </div>
      ) : (
        <div className="mx-auto mt-7 grid max-w-[1500px] gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <section className="rounded-md border border-[#30363d] bg-[#161b22]"><div className="border-b border-[#30363d] p-5"><h2 className="text-base font-semibold text-[#f0f6fc]">Issued temporary accounts</h2><p className="mt-1 text-xs leading-5 text-[#8b949e]">The raw invite secret is shown only when created. Revoke it immediately when a subcontractor leaves the job.</p></div><AdminBulkActionBar selectedCount={externalSelection.selectedCount} visibleCount={state.externalAccounts.length} allVisibleSelected={externalSelection.allVisibleSelected} someVisibleSelected={externalSelection.someVisibleSelected} onToggleVisible={externalSelection.toggleVisible} onClear={externalSelection.clear} isPending={isSaving} actions={[{ id: "revoke", label: "Revoke selected", icon: ShieldCheck, tone: "warning", onClick: () => handleBulkExternalAction("revoke-external") }, { id: "delete", label: "Delete selected", icon: Trash2, tone: "danger", onClick: () => handleBulkExternalAction("delete-external") }]} /><div className="divide-y divide-[#30363d]">{state.externalAccounts.map((account) => <div key={account.id} className="flex items-start gap-3 p-1"><AdminSelectionCheckbox checked={externalSelection.isSelected(account.id)} onChange={() => externalSelection.toggle(account.id)} label={`Select temporary account ${account.displayName}`} className="mt-5" /><div className="min-w-0 flex-1"><ExternalAccountRow account={account} onRevoke={() => void mutate({ action: "revoke-external", accountId: account.id }, "External access revoked.")} onDelete={() => void mutate({ action: "delete-external", accountId: account.id }, "External account deleted.")} /></div></div>)}{state.externalAccounts.length === 0 ? <div className="p-10 text-center text-sm text-[#8b949e]">No temporary accounts have been issued.</div> : null}</div></section>
          <aside className="rounded-md border border-[#30363d] bg-[#161b22] p-5"><h2 className="text-base font-semibold text-[#f0f6fc]">Create external access</h2><p className="mt-1 text-xs leading-5 text-[#8b949e]">This creates a secure, time-limited work link. It does not create a permanent Supabase staff login.</p><div className="mt-5 space-y-4"><Field label="Person / company"><input value={externalName} onChange={(event) => setExternalName(event.target.value)} placeholder="Contractor name" className={inputClass} /></Field><Field label="Email (optional)"><input type="email" value={externalEmail} onChange={(event) => setExternalEmail(event.target.value)} placeholder="contractor@example.com" className={inputClass} /></Field><Field label="Company (optional)"><input value={externalCompany} onChange={(event) => setExternalCompany(event.target.value)} placeholder="Partner company" className={inputClass} /></Field><Field label="Work scope"><select value={externalScopeType} onChange={(event) => { const next = event.target.value as ExternalScopeType; setExternalScopeType(next); setExternalScopeId(""); }} className={inputClass}><option value="PROJECT">Installation project</option><option value="TASK">One installation task</option><option value="PROPOSAL">Quotation / proposal</option></select></Field><Field label="Record"><select value={externalScopeId} onChange={(event) => setExternalScopeId(event.target.value)} className={inputClass}><option value="">{selectedExternalOptions.length > 0 ? "Select a work record" : `No ${externalScopeLabel} available`}</option>{selectedExternalOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></Field>{selectedExternalOptions.length === 0 ? <p className="-mt-2 text-xs leading-5 text-[#f0b72f]">No {externalScopeLabel} are available yet. Choose another scope or create the installation record first.</p> : null}<Field label="Expires"><input type="datetime-local" value={externalExpiry} onChange={(event) => setExternalExpiry(event.target.value)} className={inputClass} /></Field><fieldset><legend className="mb-2 text-xs font-semibold text-[#c9d1d9]">Allowed capabilities</legend><div className="grid gap-2">{["external:work:read", "external:evidence:read"].map((permission) => <label key={permission} className="flex items-center gap-2 text-xs text-[#8b949e]"><input type="checkbox" checked={externalPermissions.includes(permission)} onChange={() => toggleExternalPermission(permission)} className="size-3.5 accent-[#7CA8D0]" />{rolePermissionLabels[permission]}</label>)}</div></fieldset></div><button type="button" onClick={() => void createExternal()} disabled={isSaving || !externalName || !externalScopeId} className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[#238636] text-xs font-semibold text-white hover:bg-[#2ea043] disabled:cursor-not-allowed disabled:opacity-50"><KeyRound className="size-3.5" aria-hidden="true" /> Issue temporary link</button>{inviteUrl ? <div className="mt-5 rounded-md border border-[#238636]/50 bg-[#238636]/10 p-4"><div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold text-[#3fb950]">Copy this invite now</span><button type="button" onClick={() => setInviteUrl(null)} className="text-[#8b949e] hover:text-[#f0f6fc]" aria-label="Dismiss invite"><X className="size-3.5" aria-hidden="true" /></button></div><input readOnly value={inviteUrl} className="mt-3 h-9 w-full rounded border border-[#30363d] bg-[#0d1117] px-2 text-[10px] text-[#c9d1d9]" /><div className="mt-3 flex gap-2"><button type="button" onClick={() => void copyInvite()} className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md bg-[#238636] text-xs font-semibold text-white"><Copy className="size-3.5" aria-hidden="true" /> Copy link</button><a href={inviteUrl} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-[#30363d] px-3 text-xs font-semibold text-[#8b949e] hover:text-[#f0f6fc]"><ExternalLink className="size-3.5" aria-hidden="true" /> Open</a></div></div> : null}</aside>
        </div>
      )}
    </main>
  );
}

const inputClass = "h-9 w-full rounded-md border border-[#30363d] bg-[#0d1117] px-3 text-xs text-[#f0f6fc] outline-none focus:border-[#58a6ff]";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-[#c9d1d9]">{label}</span>{children}</label>;
}

function AssignmentRow({ assignment, onRevoke }: { assignment: DeveloperAssignment; onRevoke: () => void }) {
  return <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold text-[#f0f6fc]">{assignment.userName}</span><span className="font-mono text-[10px] text-[#d8b4fe]">{assignment.roleCode}</span></div><div className="mt-1 text-xs text-[#8b949e]">{assignment.userEmail} · {assignment.scopeMode === "ALL" ? "all records" : "own / assigned records"}{assignment.expiresAt ? ` · expires ${new Date(assignment.expiresAt).toLocaleString()}` : ""}</div></div><button type="button" onClick={onRevoke} className="self-start rounded-md border border-[#6e2a35] px-3 py-1.5 text-xs font-semibold text-[#C58F61] hover:bg-[#6e2a35]/20 sm:self-auto">Revoke</button></div>;
}

function ExternalAccountRow({ account, onRevoke, onDelete }: { account: DeveloperExternalAccount; onRevoke: () => void; onDelete: () => void }) {
  const revoked = Boolean(account.revokedAt);
  return <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold text-[#f0f6fc]">{account.displayName}</span><span className={cn("rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em]", revoked ? "border-[#6e2a35] text-[#C58F61]" : "border-[#238636]/50 text-[#3fb950]")}>{revoked ? "Revoked" : "Active"}</span></div><p className="mt-1 text-xs text-[#8b949e]">{account.companyName || account.email || "No contact metadata"} · {account.scopeType} · {account.scopeId}</p><p className="mt-1 text-[11px] text-[#6e7681]">Expires {new Date(account.expiresAt).toLocaleString()} · Last used {displayDate(account.lastUsedAt)}</p></div><div className="flex gap-2 self-start lg:self-auto">{!revoked ? <button type="button" onClick={onRevoke} className="rounded-md border border-[#6e2a35] px-3 py-1.5 text-xs font-semibold text-[#C58F61] hover:bg-[#6e2a35]/20">Revoke</button> : null}<button type="button" onClick={onDelete} className="rounded-md border border-[#30363d] p-1.5 text-[#8b949e] hover:border-[#C58F61] hover:text-[#C58F61]" aria-label="Delete external account"><Trash2 className="size-3.5" aria-hidden="true" /></button></div></div>;
}
