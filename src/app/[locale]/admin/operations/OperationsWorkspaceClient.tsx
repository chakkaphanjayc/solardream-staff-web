"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
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

const stateLabelKeys = {
  NEW: "states.new",
  SITE_REVIEW: "states.siteReview",
  ENGINEERING: "states.engineering",
  MATERIAL_PREPARATION: "states.materialPreparation",
  READY_TO_SCHEDULE: "states.readyToSchedule",
  SCHEDULED: "states.scheduled",
  IN_PROGRESS: "states.inProgress",
  QA_COMMISSIONING: "states.qaCommissioning",
  HANDOVER: "states.handover",
  WARRANTY_ACTIVATION: "states.warrantyActivation",
  COMPLETED: "states.completed",
} as const satisfies Record<OpsProjectState, string>;

const syncStatusLabelKeys: Partial<Record<string, "syncStatuses.synced" | "syncStatuses.syncing" | "syncStatuses.pending" | "syncStatuses.failed" | "syncStatuses.localOnly">> = {
  SYNCED: "syncStatuses.synced",
  SYNCING: "syncStatuses.syncing",
  PENDING: "syncStatuses.pending",
  FAILED: "syncStatuses.failed",
  LOCAL_ONLY: "syncStatuses.localOnly",
};

function stateTone(state: OpsProjectState) {
  if (state === "COMPLETED") return "border-[#238636]/50 bg-[#238636]/15 text-[#7ee787]";
  if (["IN_PROGRESS", "QA_COMMISSIONING", "HANDOVER"].includes(state)) return "border-[#58a6ff]/40 bg-[#58a6ff]/10 text-[#79c0ff]";
  if (["SCHEDULED", "READY_TO_SCHEDULE"].includes(state)) return "border-[#d29922]/40 bg-[#d29922]/10 text-[#e3b341]";
  return "border-[#30363d] bg-[#21262d] text-[#c9d1d9]";
}

