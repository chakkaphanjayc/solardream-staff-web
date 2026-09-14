"use client";

import { useMemo, useState } from "react";
import { Activity, AlertTriangle, ArrowRight, Clock, Copy, Database, X } from "@/components/ui/icons";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { GsapPulse } from "@/components/ui/GsapMotion";
import { AdminBulkActionBar } from "@/components/admin/AdminBulkActionBar";
import { AdminSelectionCheckbox } from "@/components/admin/AdminSelectionCheckbox";
import { useAdminSelection } from "@/hooks/useAdminSelection";

export type ApiLogRow = {
  id: string;
  direction: string;
  sourceSystem: string;
  endpoint: string;
  method: string;
  statusCode: number;
  requestHeaders: unknown;
  requestBody: unknown;
  responseBody: unknown;
  errorMessage: string | null;
  createdAt: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value));
}

function statusTone(statusCode: number) {
  if (statusCode >= 500) {
    return "border-rose-500/20 bg-rose-500/10 text-rose-400";
  }
  if (statusCode >= 400) {
    return "border-amber-500/20 bg-amber-500/10 text-amber-400";
  }
  if (statusCode >= 200 && statusCode < 300) {
    return "border-emerald-500/20 bg-emerald-500/10 text-emerald-400";
  }
  return "border-slate-800 bg-slate-800/40 text-slate-400";
}

function directionTone(direction: string) {
  return direction === "INBOUND"
    ? "border-blue-500/20 bg-blue-500/10 text-blue-400"
    : "border-sky-500/20 bg-sky-500/10 text-sky-300";
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  const content = useMemo(() => JSON.stringify(value ?? {}, null, 2), [value]);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-800 bg-[#0B1121]">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">
          {title}
        </p>
      </div>
      <pre className="max-h-[340px] overflow-auto p-4 font-mono text-xs leading-6 text-emerald-300">
        <code>{content}</code>
      </pre>
    </section>
  );
}

