"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, ArrowLeft, CalendarDays, CheckCircle2, Loader2, MapPin, Package, RefreshCw, UserRound } from "@/components/ui/icons";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  canRescheduleVisit,
  clearVisitDateDraft,
  dateKeyInTimeZone,
  dateTimeInTimeZone,
  isVisitWithinDateRange,
  MAX_SCHEDULE_DAY_SPAN,
  reconcileVisitDateDrafts,
  scheduleQueryBounds,
  wallClockInTimeZone,
  type VisitDateDraft,
} from "@/lib/schedulePresentation";
import { cn } from "@/lib/utils";

type ScheduleItem = {
  visit: {
    id: string;
    projectId: string;
    visitType: string;
    status: string;
    scheduledStart: string | null;
    scheduledEnd: string | null;
    timezone: string;
    crewName: string | null;
    customerConfirmedAt: string | null;
  };
  project: {
    id: string;
    projectCode: string;
    lifecycleState: string;
    customerName: string;
    siteLabel: string;
    siteAddress: string | null;
  };
  assignments: Array<{
    id: string;
    taskId: string | null;
    status: string;
    assignee: { id: string; name: string; email: string } | null;
  }>;
  materials: { total: number; ready: number; blockers: number };
};

type ScheduleData = {
  window: { from: string; to: string };
  items: ScheduleItem[];
  summary: { total: number; unscheduled: number; scheduled: number; inProgress: number; materialBlockers: number };
};

type Assignee = { id: string; name: string; email: string; role: string };

const EMPTY_DATA: ScheduleData = {
  window: { from: "", to: "" },
  items: [],
  summary: { total: 0, unscheduled: 0, scheduled: 0, inProgress: 0, materialBlockers: 0 },
};

function shiftDate(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftCalendarDate(value: string, days: number) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function dateLabel(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(new Date(value + "T12:00:00Z"));
}

function dateTimeLabel(value: string | null, locale: string, timeZone: string) {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not scheduled";
  try {
    return new Intl.DateTimeFormat(locale, { timeZone, dateStyle: "medium", timeStyle: "short" }).format(date);
  } catch {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
  }
}

function statusTone(status: string) {
  if (status === "IN_PROGRESS") return "border-[#58a6ff]/40 bg-[#58a6ff]/10 text-[#79c0ff]";
  if (status === "CONFIRMED") return "border-[#238636]/40 bg-[#238636]/10 text-[#7ee787]";
  if (status === "COMPLETED") return "border-[#30363d] bg-[#21262d] text-[#8b949e]";
  return "border-[#d29922]/40 bg-[#d29922]/10 text-[#e3b341]";
}

function makeDayKeys(from: string, to: string) {
  const start = new Date(from + "T12:00:00Z");
  const end = new Date(to + "T12:00:00Z");
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];
  const days: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end && days.length <= MAX_SCHEDULE_DAY_SPAN) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