function formatDate(value: string, locale: string) {
  const formatLocale = locale === "th" ? "th-TH" : "en-US";
  return new Intl.DateTimeFormat(formatLocale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function OperationsWorkspaceClient({ enabled, initial }: { enabled: boolean; initial: InitialData }) {
  const locale = useLocale();
  const t = useTranslations("OperationsWorkspace");
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
        throw new Error(payload.error?.message || t("errors.loadFailed"));
      }
      setData({ items: payload.data, pagination: payload.pagination });
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : t("errors.loadFailed"));
    } finally {
      setIsLoading(false);
    }
  }, [enabled, query, state, t]);

  useEffect(() => {
    const timeout = window.setTimeout(() => { void loadProjects(); }, 250);
    return () => window.clearTimeout(timeout);
  }, [loadProjects]);

  const stateCounts = useMemo(() => OPS_PROJECT_STATES.map((item) => ({
    state: item,
    count: data.items.filter((project) => project.lifecycleState === item).length,
  })).filter((item) => item.count > 0), [data.items]);

  const getSyncStatusLabel = (status: string) => {
    const labelKey = syncStatusLabelKeys[status];
    return labelKey ? t(labelKey) : status;
  };

  if (!enabled) {
    return (
      <div data-bagui="operations-workspace" className="min-h-full bg-[#0d1117] px-4 py-8 text-[#c9d1d9] sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl rounded-xl border border-[#30363d] bg-[#161b22] p-8 shadow-2xl">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#21262d] text-[#58a6ff]"><SlidersHorizontal className="h-5 w-5" aria-hidden="true" /></div>
          <h1 className="mt-5 text-2xl font-semibold text-[#f0f6fc]">{t("disabled.title")}</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[#8b949e]">{t("disabled.description")}</p>
          <Link href={"/" + locale + "/admin/settings/feature-toggles"} className={cn(buttonVariants({ variant: "primary", size: "sm" }), "mt-6")}>{t("actions.openFeatureToggles")} <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
        </div>
      </div>
    );
  }

  return (
    <div data-bagui="operations-workspace" className="min-h-full bg-[#0d1117] px-4 py-6 text-[#c9d1d9] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <header className="flex flex-col gap-5 border-b border-[#30363d] pb-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#58a6ff]"><ClipboardList className="h-4 w-4" aria-hidden="true" /> {t("header.eyebrow")}</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#f0f6fc]">{t("header.title")}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#8b949e]">{t("header.description")}</p>
          </div>
          <Link href={"/" + locale + "/admin/settings/integration-sync"} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "border-[#30363d] bg-[#161b22] text-[#c9d1d9] hover:bg-[#21262d] hover:text-[#f0f6fc]")}>{t("actions.integrationMonitor")} <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label={t("overview.label")}>
          <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-4"><p className="text-xs text-[#8b949e]">{t("overview.visibleProjects")}</p><p className="mt-2 text-2xl font-semibold text-[#f0f6fc]">{data.pagination.total}</p></div>
          <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-4"><p className="text-xs text-[#8b949e]">{t("overview.activeDelivery")}</p><p className="mt-2 text-2xl font-semibold text-[#79c0ff]">{data.items.filter((project) => ["SCHEDULED", "IN_PROGRESS", "QA_COMMISSIONING", "HANDOVER"].includes(project.lifecycleState)).length}</p></div>
          <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-4"><p className="text-xs text-[#8b949e]">{t("overview.needsPreparation")}</p><p className="mt-2 text-2xl font-semibold text-[#e3b341]">{data.items.filter((project) => ["SITE_REVIEW", "ENGINEERING", "MATERIAL_PREPARATION"].includes(project.lifecycleState)).length}</p></div>
          <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-4"><p className="text-xs text-[#8b949e]">{t("overview.completed")}</p><p className="mt-2 text-2xl font-semibold text-[#7ee787]">{data.items.filter((project) => project.lifecycleState === "COMPLETED").length}</p></div>
        </section>

        <section className="rounded-lg border border-[#30363d] bg-[#161b22] shadow-xl">
          <div className="flex flex-col gap-3 border-b border-[#30363d] p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 flex-col gap-3 sm:flex-row">
              <label className="relative block min-w-0 flex-1 sm:max-w-md">
                <span className="sr-only">{t("filters.searchLabel")}</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8b949e]" aria-hidden="true" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("filters.searchPlaceholder")} className="min-h-10 w-full rounded-md border border-[#30363d] bg-[#0d1117] pl-9 pr-3 text-sm text-[#f0f6fc] outline-none placeholder:text-[#6e7681] focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff]" />
              </label>
              <label className="block sm:w-56">
                <span className="sr-only">{t("filters.stateLabel")}</span>
                <select value={state} onChange={(event) => setState(event.target.value as OpsProjectState | "")} className="min-h-10 w-full rounded-md border border-[#30363d] bg-[#0d1117] px-3 text-sm text-[#c9d1d9] outline-none focus:border-[#58a6ff]">
                  <option value="">{t("filters.allStates")}</option>
                  {OPS_PROJECT_STATES.map((item) => <option key={item} value={item}>{t(stateLabelKeys[item])}</option>)}
                </select>
              </label>
            </div>
            <Button type="button" variant="quiet" size="sm" onClick={() => void loadProjects()} disabled={isLoading} className="self-start text-[#8b949e] hover:bg-[#21262d] hover:text-[#f0f6fc]"><RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} aria-hidden="true" /> {t("actions.refresh")}</Button>
          </div>
          {stateCounts.length > 0 ? <div className="flex flex-wrap gap-2 border-b border-[#30363d] px-4 py-3">{stateCounts.map((item) => <span key={item.state} className={cn("rounded-full border px-2.5 py-1 text-[11px] font-semibold", stateTone(item.state))}>{t(stateLabelKeys[item.state])} · {item.count}</span>)}</div> : null}
          {error ? <div role="alert" className="m-4 flex items-start gap-3 rounded-md border border-[#f85149]/40 bg-[#f85149]/10 p-3 text-sm text-[#ff7b72]"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span>{error}</span></div> : null}
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-[#30363d] text-[11px] uppercase tracking-[0.08em] text-[#8b949e]"><tr><th className="px-4 py-3 font-semibold">{t("table.project")}</th><th className="px-4 py-3 font-semibold">{t("table.customerSite")}</th><th className="px-4 py-3 font-semibold">{t("table.lifecycle")}</th><th className="px-4 py-3 font-semibold">{t("table.erpProjection")}</th><th className="px-4 py-3 font-semibold">{t("table.updated")}</th><th className="px-4 py-3"><span className="sr-only">{t("table.open")}</span></th></tr></thead>
              <tbody className="divide-y divide-[#21262d]">
                {data.items.length === 0 ? <tr><td colSpan={6} className="px-4 py-14 text-center text-[#8b949e]">{isLoading ? t("empty.loadingProjects") : t("empty.noMatches")}</td></tr> : data.items.map((project) => (
                  <tr key={project.id} className="transition-colors hover:bg-[#1c2128]">
                    <td className="px-4 py-4"><Link href={"/" + locale + "/admin/operations/projects/" + project.id} className="font-semibold text-[#f0f6fc] hover:text-[#79c0ff]">{project.projectCode}</Link><p className="mt-1 font-mono text-[11px] text-[#6e7681]">{project.proposalId}</p></td>
                    <td className="px-4 py-4"><p className="font-medium text-[#c9d1d9]">{project.customerName}</p><p className="mt-1 max-w-xs truncate text-xs text-[#8b949e]">{project.siteLabel || project.siteAddress || t("empty.siteDetailsPending")}</p></td>
                    <td className="px-4 py-4"><span className={cn("inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold", stateTone(project.lifecycleState))}>{t(stateLabelKeys[project.lifecycleState])}</span></td>
                    <td className="px-4 py-4"><span className="text-xs text-[#8b949e]">{getSyncStatusLabel(project.erpnextSyncStatus)}</span></td>
                    <td className="whitespace-nowrap px-4 py-4 text-xs text-[#8b949e]">{formatDate(project.updatedAt, locale)}</td>
                    <td className="px-4 py-4 text-right"><Link href={"/" + locale + "/admin/operations/projects/" + project.id} aria-label={t("actions.openProject", { projectCode: project.projectCode })} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#8b949e] hover:bg-[#21262d] hover:text-[#f0f6fc]"><ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
