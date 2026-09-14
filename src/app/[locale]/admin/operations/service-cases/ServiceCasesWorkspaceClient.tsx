"use client";

import Link from "next/link";
import { useLocale } from "next-intl";
import { useCallback, useEffect, useState } from "react";

import { AlertTriangle, ArrowLeft, CheckCircle2, LifeBuoy, Loader2, RefreshCw } from "@/components/ui/icons";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ServiceCase = {
  id: string;
  caseNumber: string;
  customerUserId: string;
  projectId: string | null;
  assetId: string | null;
  type: string;
  priority: string;
  subject: string;
  description: string;
  status: string;
  assignedUserId: string | null;
  warrantyDecision: string | null;
  slaDueAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const STATUSES = ["NEW", "TRIAGED", "SCHEDULED", "IN_PROGRESS", "WAITING_CUSTOMER", "RESOLVED", "CLOSED", "CANCELLED"] as const;

function titleCase(value: string) {
  return value.replaceAll("_", " ").toLowerCase().replace(/(^| )\w/g, (letter) => letter.toUpperCase());
}

function dateLabel(value: string | null) {
  if (!value) return "Not set";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not set" : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function randomKey() {
  return "ops-after-sales:" + crypto.randomUUID();
}

export default function ServiceCasesWorkspaceClient({ enabled }: { enabled: boolean }) {
  const locale = useLocale();
  const [cases, setCases] = useState<ServiceCase[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(enabled);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError("");
    try {
      const query = statusFilter ? "?status=" + encodeURIComponent(statusFilter) : "";
      const response = await fetch("/api/v2/service-cases" + query, { cache: "no-store" });
      const payload = await response.json() as { success?: boolean; data?: ServiceCase[]; error?: { message?: string } };
      if (!response.ok || !payload.success || !payload.data) throw new Error(payload.error?.message || "Service cases could not be loaded.");
      setCases(payload.data);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Service cases could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [enabled, statusFilter]);

  // This effect hydrates the case queue from the API after the route loads.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const updateStatus = async (item: ServiceCase, status: string) => {
    setBusyId(item.id);
    setError("");
    try {
      const response = await fetch("/api/v2/service-cases/" + item.id, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, idempotencyKey: randomKey() }),
      });
      const payload = await response.json() as { success?: boolean; error?: { message?: string } };
      if (!response.ok || !payload.success) throw new Error(payload.error?.message || "The case status could not be updated.");
      await load();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "The case status could not be updated.");
    } finally {
      setBusyId("");
    }
  };

  if (!enabled) {
    return <main className="min-h-full bg-[#0d1117] p-8 text-[#c9d1d9]"><div className="mx-auto max-w-3xl rounded-xl border border-[#30363d] bg-[#161b22] p-8"><h1 className="text-2xl font-semibold text-[#f0f6fc]">After-sales workspace is staged</h1><p className="mt-2 text-sm leading-6 text-[#8b949e]">Enable OPS_V2_AFTER_SALES when the new customer service workflow is ready for staff.</p></div></main>;
  }

  return (
    <main data-bagui="after-sales-workspace" className="min-h-full bg-[#0d1117] px-4 py-6 text-[#c9d1d9] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1400px] space-y-6">
        <div className="flex items-center justify-between gap-4">
          <Link href={"/" + locale + "/admin/operations"} className="inline-flex items-center gap-2 text-sm font-medium text-[#8b949e] hover:text-[#f0f6fc]"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Operations workspace</Link>
          <Button type="button" variant="quiet" size="sm" onClick={() => void load()} disabled={loading} className="text-[#8b949e] hover:bg-[#21262d] hover:text-[#f0f6fc]"><RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} aria-hidden="true" /> Refresh</Button>
        </div>
        <header className="flex flex-col gap-4 rounded-xl border border-[#30363d] bg-[#161b22] p-5 shadow-xl sm:p-7 md:flex-row md:items-end md:justify-between">
          <div><div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#C58F61]"><LifeBuoy className="h-4 w-4" aria-hidden="true" /> Customer care operations</div><h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#f0f6fc]">After-sales cases</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#8b949e]">Triage customer requests, apply warranty decisions, and move field follow-up through one auditable case queue.</p></div>
          <Link href={"/" + locale + "/portal/service"} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "border-[#30363d] bg-[#0d1117] text-[#c9d1d9] hover:bg-[#21262d] hover:text-[#f0f6fc]")}>Customer service view</Link>
        </header>
        <section className="rounded-xl border border-[#30363d] bg-[#161b22] shadow-xl">
          <div className="flex flex-col gap-3 border-b border-[#30363d] p-4 sm:flex-row sm:items-center sm:justify-between"><label className="text-xs font-semibold uppercase tracking-[0.08em] text-[#8b949e]">Filter status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="ml-3 min-h-9 rounded-md border border-[#30363d] bg-[#0d1117] px-3 text-xs font-normal normal-case tracking-normal text-[#c9d1d9]"><option value="">All cases</option>{STATUSES.map((status) => <option key={status} value={status}>{titleCase(status)}</option>)}</select></label><span className="text-xs text-[#8b949e]">{cases.length} visible case{cases.length === 1 ? "" : "s"}</span></div>
          {error ? <div role="alert" className="m-4 flex gap-2 rounded-md border border-[#f85149]/40 bg-[#f85149]/10 p-3 text-sm text-[#ff7b72]"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{error}</div> : null}
          {loading && cases.length === 0 ? <div className="flex items-center gap-2 p-8 text-sm text-[#8b949e]"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading cases…</div> : cases.length === 0 ? <div className="p-12 text-center text-sm text-[#8b949e]">No service cases match this filter.</div> : <div className="divide-y divide-[#21262d]">{cases.map((item) => <article key={item.id} className="p-5 transition-colors hover:bg-[#1c2128]"><div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs text-[#79c0ff]">{item.caseNumber}</span><span className="rounded-full border border-[#30363d] bg-[#21262d] px-2 py-1 text-[11px] font-semibold text-[#c9d1d9]">{titleCase(item.priority)}</span><span className="rounded-full border border-[#d29922]/40 bg-[#d29922]/10 px-2 py-1 text-[11px] font-semibold text-[#e3b341]">{titleCase(item.type)}</span></div><h2 className="mt-3 text-base font-semibold text-[#f0f6fc]">{item.subject}</h2><p className="mt-2 max-w-3xl whitespace-pre-wrap text-sm leading-6 text-[#8b949e]">{item.description}</p><p className="mt-3 text-xs text-[#6e7681]">Customer {item.customerUserId} · Opened {dateLabel(item.createdAt)} · SLA {dateLabel(item.slaDueAt)}</p></div><div className="flex shrink-0 items-center gap-3"><label className="text-xs text-[#8b949e]">Status<select value={item.status} onChange={(event) => void updateStatus(item, event.target.value)} disabled={busyId === item.id} className="mt-1 min-h-10 w-48 rounded-md border border-[#30363d] bg-[#0d1117] px-3 text-sm text-[#c9d1d9]">{STATUSES.map((status) => <option key={status} value={status}>{titleCase(status)}</option>)}</select></label>{busyId === item.id ? <Loader2 className="h-4 w-4 animate-spin text-[#79c0ff]" aria-label="Updating case" /> : item.status === "RESOLVED" || item.status === "CLOSED" ? <CheckCircle2 className="h-5 w-5 text-[#7ee787]" aria-label="Case resolved" /> : null}</div></div></article>)}</div>}
        </section>
      </div>
    </main>
  );
}
