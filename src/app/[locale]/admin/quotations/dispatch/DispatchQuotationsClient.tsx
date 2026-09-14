"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Check,
  ChevronDown,
  Clipboard,
  Copy,
  ExternalLink,
  FileText,
  Link as LinkIcon,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
} from "@/components/ui/icons";
import { toast } from "sonner";

import { dispatchQuotationForSigning } from "@/app/actions/quotationDispatch";
import { cn, formatPrice } from "@/lib/utils";
import { GsapSpinner } from "@/components/ui/GsapMotion";
import { AdminBulkActionBar } from "@/components/admin/AdminBulkActionBar";
import { AdminSelectionCheckbox } from "@/components/admin/AdminSelectionCheckbox";
import { useAdminSelection } from "@/hooks/useAdminSelection";

export type DispatchQuotation = {
  id: string;
  erpnextQuotationId: string | null;
  status: string;
  dispatchStatus: "PENDING_DISPATCH" | "DISPATCHED" | "SIGNED" | "EXPIRED";
  systemSizeKwp: number;
  panelCount: number;
  totalPrice: number;
  pdfUrl: string | null;
  magicTokenSlug: string;
  wizardLeadId: string | null;
  createdAt: string;
  updatedAt: string;
  customer: {
    name: string;
    email: string;
    phoneNumber: string | null;
  };
  linkedLead: {
    id: string;
    customerName: string;
    email: string;
    targetSystemSize: string;
    createdAt: string;
  } | null;
};

export type DispatchLead = {
  id: string;
  customerName: string;
  email: string;
  phone: string;
  targetSystemSize: string;
  systemType: "ON_GRID" | "HYBRID";
  status: string;
  createdAt: string;
  postalCode: string | null;
};

type DispatchSuccess = {
  proposalId: string;
  magicLink: string;
  signingUrl: string;
  magicTokenSlug: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
}

