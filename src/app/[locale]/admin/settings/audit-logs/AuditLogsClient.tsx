"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Copy,
  Database,
  Eye,
  Fingerprint,
  Search,
  ShieldAlert,
  X,
} from "@/components/ui/icons";
import { toast } from "sonner";

import type { AuditLogResult, AuditLogRow, AuditOutcome } from "@/types/audit";
import { cn } from "@/lib/utils";
import { AdminBulkActionBar } from "@/components/admin/AdminBulkActionBar";
import { AdminSelectionCheckbox } from "@/components/admin/AdminSelectionCheckbox";
import { useAdminSelection } from "@/hooks/useAdminSelection";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value));
}

function outcomeTone(outcome: AuditOutcome) {
  if (outcome === "SUCCESS") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (outcome === "DENIED") return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  return "border-rose-500/30 bg-rose-500/10 text-rose-300";
}

function actorLabel(row: AuditLogRow) {
  return row.actorName || row.actorEmail || row.actorUserId || row.actorType;
}

function metadataText(row: AuditLogRow) {
  return JSON.stringify(row.metadata, null, 2);
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[#30363d] bg-[#161b22] px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8b949e]">{label}</p>
      <p className="mt-1 text-xl font-semibold text-[#f0f6fc]">{value}</p>
    </div>
  );
}

