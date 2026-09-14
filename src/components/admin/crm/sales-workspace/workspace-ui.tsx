"use client";

import type { ReactNode } from "react";
import {
  Activity,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  CircleAlert,
  ClipboardCheck,
  Compass,
  CreditCard,
  ExternalLink,
  FileText,
  Home,
  Inbox,
  Info,
  Link2,
  Mail,
  MapPin,
  PackageCheck,
  Phone,
  RefreshCw,
  Signature,
  User,
  Wrench,
} from "@/components/ui/icons";
import type { IconType } from "@/components/ui/icons";
import type {
  SalesWorkspaceFact,
  SalesWorkspaceState,
  SalesWorkspaceTabId,
  SalesWorkflowStageId,
} from "@/lib/sales-workspace/workflow";
import { SALES_WORKFLOW_STAGES } from "@/lib/sales-workspace/workflow";
import { cn } from "@/lib/utils";
import type { SalesWorkspaceCopy } from "./copy";

const surfaceClass = "admin-crm-surface rounded-xl border border-[#30363d] bg-[#161b22] shadow-sm";

const statusClasses = {
  neutral: "border-[#30363d] bg-[#21262d] text-[#c9d1d9]",
  info: "border-[#58a6ff]/40 bg-[#58a6ff]/10 text-[#58a6ff]",
  success: "border-[#3fb950]/40 bg-[#238636]/20 text-[#3fb950]",
  warning: "border-[#d29922]/40 bg-[#d29922]/15 text-[#d29922]",
  danger: "border-[#f85149]/40 bg-[#f85149]/15 text-[#f85149]",
} as const;

export type WorkspaceStatusTone = keyof typeof statusClasses;

export function WorkspaceCard({
  children,
  className,
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article";
}) {
  const Component = as;
  return (
    <Component data-bagui="sales-workspace-card" className={cn(surfaceClass, className)}>
      {children}
    </Component>
  );
}

