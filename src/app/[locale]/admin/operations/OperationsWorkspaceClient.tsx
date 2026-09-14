"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { AlertTriangle, ArrowRight, ClipboardList, RefreshCw, Search, SlidersHorizontal } from "@/components/ui/icons";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { OPS_PROJECT_STATES, type OpsProjectState } from "@/types/ops-v2";

type ProjectItem = {
  id: string;
  projectCode: string;
  proposalId: string;
  customerId: string | null;
  customerName: string;
  siteId: string | null;
  siteLabel: string | null;
  siteAddress: string | null;
  lifecycleState: OpsProjectState;
  legacyStatus: string;
  erpnextSyncStatus: string;
  permitStatus: string;
  createdAt: string;
  updatedAt: string;
};

type InitialData = {
  items: ProjectItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function OperationsWorkspaceClient({ enabled, initial }: { enabled: boolean; initial: InitialData }) {
  const locale = useLocale();
  const [query, setQuery] = useState("");
  const [state, setState] = useState<OpsProjectState | "">("");
  const [data, setData] = useState<InitialData>(initial);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    if (!enabled) return;
    setIsLoading(true);
    setError(null);
    const params = new URLSearchParams({ limit: "25" });
    if (query.trim()) params.set("q", query.trim());
    if (state) params.set("state", state);
    try {
      const response = await fetch("/api/v2/projects?" + params.toString(), { cache: "no-store" });
      const payload = await response.json() as { success?: boolean; data?: ProjectItem[]; pagination?: InitialData["pagination"]; error?: { message?: string } };
      if (!response.ok || !payload.success || !payload.data || !payload.pagination) {
        throw new Error(payload.error?.message || "Projects could not be loaded.");
      }
      setData({ items: payload.data, pagination: payload.pagination });
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : "Projects could not be loaded.");
    } finally {
      setIsLoading(false);
    }
  }, [enabled, query, state]);

  useEffect(() => {
    const timeout = window.setTimeout(() => { void loadProjects(); }, 250);
    return () => window.clearTimeout(timeout);
  }, [loadProjects]);

  const stateCounts = useMemo(() => OPS_PROJECT_STATES.map((item) => ({
    state: item,
    count: data.items.filter((project) => project.lifecycleState === item).length,
  })).filter((item) => item.count > 0), [data.items]);

  if (!enabled) {
    return (
      <main data-bagui="operations-workspace" className="min-h-full bg-[#0d1117] px-4 py-8 text-[#c9d1d9] sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl rounded-xl border border-[#30363d] bg-[#161b22] p-8 shadow-2xl">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#21262d] text-[#58a6ff]"><SlidersHorizontal className="h-5 w-5" aria-hidden="true" /></div>
          <h1 className="mt-5 text-2xl font-semibold text-[#f0f6fc]">Operations workspace is staged</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[#8b949e]">Enable OPS_V2_PROJECTS in Feature toggles when the team is ready to expose the canonical project read model.</p>
          <Link href={"/" + locale + "/admin/settings/feature-toggles"} className={cn(buttonVariants({ variant: "primary", size: "sm" }), "mt-6")}>Open feature toggles <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
        </div>
      </main>
    );
  }

  return (
    <main data-bagui="operations-workspace" className="min-h-full bg-[#0d1117] px-4 py-6 text-[#c9d1d9] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <header className="flex flex-col gap-5 border-b border-[#30363d] pb-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#58a6ff]"><ClipboardList className="h-4 w-4" aria-hidden="true" /> Canonical delivery control</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#f0f6fc]">Operations workspace</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#8b949e]">One project view for site readiness, engineering, material availability, scheduling, field execution, handover, and warranty activation.</p>
          </div>
          <Link href={"/" + locale + "/admin/settings/integration-sync"} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "border-[#30363d] bg-[#161b22] text-[#c9d1d9] hover:bg-[#21262d] hover:text-[#f0f6fc]")}>Integration monitor <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Project overview">
          <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-4"><p className="text-xs text-[#8b949e]">Visible projects</p><p className="mt-2 text-2xl font-semibold text-[#f0f6fc]">{data.pagination.total}</p></div>
          <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-4"><p className="text-xs text-[#8b949e]">Active delivery</p><p className="mt-2 text-2xl font-semibold text-[#79c0ff]">{data.items.filter((project) => ["SCHEDULED", "IN_PROGRESS", "QA_COMMISSIONING", "HANDOVER"].includes(project.lifecycleState)).length}</p></div>
          <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-4"><p className="text-xs text-[#8b949e]">Needs preparation</p><p className="mt-2 text-2xl font-semibold text-[#e3b341]">{data.items.filter((project) => ["SITE_REVIEW", "ENGINEERING", "MATERIAL_PREPARATION"].includes(project.lifecycleState)).length}</p></div>
          <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-4"><p className="text-xs text-[#8b949e]">Completed</p><p className="mt-2 text-2xl font-semibold text-[#7ee787]">{data.items.filter((project) => project.lifecycleState === "COMPLETED").length}</p></div>
        </section>

        <section className="rounded-lg border border-[#30363d] bg-[#161b22] shadow-xl">
          <div className="flex flex-col gap-3 border-b border-[#30363d] p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 flex-col gap-3 sm:flex-row">
              <label className="relative block min-w-0 flex-1 sm:max-w-md">
                <span className="sr-only">Search projects</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8b949e]" aria-hidden="true" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search project, customer, or site" className="min-h-10 w-full rounded-md border border-[#30363d] bg-[#0d1117] pl-9 pr-3 text-sm text-[#f0f6fc] outline-none placeholder:text-[#6e7681] focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff]" />
              </label>
              <label className="block sm:w-56">
                <span className="sr-only">Filter project state</span>
                <select value={state} onChange={(event) => setState(event.target.value as OpsProjectState | "")} className="min-h-10 w-full rounded-md border border-[#30363d] bg-[#0d1117] px-3 text-sm text-[#c9d1d9] outline-none focus:border-[#58a6ff]">
                  <option value="">All lifecycle states</option>
                  {OPS_PROJECT_STATES.map((item) => <option key={item} value={item}>{stateLabels[item]}</option>)}
                </select>
              </label>
            </div>
            <Button type="button" variant="quiet" size="sm" onClick={() => void loadProjects()} disabled={isLoading} className="self-start text-[#8b949e] hover:bg-[#21262d] hover:text-[#f0f6fc]"><RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} aria-hidden="true" /> Refresh</Button>
          </div>
          {stateCounts.length > 0 ? <div className="flex flex-wrap gap-2 border-b border-[#30363d] px-4 py-3">{stateCounts.map((item) => <span key={item.state} className={cn("rounded-full border px-2.5 py-1 text-[11px] font-semibold", stateTone(item.state))}>{stateLabels[item.state]} · {item.count}</span>)}</div> : null}
          {error ? <div role="alert" className="m-4 flex items-start gap-3 rounded-md border border-[#f85149]/40 bg-[#f85149]/10 p-3 text-sm text-[#ff7b72]"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span>{error}</span></div> : null}
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-[#30363d] text-[11px] uppercase tracking-[0.08em] text-[#8b949e]"><tr><th className="px-4 py-3 font-semibold">Project</th><th className="px-4 py-3 font-semibold">Customer / site</th><th className="px-4 py-3 font-semibold">Lifecycle</th><th className="px-4 py-3 font-semibold">ERP projection</th><th className="px-4 py-3 font-semibold">Updated</th><th className="px-4 py-3"><span className="sr-only">Open</span></th></tr></thead>
              <tbody className="divide-y divide-[#21262d]">
                {data.items.length === 0 ? <tr><td colSpan={6} className="px-4 py-14 text-center text-[#8b949e]">{isLoading ? "Loading projects…" : "No canonical projects match these filters."}</td></tr> : data.items.map((project) => (
                  <tr key={project.id} className="transition-colors hover:bg-[#1c2128]">
                    <td className="px-4 py-4"><Link href={"/" + locale + "/admin/operations/projects/" + project.id} className="font-semibold text-[#f0f6fc] hover:text-[#79c0ff]">{project.projectCode}</Link><p className="mt-1 font-mono text-[11px] text-[#6e7681]">{project.proposalId}</p></td>
                    <td className="px-4 py-4"><p className="font-medium text-[#c9d1d9]">{project.customerName}</p><p className="mt-1 max-w-xs truncate text-xs text-[#8b949e]">{project.siteLabel || project.siteAddress || "Site details pending"}</p></td>
                    <td className="px-4 py-4"><span className={cn("inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold", stateTone(project.lifecycleState))}>{stateLabels[project.lifecycleState]}</span></td>
                    <td className="px-4 py-4"><span className="text-xs text-[#8b949e]">{project.erpnextSyncStatus}</span></td>
                    <td className="whitespace-nowrap px-4 py-4 text-xs text-[#8b949e]">{formatDate(project.updatedAt)}</td>
                    <td className="px-4 py-4 text-right"><Link href={"/" + locale + "/admin/operations/projects/" + project.id} aria-label={"Open " + project.projectCode} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#8b949e] hover:bg-[#21262d] hover:text-[#f0f6fc]"><ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
