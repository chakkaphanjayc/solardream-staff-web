import type { ReactNode } from "react";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Info,
  RotateCcw,
  Save,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";

type AdminPageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  children?: ReactNode;
};

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  action,
  children,
}: AdminPageHeaderProps) {
  return (
    <header data-bagui="admin-page-header" className="flex flex-col gap-4 border-b border-[var(--solar-ops-border)] pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 max-w-3xl">
        {eyebrow ? (
          <p className="mb-2 text-xs font-semibold text-[var(--solar-ops-muted)]">{eyebrow}</p>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--solar-ops-text)] sm:text-3xl">{title}</h1>
        {description ? <p className="mt-2 text-sm leading-6 text-[var(--solar-ops-muted)]">{description}</p> : null}
        {children}
      </div>
      {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
    </header>
  );
}

type AdminFilterToolbarProps = {
  children: ReactNode;
  resultLabel?: string;
  onClear?: () => void;
  clearLabel?: string;
};

export function AdminFilterToolbar({
  children,
  resultLabel,
  onClear,
  clearLabel = "Clear filters",
}: AdminFilterToolbarProps) {
  return (
    <div data-bagui="admin-filter-toolbar" className="flex flex-col gap-3 rounded-lg border border-[var(--solar-ops-border)] bg-[var(--solar-ops-surface)] p-3 sm:flex-row sm:flex-wrap sm:items-end">
      <div className="flex min-w-0 flex-1 flex-wrap items-end gap-3">{children}</div>
      {resultLabel ? <span className="text-xs text-[var(--solar-ops-muted)]">{resultLabel}</span> : null}
      {onClear ? (
        <button
          type="button"
          onClick={onClear}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[var(--solar-ops-border)] px-3 text-xs font-semibold text-[var(--solar-ops-body)] transition-colors hover:bg-[var(--solar-ops-hover)] hover:text-[var(--solar-ops-text)]"
        >
          <RotateCcw className="size-3.5" aria-hidden="true" />
          {clearLabel}
        </button>
      ) : null}
    </div>
  );
}

type AdminStatusTone = "neutral" | "success" | "warning" | "danger" | "info";

const statusToneByValue: Record<string, AdminStatusTone> = {
  active: "success",
  enabled: "success",
  published: "success",
  connected: "success",
  open: "info",
  draft: "warning",
  pending: "warning",
  scheduled: "warning",
  waiting: "warning",
  failed: "danger",
  error: "danger",
  archived: "neutral",
  disabled: "neutral",
  closed: "neutral",
};

const statusIconByTone: Record<AdminStatusTone, typeof CheckCircle2> = {
  neutral: Info,
  success: CheckCircle2,
  warning: Clock3,
  danger: CircleAlert,
  info: Info,
};

export function AdminStatusBadge({
  value,
  tone,
}: {
  value: string;
  tone?: AdminStatusTone;
}) {
  const resolvedTone = tone ?? statusToneByValue[value.toLowerCase()] ?? "neutral";
  const Icon = statusIconByTone[resolvedTone];

  return (
    <span data-bagui="admin-status-badge" data-status={resolvedTone} className={cn("inline-flex w-fit items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium", {
      "border-[#3fb950]/40 bg-[#238636]/20 text-[#7ee787]": resolvedTone === "success",
      "border-[#d29922]/40 bg-[#d29922]/15 text-[#e3b341]": resolvedTone === "warning",
      "border-[#f85149]/40 bg-[#f85149]/15 text-[#ff7b72]": resolvedTone === "danger",
      "border-[#58a6ff]/40 bg-[#58a6ff]/15 text-[#79c0ff]": resolvedTone === "info",
      "border-[var(--solar-ops-border)] bg-[var(--solar-ops-hover)] text-[var(--solar-ops-body)]": resolvedTone === "neutral",
    })}>
      <Icon className="size-3.5" aria-hidden="true" />
      <span>{value}</span>
    </span>
  );
}

export function AdminEmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div data-bagui="admin-empty-state" className="flex min-h-44 flex-col items-center justify-center rounded-lg border border-dashed border-[var(--solar-ops-border-strong)] bg-[var(--solar-ops-surface)] px-6 py-10 text-center">
      <Archive className="size-8 text-[var(--solar-ops-muted)]" aria-hidden="true" />
      <h2 className="mt-3 text-sm font-semibold text-[var(--solar-ops-text)]">{title}</h2>
      <p className="mt-1 max-w-md text-sm leading-6 text-[var(--solar-ops-muted)]">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function AdminErrorState({
  title,
  description,
  retry,
}: {
  title: string;
  description: string;
  retry?: ReactNode;
}) {
  return (
    <div data-bagui="admin-error-state" role="alert" className="rounded-lg border border-[#f85149]/40 bg-[#f85149]/10 px-4 py-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-[#ff7b72]" aria-hidden="true" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[#ff7b72]">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-[var(--solar-ops-body)]">{description}</p>
          {retry ? <div className="mt-3">{retry}</div> : null}
        </div>
      </div>
    </div>
  );
}

export function AdminSaveStatus({
  state,
  label,
}: {
  state: "saved" | "saving" | "unsaved" | "error";
  label: string;
}) {
  const Icon = state === "saved" ? CheckCircle2 : state === "error" ? CircleAlert : Save;
  return (
    <span data-bagui="admin-save-status" data-state={state} className={cn("inline-flex items-center gap-1.5 text-xs font-medium", {
      "text-[#7ee787]": state === "saved",
      "text-[#e3b341]": state === "saving" || state === "unsaved",
      "text-[#ff7b72]": state === "error",
    })} aria-live="polite">
      <Icon className={cn("size-3.5", state === "saving" && "animate-pulse")} aria-hidden="true" />
      {label}
    </span>
  );
}

export function AdminPublishSummary({
  draftVersion,
  publishedVersion,
  status,
  note,
}: {
  draftVersion: number;
  publishedVersion: number | null;
  status: string;
  note?: string;
}) {
  return (
    <aside data-bagui="admin-publish-summary" className="rounded-lg border border-[var(--solar-ops-border)] bg-[var(--solar-ops-surface)] p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-[var(--solar-ops-text)]">Publication</h2>
        <AdminStatusBadge value={status} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div>
          <dt className="text-[var(--solar-ops-muted)]">Draft version</dt>
          <dd className="mt-1 font-mono text-[var(--solar-ops-body)]">v{draftVersion}</dd>
        </div>
        <div>
          <dt className="text-[var(--solar-ops-muted)]">Published version</dt>
          <dd className="mt-1 font-mono text-[var(--solar-ops-body)]">{publishedVersion ? `v${publishedVersion}` : "Not published"}</dd>
        </div>
      </dl>
      {note ? <p className="mt-3 text-xs leading-5 text-[var(--solar-ops-muted)]">{note}</p> : null}
    </aside>
  );
}

export type AdminDataTableColumn<Row extends { id: string }> = {
  key: string;
  label: string;
  className?: string;
  render: (row: Row) => ReactNode;
};

export function AdminDataTable<Row extends { id: string }>({
  rows,
  columns,
  caption,
}: {
  rows: readonly Row[];
  columns: readonly AdminDataTableColumn<Row>[];
  caption: string;
}) {
  return (
    <div data-bagui="admin-data-table" className="overflow-x-auto rounded-lg border border-[var(--solar-ops-border)] bg-[var(--solar-ops-surface)]">
      <table className="w-full min-w-[680px] border-collapse text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b border-[var(--solar-ops-border)] bg-[var(--solar-ops-workspace)] text-xs font-semibold text-[var(--solar-ops-muted)]">
          <tr>
            {columns.map((column) => <th key={column.key} scope="col" className={cn("px-4 py-3", column.className)}>{column.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-[var(--solar-ops-border)] last:border-b-0">
              {columns.map((column) => <td key={column.key} className={cn("px-4 py-3 align-top text-[var(--solar-ops-body)]", column.className)}>{column.render(row)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