function getLeadSearchText(lead: DispatchLead) {
  return [
    lead.customerName,
    lead.email,
    lead.phone,
    lead.targetSystemSize,
    lead.postalCode,
    lead.status,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function getShortId(value: string) {
  return value.slice(0, 8).toUpperCase();
}

export default function DispatchQuotationsClient({
  initialQuotations,
  unresolvedLeads,
}: {
  initialQuotations: DispatchQuotation[];
  unresolvedLeads: DispatchLead[];
}) {
  const [quotations, setQuotations] = useState(initialQuotations);
  const [selectedQuotationId, setSelectedQuotationId] = useState(initialQuotations[0]?.id || "");
  const [leadSelections, setLeadSelections] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialQuotations.map((quotation) => [quotation.id, quotation.wizardLeadId || ""])),
  );
  const [success, setSuccess] = useState<DispatchSuccess | null>(null);
  const [isPending, startTransition] = useTransition();
  const quotationSelection = useAdminSelection(quotations.map((quotation) => quotation.id));

  const selectedQuotation = useMemo(
    () => quotations.find((quotation) => quotation.id === selectedQuotationId) || quotations[0] || null,
    [quotations, selectedQuotationId],
  );

  const selectedLeadId = selectedQuotation ? leadSelections[selectedQuotation.id] || "" : "";
  const selectedLead = selectedLeadId
    ? unresolvedLeads.find((lead) => lead.id === selectedLeadId) || null
    : null;

  const dispatchSelectedQuotation = () => {
    if (!selectedQuotation) return;

    if (!selectedLeadId) {
      toast.error("Please select an unresolved Wizard Lead before dispatch.");
      return;
    }

    startTransition(async () => {
      try {
        const result = await dispatchQuotationForSigning(selectedQuotation.id, selectedLeadId);
        if (!result.success) {
          toast.error(result.error);
          return;
        }

        setSuccess({
          proposalId: result.proposalId,
          magicLink: result.magicLink,
          signingUrl: result.signingUrl,
          magicTokenSlug: result.magicTokenSlug,
        });
        setQuotations((current) => {
          const next = current.filter((quotation) => quotation.id !== selectedQuotation.id);
          setSelectedQuotationId(next[0]?.id || "");
          return next;
        });
        quotationSelection.remove([selectedQuotation.id]);
        toast.success("Quotation dispatched and magic link created.");
      } catch (error) {
        console.error("Quotation dispatch error:", error);
        toast.error("Could not dispatch the quotation. Please try again.");
      }
    });
  };

  const dispatchSelectedQuotations = () => {
    const selected = quotationSelection.selectedIds
      .map((id) => {
        const quotation = quotations.find((item) => item.id === id);
        const leadId = quotation ? leadSelections[quotation.id] || "" : "";
        return quotation && leadId ? { quotation, leadId } : null;
      })
      .filter((item): item is { quotation: DispatchQuotation; leadId: string } => item !== null);

    if (selected.length === 0) {
      toast.error("Select quotations with an unresolved Wizard Lead before dispatching.");
      return;
    }
    if (selected.length !== quotationSelection.selectedIds.length) {
      toast.error("Every selected quotation needs an unresolved Wizard Lead first.");
      return;
    }

    startTransition(async () => {
      try {
        const settled = await Promise.allSettled(
          selected.map(async ({ quotation, leadId }) => ({
            quotation,
            result: await dispatchQuotationForSigning(quotation.id, leadId),
          })),
        );
        const succeeded = settled.flatMap((item) =>
          item.status === "fulfilled" && item.value.result.success ? [item.value] : [],
        );
        const succeededIds = new Set(succeeded.map((item) => item.quotation.id));
        const failedCount = settled.length - succeeded.length;

        if (succeededIds.size > 0) {
          setQuotations((current) => {
            const next = current.filter((quotation) => !succeededIds.has(quotation.id));
            setSelectedQuotationId((currentId) =>
              succeededIds.has(currentId) ? next[0]?.id || "" : currentId,
            );
            return next;
          });
          quotationSelection.remove([...succeededIds]);
        }

        if (failedCount > 0) {
          toast.error(`${failedCount} quotation${failedCount === 1 ? "" : "s"} could not be dispatched.`);
        }
        if (succeeded.length > 0) {
          toast.success(`Dispatched ${succeeded.length} quotation${succeeded.length === 1 ? "" : "s"}.`);
        }
      } catch (error) {
        console.error("Bulk quotation dispatch error:", error);
        toast.error("Could not dispatch the selected quotations. Please try again.");
      }
    });
  };

  const copyMagicLink = async (link: string) => {
    await navigator.clipboard.writeText(link);
    toast.success("Magic link copied.");
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 rounded-[2rem] border border-[#1E293B] bg-[#0F172A]/70 p-5 shadow-none backdrop-blur sm:p-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-[#B7D1EA]/35 px-3 py-1 text-[11px] font-black uppercase tracking-[0.28em] text-[#0369a1]">
            <Sparkles className="h-3.5 w-3.5" />
            ERPNext dispatch
          </p>
          <h1 className="mt-4 text-2xl font-black tracking-tight text-gray-100 sm:text-3xl">
            Quotation Signing Dispatcher
          </h1>
          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-gray-400">
            Bind finalized ERPNext quotations to unresolved Wizard Leads and hand staff a passwordless customer portal link.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:flex">
          <Metric label="Pending" value={String(quotations.length)} />
          <Metric label="Unresolved leads" value={String(unresolvedLeads.length)} />
        </div>
      </header>

      {success ? (
        <section className="rounded-[2rem] border border-emerald-200/80 bg-emerald-500/10 p-5 shadow-none sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-none shadow-emerald-600/20">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-700">Dispatched</p>
                <h2 className="mt-1 text-xl font-black text-gray-100">Magic link is ready for the customer</h2>
                <p className="mt-2 break-all rounded-2xl bg-[#0F172A]/80 px-4 py-3 font-mono text-sm font-bold text-gray-300">
                  {success.magicLink}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:shrink-0">
              <button
                type="button"
                onClick={() => copyMagicLink(success.magicLink)}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white transition hover:bg-[#0369a1] focus:outline-none focus:ring-4 focus:ring-emerald-200"
              >
                <Copy className="h-4 w-4" />
                Copy Magic Link
              </button>
              <a
                href={success.signingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#0F172A] px-5 py-3 text-sm font-black text-gray-100 shadow-none transition hover:text-[#0369a1] focus:outline-none focus:ring-4 focus:ring-emerald-200"
              >
                <ExternalLink className="h-4 w-4" />
                Open Staff Signing
              </a>
            </div>
          </div>
        </section>
      ) : null}

      {selectedQuotation ? (
        <section className="grid gap-5 xl:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
          <aside className="rounded-[2rem] border border-[#1E293B] bg-[#0F172A]/75 p-3 shadow-none backdrop-blur">
            <div className="flex items-center justify-between px-2 pb-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.25em] text-gray-500">Queue</p>
                <h2 className="text-lg font-black text-gray-100">Pending dispatch</h2>
              </div>
              <Clipboard className="h-5 w-5 text-[#0369a1]" />
            </div>
            <AdminBulkActionBar
              selectedCount={quotationSelection.selectedCount}
              visibleCount={quotations.length}
              allVisibleSelected={quotationSelection.allVisibleSelected}
              someVisibleSelected={quotationSelection.someVisibleSelected}
              onToggleVisible={quotationSelection.toggleVisible}
              onClear={quotationSelection.clear}
              isPending={isPending}
              actions={[
                { id: "dispatch", label: "Dispatch selected", icon: Send, tone: "success", onClick: dispatchSelectedQuotations },
              ]}
              className="mb-3"
            />
            <div className="max-h-[68dvh] space-y-2 overflow-y-auto pr-1">
              {quotations.map((quotation) => {
                const active = quotation.id === selectedQuotation.id;
                return (
                  <div
                    key={quotation.id}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-2xl p-3 transition",
                      active ? "bg-[#0369a1] text-white shadow-none shadow-sky-900/15" : "bg-[#F8F7F4] text-gray-100 hover:bg-[#0B1121]",
                    )}
                  >
                    <AdminSelectionCheckbox
                      checked={quotationSelection.isSelected(quotation.id)}
                      onChange={() => quotationSelection.toggle(quotation.id)}
                      label={`Select quotation for ${quotation.customer.name}`}
                      className="mt-1 shrink-0"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedQuotationId(quotation.id);
                        setSuccess(null);
                      }}
                      className="min-w-0 flex-1 rounded-xl p-1 text-left transition focus:outline-none focus:ring-4 focus:ring-[#B7D1EA]/40"
                    >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black">
                          {quotation.customer.name}
                        </p>
                        <p className={cn("mt-1 truncate text-xs font-bold", active ? "text-sky-100" : "text-gray-400")}>
                          {quotation.erpnextQuotationId || `#${getShortId(quotation.id)}`}
                        </p>
                      </div>
                      <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-black", active ? "bg-[#0F172A]/20" : "bg-[#0F172A] text-[#0369a1]")}>
                        {quotation.systemSizeKwp.toFixed(1)} kW
                      </span>
                    </div>
                    <div className={cn("mt-4 flex items-center justify-between text-xs font-bold", active ? "text-sky-50" : "text-gray-400")}>
                      <span>{formatPrice(quotation.totalPrice)}</span>
                      <span>{formatDate(quotation.createdAt)}</span>
                    </div>
                    </button>
                  </div>
                );
              })}
            </div>
          </aside>

          <main className="rounded-[2rem] border border-[#1E293B] bg-[#0F172A]/80 p-5 shadow-none backdrop-blur sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.25em] text-[#0369a1]">
                  {selectedQuotation.erpnextQuotationId || `Proposal ${getShortId(selectedQuotation.id)}`}
                </p>
                <h2 className="mt-2 text-2xl font-black tracking-tight text-gray-100">
                  {selectedQuotation.customer.name}
                </h2>
                <p className="mt-1 text-sm font-semibold text-gray-400">{selectedQuotation.customer.email}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusPill label="PENDING_DISPATCH" />
                {selectedQuotation.pdfUrl ? (
                  <a
                    href={selectedQuotation.pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white transition hover:bg-[#0369a1]"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    PDF
                  </a>
                ) : null}
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <Spec label="System size" value={`${selectedQuotation.systemSizeKwp.toFixed(2)} kW`} />
              <Spec label="Panels" value={`${selectedQuotation.panelCount}`} />
              <Spec label="Total" value={formatPrice(selectedQuotation.totalPrice)} />
            </div>

            <section className="mt-6 rounded-[1.5rem] bg-[#0F172A] p-4 sm:p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
                <div className="min-w-0 flex-1">
                  <label className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.25em] text-gray-400">
                    <UserRound className="h-4 w-4 text-[#0369a1]" />
                    Wizard Lead
                  </label>
                  <LeadCombobox
                    leads={unresolvedLeads}
                    value={selectedLeadId}
                    selectedLead={selectedLead}
                    onChange={(leadId) => {
                      if (!selectedQuotation) return;
                      setLeadSelections((current) => ({
                        ...current,
                        [selectedQuotation.id]: leadId,
                      }));
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={dispatchSelectedQuotation}
                  disabled={isPending || !selectedLeadId}
                  className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-[#0369a1] px-6 py-3.5 text-sm font-black text-white shadow-none shadow-sky-900/20 transition hover:bg-[#0284c7] focus:outline-none focus:ring-4 focus:ring-[#B7D1EA]/45 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
                >
                  {isPending ? <GsapSpinner className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                  สร้างสิทธิ์และส่งลิงก์เซ็นสัญญา 🔗
                </button>
              </div>

              {selectedLead ? (
                <div className="mt-4 grid gap-3 rounded-2xl bg-[#0F172A]/80 p-4 text-sm sm:grid-cols-3">
                  <Spec label="Lead customer" value={selectedLead.customerName} compact />
                  <Spec label="Requested system" value={selectedLead.targetSystemSize} compact />
                  <Spec label="Submitted" value={formatDate(selectedLead.createdAt)} compact />
                </div>
              ) : null}
            </section>
          </main>
        </section>
      ) : (
        <section className="rounded-[2rem] border border-[#1E293B] bg-[#0F172A]/80 p-8 text-center shadow-none">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#B7D1EA]/35 text-[#0369a1]">
            <Check className="h-7 w-7" />
          </div>
          <h2 className="mt-5 text-2xl font-black text-gray-100">No pending dispatch quotations</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm font-semibold leading-6 text-gray-400">
            New finalized ERPNext quotations with PENDING_DISPATCH status will appear here automatically.
          </p>
        </section>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[#0F172A] px-4 py-3 shadow-none">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-black text-gray-100">{value}</p>
    </div>
  );
}

function StatusPill({ label, tone = "amber" }: { label: string; tone?: "amber" | "blue" }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-4 py-2 text-xs font-black",
        tone === "amber" && "bg-amber-500/10 text-amber-700",
        tone === "blue" && "bg-[#B7D1EA]/35 text-[#0369a1]",
      )}
    >
      {label}
    </span>
  );
}

function Spec({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("rounded-2xl bg-[#0F172A] p-4 shadow-none", compact && "p-3 shadow-none")}>
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">{label}</p>
      <p className={cn("mt-1 break-words font-black text-gray-100", compact ? "text-sm" : "text-lg")}>{value}</p>
    </div>
  );
}

function LeadCombobox({
  leads,
  value,
  selectedLead,
  onChange,
}: {
  leads: DispatchLead[];
  value: string;
  selectedLead: DispatchLead | null;
  onChange: (leadId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const filteredLeads = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return leads.slice(0, 24);
    return leads
      .filter((lead) => getLeadSearchText(lead).includes(normalizedQuery))
      .slice(0, 24);
  }, [leads, query]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl border border-white bg-[#0F172A] px-4 py-3 text-left shadow-none transition focus:outline-none focus:ring-4 focus:ring-[#B7D1EA]/45"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-black text-gray-100">
            {selectedLead ? selectedLead.customerName : "Select unresolved Wizard Lead"}
          </span>
          <span className="mt-1 block truncate text-xs font-bold text-gray-400">
            {selectedLead
              ? `${selectedLead.targetSystemSize} · ${formatDate(selectedLead.createdAt)}`
              : "Search by customer name, email, phone, date, or system kW"}
          </span>
        </span>
        <ChevronDown className={cn("h-5 w-5 shrink-0 text-gray-500 transition", open && "rotate-180")} />
      </button>

      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-30 rounded-2xl border border-[#1E293B] bg-[#0F172A] p-3 shadow-none">
          <div className="flex items-center gap-2 rounded-xl bg-[#0F172A] px-3 py-2">
            <Search className="h-4 w-4 text-[#0369a1]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoFocus
              placeholder="Search unresolved leads"
              className="min-w-0 flex-1 bg-transparent text-sm font-bold text-gray-100 outline-none placeholder:text-gray-500"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="rounded-full p-1 text-gray-500 transition hover:bg-[#0B1121] hover:text-gray-300"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          <div className="mt-2 max-h-72 overflow-y-auto">
            {filteredLeads.length > 0 ? (
              filteredLeads.map((lead) => (
                <button
                  key={lead.id}
                  type="button"
                  onClick={() => {
                    onChange(lead.id);
                    setOpen(false);
                    setQuery("");
                  }}
                  className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-[#0F172A] focus:outline-none focus:ring-4 focus:ring-[#B7D1EA]/35"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-black text-gray-100">{lead.customerName}</span>
                    <span className="mt-1 block truncate text-xs font-bold text-gray-400">
                      {formatDate(lead.createdAt)} · {lead.systemType.replace("_", " ")}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="rounded-full bg-[#B7D1EA]/35 px-2.5 py-1 text-[11px] font-black text-[#0369a1]">
                      {lead.targetSystemSize}
                    </span>
                    {value === lead.id ? <Check className="h-4 w-4 text-emerald-600" /> : null}
                  </span>
                </button>
              ))
            ) : (
              <div className="px-3 py-8 text-center">
                <LinkIcon className="mx-auto h-6 w-6 text-slate-300" />
                <p className="mt-3 text-sm font-black text-gray-300">No unresolved leads found</p>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