export default function ScheduleWorkspaceClient({ enabled, initial }: { enabled: boolean; initial: ScheduleData | null }) {
  const locale = useLocale();
  const t = useTranslations("AdminSchedule");
  const [from, setFrom] = useState(shiftDate(-7));
  const [to, setTo] = useState(shiftDate(21));
  const [status, setStatus] = useState("");
  const [data, setData] = useState<ScheduleData>(initial || EMPTY_DATA);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [assignmentUserByVisit, setAssignmentUserByVisit] = useState<Record<string, string>>({});
  const [targetDateByVisit, setTargetDateByVisit] = useState<Record<string, VisitDateDraft>>({});
  const [draggedVisitId, setDraggedVisitId] = useState("");
  const [busyKey, setBusyKey] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const scheduleHeadingRef = useRef<HTMLHeadingElement>(null);
  const earliestFrom = shiftCalendarDate(to, -MAX_SCHEDULE_DAY_SPAN);
  const latestTo = shiftCalendarDate(from, MAX_SCHEDULE_DAY_SPAN);

  const load = useCallback(async () => {
    if (!enabled) return;
    setIsLoading(true);
    setError(null);
    const params = new URLSearchParams();
    try {
      const queryBounds = scheduleQueryBounds(from, to);
      if (!queryBounds) throw new Error(t("invalidDateRange"));
      params.set("from", queryBounds.from);
      params.set("to", queryBounds.to);
      if (status) params.set("status", status);
      const response = await fetch("/api/v2/schedule?" + params.toString(), { cache: "no-store" });
      const payload = await response.json() as { success?: boolean; data?: ScheduleData; error?: { message?: string } };
      if (!response.ok || !payload.success || !payload.data) throw new Error(payload.error?.message || "The schedule could not be loaded.");
      const visibleItems = payload.data.items.filter((item) => isVisitWithinDateRange(
        item.visit.scheduledStart,
        item.visit.timezone,
        from,
        to,
      ));
      const scheduledDateByVisit = Object.fromEntries(visibleItems.flatMap((item) => {
        const key = dateKeyInTimeZone(item.visit.scheduledStart, item.visit.timezone);
        return key ? [[item.visit.id, key]] : [];
      }));
      setData({
        ...payload.data,
        items: visibleItems,
        summary: {
          total: visibleItems.length,
          unscheduled: visibleItems.filter((item) => !item.visit.scheduledStart && !["COMPLETED", "CANCELLED"].includes(item.visit.status)).length,
          scheduled: visibleItems.filter((item) => Boolean(item.visit.scheduledStart) && ["CONFIRMED", "IN_PROGRESS"].includes(item.visit.status)).length,
          inProgress: visibleItems.filter((item) => item.visit.status === "IN_PROGRESS").length,
          materialBlockers: visibleItems.filter((item) => item.materials.blockers > 0).length,
        },
      });
      setTargetDateByVisit((current) => reconcileVisitDateDrafts(current, scheduledDateByVisit));
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "The schedule could not be loaded.");
    } finally {
      setIsLoading(false);
    }
  }, [enabled, from, status, t, to]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!enabled) return;
    void fetch("/api/v2/field/assignees", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { success?: boolean; data?: Assignee[] };
        if (response.ok && payload.success && payload.data) setAssignees(payload.data);
      })
      .catch(() => undefined);
  }, [enabled]);

  const assign = async (item: ScheduleItem) => {
    const assigneeUserId = assignmentUserByVisit[item.visit.id];
    if (!assigneeUserId) return;
    setBusyKey("assign:" + item.visit.id);
    setError(null);
    try {
      const response = await fetch("/api/v2/visits/" + item.visit.id + "/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigneeUserId, role: "TECHNICIAN", idempotencyKey: "schedule:" + crypto.randomUUID() }),
      });
      const payload = await response.json() as { success?: boolean; error?: { message?: string } };
      if (!response.ok || !payload.success) throw new Error(payload.error?.message || "The field assignment could not be saved.");
      setAssignmentUserByVisit((current) => ({ ...current, [item.visit.id]: "" }));
      await load();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "The field assignment could not be saved.");
    } finally {
      setBusyKey("");
    }
  };

  const reschedule = async (item: ScheduleItem, targetDate: string) => {
    if (!canRescheduleVisit(item.visit.status) || !targetDate || targetDate < from || targetDate > to) return;
    if (targetDate === dateKeyInTimeZone(item.visit.scheduledStart, item.visit.timezone)) return;
    const oldStart = item.visit.scheduledStart ? new Date(item.visit.scheduledStart) : null;
    const wallClock = oldStart ? wallClockInTimeZone(oldStart, item.visit.timezone) : { hour: 9, minute: 0 };
    const start = wallClock ? dateTimeInTimeZone(targetDate, wallClock.hour, wallClock.minute, item.visit.timezone) : null;
    setAnnouncement("");
    setError(null);
    if (!start) {
      setError(t("invalidVisitDate"));
      return;
    }
    const oldEnd = item.visit.scheduledEnd ? new Date(item.visit.scheduledEnd) : null;
    const duration = oldStart && oldEnd && oldEnd > oldStart ? oldEnd.getTime() - oldStart.getTime() : 6 * 60 * 60 * 1000;
    const end = new Date(start.getTime() + duration);
    setBusyKey("move:" + item.visit.id);
    setError(null);
    try {
      const response = await fetch("/api/v2/projects/" + item.project.id + "/visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitId: item.visit.id,
          visitType: item.visit.visitType,
          status: "CONFIRMED",
          scheduledStart: start.toISOString(),
          scheduledEnd: end.toISOString(),
          timezone: item.visit.timezone,
          customerConfirmed: Boolean(item.visit.customerConfirmedAt),
          idempotencyKey: "schedule-move:" + crypto.randomUUID(),
        }),
      });
      const payload = await response.json() as { success?: boolean; error?: { message?: string } };
      if (!response.ok || !payload.success) throw new Error(payload.error?.message || "The visit could not be rescheduled.");
      setTargetDateByVisit((current) => clearVisitDateDraft(current, item.visit.id));
      setAnnouncement(t("visitMoved", {
        customerName: item.project.customerName,
        projectCode: item.project.projectCode,
        scheduledAt: dateTimeLabel(item.visit.scheduledStart, locale, item.visit.timezone),
        date: dateLabel(targetDate, locale),
      }));
      await load();
      window.requestAnimationFrame(() => scheduleHeadingRef.current?.focus());
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "The visit could not be rescheduled.");
    } finally {
      setBusyKey("");
      setDraggedVisitId("");
    }
  };

  const dayKeys = useMemo(() => makeDayKeys(from, to), [from, to]);
  const unscheduled = useMemo(() => data.items.filter((item) => !item.visit.scheduledStart && !["COMPLETED", "CANCELLED"].includes(item.visit.status)), [data.items]);
  const scheduledByDay = useMemo(() => {
    const grouped = new Map<string, ScheduleItem[]>();
    for (const item of data.items) {
      const key = dateKeyInTimeZone(item.visit.scheduledStart, item.visit.timezone);
      if (!key) continue;
      const items = grouped.get(key) || [];
      items.push(item);
      grouped.set(key, items);
    }
    return grouped;
  }, [data.items]);

  if (!enabled) {
    return (
      <div data-bagui="schedule-workspace" className="min-h-full bg-[#0d1117] p-8 text-[#c9d1d9]">
        <div className="mx-auto max-w-3xl rounded-xl border border-[#30363d] bg-[#161b22] p-8">
          <h1 className="text-2xl font-semibold text-[#f0f6fc]">Schedule workspace is staged</h1>
          <p className="mt-2 text-sm leading-6 text-[#8b949e]">Enable OPS_V2_SCHEDULING when canonical visits, material readiness, and assignment checks are ready for schedulers.</p>
        </div>
      </div>
    );
  }

  return (
    <div data-bagui="schedule-workspace" className="min-h-full bg-[#0d1117] px-4 py-6 text-[#c9d1d9] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
        <div className="flex items-center justify-between gap-4">
          <Link href={"/" + locale + "/admin/operations"} className="inline-flex items-center gap-2 text-sm font-medium text-[#8b949e] hover:text-[#f0f6fc]"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Operations workspace</Link>
          <Button type="button" variant="quiet" size="sm" onClick={() => void load()} disabled={isLoading} className="text-[#8b949e] hover:bg-[#21262d] hover:text-[#f0f6fc]"><RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} aria-hidden="true" /> Refresh</Button>
        </div>

        <header className="flex flex-col gap-5 rounded-xl border border-[#30363d] bg-[#161b22] p-5 shadow-xl xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#e3b341]"><CalendarDays className="h-4 w-4" aria-hidden="true" /> Resource planning</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#f0f6fc]">Schedule &amp; dispatch</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#8b949e]">Plan confirmed field visits, assign technicians, and surface material blockers before work reaches the customer.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
            {[["Unscheduled", data.summary.unscheduled, "text-[#e3b341]"], ["Scheduled", data.summary.scheduled, "text-[#7ee787]"], ["In progress", data.summary.inProgress, "text-[#79c0ff]"], ["Material blockers", data.summary.materialBlockers, "text-[#ff7b72]"]].map(([label, value, tone]) => <div key={label} className="rounded-lg border border-[#30363d] bg-[#0d1117] px-3 py-2"><p className="text-[10px] uppercase tracking-[0.08em] text-[#8b949e]">{label}</p><p className={"mt-1 text-xl font-semibold " + tone}>{value}</p></div>)}
          </div>
        </header>

        <section className="flex flex-col gap-3 rounded-xl border border-[#30363d] bg-[#161b22] p-4 sm:flex-row sm:items-end">
          <label className="text-xs text-[#8b949e]">From<input type="date" required min={earliestFrom} max={to} value={from} onChange={(event) => { const nextFrom = event.target.value; if (!nextFrom) return; setFrom(nextFrom); if (to < nextFrom) setTo(nextFrom); else if (to > shiftCalendarDate(nextFrom, MAX_SCHEDULE_DAY_SPAN)) setTo(shiftCalendarDate(nextFrom, MAX_SCHEDULE_DAY_SPAN)); }} className="mt-1 min-h-10 rounded-md border border-[#30363d] bg-[#0d1117] px-3 text-sm text-[#f0f6fc]" /></label>
          <label className="text-xs text-[#8b949e]">To<input type="date" required min={from} max={latestTo} value={to} onChange={(event) => { const nextTo = event.target.value; if (!nextTo) return; setTo(nextTo); if (from > nextTo) setFrom(nextTo); else if (from < shiftCalendarDate(nextTo, -MAX_SCHEDULE_DAY_SPAN)) setFrom(shiftCalendarDate(nextTo, -MAX_SCHEDULE_DAY_SPAN)); }} className="mt-1 min-h-10 rounded-md border border-[#30363d] bg-[#0d1117] px-3 text-sm text-[#f0f6fc]" /></label>
          <label className="text-xs text-[#8b949e]">Visit status<select value={status} onChange={(event) => setStatus(event.target.value)} className="mt-1 min-h-10 min-w-44 rounded-md border border-[#30363d] bg-[#0d1117] px-3 text-sm text-[#c9d1d9]"><option value="">All visits</option><option value="PLANNED">Planned</option><option value="CONFIRMED">Confirmed</option><option value="IN_PROGRESS">In progress</option><option value="COMPLETED">Completed</option><option value="CANCELLED">Cancelled</option></select></label>
          <div className="text-xs text-[#8b949e] sm:ml-auto"><p>{t("dateRangeHelp")}</p><p className="mt-1">{t("dragHelp")}</p></div>
        </section>

        {error ? <div role="alert" className="flex items-start gap-2 rounded-md border border-[#f85149]/40 bg-[#f85149]/10 p-3 text-sm text-[#ff7b72]"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{error}</div> : null}

        <section className="grid gap-4 xl:grid-cols-[minmax(250px,0.8fr)_minmax(0,3fr)]">
          <div className="rounded-xl border border-[#30363d] bg-[#161b22]">
            <div className="border-b border-[#30363d] p-4"><h2 className="font-semibold text-[#f0f6fc]">Unscheduled</h2><p className="mt-1 text-xs text-[#8b949e]">Visits without a confirmed time.</p></div>
            <div className="space-y-3 p-4">
              {unscheduled.length === 0 ? <p className="py-8 text-center text-xs text-[#8b949e]">No unscheduled visits in this window.</p> : unscheduled.map((item) => (
                <article key={item.visit.id} className="rounded-lg border border-[#d29922]/40 bg-[#d29922]/5 p-3">
                  <div className="flex items-start justify-between gap-2"><div><p className="font-mono text-xs text-[#79c0ff]">{item.project.projectCode}</p><h3 className="mt-1 text-sm font-semibold text-[#f0f6fc]">{item.project.customerName}</h3></div><span className={cn("rounded-full border px-2 py-1 text-[10px] font-semibold", statusTone(item.visit.status))}>{item.visit.status}</span></div>
                  <p className="mt-2 flex items-start gap-1 text-xs text-[#8b949e]"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />{item.project.siteLabel}</p>
                  {item.materials.blockers > 0 ? <p className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-[#ff7b72]"><Package className="h-3.5 w-3.5" aria-hidden="true" /> {item.materials.blockers} material blocker{item.materials.blockers === 1 ? "" : "s"}</p> : null}
                  <div className="mt-3 flex gap-2"><select value={assignmentUserByVisit[item.visit.id] || ""} onChange={(event) => setAssignmentUserByVisit((current) => ({ ...current, [item.visit.id]: event.target.value }))} className="min-h-9 min-w-0 flex-1 rounded-md border border-[#30363d] bg-[#0d1117] px-2 text-xs text-[#c9d1d9]"><option value="">Assign technician</option>{assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.name}</option>)}</select><Button type="button" size="sm" onClick={() => void assign(item)} disabled={!assignmentUserByVisit[item.visit.id] || busyKey === "assign:" + item.visit.id}>{busyKey === "assign:" + item.visit.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <UserRound className="h-4 w-4" aria-hidden="true" />} Assign</Button></div>
                </article>
              ))}
            </div>
          </div>

          <div className="min-w-0 space-y-3">
            <h2 ref={scheduleHeadingRef} tabIndex={-1} className="text-lg font-semibold text-[#f0f6fc] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#79c0ff]">{t("scheduledVisits")}</h2>
            <div className="overflow-x-auto rounded-xl border border-[#30363d] bg-[#161b22]">
            <div className="flex min-w-[900px] border-b border-[#30363d]">
              {dayKeys.map((day) => <div key={day} className="min-w-[210px] flex-1 border-r border-[#30363d] p-4 last:border-r-0"><p className="text-xs font-semibold text-[#f0f6fc]">{dateLabel(day, locale)}</p><p className="mt-1 text-[11px] text-[#8b949e]">{(scheduledByDay.get(day) || []).length} visit{(scheduledByDay.get(day) || []).length === 1 ? "" : "s"}</p></div>)}
            </div>
            <div className="flex min-h-[360px] min-w-[900px]">
              {dayKeys.map((day) => <div key={day} className="min-w-[210px] flex-1 space-y-3 border-r border-[#30363d] p-3 last:border-r-0" onDragOver={(event) => event.preventDefault()} onDrop={() => { const item = data.items.find((candidate) => candidate.visit.id === draggedVisitId); if (item) void reschedule(item, day); }}>
                {(scheduledByDay.get(day) || []).map((item) => {
                  const canMove = canRescheduleVisit(item.visit.status);
                  const scheduledDate = dateKeyInTimeZone(item.visit.scheduledStart, item.visit.timezone) || day;
                  const draft = targetDateByVisit[item.visit.id];
                  const targetDate = draft?.originalDate === scheduledDate ? draft.targetDate : scheduledDate;
                  const isMoving = busyKey === "move:" + item.visit.id;
                  const visitControlContext = {
                    customerName: item.project.customerName,
                    projectCode: item.project.projectCode,
                    scheduledAt: dateTimeLabel(item.visit.scheduledStart, locale, item.visit.timezone),
                  };

                  return <article key={item.visit.id} draggable={canMove} onDragStart={() => setDraggedVisitId(item.visit.id)} className={cn("rounded-lg border bg-[#0d1117] p-3", canMove && "cursor-grab active:cursor-grabbing", item.visit.status === "IN_PROGRESS" ? "border-[#58a6ff]/50" : "border-[#30363d]", isMoving && "opacity-60")}>
                  <div className="flex items-start justify-between gap-2"><p className="font-mono text-xs text-[#79c0ff]">{item.project.projectCode}</p><span className={cn("rounded-full border px-2 py-1 text-[10px] font-semibold", statusTone(item.visit.status))}>{item.visit.status}</span></div>
                  <h3 className="mt-2 text-sm font-semibold text-[#f0f6fc]">{item.project.customerName}</h3>
                  <p className="mt-1 text-xs text-[#8b949e]">{item.visit.visitType} · {dateTimeLabel(item.visit.scheduledStart, locale, item.visit.timezone)}</p>
                  <p className="mt-2 flex items-start gap-1 text-xs text-[#8b949e]"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />{item.project.siteLabel}</p>
                  {item.assignments.length > 0 ? <p className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-[#c9d1d9]"><UserRound className="h-3.5 w-3.5 text-[#79c0ff]" aria-hidden="true" />{item.assignments.filter((assignment) => assignment.status !== "SUPERSEDED").map((assignment) => assignment.assignee?.name || "Unassigned").join(", ")}</p> : <p className="mt-2 text-[11px] text-[#e3b341]">No technician assigned</p>}
                  {item.materials.blockers > 0 ? <p className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-[#ff7b72]"><Package className="h-3.5 w-3.5" aria-hidden="true" />{item.materials.blockers} material blocker{item.materials.blockers === 1 ? "" : "s"}</p> : <p className="mt-2 flex items-center gap-1 text-[11px] text-[#7ee787]"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />Materials ready</p>}
                  {canMove ? <details className="mt-3 border-t border-[#30363d] pt-2">
                    <summary aria-label={t("chooseDateFor", visitControlContext)} className="min-h-11 cursor-pointer py-2 text-xs font-semibold text-[#79c0ff] underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#79c0ff]">{t("chooseDate")}</summary>
                    <div className="mt-2 space-y-2">
                      <label className="block text-xs text-[#8b949e]">
                        {t("targetDate")}
                        <input
                          type="date"
                          aria-label={t("targetDateFor", visitControlContext)}
                          value={targetDate}
                          min={from}
                          max={to}
                          onChange={(event) => setTargetDateByVisit((current) => ({ ...current, [item.visit.id]: { originalDate: scheduledDate, targetDate: event.target.value } }))}
                          className="mt-1 min-h-11 w-full rounded-md border border-[#30363d] bg-[#161b22] px-3 text-sm text-[#f0f6fc] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#79c0ff]"
                        />
                      </label>
                      <Button type="button" size="sm" aria-label={t("moveVisitFor", visitControlContext)} onClick={() => void reschedule(item, targetDate)} disabled={!targetDate || targetDate === scheduledDate || targetDate < from || targetDate > to || isMoving}>
                        {isMoving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                        {t("moveVisit")}
                      </Button>
                    </div>
                  </details> : item.visit.status === "IN_PROGRESS" ? <p className="mt-3 border-t border-[#30363d] pt-3 text-xs text-[#8b949e]">{t("inProgressCannotMove")}</p> : null}
                </article>;
                })}
                {(scheduledByDay.get(day) || []).length === 0 ? <p className="py-12 text-center text-xs text-[#6e7681]">Drop a visit here</p> : null}
              </div>)}
            </div>
            </div>
          </div>
        </section>

        {isLoading ? <div role="status" aria-live="polite" className="flex items-center justify-center gap-2 text-xs text-[#8b949e]"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {t("refreshingSchedule")}</div> : null}
        <Link href={"/" + locale + "/admin/settings/feature-toggles"} className={cn(buttonVariants({ variant: "quiet", size: "sm" }), "text-[#8b949e]")}>Manage rollout flags</Link>
      </div>
    </div>
  );
}
