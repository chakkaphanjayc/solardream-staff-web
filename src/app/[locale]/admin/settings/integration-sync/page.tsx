import { connection } from "next/server";

import { AlertTriangle, CheckCircle2, Clock3, RefreshCw, CloudCog } from "@/components/ui/icons";
import { getInstallationSyncMonitor } from "@/app/actions/installationSync";
import { requireAdmin } from "@/lib/auth-guard";
import { ERPNextConnectionButton, IntegrationUnavailableNotice, RetryOutboxButton } from "./IntegrationCenterActions";

function statusTone(status: string) {
  const normalized = status.toUpperCase();
  if (["SYNCED", "SUCCESS", "PROCESSED"].includes(normalized)) return "text-emerald-700 bg-emerald-50 border-emerald-200";
  if (["FAILED", "DEAD", "CONFLICT"].includes(normalized)) return "text-rose-700 bg-rose-50 border-rose-200";
  if (["SYNCING", "PROCESSING"].includes(normalized)) return "text-amber-700 bg-amber-50 border-amber-200";
  return "text-slate-700 bg-slate-50 border-slate-200";
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function countValue(counts: Record<string, number>, key: string) {
  return counts[key] || 0;
}

export default async function InstallationSyncPage() {
  await connection();
  await requireAdmin();
  const monitor = await getInstallationSyncMonitor();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
            <CloudCog className="h-4 w-4 text-[#2A9D8F]" aria-hidden="true" />
            Installation integration
          </div>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">ERPNext sync monitor</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            SolarDream remains the field-work source of truth. This page shows the asynchronous ERPNext projection without exposing credentials or blocking technicians.
          </p>
        </div>
        <div className="flex flex-col items-start gap-3 sm:items-end"><div className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-bold ${monitor.enabled ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
          {monitor.enabled ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <Clock3 className="h-4 w-4" aria-hidden="true" />}
          {monitor.enabled ? "ERPNext projection enabled" : "ERPNext projection paused"}
        </div><ERPNextConnectionButton /></div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Local projects awaiting sync", value: countValue(monitor.projectCounts, "PENDING") + countValue(monitor.projectCounts, "SYNCING"), tone: "text-amber-700", icon: Clock3 },
          { label: "Projects synced", value: countValue(monitor.projectCounts, "SYNCED"), tone: "text-emerald-700", icon: CheckCircle2 },
          { label: "Outbox waiting", value: countValue(monitor.outboxCounts, "PENDING") + countValue(monitor.outboxCounts, "RETRY") + countValue(monitor.outboxCounts, "PROCESSING"), tone: "text-sky-700", icon: RefreshCw },
          { label: "Outbox failed", value: countValue(monitor.outboxCounts, "FAILED") + countValue(monitor.outboxCounts, "DEAD"), tone: "text-rose-700", icon: AlertTriangle },
        ].map((metric) => {
          const Icon = metric.icon;
          return (
            <div key={metric.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-slate-500">{metric.label}</span>
                <Icon className={`h-4 w-4 ${metric.tone}`} aria-hidden="true" />
              </div>
              <p className={`mt-3 text-3xl font-black ${metric.tone}`}>{metric.value}</p>
            </div>
          );
        })}
      </div>

      {!monitor.enabled ? (
        <IntegrationUnavailableNotice />
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-black text-slate-950">Recent installation events</h2>
          <p className="mt-1 text-xs text-slate-500">Retry and inspect the event stream from the existing cron/outbox worker.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-3 font-bold">Topic</th>
                <th className="px-5 py-3 font-bold">Status</th>
                <th className="px-5 py-3 font-bold">Attempts</th>
                <th className="px-5 py-3 font-bold">Created</th>
                <th className="px-5 py-3 font-bold">Last error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {monitor.events.length === 0 ? (
                <tr><td className="px-5 py-8 text-center text-slate-500" colSpan={5}>No installation sync events yet.</td></tr>
              ) : monitor.events.map((event) => (
                <tr key={event.id} className="align-top">
                  <td className="px-5 py-4">
                    <p className="font-semibold text-slate-900">{event.topic.replace("installation.", "")}</p>
                    <p className="mt-1 font-mono text-[11px] text-slate-400">{event.aggregateId}</p>
                  </td>
                  <td className="px-5 py-4"><span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${statusTone(event.status)}`}>{event.status}</span></td>
                  <td className="px-5 py-4 text-slate-600">{event.attempts}</td>
                  <td className="whitespace-nowrap px-5 py-4 text-slate-600">{formatDate(event.createdAt)}</td>
                  <td className="max-w-sm px-5 py-4 text-xs leading-5 text-rose-700">{event.lastError || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-black text-slate-950">Installation projects</h2>
          <p className="mt-1 text-xs text-slate-500">Remote IDs are bindings, not required to start or finish local field work.</p>
        </div>
        <div className="grid gap-3 p-5 md:grid-cols-2">
          {monitor.projects.length === 0 ? <p className="text-sm text-slate-500">No local installation projects yet.</p> : monitor.projects.map((project) => (
            <article key={project.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-slate-900">{project.projectCode}</h3>
                  <p className="mt-1 text-xs text-slate-500">Workflow v{project.sourceVersion} · {project.status}</p>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${statusTone(project.erpnextSyncStatus)}`}>{project.erpnextSyncStatus}</span>
              </div>
              <dl className="mt-4 grid grid-cols-1 gap-2 text-xs text-slate-600">
                <div className="flex justify-between gap-3"><dt>ERPNext Project</dt><dd className="font-mono text-right">{project.erpnextProjectId || "Not bound"}</dd></div>
                <div className="flex justify-between gap-3"><dt>Last synced</dt><dd>{formatDate(project.lastSyncedAt)}</dd></div>
                <div className="flex justify-between gap-3"><dt>Permit</dt><dd>{project.permitStatus}{project.permitApplicationNumber ? ` · ${project.permitApplicationNumber}` : ""}</dd></div>
                {project.permitAuthority ? <div className="flex justify-between gap-3"><dt>Authority</dt><dd>{project.permitAuthority}</dd></div> : null}
                {project.permitSubmittedAt ? <div className="flex justify-between gap-3"><dt>Submitted</dt><dd>{formatDate(project.permitSubmittedAt)}</dd></div> : null}
                {project.erpnextSyncError ? <div className="rounded-lg bg-rose-50 p-2 text-rose-700">{project.erpnextSyncError}</div> : null}
              </dl>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="font-black text-slate-950">Operator retry queue</h2><p className="mt-1 text-xs text-slate-500">Retry a failed projection without changing the local source-of-truth record.</p></div>
          <span className="text-xs font-bold text-slate-500">{monitor.events.filter((event) => ["PENDING", "RETRY", "PROCESSING", "DEAD"].includes(event.status)).length} actionable events</span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">{monitor.events.filter((event) => ["RETRY", "DEAD"].includes(event.status)).slice(0, 12).map((event) => <div key={event.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"><span className="max-w-[18rem] truncate text-xs font-semibold text-slate-700">{event.topic} · {event.aggregateId}</span><RetryOutboxButton eventId={event.id} /></div>)}{monitor.events.filter((event) => ["RETRY", "DEAD"].includes(event.status)).length === 0 ? <span className="text-xs text-slate-500">No retryable events currently visible.</span> : null}</div>
      </section>

      <p className="text-xs leading-5 text-slate-500">
        Topics configured: {monitor.topics.map((topic) => topic.replace("installation.", "")).join(" · ")}. Refresh this page after the cron worker runs.
      </p>
    </div>
  );
}
