"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CircleDashed,
  ExternalLink,
  FileText,
  GitBranch,
  Trash2,
  UserRound,
  Wrench,
} from "@/components/ui/icons";
import { useTranslations } from "next-intl";
import { AuditLogTrigger } from "@/components/ui/AuditLogSidebar";
import { AdminSelectionCheckbox } from "@/components/admin/AdminSelectionCheckbox";

import type { SalesThread, SalesThreadInstallation } from "@/types/salesThread";

type SalesThreadCardProps = {
  thread: SalesThread | null;
  locale: string;
  compact?: boolean;
  onOpenAudit?: () => void;
  onDelete?: () => void;
  isSelected?: boolean;
  onToggleSelect?: () => void;
};

type StageCardProps = {
  icon: typeof UserRound;
  label: string;
  status: string | null;
  reference: string | null;
  detail: string | null;
  missingLabel: string;
  children?: ReactNode;
};

function statusLabel(value: string | null, fallback: string): string {
  return value ? value.replaceAll("_", " ") : fallback;
}

function StageCard({
  icon: Icon,
  label,
  status,
  reference,
  detail,
  missingLabel,
  children,
}: StageCardProps) {
  const isMissing = !reference;

  return (
    <article className="sd-surface flex min-w-0 flex-col rounded-lg border border-[#30363d] bg-[#0d1117] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-[#30363d] bg-[#161b22] text-[#8b949e]">
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8b949e]">
              {label}
            </p>
            <p className="mt-1 truncate font-mono text-xs font-semibold text-[#f0f6fc]">
              {reference || missingLabel}
            </p>
          </div>
        </div>
        <span
          className={
            isMissing
              ? "shrink-0 rounded-md border border-dashed border-[#484f58] px-2 py-1 text-[10px] font-medium text-[#8b949e]"
              : "shrink-0 rounded-md border border-[#238636]/50 bg-[#238636]/10 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-[#3fb950]"
          }
        >
          {isMissing ? "—" : statusLabel(status, "Linked")}
        </span>
      </div>

      {detail ? (
        <p className="mt-3 line-clamp-2 text-xs leading-5 text-[#8b949e]">{detail}</p>
      ) : null}

      {children ? <div className="mt-auto flex flex-wrap gap-2 pt-4">{children}</div> : null}
    </article>
  );
}

function ActionLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="sd-action inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[#30363d] bg-[#21262d] px-3 text-xs font-semibold text-[#c9d1d9] transition-colors hover:border-[#58a6ff] hover:bg-[#30363d] hover:text-[#f0f6fc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#58a6ff]"
    >
      {children}
    </Link>
  );
}

function getLeadHref(locale: string, thread: SalesThread): string | null {
  const lead = thread.lead;
  if (!lead) return null;
  if (lead.target === "CRM_RECORD") {
    return `/${locale}/admin/crm/${encodeURIComponent(lead.id)}`;
  }
  return `/${locale}/admin/quotations?tab=leads&lead=${encodeURIComponent(
    lead.inboundRequestId || lead.consultationLeadId || lead.id,
  )}`;
}

function getProjectHref(locale: string, thread: SalesThread): string | null {
  if (!thread.installation) return null;
  if (!thread.installation.projectId) {
    return thread.installation.legacyProjectId || thread.installation.legacyJobTicketId
      ? `/${locale}/admin/projects`
      : null;
  }
  if (!thread.quotation?.id) return `/${locale}/admin/projects`;
  return `/${locale}/admin/projects?proposal=${encodeURIComponent(thread.quotation.id)}`;
}

function getTicketHref(locale: string, installation: SalesThreadInstallation): string | null {
  return installation.jobTicketId
    ? `/${locale}/admin/job-tickets/${encodeURIComponent(installation.jobTicketId)}`
    : null;
}

