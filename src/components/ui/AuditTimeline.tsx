"use client";

import { CheckCircle2, Circle, FileText, XCircle } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

export type AuditTimelineItem = {
  id: string;
  action: string;
  description: string;
  userId?: string | null;
  createdAt: string | Date;
};

type AuditTimelineProps = {
  logs: AuditTimelineItem[];
  emptyMessage?: string;
  className?: string;
};

function getActionTone(action: string) {
  const normalized = action.toUpperCase();
  if (normalized.includes("CANCEL") || normalized.includes("DELETE") || normalized.includes("REJECT")) {
    return {
      node: "border-rose-200 bg-rose-500",
      icon: <XCircle className="h-3.5 w-3.5 text-white" />,
    };
  }
  if (normalized.includes("SIGNED") || normalized.includes("COMPLETE") || normalized.includes("UPLOAD")) {
    return {
      node: "border-emerald-200 bg-emerald-500",
      icon: <CheckCircle2 className="h-3.5 w-3.5 text-white" />,
    };
  }
  if (normalized.includes("DOCUMENT")) {
    return {
      node: "border-indigo-200 bg-indigo-500",
      icon: <FileText className="h-3.5 w-3.5 text-white" />,
    };
  }
  return {
    node: "border-sky-200 bg-sky-500",
    icon: <Circle className="h-3.5 w-3.5 fill-white text-white" />,
  };
}

function formatRelativeTimestamp(value: string | Date) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.round(diffMs / 60000);
  const absMinutes = Math.abs(diffMinutes);

  if (absMinutes < 1) return "Just now";
  if (absMinutes < 60) return `${absMinutes} minute${absMinutes === 1 ? "" : "s"} ago`;

  const diffHours = Math.round(absMinutes / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function AuditTimeline({
  logs,
  emptyMessage = "No audit activity recorded yet.",
  className,
}: AuditTimelineProps) {
  const sortedLogs = [...logs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <div className={cn("rounded-2xl border border-slate-200 bg-white p-5", className)}>
      <div className="mb-5">
        <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">
          Audit Trail
        </p>
        <h3 className="mt-1 text-lg font-black tracking-tight text-slate-950">
          Activity Timeline
        </h3>
      </div>

      {sortedLogs.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-center text-sm font-semibold text-slate-400">
          {emptyMessage}
        </p>
      ) : (
        <ol className="space-y-5 border-l-2 border-slate-200 pl-5">
          {sortedLogs.map((log) => {
            const tone = getActionTone(log.action);
            return (
              <li key={log.id} className="relative">
                <span
                  className={cn(
                    "absolute -left-[31px] top-0 flex h-6 w-6 items-center justify-center rounded-full border-2 shadow-sm",
                    tone.node
                  )}
                >
                  {tone.icon}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <p className="text-sm font-bold leading-6 text-slate-800">
                      {log.description}
                    </p>
                    <time className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      {formatRelativeTimestamp(log.createdAt)}
                    </time>
                  </div>
                  <p className="mt-1 text-[10px] font-black uppercase tracking-wider text-slate-400">
                    {log.action.replaceAll("_", " ")}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
