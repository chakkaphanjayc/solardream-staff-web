"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { ArrowLeft, ArrowRight, CalendarDays, CheckCircle2, ClipboardCheck, Loader2, MapPin, Package, RefreshCw, ShieldCheck, UserRound, Wrench } from "@/components/ui/icons";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { OpsProjectState } from "@/types/ops-v2";

type Task = {
  id: string;
  taskCode: string;
  title: string;
  sequence: number;
  status: string;
  assignedUserId: string | null;
  completedAt: string | null;
};

type Checklist = {
  id: string;
  itemCode: string;
  label: string;
  required: boolean;
  evidenceRequired: boolean;
  status: string;
  outcome: string | null;
};

type Assignee = {
  id: string;
  name: string;
  email: string;
  role: string;
};

type ERPMaterialLookup = {
  item: { providerId: string; itemCode: string; itemName: string; itemGroup: string | null; brand: string | null; stockUom: string | null; disabled: boolean } | null;
  stock: Array<{ providerId: string; itemCode: string; warehouse: string; actualQuantity: number; projectedQuantity: number; reservedQuantity: number }>;
  sourceOfTruth: "ERPNext";
};

type ERPAssetLookup = {
  found: boolean;
  serialNumber: string;
  item: { code: string | null; name: string } | null;
  warrantyExpiryDate: string | null;
  status: string | null;
  sourceOfTruth: "ERPNext";
};

type Workspace = {
  project: {
    id: string;
    projectCode: string;
    proposalId: string;
    lifecycleState: OpsProjectState;
    lifecycleVersion: number;
    erpnextSyncStatus: string;
    erpnextSyncError: string | null;
    permitStatus: string;
    customer: { id: string; name: string | null; email: string | null };
    site: { label: string; addressLine1: string; city: string | null; province: string | null; country: string; accessNotes: string | null; latitude: number | null; longitude: number | null } | null;
    proposal: { status: string; paymentStatus: string; paidAt: string | null; systemSizeKwp: string | null; panelCount: number | null };
  };
  tasks: Array<{ task: Task; checklist: Checklist[] }>;
  visits: Array<{ visit: { id: string; status: string; visitType: string; scheduledStart: string | null; scheduledEnd: string | null; timezone: string; crewName: string | null; customerConfirmedAt: string | null }; assignments: Array<{ assignment: { id: string; taskId: string | null; assigneeUserId: string; status: string }; assignee: { id: string; name: string | null; email: string } | null }> }>;
  materials: Array<{ id: string; productName: string; quantity: string; unit: string; status: string; serialRequired: boolean; notes: string | null }>;
  assets: Array<{ id: string; productName: string; serialNumber: string; status: string; catalogProductId: string | null; installedDate: string; warrantyExpiryDate: string }>;
  installationWarranties: Array<{ id: string; status: string; policyVersion: string; startsAt: string | null; endsAt: string | null; durationMonths: number | null }>;
  productWarranties: Array<{ warranty: { id: string; provider: string; productName: string; status: string; startsAt: string | null; endsAt: string | null }; asset: { id: string; serialNumber: string; productName: string } }>;
  serviceCases: Array<{ id: string; caseNumber: string; subject: string; status: string; priority: string; createdAt: string }>;
};

const nextState: Partial<Record<OpsProjectState, OpsProjectState>> = {
  NEW: "SITE_REVIEW",
  SITE_REVIEW: "ENGINEERING",
  ENGINEERING: "MATERIAL_PREPARATION",
  MATERIAL_PREPARATION: "READY_TO_SCHEDULE",
  READY_TO_SCHEDULE: "SCHEDULED",
  SCHEDULED: "IN_PROGRESS",
  IN_PROGRESS: "QA_COMMISSIONING",
  QA_COMMISSIONING: "HANDOVER",
  HANDOVER: "WARRANTY_ACTIVATION",
  WARRANTY_ACTIVATION: "COMPLETED",
};

const stateLabels: Record<OpsProjectState, string> = {
  NEW: "New",
  SITE_REVIEW: "Site review",
  ENGINEERING: "Engineering",
  MATERIAL_PREPARATION: "Material preparation",
  READY_TO_SCHEDULE: "Ready to schedule",
  SCHEDULED: "Scheduled",
  IN_PROGRESS: "In progress",
  QA_COMMISSIONING: "QA & commissioning",
  HANDOVER: "Handover",
  WARRANTY_ACTIVATION: "Warranty activation",
  COMPLETED: "Completed",
};

function stateTone(state: OpsProjectState) {
  if (state === "COMPLETED") return "border-[#238636]/50 bg-[#238636]/15 text-[#7ee787]";
  if (["IN_PROGRESS", "QA_COMMISSIONING", "HANDOVER"].includes(state)) return "border-[#58a6ff]/40 bg-[#58a6ff]/10 text-[#79c0ff]";
  if (["SCHEDULED", "READY_TO_SCHEDULE"].includes(state)) return "border-[#d29922]/40 bg-[#d29922]/10 text-[#e3b341]";
  return "border-[#30363d] bg-[#21262d] text-[#c9d1d9]";
}