export default function SalesThreadCard({
  thread,
  locale,
  compact = false,
  onOpenAudit,
  onDelete,
  isSelected = false,
  onToggleSelect,
}: SalesThreadCardProps) {
  const t = useTranslations("AdminSalesThread");

  if (!thread) {
    return (
      <section className="sd-surface rounded-xl border border-dashed border-[#484f58] bg-[#161b22] p-4 text-sm text-[#8b949e]">
        {t("missingThread")}
      </section>
    );
  }

  const leadHref = getLeadHref(locale, thread);
  const projectHref = getProjectHref(locale, thread);
  const ticketHref = thread.installation
    ? getTicketHref(locale, thread.installation)
    : null;
  const installationReference = thread.installation
    ? thread.installation.projectCode ||
      thread.installation.erpnextProjectId ||
      thread.installation.jobTicketId ||
      thread.installation.legacyProjectId
    : null;
  const installationDetail = thread.installation
    ? [
        thread.installation.erpnextProjectId
          ? `ERPNext ${thread.installation.erpnextProjectId}`
          : null,
        thread.installation.jobTicketId
          ? `Job ticket ${thread.installation.jobTicketId.slice(0, 8).toUpperCase()}`
          : null,
        thread.installation.legacyJobTicketId ? "Legacy ticket retained" : null,
      ]
        .filter(Boolean)
        .join(" · ") || null
    : null;

  return (
    <section
      aria-label={`${thread.customerName} · ${thread.id}`}
      className="sd-panel rounded-xl border border-[#30363d] bg-[#161b22]"
    >
      {!compact ? (
        <header className="flex flex-col gap-3 border-b border-[#30363d] p-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[#58a6ff]">
              <GitBranch className="size-4" aria-hidden="true" />
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em]">
                {t("eyebrow")}
              </p>
            </div>
            <h2 id={`sales-thread-${thread.id}`} className="mt-2 truncate text-base font-semibold text-[#f0f6fc]">
              {thread.customerName}
            </h2>
            <p className="mt-1 truncate text-xs text-[#8b949e]">
              {[thread.email, thread.phone].filter(Boolean).join(" · ") || t("noContact")}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {onToggleSelect ? (
              <label
                className="inline-flex min-h-11 items-center gap-2 rounded-md px-1 text-[10px] font-semibold text-[#8b949e] transition-colors hover:text-[#f0f6fc]"
                onClick={(event) => event.stopPropagation()}
              >
                <AdminSelectionCheckbox
                  checked={isSelected}
                  onChange={onToggleSelect}
                  label={`Select ${thread.customerName} sales thread`}
                />
                <span className="sr-only">Select thread</span>
              </label>
            ) : null}
            <span className="font-mono text-[10px] text-[#8b949e]">
              {thread.id.includes(":") ? thread.id : `#${thread.id.slice(0, 8).toUpperCase()}`}
            </span>
            {onOpenAudit ? (
              <AuditLogTrigger
                onClick={onOpenAudit}
                label="Logs"
                className="min-h-8 px-2 text-[10px]"
              />
            ) : null}
            {onDelete ? (
              <button
                type="button"
                onClick={onDelete}
                aria-label={`Delete ${thread.customerName} sales thread`}
                className="inline-flex size-8 items-center justify-center rounded-md border border-rose-500/40 bg-rose-500/10 text-rose-300 transition-colors hover:bg-rose-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </header>
      ) : null}

      <div className={compact ? "p-3" : "p-4"}>
        <div className="grid items-stretch gap-2 md:grid-cols-[minmax(0,1fr)_24px_minmax(0,1fr)_24px_minmax(0,1fr)]">
          <StageCard
            icon={UserRound}
            label={t("stages.lead")}
            status={thread.lead?.status ?? null}
            reference={thread.lead?.name ?? null}
            detail={
              thread.lead
                ? `${thread.lead.source.replaceAll("_", " ")} · ${thread.lead.email || t("noEmail")}`
                : null
            }
            missingLabel={t("notLinked")}
          >
            {leadHref ? (
              <ActionLink href={leadHref}>
                {t("actions.openLead")}
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </ActionLink>
            ) : null}
          </StageCard>

          <div className="hidden items-center justify-center md:flex" aria-hidden="true">
            <ArrowRight className="size-4 text-[#484f58]" />
          </div>

          <StageCard
            icon={FileText}
            label={t("stages.quotation")}
            status={thread.quotation?.status ?? null}
            reference={thread.quotation?.documentNo ?? null}
            detail={
              thread.quotation?.erpnextQuotationId
                ? `ERPNext ${thread.quotation.erpnextQuotationId}`
                : thread.quotation
                  ? t("erpNotLinked")
                  : null
            }
            missingLabel={t("notCreated")}
          >
            {thread.quotation ? (
              <ActionLink href={`/${locale}/admin/quotations/${encodeURIComponent(thread.quotation.id)}`}>
                {t("actions.openQuotation")}
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </ActionLink>
            ) : null}
          </StageCard>

          <div className="hidden items-center justify-center md:flex" aria-hidden="true">
            <ArrowRight className="size-4 text-[#484f58]" />
          </div>

          <StageCard
            icon={Wrench}
            label={t("stages.installation")}
            status={
              thread.installation?.projectStatus ||
              thread.installation?.jobTicketStatus ||
              thread.installation?.legacyJobTicketStatus ||
              null
            }
            reference={installationReference}
            detail={installationDetail}
            missingLabel={t("notCreated")}
          >
            {projectHref ? (
              <ActionLink href={projectHref}>
                {t("actions.openProject")}
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </ActionLink>
            ) : null}
            {ticketHref ? (
              <ActionLink href={ticketHref}>
                {t("actions.openJobTicket")}
                <ExternalLink className="size-3.5" aria-hidden="true" />
              </ActionLink>
            ) : null}
          </StageCard>
        </div>

        {!thread.lead || !thread.quotation || !thread.installation ? (
          <div className="mt-3 flex items-start gap-2 border border-dashed border-[#484f58] bg-[#0d1117] px-3 py-2.5 text-xs text-[#8b949e]" role="status">
            <CircleDashed className="mt-0.5 size-3.5 shrink-0 text-[#d29922]" aria-hidden="true" />
            <span>{t("incompleteHint")}</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}