export function WorkspaceSectionHeading({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="min-w-0">
        <h2 className="text-[17px] font-bold leading-6 tracking-[-0.015em] text-slate-950">{title}</h2>
        {description ? <p className="mt-1 max-w-2xl text-[13px] leading-5 text-slate-600">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function WorkspaceStatusBadge({
  children,
  tone = "neutral",
  icon: Icon,
  className,
}: {
  children: ReactNode;
  tone?: WorkspaceStatusTone;
  icon?: IconType;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none", statusClasses[tone], className)}>
      {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

export function WorkspaceMetricStrip({
  metrics,
}: {
  metrics: Array<{
    label: string;
    value: ReactNode;
    supporting?: ReactNode;
    icon: IconType;
    tone?: WorkspaceStatusTone;
  }>;
}) {
  return (
    <section aria-label="Sales case metrics" data-bagui="crm-metric-strip" className="admin-crm-metric-strip grid grid-cols-1 overflow-hidden rounded-xl border border-[#30363d] bg-[#161b22] shadow-sm sm:grid-cols-2 lg:grid-cols-4">
      {metrics.map(({ label, value, supporting, icon: Icon, tone = "info" }, index) => (
        <div key={label} className={cn("min-w-0 p-4 sm:p-5", index > 0 && "border-t border-[#30363d] sm:border-l sm:border-t-0")}>
          <div className="flex items-center gap-2 text-[12px] font-medium text-slate-600">
            <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-lg", tone === "success" ? "bg-[#238636]/20 text-[#3fb950]" : tone === "warning" ? "bg-[#d29922]/15 text-[#d29922]" : "bg-[#58a6ff]/10 text-[#58a6ff]")}>
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="truncate">{label}</span>
          </div>
          <p className="mt-3 truncate text-[22px] font-bold leading-7 tracking-[-0.025em] text-slate-950 sm:text-[25px]">{value}</p>
          {supporting ? <p className="mt-1 truncate text-[12px] text-slate-500">{supporting}</p> : null}
        </div>
      ))}
    </section>
  );
}

const stageIcons: Record<SalesWorkflowStageId, IconType> = {
  lead: Inbox,
  design: Compass,
  quote: FileText,
  sign: Signature,
  payment: CreditCard,
  handoff: PackageCheck,
  installation: Wrench,
};

export function SalesStageStepper({
  state,
  copy,
}: {
  state: SalesWorkspaceState;
  copy: SalesWorkspaceCopy;
}) {
  return (
    <section data-bagui="crm-workflow" className={cn(surfaceClass, "overflow-hidden p-4 sm:p-5")} aria-labelledby="sales-workflow-heading">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 id="sales-workflow-heading" className="text-sm font-bold text-slate-950">Sales workflow</h2>
          <p className="mt-1 text-[12px] text-slate-500">Business status, not page navigation</p>
        </div>
        <WorkspaceStatusBadge tone={state.isTerminal ? "danger" : "info"} icon={state.isTerminal ? CircleAlert : Activity}>
          {state.isTerminal ? state.statusLabel : `${state.completedStageCount} of ${SALES_WORKFLOW_STAGES.length - 1} complete`}
        </WorkspaceStatusBadge>
      </div>

      <div className="mt-5 overflow-x-auto pb-1" role="list" aria-label="Sales workflow stages">
        <div className="flex min-w-[720px] items-start">
          {state.steps.map((step, index) => {
            const Icon = stageIcons[step.id];
            const label = copy.stages[step.id];
            return (
              <div key={step.id} className="flex min-w-0 flex-1 items-start" role="listitem">
                <div className="flex min-w-[86px] flex-1 flex-col items-center text-center">
                  <span
                    aria-current={step.state === "current" ? "step" : undefined}
                    className={cn(
                      "grid h-9 w-9 place-items-center rounded-full border text-[12px] transition-colors duration-200",
                      step.state === "complete" && "border-emerald-600 bg-emerald-600 text-white",
                      step.state === "current" && "border-sky-700 bg-sky-700 text-white ring-4 ring-sky-100",
                      step.state === "upcoming" && "border-slate-200 bg-slate-50 text-slate-400",
                    )}
                  >
                    {step.state === "complete" ? <Check className="h-4 w-4" strokeWidth={2.5} /> : <Icon className="h-4 w-4" aria-hidden="true" />}
                  </span>
                  <span className={cn("mt-2 text-[12px] font-semibold", step.state === "upcoming" ? "text-slate-500" : "text-slate-950")}>
                    {label}
                  </span>
                  <span className="mt-0.5 max-w-[110px] text-[10px] leading-4 text-slate-500">{step.description}</span>
                </div>
                {index < state.steps.length - 1 ? (
                  <span className={cn("mt-[18px] h-px min-w-4 flex-1", index < state.currentStageIndex ? "bg-emerald-300" : "bg-slate-200")} aria-hidden="true" />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function WorkspaceTabs({
  activeTab,
  onChange,
  copy,
  counts,
}: {
  activeTab: SalesWorkspaceTabId;
  onChange: (tab: SalesWorkspaceTabId) => void;
  copy: SalesWorkspaceCopy;
  counts?: Partial<Record<SalesWorkspaceTabId, number>>;
}) {
  const tabs: Array<{ id: SalesWorkspaceTabId; icon: IconType }> = [
    { id: "overview", icon: Home },
    { id: "boq", icon: Compass },
    { id: "quotation", icon: FileText },
    { id: "documents", icon: ClipboardCheck },
    { id: "payment", icon: CreditCard },
    { id: "handoff", icon: PackageCheck },
    { id: "activity", icon: Activity },
  ];

  return (
    <nav data-bagui="crm-tabs" className="admin-crm-tabs overflow-x-auto border-b border-slate-200" aria-label="Sales case workspace tabs" role="tablist">
      <div className="flex min-w-max gap-1">
        {tabs.map(({ id, icon: Icon }) => {
          const isActive = activeTab === id;
          const count = counts?.[id];
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(id)}
              className={cn(
                "group inline-flex min-h-12 items-center gap-2 border-b-2 px-3 text-[13px] font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-inset sm:px-4",
                isActive ? "border-sky-700 text-sky-800" : "border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-950",
              )}
            >
              <Icon className={cn("h-4 w-4", isActive ? "text-sky-700" : "text-slate-400 group-hover:text-slate-600")} aria-hidden="true" />
              <span>{copy.tabs[id]}</span>
              {typeof count === "number" && count > 0 ? <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">{count}</span> : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export function CurrentAction({
  state,
  copy,
  onAction,
  isBusy = false,
}: {
  state: SalesWorkspaceState;
  copy: SalesWorkspaceCopy;
  onAction?: () => void;
  isBusy?: boolean;
}) {
  const action = state.currentAction;
  const hasBlocker = Boolean(action.blockedReason);
  const canAct = action.action !== "none" && Boolean(onAction) && !hasBlocker && !isBusy;

  return (
    <WorkspaceCard className="overflow-hidden" as="section">
      <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-sky-700">
            <Circle className="h-3 w-3 fill-current" aria-hidden="true" />
            {copy.nextAction}
          </div>
          <h2 className="mt-2 text-[20px] font-bold leading-7 tracking-[-0.02em] text-slate-950">{action.title}</h2>
          <p className="mt-1 max-w-2xl text-[13px] leading-5 text-slate-600">{action.description}</p>
        </div>
        {action.action !== "none" ? (
          <button
            type="button"
            onClick={onAction}
            disabled={!canAct}
            aria-describedby={hasBlocker ? "current-action-blocker" : undefined}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md bg-[#238636] px-4 py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-[#2ea043] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#58a6ff] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
          >
            {isBusy ? <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            <span>{isBusy ? "Working..." : action.ctaLabel}</span>
            {!isBusy ? <ChevronRight className="h-4 w-4" aria-hidden="true" /> : null}
          </button>
        ) : (
          <WorkspaceStatusBadge tone={state.isTerminal ? "danger" : "success"} icon={state.isTerminal ? CircleAlert : CheckCircle2}>
            {state.isTerminal ? copy.caseClosed : copy.completed}
          </WorkspaceStatusBadge>
        )}
      </div>

      {hasBlocker ? (
        <div id="current-action-blocker" className="flex items-start gap-2.5 border-b border-amber-200 bg-amber-50 px-5 py-3.5 text-[13px] leading-5 text-amber-950 sm:px-6" role="status">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
          <span>{action.blockedReason}</span>
        </div>
      ) : null}

      <div className="grid gap-2 px-5 py-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
        {action.facts.map((fact) => <PrerequisiteRow key={fact.id} fact={fact} />)}
      </div>
    </WorkspaceCard>
  );
}

function PrerequisiteRow({ fact }: { fact: SalesWorkspaceFact }) {
  return (
    <div className={cn("flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-[12px]", fact.complete ? "bg-emerald-50/70 text-emerald-900" : "bg-slate-50 text-slate-700")}>
      {fact.complete ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" /> : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />}
      <span className="min-w-0">
        <span className="block font-semibold">{fact.label}</span>
        {fact.detail ? <span className="mt-0.5 block leading-4 text-slate-600">{fact.detail}</span> : null}
      </span>
    </div>
  );
}

export function CustomerSummaryCard({
  name,
  email,
  phone,
  location,
  typeLabel,
  siteAddress,
  copy,
  children,
}: {
  name: string;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  typeLabel: string;
  siteAddress?: string | null;
  copy: SalesWorkspaceCopy;
  children?: ReactNode;
}) {
  return (
    <WorkspaceCard as="section" className="p-5 sm:p-6">
      <WorkspaceSectionHeading title={copy.customer} description="One stable customer context for every sales stage." />
      <div className="mt-5 flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700"><User className="h-5 w-5" aria-hidden="true" /></span>
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-bold text-slate-950">{name}</h3>
          <p className="mt-1 text-[12px] text-slate-500">{typeLabel}</p>
        </div>
      </div>
      <div className="mt-5 space-y-3 text-[13px] text-slate-600">
        {email ? <div className="flex items-center gap-2.5"><Mail className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" /><span className="truncate">{email}</span></div> : null}
        {phone ? <div className="flex items-center gap-2.5"><Phone className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" /><span>{phone}</span></div> : null}
        {location ? <div className="flex items-start gap-2.5"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" /><span className="line-clamp-2">{location}</span></div> : null}
      </div>
      {siteAddress ? (
        <div className="mt-5 rounded-xl bg-slate-50 p-3.5">
          <div className="flex items-center gap-2 text-[12px] font-bold text-slate-800"><MapPin className="h-4 w-4 text-sky-700" aria-hidden="true" />Site location</div>
          <p className="mt-1.5 text-[12px] leading-5 text-slate-600">{siteAddress}</p>
        </div>
      ) : null}
      {children ? <div className="mt-5 border-t border-slate-200 pt-4">{children}</div> : null}
    </WorkspaceCard>
  );
}

export type ErpConnectionState = "connected" | "syncing" | "not-connected" | "error";

export function ERPConnectionCard({
  state,
  customerId,
  quotationId,
  customerUrl,
  quotationUrl,
  syncError,
  lastSynced,
  copy,
  onCreateCustomer,
  onSync,
  onOpenCustomer,
  onOpenQuotation,
  isBusy = false,
}: {
  state: ErpConnectionState;
  customerId?: string | null;
  quotationId?: string | null;
  customerUrl?: string | null;
  quotationUrl?: string | null;
  syncError?: string | null;
  lastSynced?: string | null;
  copy: SalesWorkspaceCopy;
  onCreateCustomer?: () => void;
  onSync?: () => void;
  onOpenCustomer?: () => void;
  onOpenQuotation?: () => void;
  isBusy?: boolean;
}) {
  const tone: WorkspaceStatusTone = state === "connected" ? "success" : state === "error" ? "danger" : state === "syncing" ? "info" : "warning";
  const stateLabel = state === "connected" ? copy.connected : state === "error" ? copy.error : state === "syncing" ? copy.syncing : copy.notConnected;

  return (
    <WorkspaceCard as="section" className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <WorkspaceSectionHeading title={copy.erpNext} description="The external relationship is identified by stable ERPNext IDs." />
        <WorkspaceStatusBadge tone={tone} icon={state === "connected" ? CheckCircle2 : state === "error" ? CircleAlert : state === "syncing" ? RefreshCw : Link2}>
          {stateLabel}
        </WorkspaceStatusBadge>
      </div>
      <div className="mt-5 space-y-3 text-[12px]">
        <div className="flex items-center justify-between gap-3"><span className="text-slate-500">Customer ID</span><span className="truncate font-mono font-semibold text-slate-800">{customerId || "Not linked"}</span></div>
        <div className="flex items-center justify-between gap-3"><span className="text-slate-500">Quotation ID</span><span className="truncate font-mono font-semibold text-slate-800">{quotationId || "Not created"}</span></div>
        {lastSynced ? <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-3"><span className="text-slate-500">{copy.lastSynced}</span><span className="text-right text-slate-700">{formatDate(lastSynced)}</span></div> : null}
      </div>
      {syncError ? <div className="mt-4 flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-[12px] leading-5 text-rose-800" role="alert"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span>{syncError}</span></div> : null}
      <div className="mt-5 flex flex-wrap gap-2">
        {!customerId && onCreateCustomer ? <WorkspaceButton onClick={onCreateCustomer} disabled={isBusy} variant="primary">{isBusy ? "Creating..." : copy.createCustomer}</WorkspaceButton> : null}
        {onSync ? <WorkspaceButton onClick={onSync} disabled={isBusy} variant="secondary" icon={RefreshCw}>{isBusy ? "Syncing..." : copy.sync}</WorkspaceButton> : null}
        {customerUrl && onOpenCustomer ? <WorkspaceButton onClick={onOpenCustomer} variant="quiet" icon={ExternalLink}>{copy.openErpNext}</WorkspaceButton> : null}
        {quotationUrl && onOpenQuotation ? <WorkspaceButton onClick={onOpenQuotation} variant="quiet" icon={ExternalLink}>Open quotation</WorkspaceButton> : null}
      </div>
    </WorkspaceCard>
  );
}

export function CommercialSummaryCard({
  values,
  copy,
}: {
  values: {
    internalCost: string;
    recommendedPrice: string;
    agreedPrice: string;
    margin: string;
    marginPercent: string;
  };
  copy: SalesWorkspaceCopy;
}) {
  return (
    <WorkspaceCard as="section" className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <WorkspaceSectionHeading title={copy.commercialSnapshot} description="The customer quote and internal economics stay separate." />
        <WorkspaceStatusBadge tone="neutral">{copy.internalOnly}</WorkspaceStatusBadge>
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4">
        <CommercialValue label={copy.internalCost} value={values.internalCost} />
        <CommercialValue label={copy.recommendedPrice} value={values.recommendedPrice} />
        <CommercialValue label={copy.agreedPrice} value={values.agreedPrice} emphasis />
        <CommercialValue label={copy.margin} value={values.margin} />
        <CommercialValue label={copy.marginPercent} value={values.marginPercent} />
      </dl>
    </WorkspaceCard>
  );
}

function CommercialValue({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium text-slate-500">{label}</dt>
      <dd className={cn("mt-1 truncate text-[14px] font-semibold", emphasis ? "text-sky-800" : "text-slate-900")}>{value}</dd>
    </div>
  );
}

export function DocumentChecklist({
  items,
  copy,
  emptyMessage,
  action,
}: {
  items: Array<{ id: string; label: string; required?: boolean; status: string; detail?: string; visibleToCustomer?: boolean }>;
  copy: SalesWorkspaceCopy;
  emptyMessage?: string;
  action?: ReactNode;
}) {
  return (
    <WorkspaceCard as="section" className="p-5 sm:p-6">
      <WorkspaceSectionHeading title="Document checklist" description="Keep customer-visible requirements explicit before handoff." action={action} />
      {items.length === 0 ? <WorkspaceEmptyState icon={FileText} title={copy.noDocuments} /> : (
        <div className="mt-5 divide-y divide-slate-200">
          {items.map((item) => {
            const complete = /approved|ready|uploaded|signed/i.test(item.status);
            return (
              <div key={item.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                <span className={cn("mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full", complete ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500")}>
                  {complete ? <Check className="h-4 w-4" strokeWidth={2.5} /> : <FileText className="h-3.5 w-3.5" aria-hidden="true" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><p className="text-[13px] font-semibold text-slate-900">{item.label}</p>{item.required ? <WorkspaceStatusBadge tone="warning">Required</WorkspaceStatusBadge> : null}{item.visibleToCustomer ? <WorkspaceStatusBadge tone="info">Customer visible</WorkspaceStatusBadge> : null}</div>
                  <p className="mt-1 text-[12px] text-slate-500">{item.detail || item.status}</p>
                </div>
                <WorkspaceStatusBadge tone={complete ? "success" : "warning"}>{complete ? copy.completed : copy.missing}</WorkspaceStatusBadge>
              </div>
            );
          })}
        </div>
      )}
      {emptyMessage ? <p className="mt-4 text-[12px] text-slate-500">{emptyMessage}</p> : null}
    </WorkspaceCard>
  );
}

export function HandoffChecklist({
  items,
  ready,
  copy,
  onCreateProject,
  isBusy = false,
}: {
  items: Array<{ id: string; label: string; complete: boolean; detail?: string }>;
  ready: boolean;
  copy: SalesWorkspaceCopy;
  onCreateProject?: () => void;
  isBusy?: boolean;
}) {
  return (
    <WorkspaceCard as="section" className="overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-slate-200 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <WorkspaceSectionHeading title={copy.handoffReadiness} description="Only relevant operational information crosses the sales boundary." />
        <WorkspaceStatusBadge tone={ready ? "success" : "warning"} icon={ready ? CheckCircle2 : CircleAlert}>{ready ? copy.readyForOperations : copy.notReadyForOperations}</WorkspaceStatusBadge>
      </div>
      <div className="divide-y divide-slate-200 px-5 sm:px-6">
        {items.map((item) => <PrerequisiteRow key={item.id} fact={{ id: item.id, label: item.label, complete: item.complete, detail: item.detail }} />)}
      </div>
      <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50/80 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <p className="max-w-xl text-[12px] leading-5 text-slate-600">The installation package excludes internal cost, margin, negotiation history, and private sales notes.</p>
        {onCreateProject ? <WorkspaceButton onClick={onCreateProject} disabled={!ready || isBusy} variant="primary" icon={PackageCheck}>{isBusy ? "Creating..." : "Create installation project"}</WorkspaceButton> : null}
      </div>
    </WorkspaceCard>
  );
}

export function ActivityLog({
  items,
  copy,
}: {
  items: Array<{ id: string; action: string; description?: string | null; createdAt: string | Date; userId?: string | null }>;
  copy: SalesWorkspaceCopy;
}) {
  return (
    <WorkspaceCard as="section" className="p-5 sm:p-6">
      <WorkspaceSectionHeading title={copy.activity} description="A chronological record of quote, portal, payment, and handoff events." />
      {items.length === 0 ? <WorkspaceEmptyState icon={Activity} title={copy.noActivity} /> : (
        <ol className="mt-5 space-y-5">
          {items.map((item, index) => (
            <li key={item.id} className="relative flex gap-3">
              {index < items.length - 1 ? <span className="absolute left-[11px] top-7 h-[calc(100%+12px)] w-px bg-slate-200" aria-hidden="true" /> : null}
              <span className="relative grid h-6 w-6 shrink-0 place-items-center rounded-full border border-[#30363d] bg-[#21262d] text-[#58a6ff]"><Activity className="h-3 w-3" aria-hidden="true" /></span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2"><p className="text-[13px] font-semibold text-slate-900">{item.action}</p><time className="text-[11px] text-slate-500">{formatDate(item.createdAt)}</time></div>
                {item.description ? <p className="mt-1 text-[12px] leading-5 text-slate-600">{item.description}</p> : null}
                {item.userId ? <p className="mt-1 text-[11px] text-slate-400">Actor {item.userId}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </WorkspaceCard>
  );
}

export function WorkspaceEmptyState({
  icon: Icon = Info,
  title,
  description,
}: {
  icon?: IconType;
  title: string;
  description?: string;
}) {
  return (
    <div className="mt-5 rounded-xl bg-slate-50 px-4 py-8 text-center">
      <Icon className="mx-auto h-6 w-6 text-slate-400" aria-hidden="true" />
      <p className="mt-3 text-[13px] font-semibold text-slate-800">{title}</p>
      {description ? <p className="mx-auto mt-1 max-w-md text-[12px] leading-5 text-slate-500">{description}</p> : null}
    </div>
  );
}

export function WorkspaceButton({
  children,
  variant = "secondary",
  icon: Icon,
  onClick,
  disabled = false,
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "quiet";
  icon?: IconType;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-[12px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-[#238636] text-white hover:bg-[#2ea043]",
        variant === "secondary" && "border border-[#30363d] bg-[#161b22] text-[#c9d1d9] hover:bg-[#21262d]",
        variant === "quiet" && "text-[#8b949e] hover:bg-[#21262d] hover:text-[#f0f6fc]",
      )}
    >
      {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

function formatDate(value: string | Date) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