function DetailValue({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-md border border-[#30363d] bg-[#0d1117] px-3 py-2.5">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8b949e]">{label}</dt>
      <dd className="mt-1 break-all font-mono text-xs text-[#c9d1d9]">{value || "Not recorded"}</dd>
    </div>
  );
}

export default function AuditLogsClient({ initialResult }: { initialResult: AuditLogResult }) {
  const t = useTranslations("AdminAuditLogs");
  const [query, setQuery] = useState("");
  const [outcome, setOutcome] = useState<AuditOutcome | "ALL">("ALL");
  const [resourceType, setResourceType] = useState("ALL");
  const [selectedLog, setSelectedLog] = useState<AuditLogRow | null>(null);

  const resourceTypes = useMemo(
    () => [...new Set(initialResult.rows.map((row) => row.resourceType))].sort(),
    [initialResult.rows],
  );

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return initialResult.rows.filter((row) => {
      if (outcome !== "ALL" && row.outcome !== outcome) return false;
      if (resourceType !== "ALL" && row.resourceType !== resourceType) return false;
      if (!normalizedQuery) return true;

      return [
        row.action,
        row.resourceType,
        row.resourceId,
        row.route,
        row.actorName,
        row.actorEmail,
        row.actorUserId,
        row.requestId,
      ]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(normalizedQuery));
    });
  }, [initialResult.rows, outcome, query, resourceType]);
  const auditSelection = useAdminSelection(filteredRows.map((row) => row.id));

  const handleCopySelected = async () => {
    const selected = filteredRows.filter((row) => auditSelection.selectedIds.includes(row.id));
    if (selected.length === 0) return;
    await navigator.clipboard.writeText(selected.map((row) => `${row.occurredAt}\t${row.action}\t${row.resourceType}\t${row.resourceId || ""}`).join("\n"));
    toast.success(`Copied ${selected.length} selected audit event${selected.length === 1 ? "" : "s"}.`);
  };

  const copyValue = async (value: string | null) => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    toast.success(t("copied"));
  };

  return (
    <main className="min-h-full bg-[#0d1117] px-4 py-6 text-[#c9d1d9] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="rounded-md border border-[#30363d] bg-[#161b22] p-5">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-md border border-[#58a6ff]/35 bg-[#58a6ff]/10 px-2.5 py-1.5 text-xs font-semibold text-[#79c0ff]">
                <Fingerprint className="h-4 w-4" />
                {t("eyebrow")}
              </div>
              <h1 className="mt-4 text-2xl font-semibold tracking-tight text-[#f0f6fc] sm:text-3xl">
                {t("title")}
              </h1>
              <p className="mt-2 text-sm leading-6 text-[#8b949e]">{t("description")}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Metric label={t("metrics.events")} value={String(initialResult.rows.length)} />
              <Metric label={t("metrics.visible")} value={String(filteredRows.length)} />
              <Metric label={t("metrics.failures")} value={String(initialResult.rows.filter((row) => row.outcome === "FAILURE").length)} />
              <Metric label={t("metrics.denied")} value={String(initialResult.rows.filter((row) => row.outcome === "DENIED").length)} />
            </div>
          </div>
        </header>

        {!initialResult.storageReady && (
          <section className="flex flex-col gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-4 text-amber-200 sm:flex-row sm:items-start">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
            <div>
              <p className="font-semibold">{t("notReadyTitle")}</p>
              <p className="mt-1 text-sm leading-6 text-amber-100/80">{t("notReadyDescription")}</p>
              <code className="mt-2 block overflow-x-auto rounded bg-[#0d1117]/70 px-3 py-2 font-mono text-xs text-amber-100">
                npm run db:migrate:audit-logs
              </code>
            </div>
          </section>
        )}

        {initialResult.error && initialResult.storageReady && (
          <div role="alert" className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {initialResult.error}
          </div>
        )}

        <section className="rounded-md border border-[#30363d] bg-[#161b22]">
          <div className="flex flex-col gap-3 border-b border-[#30363d] p-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="font-semibold text-[#f0f6fc]">{t("ledgerTitle")}</h2>
              <p className="mt-1 text-xs text-[#8b949e]">{t("ledgerDescription")}</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-[#8b949e]">
              <Database className="h-4 w-4 text-[#58a6ff]" />
              {t("newestFirst")}
            </div>
          </div>

          <div className="grid gap-3 border-b border-[#30363d] p-4 md:grid-cols-[minmax(0,1fr)_180px_180px]">
            <label className="relative block">
              <span className="sr-only">{t("searchLabel")}</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8b949e]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("searchPlaceholder")}
                className="min-h-11 w-full rounded-md border border-[#30363d] bg-[#0d1117] pl-9 pr-3 text-sm text-[#f0f6fc] outline-none placeholder:text-[#8b949e] focus:border-[#58a6ff] focus:ring-2 focus:ring-[#58a6ff]/30"
              />
            </label>
            <label>
              <span className="sr-only">{t("outcomeLabel")}</span>
              <select
                value={outcome}
                onChange={(event) => setOutcome(event.target.value as AuditOutcome | "ALL")}
                className="min-h-11 w-full rounded-md border border-[#30363d] bg-[#0d1117] px-3 text-sm text-[#c9d1d9] outline-none focus:border-[#58a6ff] focus:ring-2 focus:ring-[#58a6ff]/30"
              >
                <option value="ALL">{t("allOutcomes")}</option>
                <option value="SUCCESS">{t("outcomes.success")}</option>
                <option value="FAILURE">{t("outcomes.failure")}</option>
                <option value="DENIED">{t("outcomes.denied")}</option>
              </select>
            </label>
            <label>
              <span className="sr-only">{t("resourceLabel")}</span>
              <select
                value={resourceType}
                onChange={(event) => setResourceType(event.target.value)}
                className="min-h-11 w-full rounded-md border border-[#30363d] bg-[#0d1117] px-3 text-sm text-[#c9d1d9] outline-none focus:border-[#58a6ff] focus:ring-2 focus:ring-[#58a6ff]/30"
              >
                <option value="ALL">{t("allResources")}</option>
                {resourceTypes.map((resource) => <option key={resource} value={resource}>{resource}</option>)}
              </select>
            </label>
          </div>

          <AdminBulkActionBar
            selectedCount={auditSelection.selectedCount}
            visibleCount={filteredRows.length}
            allVisibleSelected={auditSelection.allVisibleSelected}
            someVisibleSelected={auditSelection.someVisibleSelected}
            onToggleVisible={auditSelection.toggleVisible}
            onClear={auditSelection.clear}
            actions={[
              { id: "copy", label: "Copy selected", icon: Copy, onClick: handleCopySelected },
            ]}
          />

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left">
              <thead className="border-b border-[#30363d] bg-[#0d1117] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8b949e]">
                <tr>
                  <th className="px-5 py-3">
                    <AdminSelectionCheckbox
                      checked={auditSelection.allVisibleSelected}
                      indeterminate={auditSelection.someVisibleSelected}
                      onChange={auditSelection.toggleVisible}
                      label="Select all visible audit events"
                    />
                  </th>
                  <th className="px-5 py-3">{t("columns.timestamp")}</th>
                  <th className="px-5 py-3">{t("columns.actor")}</th>
                  <th className="px-5 py-3">{t("columns.action")}</th>
                  <th className="px-5 py-3">{t("columns.resource")}</th>
                  <th className="px-5 py-3">{t("columns.outcome")}</th>
                  <th className="px-5 py-3 text-right">{t("columns.inspect")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#21262d]">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-14 text-center">
                      <Activity className="mx-auto h-7 w-7 text-[#8b949e]" />
                      <p className="mt-3 text-sm font-semibold text-[#c9d1d9]">{t("emptyTitle")}</p>
                      <p className="mt-1 text-xs text-[#8b949e]">{t("emptyDescription")}</p>
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr key={row.id} className="transition-colors hover:bg-[#21262d]/45">
                      <td className="px-5 py-4" onClick={(event) => event.stopPropagation()}>
                        <AdminSelectionCheckbox
                          checked={auditSelection.isSelected(row.id)}
                          onChange={() => auditSelection.toggle(row.id)}
                          label={`Select audit event ${row.action}`}
                        />
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2 text-xs text-[#c9d1d9]">
                          <Clock3 className="h-3.5 w-3.5 text-[#8b949e]" />
                          {formatDate(row.occurredAt)}
                        </div>
                        {row.requestId && <p className="mt-1 max-w-[180px] truncate font-mono text-[10px] text-[#8b949e]">{row.requestId}</p>}
                      </td>
                      <td className="px-5 py-4">
                        <p className="max-w-[190px] truncate text-sm font-semibold text-[#f0f6fc]">{actorLabel(row)}</p>
                        <p className="mt-1 text-[10px] uppercase tracking-[0.08em] text-[#8b949e]">{row.actorType}</p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-mono text-xs font-semibold text-[#79c0ff]">{row.action}</p>
                        {row.method && <p className="mt-1 font-mono text-[10px] text-[#8b949e]">{row.method} {row.route || ""}</p>}
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-xs font-semibold text-[#c9d1d9]">{row.resourceType}</p>
                        {row.resourceId && <p className="mt-1 max-w-[160px] truncate font-mono text-[10px] text-[#8b949e]">{row.resourceId}</p>}
                      </td>
                      <td className="px-5 py-4">
                        <span className={cn("inline-flex rounded-md border px-2.5 py-1 text-[10px] font-semibold", outcomeTone(row.outcome))}>
                          {t(`outcomes.${row.outcome.toLowerCase() as "success" | "failure" | "denied"}`)}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedLog(row)}
                          className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[#30363d] px-3 text-xs font-semibold text-[#c9d1d9] transition-colors hover:border-[#58a6ff] hover:bg-[#21262d] hover:text-[#f0f6fc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#58a6ff]"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          {t("inspect")}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {selectedLog && (
        <div className="fixed inset-0 z-50 flex justify-end bg-[#010409]/75" role="presentation" onClick={() => setSelectedLog(null)}>
          <aside
            className="h-full w-full max-w-2xl overflow-y-auto border-l border-[#30363d] bg-[#161b22] p-5"
            role="dialog"
            aria-modal="true"
            aria-labelledby="audit-detail-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sticky top-0 z-10 -mx-5 -mt-5 border-b border-[#30363d] bg-[#161b22] px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8b949e]">{t("detailEyebrow")}</p>
                  <h2 id="audit-detail-title" className="mt-1 break-words text-xl font-semibold text-[#f0f6fc]">{selectedLog.action}</h2>
                  <p className="mt-1 text-sm text-[#8b949e]">{selectedLog.resourceType}{selectedLog.resourceId ? ` · ${selectedLog.resourceId}` : ""}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedLog(null)}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-[#30363d] text-[#8b949e] transition-colors hover:bg-[#21262d] hover:text-[#f0f6fc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#58a6ff]"
                  aria-label={t("close")}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="mt-5 space-y-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <Metric label={t("detail.outcome")} value={t(`outcomes.${selectedLog.outcome.toLowerCase() as "success" | "failure" | "denied"}`)} />
                <Metric label={t("detail.actorType")} value={selectedLog.actorType} />
                <Metric label={t("detail.timestamp")} value={formatDate(selectedLog.occurredAt)} />
              </div>

              <dl className="grid gap-3 sm:grid-cols-2">
                <DetailValue label={t("detail.actor")} value={actorLabel(selectedLog)} />
                <DetailValue label={t("detail.requestId")} value={selectedLog.requestId} />
                <DetailValue label={t("detail.route")} value={selectedLog.route} />
                <DetailValue label={t("detail.method")} value={selectedLog.method} />
                <DetailValue label={t("detail.ipHash")} value={selectedLog.ipHash} />
                <DetailValue label={t("detail.userAgentHash")} value={selectedLog.userAgentHash} />
              </dl>

              <section className="overflow-hidden rounded-md border border-[#30363d] bg-[#0d1117]">
                <div className="flex items-center justify-between border-b border-[#30363d] px-4 py-3">
                  <p className="text-xs font-semibold text-[#c9d1d9]">{t("metadata")}</p>
                  <button
                    type="button"
                    onClick={() => copyValue(metadataText(selectedLog))}
                    className="inline-flex min-h-9 items-center gap-2 rounded-md px-2.5 text-xs font-semibold text-[#8b949e] hover:bg-[#21262d] hover:text-[#f0f6fc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#58a6ff]"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {t("copy")}
                  </button>
                </div>
                <pre className="max-h-[360px] overflow-auto p-4 font-mono text-xs leading-6 text-[#7ee787]"><code>{metadataText(selectedLog)}</code></pre>
              </section>

              <div className="flex items-start gap-3 rounded-md border border-[#30363d] bg-[#0d1117] p-4 text-xs leading-5 text-[#8b949e]">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#3fb950]" />
                {t("appendOnlyNotice")}
              </div>
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}