function formatDate(value: string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function randomKey(prefix: string) {
  return prefix + ":" + crypto.randomUUID();
}

type ProjectWorkspaceClientProps = {
  projectId: string;
  enabled: boolean;
  schedulingEnabled: boolean;
  assetsEnabled: boolean;
  warrantyEnabled: boolean;
  afterSalesEnabled: boolean;
};

export default function ProjectWorkspaceClient({
  projectId,
  enabled,
  schedulingEnabled,
  assetsEnabled,
  warrantyEnabled,
  afterSalesEnabled,
}: ProjectWorkspaceClientProps) {
  const locale = useLocale();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [isLoading, setIsLoading] = useState(enabled);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visitStart, setVisitStart] = useState("");
  const [visitEnd, setVisitEnd] = useState("");
  const [materialName, setMaterialName] = useState("");
  const [materialQuantity, setMaterialQuantity] = useState("1");
  const [erpItemCode, setErpItemCode] = useState("");
  const [erpMaterialLookup, setErpMaterialLookup] = useState<ERPMaterialLookup | null>(null);
  const [assetProductName, setAssetProductName] = useState("");
  const [assetSerialNumber, setAssetSerialNumber] = useState("");
  const [assetWarrantyProvider, setAssetWarrantyProvider] = useState("");
  const [erpAssetLookup, setErpAssetLookup] = useState<ERPAssetLookup | null>(null);
  const [resolutionAssetId, setResolutionAssetId] = useState("");
  const [resolutionCatalogProductId, setResolutionCatalogProductId] = useState("");
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [assignmentVisitId, setAssignmentVisitId] = useState("");
  const [assignmentTaskId, setAssignmentTaskId] = useState("");
  const [assignmentUserId, setAssignmentUserId] = useState("");

  const loadWorkspace = useCallback(async () => {
    if (!enabled) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/v2/projects/" + projectId, { cache: "no-store" });
      const payload = await response.json() as { success?: boolean; data?: Workspace; error?: { message?: string } };
      if (!response.ok || !payload.success || !payload.data) throw new Error(payload.error?.message || "Project workspace could not be loaded.");
      setWorkspace(payload.data);
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : "Project workspace could not be loaded.");
    } finally {
      setIsLoading(false);
    }
  }, [enabled, projectId]);

  // This effect hydrates the client workspace from the API after the route loads.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadWorkspace(); }, [loadWorkspace]);

  useEffect(() => {
    if (!enabled || !schedulingEnabled) return;
    void fetch("/api/v2/field/assignees", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { success?: boolean; data?: Assignee[] };
        if (response.ok && payload.success && payload.data) setAssignees(payload.data);
      })
      .catch(() => undefined);
  }, [enabled, schedulingEnabled]);

  const transition = async () => {
    if (!workspace) return;
    const target = nextState[workspace.project.lifecycleState];
    if (!target) return;
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/v2/projects/" + projectId, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: target, idempotencyKey: randomKey("workspace-transition"), source: "OPS_WORKSPACE" }),
      });
      const payload = await response.json() as { success?: boolean; error?: { message?: string } };
      if (!response.ok || !payload.success) throw new Error(payload.error?.message || "The project transition was rejected.");
      await loadWorkspace();
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "The project transition was rejected.");
    } finally {
      setIsSaving(false);
    }
  };

  const createVisit = async () => {
    if (!visitStart) return;
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/v2/projects/" + projectId + "/visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "CONFIRMED",
          scheduledStart: new Date(visitStart).toISOString(),
          scheduledEnd: visitEnd ? new Date(visitEnd).toISOString() : null,
          customerConfirmed: true,
          idempotencyKey: randomKey("workspace-visit"),
        }),
      });
      const payload = await response.json() as { success?: boolean; error?: { message?: string } };
      if (!response.ok || !payload.success) throw new Error(payload.error?.message || "The field visit could not be scheduled.");
      setVisitStart("");
      setVisitEnd("");
      await loadWorkspace();
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "The field visit could not be scheduled.");
    } finally {
      setIsSaving(false);
    }
  };

  const addMaterial = async () => {
    if (!materialName.trim() || Number(materialQuantity) <= 0) return;
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/v2/projects/" + projectId + "/materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productName: materialName, quantity: materialQuantity, idempotencyKey: randomKey("workspace-material") }),
      });
      const payload = await response.json() as { success?: boolean; error?: { message?: string } };
      if (!response.ok || !payload.success) throw new Error(payload.error?.message || "The material requirement could not be added.");
      setMaterialName("");
      setMaterialQuantity("1");
      await loadWorkspace();
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "The material requirement could not be added.");
    } finally {
      setIsSaving(false);
    }
  };

  const lookupErpMaterial = async () => {
    if (!erpItemCode.trim()) return;
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/v2/materials/catalog?itemCode=" + encodeURIComponent(erpItemCode.trim()), { cache: "no-store" });
      const payload = await response.json() as { success?: boolean; data?: ERPMaterialLookup; error?: { message?: string } };
      if (!response.ok || !payload.success || !payload.data) throw new Error(payload.error?.message || "ERPNext material lookup failed.");
      setErpMaterialLookup(payload.data);
    } catch (lookupError: unknown) {
      setError(lookupError instanceof Error ? lookupError.message : "ERPNext material lookup failed.");
      setErpMaterialLookup(null);
    } finally {
      setIsSaving(false);
    }
  };

  const registerAsset = async () => {
    if (!assetProductName.trim() || !assetSerialNumber.trim()) return;
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/v2/projects/" + projectId + "/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName: assetProductName,
          serialNumber: assetSerialNumber,
          catalogProductId: erpAssetLookup?.item?.code || null,
          productWarrantyProvider: assetWarrantyProvider || null,
          idempotencyKey: randomKey("workspace-asset"),
        }),
      });
      const payload = await response.json() as { success?: boolean; error?: { message?: string } };
      if (!response.ok || !payload.success) throw new Error(payload.error?.message || "The installed asset could not be registered.");
      setAssetProductName("");
      setAssetSerialNumber("");
      setAssetWarrantyProvider("");
      setErpAssetLookup(null);
      await loadWorkspace();
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "The installed asset could not be registered.");
    } finally {
      setIsSaving(false);
    }
  };

  const lookupErpAsset = async () => {
    if (!assetSerialNumber.trim()) return;
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/v2/assets/lookup?serial=" + encodeURIComponent(assetSerialNumber.trim()), { cache: "no-store" });
      const payload = await response.json() as { success?: boolean; data?: ERPAssetLookup; error?: { message?: string } };
      if (!response.ok || !payload.success || !payload.data) throw new Error(payload.error?.message || "ERPNext serial lookup failed.");
      setErpAssetLookup(payload.data);
      if (payload.data.item?.name) setAssetProductName(payload.data.item.name);
      if (payload.data.found && payload.data.item?.code) setAssetWarrantyProvider("ERPNext");
    } catch (lookupError: unknown) {
      setError(lookupError instanceof Error ? lookupError.message : "ERPNext serial lookup failed.");
      setErpAssetLookup(null);
    } finally {
      setIsSaving(false);
    }
  };

  const resolveAsset = async (asset: Workspace["assets"][number]) => {
    if (asset.status !== "UNKNOWN" || resolutionAssetId !== asset.id || !resolutionCatalogProductId.trim()) return;
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/v2/projects/" + projectId + "/assets/" + asset.id, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          catalogProductId: resolutionCatalogProductId.trim(),
          productName: asset.productName,
          idempotencyKey: randomKey("workspace-asset-resolution"),
        }),
      });
      const payload = await response.json() as { success?: boolean; error?: { message?: string } };
      if (!response.ok || !payload.success) throw new Error(payload.error?.message || "The asset resolution could not be saved.");
      setResolutionAssetId("");
      setResolutionCatalogProductId("");
      await loadWorkspace();
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "The asset resolution could not be saved.");
    } finally {
      setIsSaving(false);
    }
  };

  const activateWarranty = async () => {
    if (!project) return;
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/v2/projects/" + projectId + "/warranty", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceHandoverId: project.projectCode, idempotencyKey: randomKey("workspace-warranty") }),
      });
      const payload = await response.json() as { success?: boolean; error?: { message?: string } };
      if (!response.ok || !payload.success) throw new Error(payload.error?.message || "The installation warranty could not be activated.");
      await loadWorkspace();
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "The installation warranty could not be activated.");
    } finally {
      setIsSaving(false);
    }
  };

  const assignJob = async () => {
    if (!assignmentVisitId || !assignmentUserId) return;
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/v2/visits/" + assignmentVisitId + "/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: assignmentTaskId || null,
          assigneeUserId: assignmentUserId,
          role: "TECHNICIAN",
          idempotencyKey: randomKey("workspace-assignment"),
        }),
      });
      const payload = await response.json() as { success?: boolean; error?: { message?: string } };
      if (!response.ok || !payload.success) throw new Error(payload.error?.message || "The field assignment could not be saved.");
      await loadWorkspace();
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "The field assignment could not be saved.");
    } finally {
      setIsSaving(false);
    }
  };

  const activeVisit = workspace?.visits.find((item) => ["CONFIRMED", "IN_PROGRESS"].includes(item.visit.status));
  const next = workspace ? nextState[workspace.project.lifecycleState] : undefined;
  const taskProgress = useMemo(() => {
    if (!workspace || workspace.tasks.length === 0) return { complete: 0, total: workspace?.tasks.length || 0 };
    return { complete: workspace.tasks.filter((item) => item.task.status === "COMPLETED").length, total: workspace.tasks.length };
  }, [workspace]);

  if (!enabled) {
    return <main className="min-h-full bg-[#0d1117] p-8 text-[#c9d1d9]"><div className="mx-auto max-w-3xl rounded-xl border border-[#30363d] bg-[#161b22] p-8"><h1 className="text-2xl font-semibold text-[#f0f6fc]">Project workspace is staged</h1><p className="mt-2 text-sm leading-6 text-[#8b949e]">Enable OPS_V2_PROJECTS and OPS_V2_PROJECT_WORKSPACE to open this canonical workspace.</p></div></main>;
  }

  if (isLoading && !workspace) {
    return <main className="flex min-h-full items-center justify-center bg-[#0d1117] text-[#8b949e]"><Loader2 className="h-6 w-6 animate-spin" aria-label="Loading project workspace" /></main>;
  }

  if (!workspace) {
    return <main className="min-h-full bg-[#0d1117] p-8 text-[#c9d1d9]"><div className="mx-auto max-w-3xl rounded-xl border border-[#f85149]/40 bg-[#161b22] p-8"><h1 className="text-2xl font-semibold text-[#f0f6fc]">Project unavailable</h1><p className="mt-2 text-sm text-[#ff7b72]">{error || "The project workspace could not be loaded."}</p><Button className="mt-5" size="sm" variant="outline" onClick={() => void loadWorkspace()}><RefreshCw className="h-4 w-4" aria-hidden="true" /> Retry</Button></div></main>;
  }

  const project = workspace.project;
  return (
    <main data-bagui="project-workspace" className="min-h-full bg-[#0d1117] px-4 py-6 text-[#c9d1d9] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <div className="flex items-center justify-between gap-4">
          <Link href={"/" + locale + "/admin/operations"} className="inline-flex items-center gap-2 text-sm font-medium text-[#8b949e] hover:text-[#f0f6fc]"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Operations workspace</Link>
          <Button type="button" variant="quiet" size="sm" onClick={() => void loadWorkspace()} disabled={isLoading} className="text-[#8b949e] hover:bg-[#21262d] hover:text-[#f0f6fc]"><RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} aria-hidden="true" /> Refresh</Button>
        </div>
        {error ? <div role="alert" className="rounded-md border border-[#f85149]/40 bg-[#f85149]/10 p-3 text-sm text-[#ff7b72]">{error}</div> : null}
        <header className="flex flex-col gap-5 rounded-xl border border-[#30363d] bg-[#161b22] p-5 shadow-xl xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3"><span className="font-mono text-xs text-[#8b949e]">{project.projectCode}</span><span className={cn("rounded-full border px-2.5 py-1 text-[11px] font-semibold", stateTone(project.lifecycleState))}>{stateLabels[project.lifecycleState]}</span><span className="text-xs text-[#8b949e]">Lifecycle v{project.lifecycleVersion}</span></div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#f0f6fc]">{project.customer.name || "Customer project"}</h1>
            <p className="mt-2 text-sm text-[#8b949e]">{project.proposal.systemSizeKwp ? project.proposal.systemSizeKwp + " kWp" : "System size pending"} {project.proposal.panelCount ? "· " + project.proposal.panelCount + " panels" : ""} · Payment {project.proposal.paymentStatus}</p>
          </div>
          <div className="flex flex-col items-start gap-2 xl:items-end"><Button type="button" size="sm" onClick={() => void transition()} disabled={!next || isSaving}>{isSaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ArrowRight className="h-4 w-4" aria-hidden="true" />} {next ? "Advance to " + stateLabels[next] : "Lifecycle complete"}</Button><span className="text-xs text-[#8b949e]">ERP projection: {project.erpnextSyncStatus}</span></div>
        </header>
        <div className="flex flex-wrap gap-2 rounded-lg border border-[#30363d] bg-[#161b22] px-4 py-3 text-[11px]" aria-label="Operations capability rollout status">
          <span className={cn("rounded-full px-2 py-1 font-semibold", schedulingEnabled ? "bg-[#238636]/15 text-[#7ee787]" : "bg-[#21262d] text-[#8b949e]")}>Scheduling · {schedulingEnabled ? "live" : "staged"}</span>
          <span className={cn("rounded-full px-2 py-1 font-semibold", assetsEnabled ? "bg-[#238636]/15 text-[#7ee787]" : "bg-[#21262d] text-[#8b949e]")}>Assets · {assetsEnabled ? "live" : "staged"}</span>
          <span className={cn("rounded-full px-2 py-1 font-semibold", warrantyEnabled ? "bg-[#238636]/15 text-[#7ee787]" : "bg-[#21262d] text-[#8b949e]")}>Warranty · {warrantyEnabled ? "live" : "staged"}</span>
          <span className={cn("rounded-full px-2 py-1 font-semibold", afterSalesEnabled ? "bg-[#238636]/15 text-[#7ee787]" : "bg-[#21262d] text-[#8b949e]")}>After-sales · {afterSalesEnabled ? "live" : "staged"}</span>
        </div>

        <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-5"><div className="flex items-center gap-2 text-sm font-semibold text-[#f0f6fc]"><MapPin className="h-4 w-4 text-[#58a6ff]" aria-hidden="true" /> Customer and site</div><div className="mt-4 grid gap-4 sm:grid-cols-2"><div><p className="text-xs text-[#8b949e]">Customer</p><p className="mt-1 font-medium text-[#c9d1d9]">{project.customer.name || "Not named"}</p><p className="mt-1 text-xs text-[#8b949e]">{project.customer.email || "No email"}</p></div><div><p className="text-xs text-[#8b949e]">Installation site</p><p className="mt-1 font-medium text-[#c9d1d9]">{project.site?.label || "Site pending"}</p><p className="mt-1 text-xs leading-5 text-[#8b949e]">{project.site ? [project.site.addressLine1, project.site.city, project.site.province, project.site.country].filter(Boolean).join(", ") : "Add a site before site review."}</p></div></div>{project.site?.accessNotes ? <p className="mt-4 rounded-md border border-[#30363d] bg-[#0d1117] p-3 text-xs leading-5 text-[#8b949e]">Access notes: {project.site.accessNotes}</p> : null}</div>
          <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-5"><div className="flex items-center gap-2 text-sm font-semibold text-[#f0f6fc]"><ClipboardCheck className="h-4 w-4 text-[#e3b341]" aria-hidden="true" /> Delivery progress</div><div className="mt-4 flex items-end gap-3"><p className="text-3xl font-semibold text-[#f0f6fc]">{taskProgress.complete}<span className="text-lg text-[#6e7681]">/{taskProgress.total}</span></p><p className="pb-1 text-xs text-[#8b949e]">installation tasks complete</p></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-[#21262d]"><div className="h-full rounded-full bg-[#58a6ff] transition-all" style={{ width: taskProgress.total ? (taskProgress.complete / taskProgress.total) * 100 + "%" : "0%" }} /></div><dl className="mt-4 space-y-2 text-xs"><div className="flex justify-between gap-3"><dt className="text-[#8b949e]">Permit</dt><dd className="text-[#c9d1d9]">{project.permitStatus}</dd></div><div className="flex justify-between gap-3"><dt className="text-[#8b949e]">Paid</dt><dd className="text-[#c9d1d9]">{formatDate(project.proposal.paidAt)}</dd></div></dl></div>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-xl border border-[#30363d] bg-[#161b22]"><div className="flex items-center justify-between border-b border-[#30363d] p-5"><div className="flex items-center gap-2 text-sm font-semibold text-[#f0f6fc]"><Wrench className="h-4 w-4 text-[#79c0ff]" aria-hidden="true" /> Tasks and checklist</div><span className="text-xs text-[#8b949e]">{workspace.tasks.length} tasks</span></div><div className="divide-y divide-[#21262d]">{workspace.tasks.length === 0 ? <p className="p-5 text-sm text-[#8b949e]">No tasks have been seeded yet.</p> : workspace.tasks.map((item) => <article key={item.task.id} className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-[11px] text-[#6e7681]">{item.task.taskCode}</p><h3 className="mt-1 font-medium text-[#f0f6fc]">{item.task.title}</h3></div><span className="rounded-full border border-[#30363d] bg-[#21262d] px-2 py-1 text-[11px] text-[#c9d1d9]">{item.task.status}</span></div>{item.checklist.length > 0 ? <ul className="mt-3 space-y-2">{item.checklist.map((check) => <li key={check.id} className="flex items-start gap-2 text-xs text-[#8b949e]"><CheckCircle2 className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", check.status === "VERIFIED" ? "text-[#7ee787]" : "text-[#6e7681]")} aria-hidden="true" /><span>{check.label}{check.evidenceRequired ? " · evidence required" : ""}</span></li>)}</ul> : null}</article>)}</div></div>

          <div className="space-y-4">
            <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-5">
              <div className="flex items-center justify-between gap-3">
                <div><div className="text-sm font-semibold text-[#f0f6fc]">ERPNext stock lookup</div><p className="mt-1 text-xs text-[#8b949e]">Item and warehouse quantities stay sourced from ERPNext.</p></div>
                <span className="text-[11px] text-[#6e7681]">read-only</span>
              </div>
              <div className="mt-3 flex gap-2">
                <input value={erpItemCode} onChange={(event) => setErpItemCode(event.target.value)} placeholder="ERPNext item code" className="min-h-10 min-w-0 flex-1 rounded-md border border-[#30363d] bg-[#0d1117] px-3 text-sm text-[#f0f6fc] placeholder:text-[#6e7681]" />
                <Button type="button" size="sm" variant="outline" onClick={() => void lookupErpMaterial()} disabled={isSaving || !erpItemCode.trim()}>Check</Button>
              </div>
              {erpMaterialLookup ? <div className="mt-3 rounded-md border border-[#30363d] bg-[#0d1117] p-3 text-xs">
                {erpMaterialLookup.item ? <><p className="font-medium text-[#c9d1d9]">{erpMaterialLookup.item.itemName}</p><p className="mt-1 text-[#8b949e]">{erpMaterialLookup.item.itemCode}{erpMaterialLookup.item.brand ? " · " + erpMaterialLookup.item.brand : ""}{erpMaterialLookup.item.disabled ? " · disabled" : ""}</p><div className="mt-2 space-y-1">{erpMaterialLookup.stock.length === 0 ? <p className="text-[#e3b341]">No warehouse balance returned.</p> : erpMaterialLookup.stock.map((stock) => <p key={stock.providerId || stock.warehouse} className="flex justify-between gap-3 text-[#8b949e]"><span>{stock.warehouse || "Warehouse"}</span><span className="text-[#c9d1d9]">{stock.actualQuantity} available · {stock.reservedQuantity} reserved</span></p>)}</div></> : <p className="text-[#e3b341]">Item not found in ERPNext.</p>}
              </div> : null}
            </div>
            <div className="rounded-xl border border-[#30363d] bg-[#161b22]"><div className="border-b border-[#30363d] p-5"><div className="flex items-center gap-2 text-sm font-semibold text-[#f0f6fc]"><CalendarDays className="h-4 w-4 text-[#e3b341]" aria-hidden="true" /> Scheduling</div><p className="mt-1 text-xs text-[#8b949e]">Confirmed visits move a ready project into Scheduled.</p></div><div className="p-5">{activeVisit ? <div className="rounded-md border border-[#d29922]/40 bg-[#d29922]/10 p-3 text-sm text-[#e3b341]"><p className="font-semibold">{activeVisit.visit.status} visit</p><p className="mt-1 text-xs">{formatDate(activeVisit.visit.scheduledStart)} – {formatDate(activeVisit.visit.scheduledEnd)}</p><p className="mt-1 text-xs text-[#c9d1d9]">{activeVisit.visit.crewName || "Crew not assigned"}</p></div> : <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs text-[#8b949e]">Start<input type="datetime-local" value={visitStart} onChange={(event) => setVisitStart(event.target.value)} className="mt-1 min-h-10 w-full rounded-md border border-[#30363d] bg-[#0d1117] px-3 text-sm text-[#f0f6fc]" /></label><label className="text-xs text-[#8b949e]">End<input type="datetime-local" value={visitEnd} onChange={(event) => setVisitEnd(event.target.value)} className="mt-1 min-h-10 w-full rounded-md border border-[#30363d] bg-[#0d1117] px-3 text-sm text-[#f0f6fc]" /></label><Button type="button" size="sm" className="sm:col-span-2" onClick={() => void createVisit()} disabled={isSaving || !visitStart}>Confirm field visit</Button></div>}</div></div>
            <div className="rounded-xl border border-[#30363d] bg-[#161b22]"><div className="flex items-center justify-between border-b border-[#30363d] p-5"><div className="flex items-center gap-2 text-sm font-semibold text-[#f0f6fc]"><Package className="h-4 w-4 text-[#7ee787]" aria-hidden="true" /> Material readiness</div><span className="text-xs text-[#8b949e]">{workspace.materials.length} lines</span></div><div className="space-y-3 p-5">{workspace.materials.map((material) => <div key={material.id} className="flex items-center justify-between gap-3 rounded-md border border-[#30363d] bg-[#0d1117] p-3"><div><p className="text-sm font-medium text-[#c9d1d9]">{material.productName}</p><p className="mt-1 text-xs text-[#8b949e]">{material.quantity} {material.unit} · {material.status}</p></div><select value={material.status} onChange={(event) => { void fetch("/api/v2/materials/" + material.id + "/status", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: event.target.value, idempotencyKey: randomKey("workspace-material-status") }) }).then(() => loadWorkspace()); }} className="min-h-9 max-w-32 rounded-md border border-[#30363d] bg-[#161b22] px-2 text-xs text-[#c9d1d9]"><option value={material.status}>{material.status}</option><option value="RESERVED">RESERVED</option><option value="PICKED">PICKED</option><option value="ISSUED">ISSUED</option><option value="SHORT">SHORT</option><option value="CANCELLED">CANCELLED</option></select></div>)}<div className="grid gap-2 sm:grid-cols-[1fr_7rem_auto]"><input value={materialName} onChange={(event) => setMaterialName(event.target.value)} placeholder="Add material requirement" className="min-h-10 rounded-md border border-[#30363d] bg-[#0d1117] px-3 text-sm text-[#f0f6fc] placeholder:text-[#6e7681]" /><input value={materialQuantity} onChange={(event) => setMaterialQuantity(event.target.value)} type="number" min="0.001" step="0.001" className="min-h-10 rounded-md border border-[#30363d] bg-[#0d1117] px-3 text-sm text-[#f0f6fc]" /><Button type="button" size="sm" onClick={() => void addMaterial()} disabled={isSaving || !materialName.trim()}>Add</Button></div></div></div>
          </div>
        </section>

        <section className="rounded-xl border border-[#30363d] bg-[#161b22] p-5">
          <div className="flex items-center justify-between gap-3">
            <div><div className="text-sm font-semibold text-[#f0f6fc]">Scanner-first asset registration</div><p className="mt-1 text-xs text-[#8b949e]">Scan or enter a serial, then verify it against ERPNext before adding it to this project.</p></div>
            <span className="text-[11px] text-[#6e7681]">QR · barcode · manual</span>
          </div>
          <div className="mt-3 flex gap-2">
            <input value={assetSerialNumber} onChange={(event) => setAssetSerialNumber(event.target.value)} inputMode="text" autoComplete="off" placeholder="Scan serial number" className="min-h-10 min-w-0 flex-1 rounded-md border border-[#30363d] bg-[#0d1117] px-3 text-sm text-[#f0f6fc] placeholder:text-[#6e7681]" />
            <Button type="button" size="sm" variant="outline" onClick={() => void lookupErpAsset()} disabled={isSaving || !assetSerialNumber.trim()}>Verify</Button>
          </div>
          {erpAssetLookup ? <div className="mt-3 rounded-md border border-[#30363d] bg-[#0d1117] p-3 text-xs">{erpAssetLookup.found ? <><p className="font-medium text-[#7ee787]">ERP inventory match</p><p className="mt-1 text-[#c9d1d9]">{erpAssetLookup.item?.name || "Serial registered"} · {erpAssetLookup.serialNumber}</p><p className="mt-1 text-[#8b949e]">Status: {erpAssetLookup.status || "not reported"}{erpAssetLookup.warrantyExpiryDate ? " · warranty until " + formatDate(erpAssetLookup.warrantyExpiryDate) : ""}</p></> : <p className="text-[#e3b341]">Serial not found in ERPNext. It can still be registered locally for later verification.</p>}</div> : null}
        </section>

        <section className="rounded-xl border border-[#30363d] bg-[#161b22] p-5">
          <div className="flex flex-col gap-3 border-b border-[#30363d] pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#f0f6fc]"><Package className="h-4 w-4 text-[#7ee787]" aria-hidden="true" /> Installed assets</div>
            {workspace.installationWarranties.some((warranty) => warranty.status === "PENDING_ACTIVATION") && ["HANDOVER", "WARRANTY_ACTIVATION"].includes(project.lifecycleState) ? <Button type="button" size="sm" onClick={() => void activateWarranty()} disabled={isSaving}><ShieldCheck className="h-4 w-4" aria-hidden="true" /> Activate installation warranty</Button> : null}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {workspace.assets.map((asset) => <div key={asset.id} className="rounded-md border border-[#30363d] bg-[#0d1117] p-3"><div className="flex items-start justify-between gap-3"><p className="text-sm font-medium text-[#c9d1d9]">{asset.productName}</p><span className={cn("text-[11px]", asset.status === "UNKNOWN" ? "text-[#e3b341]" : "text-[#7ee787]")}>{asset.status}</span></div><p className="mt-1 font-mono text-xs text-[#8b949e]">{asset.serialNumber}</p><p className="mt-2 text-xs text-[#8b949e]">Installed {formatDate(asset.installedDate)} · warranty until {formatDate(asset.warrantyExpiryDate)}</p>{asset.status === "UNKNOWN" ? <div className="mt-3 flex gap-2"><input value={resolutionAssetId === asset.id ? resolutionCatalogProductId : ""} onFocus={() => { setResolutionAssetId(asset.id); setResolutionCatalogProductId(""); }} onChange={(event) => { setResolutionAssetId(asset.id); setResolutionCatalogProductId(event.target.value); }} placeholder="Match ERP item code" className="min-h-9 min-w-0 flex-1 rounded-md border border-[#30363d] bg-[#161b22] px-2 text-xs text-[#f0f6fc] placeholder:text-[#6e7681]" /><Button type="button" size="sm" variant="outline" onClick={() => void resolveAsset(asset)} disabled={isSaving || resolutionAssetId !== asset.id || !resolutionCatalogProductId.trim()}>Resolve</Button></div> : null}</div>)}
            {workspace.assets.length === 0 ? <p className="text-xs text-[#8b949e]">Register serialised equipment after commissioning.</p> : null}
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
            <input value={assetProductName} onChange={(event) => setAssetProductName(event.target.value)} placeholder="Product name" className="min-h-10 rounded-md border border-[#30363d] bg-[#0d1117] px-3 text-sm text-[#f0f6fc] placeholder:text-[#6e7681]" />
            <input value={assetSerialNumber} onChange={(event) => setAssetSerialNumber(event.target.value)} placeholder="Serial number" className="min-h-10 rounded-md border border-[#30363d] bg-[#0d1117] px-3 text-sm text-[#f0f6fc] placeholder:text-[#6e7681]" />
            <input value={assetWarrantyProvider} onChange={(event) => setAssetWarrantyProvider(event.target.value)} placeholder="Warranty provider (optional)" className="min-h-10 rounded-md border border-[#30363d] bg-[#0d1117] px-3 text-sm text-[#f0f6fc] placeholder:text-[#6e7681]" />
            <Button type="button" size="sm" onClick={() => void registerAsset()} disabled={isSaving || !assetProductName.trim() || !assetSerialNumber.trim()}>Register</Button>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-5"><div className="flex items-center gap-2 text-sm font-semibold text-[#f0f6fc]"><UserRound className="h-4 w-4 text-[#79c0ff]" aria-hidden="true" /> Assignments</div><div className="mt-3 grid gap-2"><select value={assignmentVisitId} onChange={(event) => setAssignmentVisitId(event.target.value)} className="min-h-9 rounded-md border border-[#30363d] bg-[#0d1117] px-2 text-xs text-[#c9d1d9]"><option value="">Choose visit</option>{workspace.visits.filter((item) => ["PLANNED", "CONFIRMED", "IN_PROGRESS"].includes(item.visit.status)).map((item) => <option key={item.visit.id} value={item.visit.id}>{item.visit.visitType} · {item.visit.status}</option>)}</select><select value={assignmentTaskId} onChange={(event) => setAssignmentTaskId(event.target.value)} className="min-h-9 rounded-md border border-[#30363d] bg-[#0d1117] px-2 text-xs text-[#c9d1d9]"><option value="">Visit-level assignment</option>{workspace.tasks.filter((item) => !["COMPLETED", "CANCELLED"].includes(item.task.status)).map((item) => <option key={item.task.id} value={item.task.id}>{item.task.taskCode}</option>)}</select><select value={assignmentUserId} onChange={(event) => setAssignmentUserId(event.target.value)} className="min-h-9 rounded-md border border-[#30363d] bg-[#0d1117] px-2 text-xs text-[#c9d1d9]"><option value="">Choose technician</option>{assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.name} · {assignee.role}</option>)}</select><Button type="button" size="sm" onClick={() => void assignJob()} disabled={isSaving || !assignmentVisitId || !assignmentUserId}>Assign field work</Button></div><div className="mt-4 space-y-2">{workspace.visits.flatMap((item) => item.assignments).length === 0 ? <p className="text-xs text-[#8b949e]">No assignments yet.</p> : workspace.visits.flatMap((item) => item.assignments).map((item) => <div key={item.assignment.id} className="rounded-md bg-[#0d1117] p-3 text-xs"><p className="font-medium text-[#c9d1d9]">{item.assignee?.name || item.assignee?.email || item.assignment.assigneeUserId}</p><p className="mt-1 text-[#8b949e]">{item.assignment.status}</p></div>)}</div></div>
          <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-5"><div className="flex items-center gap-2 text-sm font-semibold text-[#f0f6fc]"><ShieldCheck className="h-4 w-4 text-[#7ee787]" aria-hidden="true" /> Warranty</div><div className="mt-3 space-y-2">{workspace.installationWarranties.length === 0 ? <p className="text-xs text-[#8b949e]">No installation warranty record.</p> : workspace.installationWarranties.map((warranty) => <div key={warranty.id} className="rounded-md bg-[#0d1117] p-3 text-xs"><p className="font-medium text-[#c9d1d9]">{warranty.status}</p><p className="mt-1 text-[#8b949e]">{warranty.policyVersion} · {warranty.durationMonths || "—"} months</p><p className="mt-1 text-[#8b949e]">{formatDate(warranty.startsAt)} – {formatDate(warranty.endsAt)}</p></div>)}</div></div>
          <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-5"><div className="flex items-center gap-2 text-sm font-semibold text-[#f0f6fc]"><ClipboardCheck className="h-4 w-4 text-[#e3b341]" aria-hidden="true" /> Service cases</div><div className="mt-3 space-y-2">{workspace.serviceCases.length === 0 ? <p className="text-xs text-[#8b949e]">No after-sales cases.</p> : workspace.serviceCases.map((item) => <div key={item.id} className="rounded-md bg-[#0d1117] p-3 text-xs"><p className="font-medium text-[#c9d1d9]">{item.caseNumber} · {item.subject}</p><p className="mt-1 text-[#8b949e]">{item.priority} · {item.status}</p></div>)}</div></div>
        </section>
      </div>
    </main>
  );
}