export default function ApiLogsClient({ logs }: { logs: ApiLogRow[] }) {
  const [selectedLog, setSelectedLog] = useState<ApiLogRow | null>(null);
  const logSelection = useAdminSelection(logs.map((log) => log.id));

  const handleCopySelected = async () => {
    const selected = logs.filter((log) => logSelection.selectedIds.includes(log.id));
    if (selected.length === 0) return;
    await navigator.clipboard.writeText(selected.map((log) => `${log.createdAt}\t${log.method} ${log.endpoint}\t${log.statusCode}`).join("\n"));
    toast.success(`Copied ${selected.length} selected API log${selected.length === 1 ? "" : "s"}.`);
  };

  return (
    <div className="min-h-dvh bg-[#0B1121] px-4 py-6 text-[#F8FAFC] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="rounded-2xl border border-slate-800 bg-[#0F172A] p-5 shadow-none">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-[#B7D1EA]/15 border border-[#B7D1EA]/30 px-3 py-1.5 text-xs font-black text-[#B7D1EA]">
                <Activity className="h-4 w-4" />
                API observability
              </div>
              <h1 className="mt-4 text-3xl font-black tracking-tight text-[#F8FAFC]">
                API & Webhook Request Logs
              </h1>
              <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#94A3B8]">
                Audit inbound ERPNext webhooks, payloads, response codes, and error traces.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Metric label="Total" value={logs.length.toString()} />
              <Metric label="Errors" value={logs.filter((log) => log.statusCode >= 500).length.toString()} />
              <Metric label="Inbound" value={logs.filter((log) => log.direction === "INBOUND").length.toString()} />
            </div>
          </div>
        </header>

        <section className="overflow-hidden rounded-2xl border border-slate-800 bg-[#0F172A] shadow-none">
          <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
            <div>
              <h2 className="text-lg font-black tracking-tight text-[#F8FAFC]">Newest First Ledger</h2>
              <p className="text-xs font-semibold text-[#94A3B8]">Click any row to inspect raw request and response bodies.</p>
            </div>
            <Database className="h-5 w-5 text-[#B7D1EA]" />
          </div>
          <AdminBulkActionBar
            selectedCount={logSelection.selectedCount}
            visibleCount={logs.length}
            allVisibleSelected={logSelection.allVisibleSelected}
            someVisibleSelected={logSelection.someVisibleSelected}
            onToggleVisible={logSelection.toggleVisible}
            onClear={logSelection.clear}
            actions={[
              { id: "copy", label: "Copy selected", icon: Copy, onClick: handleCopySelected },
            ]}
          />

          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left">
              <thead className="bg-[#0B1121] border-b border-slate-800 text-[11px] font-black uppercase tracking-[0.12em] text-[#94A3B8]">
                <tr>
                  <th className="px-5 py-3">
                    <AdminSelectionCheckbox
                      checked={logSelection.allVisibleSelected}
                      indeterminate={logSelection.someVisibleSelected}
                      onChange={logSelection.toggleVisible}
                      label="Select all API logs"
                    />
                  </th>
                  <th className="px-5 py-3">Timestamp</th>
                  <th className="px-5 py-3">Direction</th>
                  <th className="px-5 py-3">Source</th>
                  <th className="px-5 py-3">Endpoint</th>
                  <th className="px-5 py-3">Method</th>
                  <th className="px-5 py-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-sm font-bold text-[#94A3B8]">
                      No API logs have been captured yet.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      className="cursor-pointer transition hover:bg-slate-800/30"
                    >
                      <td className="px-5 py-4" onClick={(event) => event.stopPropagation()}>
                        <AdminSelectionCheckbox
                          checked={logSelection.isSelected(log.id)}
                          onChange={() => logSelection.toggle(log.id)}
                          label={`Select API log ${log.id}`}
                        />
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
                          <Clock className="h-3.5 w-3.5 text-[#94A3B8]" />
                          {formatDate(log.createdAt)}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className={cn("inline-flex rounded-full px-2.5 py-1 text-[10px] font-black", directionTone(log.direction))}>
                          {log.direction}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-xs font-black text-[#F8FAFC]">{log.sourceSystem}</td>
                      <td className="max-w-[340px] truncate px-5 py-4 font-mono text-xs font-semibold text-[#94A3B8]">{log.endpoint}</td>
                      <td className="px-5 py-4">
                        <span className="rounded-full bg-slate-800/60 border border-slate-700/60 px-2.5 py-1 font-mono text-[10px] font-black text-slate-200">
                          {log.method}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        {log.statusCode >= 500 ? (
                          <GsapPulse className={cn("inline-flex rounded-full px-3 py-1 text-[11px] font-black", statusTone(log.statusCode))} scale={1.03}>
                            <span>{log.statusCode}</span>
                          </GsapPulse>
                        ) : (
                          <span className={cn("inline-flex rounded-full px-3 py-1 text-[11px] font-black", statusTone(log.statusCode))}>
                            {log.statusCode}
                          </span>
                        )}
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
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/60 backdrop-blur-xs" onClick={() => setSelectedLog(null)}>
          <aside
            className="h-full w-full max-w-3xl overflow-y-auto border-l border-slate-800 bg-[#0F172A] p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sticky top-0 z-10 -mx-5 -mt-5 border-b border-slate-800 bg-[#0F172A]/95 px-5 py-4 backdrop-blur">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#94A3B8]">JSON Inspector</p>
                  <h3 className="mt-1 text-xl font-black text-[#F8FAFC]">{selectedLog.sourceSystem} {selectedLog.method}</h3>
                  <p className="mt-1 break-all font-mono text-xs font-semibold text-[#94A3B8]">{selectedLog.endpoint}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedLog(null)}
                  className="grid h-10 w-10 place-items-center rounded-full border border-slate-800 bg-[#0B1121] text-[#94A3B8] transition hover:bg-slate-800 hover:text-[#F8FAFC]"
                  aria-label="Close log inspector"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Metric label="Direction" value={selectedLog.direction} />
                <Metric label="Status" value={String(selectedLog.statusCode)} />
                <Metric label="Created" value={formatDate(selectedLog.createdAt)} />
              </div>

              {selectedLog.errorMessage && (
                <section className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-rose-300">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
                    <div>
                      <p className="text-sm font-black">Error trace captured</p>
                      <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-xs leading-6 text-rose-200">{selectedLog.errorMessage}</pre>
                    </div>
                  </div>
                </section>
              )}

              <JsonBlock title="Request Headers" value={selectedLog.requestHeaders} />
              <JsonBlock title="Request Body" value={selectedLog.requestBody} />
              <JsonBlock title="Response Body" value={selectedLog.responseBody} />
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-[#0B1121] px-4 py-3">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#94A3B8]">{label}</p>
      <p className="mt-1 flex items-center gap-2 text-sm font-black text-[#F8FAFC]">
        {value}
        <ArrowRight className="h-3.5 w-3.5 text-[#B7D1EA]" />
      </p>
    </div>
  );
}
