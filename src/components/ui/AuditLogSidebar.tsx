"use client";

import { useEffect } from "react";

import {
  CheckCircle2,
  Circle,
  FileText,
  History,
  X,
  XCircle,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import type { AuditTimelineItem } from "@/components/ui/AuditTimeline";

type AuditLogSidebarProps = {
  isOpen: boolean;
  onClose: () => void;
  logs: AuditTimelineItem[];
  title?: string;
  entityLabel?: string;
  emptyMessage?: string;
  loading?: boolean;
  className?: string;
};

type AuditLogTriggerProps = {
  onClick: () => void;
  count?: number;
  label?: string;
  className?: string;
};

function formatRelativeTimestamp(value: string | Date): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";

  const diffMinutes = Math.round((Date.now() - date.getTime()) / 60000);
  const absoluteMinutes = Math.abs(diffMinutes);
  if (absoluteMinutes < 1) return "Just now";
  if (absoluteMinutes < 60) return `${absoluteMinutes}m ago`;

  const hours = Math.round(absoluteMinutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatAction(action: string): string {
  return action
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

function getActionTone(action: string) {
  const normalized = action.toUpperCase();
  if (normalized.includes("CANCEL") || normalized.includes("DELETE") || normalized.includes("REJECT")) {
    return {
      icon: XCircle,
      className: "border-rose-400/40 bg-rose-500/15 text-rose-300",
    };
  }
  if (normalized.includes("SIGNED") || normalized.includes("COMPLETE") || normalized.includes("UPLOAD")) {
    return {
      icon: CheckCircle2,
      className: "border-emerald-400/40 bg-emerald-500/15 text-emerald-300",
    };
  }
  if (normalized.includes("DOCUMENT")) {
    return {
      icon: FileText,
      className: "border-indigo-400/40 bg-indigo-500/15 text-indigo-300",
    };
  }
  return {
    icon: Circle,
    className: "border-sky-400/40 bg-sky-500/15 text-sky-300",
  };
}

export function AuditLogTrigger({
  onClick,
  count = 0,
  label = "Activity log",
  className,
}: AuditLogTriggerProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      className={cn(
        "sd-action inline-flex min-h-10 items-center gap-2 rounded-md border border-[#30363d] bg-[#21262d] px-3 text-xs font-medium text-[#c9d1d9] transition-colors hover:border-[#58a6ff] hover:bg-[#30363d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#58a6ff]",
        className,
      )}
    >
      <History className="h-4 w-4 text-[#58a6ff]" aria-hidden="true" />
      <span>{label}</span>
      {count > 0 ? (
        <span className="rounded-full bg-[#30363d] px-2 py-0.5 font-mono text-[10px] text-[#f0f6fc]">
          {count}
        </span>
      ) : null}
    </button>
  );
}

export function AuditLogSidebar({
  isOpen,
  onClose,
  logs,
  title = "Activity log",
  entityLabel,
  emptyMessage = "No audit activity recorded yet.",
  loading = false,
  className,
}: AuditLogSidebarProps) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sortedLogs = [...logs].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );

  return (
    <div className="fixed inset-0 z-[80]" role="presentation">
      <button
        type="button"
        aria-label="Close activity log"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-slate-950/60 backdrop-blur-[2px]"
      />
      <aside
        id="audit-log-sidebar"
        role="dialog"
        aria-modal="true"
        aria-labelledby="audit-log-sidebar-title"
        className={cn(
          "sd-panel absolute inset-x-0 bottom-0 flex h-[min(82dvh,720px)] w-full max-w-none flex-col rounded-t-xl border-t border-[#30363d] bg-[#0d1117] text-[#f0f6fc] shadow-2xl sm:inset-y-0 sm:inset-x-auto sm:right-0 sm:h-auto sm:max-w-[390px] sm:rounded-l-xl sm:rounded-t-none sm:border-l sm:border-t-0",
          className,
        )}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[#30363d] bg-[#161b22] px-5 py-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[#58a6ff]">
              <History className="h-4 w-4" aria-hidden="true" />
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em]">Audit trail</p>
            </div>
            <h2 id="audit-log-sidebar-title" className="mt-2 text-lg font-semibold tracking-tight">
              {title}
            </h2>
            {entityLabel ? (
              <p className="mt-1 truncate font-mono text-[11px] text-[#8b949e]">{entityLabel}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close activity log"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-md border border-[#30363d] bg-[#21262d] text-[#8b949e] transition-colors hover:border-[#8b949e] hover:text-[#f0f6fc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#58a6ff]"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </header>

        <div className="flex items-center justify-between border-b border-[#21262d] px-5 py-3 text-[11px] text-[#8b949e]">
          <span>{loading ? "Loading activity…" : `${sortedLogs.length} event${sortedLogs.length === 1 ? "" : "s"}`}</span>
          <span className="uppercase tracking-[0.12em]">Latest first</span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {loading ? (
            <div className="space-y-3" aria-live="polite" aria-busy="true">
              {[1, 2, 3].map((item) => (
                <div key={item} className="animate-pulse rounded-md border border-[#30363d] bg-[#161b22] p-4">
                  <div className="h-3 w-2/3 rounded bg-[#30363d]" />
                  <div className="mt-3 h-3 w-full rounded bg-[#21262d]" />
                  <div className="mt-2 h-3 w-4/5 rounded bg-[#21262d]" />
                </div>
              ))}
            </div>
          ) : sortedLogs.length === 0 ? (
            <div className="rounded-md border border-dashed border-[#484f58] bg-[#161b22] px-4 py-8 text-center text-sm text-[#8b949e]">
              {emptyMessage}
            </div>
          ) : (
            <ol className="relative space-y-0 border-l border-[#30363d] pl-5">
              {sortedLogs.map((log) => {
                const tone = getActionTone(log.action);
                const Icon = tone.icon;
                return (
                  <li key={log.id} className="relative pb-6 last:pb-1">
                    <span
                      className={cn(
                        "absolute -left-[35px] top-0 inline-flex size-7 items-center justify-center rounded-full border",
                        tone.className,
                      )}
                    >
                      <Icon className="size-3.5" aria-hidden="true" />
                    </span>
                    <div className="rounded-md border border-[#30363d] bg-[#161b22] p-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8b949e]">
                          {formatAction(log.action)}
                        </p>
                        <time
                          dateTime={new Date(log.createdAt).toISOString()}
                          title={new Date(log.createdAt).toLocaleString()}
                          className="shrink-0 text-[10px] font-medium text-[#6e7681]"
                        >
                          {formatRelativeTimestamp(log.createdAt)}
                        </time>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-[#c9d1d9]">{log.description}</p>
                      {log.userId ? (
                        <p className="mt-2 truncate font-mono text-[10px] text-[#6e7681]">Actor: {log.userId}</p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </aside>
    </div>
  );
}

export type { AuditLogSidebarProps, AuditLogTriggerProps };
export type { AuditTimelineItem } from "@/components/ui/AuditTimeline";
