"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Copy, GitBranch, Link2, Search, Trash2 } from "@/components/ui/icons";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

import SalesThreadCard from "@/components/admin/SalesThreadCard";
import { AdminBulkActionBar } from "@/components/admin/AdminBulkActionBar";
import { AdminSelectionCheckbox } from "@/components/admin/AdminSelectionCheckbox";
import ConfirmDeleteModal from "@/components/layout/ConfirmDeleteModal";
import { AuditLogSidebar, type AuditTimelineItem } from "@/components/ui/AuditLogSidebar";
import { deleteSalesPipelineRecords, getSalesPipelineAuditLogs } from "@/app/actions/salesPipeline";
import { useAdminSelection } from "@/hooks/useAdminSelection";
import type { SalesThread } from "@/types/salesThread";

type SalesThreadClientProps = {
  locale: string;
  initialThreads: SalesThread[];
  initialError: string | null;
};

type FilterValue = "all" | "complete" | "attention";

function formatDate(value: string, locale: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(locale === "th" ? "th-TH" : "en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function matchesQuery(thread: SalesThread, query: string) {
  const haystack = [
    thread.id,
    thread.customerName,
    thread.email,
    thread.phone,
    thread.lead?.id,
    thread.lead?.name,
    thread.lead?.erpnextLeadId,
    thread.quotation?.id,
    thread.quotation?.documentNo,
    thread.quotation?.erpnextQuotationId,
    thread.installation?.projectCode,
    thread.installation?.erpnextProjectId,
    thread.installation?.jobTicketId,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(query.trim().toLowerCase());
}

export default function SalesThreadClient({
  locale,
  initialThreads,
  initialError,
}: SalesThreadClientProps) {
  const t = useTranslations("AdminSalesThread");
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterValue>("all");
  const [hiddenThreadIds, setHiddenThreadIds] = useState<string[]>([]);
  const [threadsToDelete, setThreadsToDelete] = useState<SalesThread[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [auditTarget, setAuditTarget] = useState<SalesThread | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditTimelineItem[]>([]);
  const [isAuditLoading, setIsAuditLoading] = useState(false);

  const visibleThreads = useMemo(
    () => initialThreads.filter((thread) => !hiddenThreadIds.includes(thread.id)),
    [hiddenThreadIds, initialThreads],
  );

  const counts = useMemo(
    () => ({
      total: visibleThreads.length,
      complete: visibleThreads.filter(
        (thread) => Boolean(thread.lead && thread.quotation && thread.installation),
      ).length,
      attention: visibleThreads.filter(
        (thread) => !thread.lead || !thread.quotation || !thread.installation,
      ).length,
    }),
    [visibleThreads],
  );

  const filteredThreads = useMemo(
    () =>
      visibleThreads.filter((thread) => {
        const matchesFilter =
          filter === "all" ||
          (filter === "complete" && thread.lead && thread.quotation && thread.installation) ||
          (filter === "attention" && (!thread.lead || !thread.quotation || !thread.installation));
        return matchesFilter && matchesQuery(thread, query);
      }),
    [filter, query, visibleThreads],
  );
  const threadSelection = useAdminSelection(filteredThreads.map((thread) => thread.id));

  const handleCopySelected = async () => {
    const selected = filteredThreads.filter((thread) => threadSelection.selectedVisibleIds.includes(thread.id));
    if (selected.length === 0) return;
    try {
      await navigator.clipboard.writeText(selected.map((thread) => `${thread.customerName}\t${thread.id}`).join("\n"));
      toast.success(`Copied ${selected.length} selected sales thread${selected.length === 1 ? "" : "s"}.`);
    } catch (error) {
      console.error("Failed to copy selected sales threads:", error);
      toast.error("Unable to copy the selected sales threads.");
    }
  };

  const handleOpenAudit = async (thread: SalesThread) => {
    setAuditTarget(thread);
    setAuditLogs([]);
    setIsAuditLoading(true);

    try {
      const entityIds = [thread.quotation?.id, thread.lead?.id].filter(
        (id): id is string => Boolean(id),
      );
      const result = await getSalesPipelineAuditLogs(entityIds);
      setAuditLogs(result.success ? result.logs : []);
    } catch (error) {
      console.error("Failed to load sales thread audit logs:", error);
      toast.error(t("audit.loadFailed"));
    } finally {
      setIsAuditLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (threadsToDelete.length === 0) return;
    setIsDeleting(true);

    try {
      const result = await deleteSalesPipelineRecords(
        threadsToDelete.map((thread) => ({ type: "THREAD", id: thread.id })),
      );
      if (!result.success) {
        toast.error(result.error || t("delete.failed"));
        return;
      }

      const deletedIds = threadsToDelete.map((thread) => thread.id);
      setHiddenThreadIds((current) => [...new Set([...current, ...deletedIds])]);
      threadSelection.remove(deletedIds);
      setThreadsToDelete([]);
      router.refresh();
      toast.success(t("delete.success", { count: deletedIds.length }));
    } catch (error) {
      console.error("Failed to delete selected sales threads:", error);
      toast.error(t("delete.failed"));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <main className="sd-page-shell min-h-dvh bg-[#0d1117] px-4 py-6 text-[#c9d1d9] sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[90rem] space-y-6">
        <header className="flex min-w-0 flex-col gap-5 border-b border-[#30363d] pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[#58a6ff]">
              <GitBranch className="size-4" aria-hidden="true" />
              <p className="text-xs font-semibold uppercase tracking-[0.14em]">{t("eyebrow")}</p>
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[#f0f6fc] sm:text-3xl">
              {t("title")}
            </h1>
            <p className="mt-2 max-w-[68ch] text-pretty text-sm leading-6 text-[#8b949e]">{t("description")}</p>
          </div>

          <div className="flex max-w-full items-center gap-2 rounded-xl border border-[#30363d] bg-[#161b22] px-3 py-2 text-xs text-[#8b949e]">
            <Link2 className="size-4 text-[#3fb950]" aria-hidden="true" />
            <span>{t("explicitLinks")}</span>
          </div>
        </header>

        {initialError ? (
          <div className="flex items-start gap-3 border border-[#da3633]/50 bg-[#da3633]/10 p-4 text-sm text-[#f85149]" role="alert">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{initialError}</span>
          </div>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-3" aria-label={t("summaryLabel")}>
          {([
            ["total", counts.total, t("summary.total")],
            ["complete", counts.complete, t("summary.complete")],
            ["attention", counts.attention, t("summary.attention")],
          ] as const).map(([key, value, label]) => (
            <div key={key} className="border border-[#30363d] bg-[#161b22] px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8b949e]">{label}</p>
              <p className="mt-2 font-mono text-2xl font-semibold text-[#f0f6fc]">{value}</p>
            </div>
          ))}
        </section>

        <section className="flex flex-col gap-3 border border-[#30363d] bg-[#161b22] p-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative block min-w-0 flex-1 sm:max-w-md">
            <span className="sr-only">{t("searchLabel")}</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#8b949e]" aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("searchPlaceholder")}
              className="min-h-11 w-full border border-[#30363d] bg-[#0d1117] pl-10 pr-3 text-sm text-[#f0f6fc] outline-none placeholder:text-[#6e7681] focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff]"
            />
          </label>

          <div className="flex flex-wrap gap-2" role="group" aria-label={t("filterLabel")}>
            {([
              ["all", t("filters.all"), counts.total],
              ["complete", t("filters.complete"), counts.complete],
              ["attention", t("filters.attention"), counts.attention],
            ] as const).map(([value, label, count]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                aria-pressed={filter === value}
                className={
                  filter === value
                    ? "inline-flex min-h-11 items-center gap-2 border border-[#8b949e] bg-[#21262d] px-3 text-xs font-semibold text-[#f0f6fc]"
                    : "inline-flex min-h-11 items-center gap-2 border border-[#30363d] bg-[#0d1117] px-3 text-xs font-semibold text-[#8b949e] hover:border-[#8b949e] hover:text-[#c9d1d9]"
                }
              >
                {label}
                <span className="font-mono text-[10px]">{count}</span>
              </button>
            ))}
          </div>
        </section>

        <div className="space-y-4">
          <AdminBulkActionBar
            selectedCount={threadSelection.selectedVisibleIds.length}
            visibleCount={filteredThreads.length}
            allVisibleSelected={threadSelection.allVisibleSelected}
            someVisibleSelected={threadSelection.someVisibleSelected}
            onToggleVisible={threadSelection.toggleVisible}
            onClear={threadSelection.clear}
            actions={[
              { id: "copy", label: "Copy selected", icon: Copy, onClick: handleCopySelected },
              {
                id: "delete",
                label: t("delete.action"),
                icon: Trash2,
                tone: "danger",
                onClick: () => {
                  setThreadsToDelete(
                    filteredThreads.filter((thread) => threadSelection.selectedVisibleIds.includes(thread.id)),
                  );
                },
              },
            ]}
          />
          {filteredThreads.length === 0 ? (
            <div className="border border-dashed border-[#484f58] bg-[#161b22] px-4 py-14 text-center">
              <GitBranch className="mx-auto size-8 text-[#484f58]" aria-hidden="true" />
              <h2 className="mt-3 text-sm font-semibold text-[#f0f6fc]">{t("emptyTitle")}</h2>
              <p className="mt-1 text-xs text-[#8b949e]">{t("emptyDescription")}</p>
            </div>
          ) : (
            filteredThreads.map((thread) => (
              <div key={thread.id} className="flex items-start gap-3">
                <AdminSelectionCheckbox
                  checked={threadSelection.isSelected(thread.id)}
                  onChange={() => threadSelection.toggle(thread.id)}
                  label={`Select sales thread for ${thread.customerName}`}
                  className="mt-4 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <SalesThreadCard
                    thread={thread}
                    locale={locale}
                    onOpenAudit={() => void handleOpenAudit(thread)}
                    onDelete={() => setThreadsToDelete([thread])}
                  />
                  <p className="mt-1 px-1 text-[10px] text-[#6e7681]">
                    {t("created", { date: formatDate(thread.createdAt, locale) })}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <ConfirmDeleteModal
        isOpen={threadsToDelete.length > 0}
        onClose={() => {
          if (!isDeleting) setThreadsToDelete([]);
        }}
        onConfirm={() => void handleConfirmDelete()}
        isDeleting={isDeleting}
        title={t("delete.title")}
        message={t("delete.message", { count: threadsToDelete.length })}
      />

      <AuditLogSidebar
        isOpen={auditTarget !== null}
        onClose={() => setAuditTarget(null)}
        logs={auditLogs}
        loading={isAuditLoading}
        title={t("audit.title")}
        entityLabel={auditTarget?.customerName}
        emptyMessage={t("audit.empty")}
      />
    </main>
  );
}
