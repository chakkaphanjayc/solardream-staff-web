"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  FileText,
  Search,
  Send,
  ShieldCheck,
  X,
} from "@/components/ui/icons";
import { toast } from "sonner";

import { dispatchQuotationForSigning } from "@/app/actions/quotationDispatch";
import { cn, formatPrice } from "@/lib/utils";
import { GsapReveal, GsapSpinner } from "@/components/ui/GsapMotion";

export type QuotationDispatchRow = {
  id: string;
  erpnextQuotationId: string | null;
  status: string;
  dispatchStatus: "PENDING_DISPATCH" | "DISPATCHED" | "SIGNED" | "EXPIRED";
  systemSizeKwp: number;
  totalPrice: number;
  pdfUrl: string | null;
  magicTokenSlug: string;
  wizardLeadId: string | null;
  createdAt: string;
  customer: {
    name: string;
    email: string;
    phoneNumber: string | null;
  };
};

export type LinkableLeadRow = {
  id: string;
  customerName: string;
  email: string;
  phone: string;
  targetSystemSize: string;
  systemType: "ON_GRID" | "HYBRID";
  status: string;
  createdAt: string;
};

type DispatchSuccess = {
  quotationId: string;
  customerName: string;
  magicLink: string;
};

type StaffSigningSession = {
  proposalId: string;
  quotationId: string;
  customerName: string;
  magicLink: string;
  phase: "READY_FOR_CUSTOMER";
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
}

function normalize(value: string | null | undefined) {
  return (value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function normalizePhone(value: string | null | undefined) {
  return (value || "").replace(/\D/g, "");
}

function leadMatchScore(quotation: QuotationDispatchRow, lead: LinkableLeadRow) {
  const quoteName = normalize(quotation.customer.name);
  const leadName = normalize(lead.customerName);
  const quotePhone = normalizePhone(quotation.customer.phoneNumber);
  const leadPhone = normalizePhone(lead.phone);

  let score = 0;
  if (quotePhone && leadPhone && (quotePhone === leadPhone || quotePhone.endsWith(leadPhone) || leadPhone.endsWith(quotePhone))) {
    score += 100;
  }
  if (quoteName && leadName && (quoteName === leadName || quoteName.includes(leadName) || leadName.includes(quoteName))) {
    score += 60;
  }
  if (normalize(quotation.customer.email) && normalize(quotation.customer.email) === normalize(lead.email)) {
    score += 40;
  }
  return score;
}

function sortLeadsForQuotation(quotation: QuotationDispatchRow, leads: LinkableLeadRow[]) {
  return [...leads].sort((first, second) => {
    const scoreDiff = leadMatchScore(quotation, second) - leadMatchScore(quotation, first);
    if (scoreDiff !== 0) return scoreDiff;
    return new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime();
  });
}

export default function QuotationLinkerDispatchTable({
  initialQuotations,
  unresolvedLeads,
}: {
  initialQuotations: QuotationDispatchRow[];
  unresolvedLeads: LinkableLeadRow[];
}) {
  const [quotations, setQuotations] = useState(initialQuotations);
  const [leadSelections, setLeadSelections] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialQuotations.map((quotation) => [quotation.id, quotation.wizardLeadId || ""])),
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [success, setSuccess] = useState<DispatchSuccess | null>(null);
  const [staffSigning, setStaffSigning] = useState<StaffSigningSession | null>(null);
  const [busyQuotationId, setBusyQuotationId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const filteredQuotations = useMemo(() => {
    const query = normalize(searchQuery);
    if (!query) return quotations;
    return quotations.filter((quotation) =>
      [
        quotation.customer.name,
        quotation.customer.email,
        quotation.customer.phoneNumber || "",
        quotation.erpnextQuotationId || "",
        quotation.id,
      ].some((value) => normalize(value).includes(query)),
    );
  }, [quotations, searchQuery]);

  const dispatchQuotation = (quotation: QuotationDispatchRow) => {
    const selectedLeadId = leadSelections[quotation.id] || "";
    if (!selectedLeadId) {
      toast.error("Select a Wizard Lead or Consultation Lead before dispatch.");
      return;
    }

    setBusyQuotationId(quotation.id);
    startTransition(async () => {
      try {
        const result = await dispatchQuotationForSigning(quotation.id, selectedLeadId);

        if (!result.success) {
          toast.error(result.error);
          return;
        }

        setQuotations((current) =>
          current.map((row) =>
            row.id === quotation.id
              ? { ...row, status: "AWAITING_CLIENT_SIGNATURE", dispatchStatus: "DISPATCHED" }
              : row,
          ),
        );
        setSuccess(null);
        setStaffSigning({
          proposalId: result.proposalId,
          quotationId: quotation.erpnextQuotationId || quotation.id,
          customerName: quotation.customer.name,
          magicLink: result.magicLink,
          phase: "READY_FOR_CUSTOMER",
        });
        toast.success("Customer portal link is ready.");
      } catch (error) {
        console.error("Quotation dispatch error:", error);
        toast.error("Could not dispatch the quotation. Please try again.");
      } finally {
        setBusyQuotationId(null);
      }
    });
  };

  const copyMagicLink = async (link: string) => {
    await navigator.clipboard.writeText(link);
    toast.success("Magic link copied.");
  };

  return (
    <div className="space-y-5">
      <header className="rounded-2xl bg-[#0F172A] p-5 shadow-none sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-[#B7D1EA]/35 px-3 py-1.5 text-xs font-black text-[#0369a1]">
              <FileText className="h-4 w-4" />
              ERPNext quotations
            </div>
            <h1 className="mt-4 text-2xl font-black tracking-tight text-gray-100 sm:text-3xl">
              Quotation Linker & Dispatcher
            </h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-gray-400">
              Match finalized ERPNext quotations with website leads and copy the guest customer link.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:flex">
            <Metric label="Pending quotes" value={String(quotations.length)} />
            <Metric label="Open leads" value={String(unresolvedLeads.length)} />
          </div>
        </div>
      </header>

      {success ? (
        <GsapReveal className="rounded-2xl bg-emerald-500/10 p-5 text-emerald-950 ring-1 ring-emerald-200">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-black">Dispatched: {success.quotationId}</p>
                <p className="mt-1 text-sm font-semibold text-emerald-800">{success.customerName}</p>
                <p className="mt-3 break-all rounded-xl bg-[#0F172A] px-3 py-2 font-mono text-xs font-bold text-gray-100">
                  {success.magicLink}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => copyMagicLink(success.magicLink)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white transition hover:bg-[#0369a1] focus:outline-none focus:ring-4 focus:ring-emerald-200"
              >
                <Copy className="h-4 w-4" />
                คัดลอกลิงก์ส่งให้ลูกค้าผ่าน LINE แชท 🔗
              </button>
            </div>
          </div>
        </GsapReveal>
      ) : null}

      <section className="rounded-2xl bg-[#0F172A] p-4 shadow-none">
        <div className="relative w-full sm:max-w-md">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search quotation, customer, phone, email"
            className="min-h-11 w-full rounded-xl bg-[#0F172A] py-2.5 pl-10 pr-4 text-sm font-semibold text-gray-100 outline-none transition placeholder:text-gray-400 focus:bg-[#0F172A] focus:ring-4 focus:ring-[#B7D1EA]/45"
          />
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl bg-[#0F172A] shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-left">
            <thead className="bg-[#0F172A] text-xs font-black text-gray-400">
              <tr>
                <th className="px-5 py-4">ERPNext quote</th>
                <th className="px-5 py-4">Customer</th>
                <th className="px-5 py-4">System</th>
                <th className="px-5 py-4">Lead match</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4 text-right">Dispatch</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredQuotations.length > 0 ? (
                filteredQuotations.map((quotation) => {
                  const selectedLeadId = leadSelections[quotation.id] || "";
                  const selectedLead = unresolvedLeads.find((lead) => lead.id === selectedLeadId) || null;
                  const suggestedLeads = sortLeadsForQuotation(quotation, unresolvedLeads);
                  const busy = busyQuotationId === quotation.id && isPending;
                  const awaitingStaff = quotation.status === "AWAITING_STAFF_SIGNATURE";

                  return (
                    <tr key={quotation.id} className="align-top transition hover:bg-[#F8F7F4]">
                      <td className="px-5 py-4">
                        <p className="font-mono text-sm font-black text-gray-100">
                          {quotation.erpnextQuotationId || quotation.id.slice(0, 10)}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-gray-400">{formatDate(quotation.createdAt)}</p>
                        {quotation.pdfUrl ? (
                          <a
                            href={quotation.pdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#0B1121] px-3 py-1.5 text-xs font-black text-gray-300 transition hover:text-[#0369a1]"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            PDF
                          </a>
                        ) : null}
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-sm font-black text-gray-100">{quotation.customer.name}</p>
                        <p className="mt-1 text-xs font-semibold text-gray-400">{quotation.customer.email}</p>
                        <p className="mt-1 text-xs font-semibold text-gray-400">{quotation.customer.phoneNumber || "No phone"}</p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-sm font-black text-gray-100">{quotation.systemSizeKwp.toFixed(2)} kW</p>
                        <p className="mt-1 text-xs font-bold text-gray-400">{formatPrice(quotation.totalPrice)}</p>
                      </td>
                      <td className="px-5 py-4">
                        <LeadCombobox
                          quotation={quotation}
                          leads={suggestedLeads}
                          selectedLead={selectedLead}
                          value={selectedLeadId}
                          onChange={(leadId) =>
                            setLeadSelections((current) => ({
                              ...current,
                              [quotation.id]: leadId,
                            }))
                          }
                        />
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-flex rounded-full bg-amber-500/10 px-3 py-1.5 text-xs font-black text-amber-700">
                          {awaitingStaff ? "AWAITING_STAFF_SIGNATURE" : quotation.dispatchStatus}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => dispatchQuotation(quotation)}
                          disabled={busy || !selectedLeadId || awaitingStaff}
                          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#0369a1] px-4 py-2.5 text-sm font-black text-white transition hover:bg-[#0284c7] focus:outline-none focus:ring-4 focus:ring-[#B7D1EA]/45 disabled:cursor-not-allowed disabled:bg-slate-300"
                        >
                          {busy ? <GsapSpinner className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                          {awaitingStaff ? "รอเจ้าหน้าที่ลงนาม" : "สร้างสิทธิ์และอนุมัติเอกสาร"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="px-5 py-14 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#B7D1EA]/35 text-[#0369a1]">
                      <Check className="h-6 w-6" />
                    </div>
                    <p className="mt-4 text-sm font-black text-gray-100">No pending ERPNext quotations</p>
                    <p className="mt-1 text-sm font-semibold text-gray-400">Finalized quotations with PENDING_DISPATCH status will appear here.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {staffSigning ? (
        <StaffSigningModal
          session={staffSigning}
          onClose={() => setStaffSigning(null)}
          onCopy={copyMagicLink}
        />
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[#0F172A] px-4 py-3">
      <p className="text-xs font-black text-gray-400">{label}</p>
      <p className="mt-1 text-xl font-black text-gray-100">{value}</p>
    </div>
  );
}

function StaffSigningModal({
  session,
  onClose,
  onCopy,
}: {
  session: StaffSigningSession;
  onClose: () => void;
  onCopy: (link: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/45 px-3 py-4 backdrop-blur-sm sm:px-6">
      <div className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-[#0F172A] shadow-none">
        <header className="flex shrink-0 items-start justify-between gap-4 bg-[#0F172A] px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-black text-[#0369a1]">SolarDream staff approval</p>
            <h2 className="mt-1 text-xl font-black text-gray-100">
              Client magic link is ready
            </h2>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-gray-300">
              สามารถคัดลอกลิงก์เพื่อส่งให้ลูกค้าทาง LINE แชทได้ทันที
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0F172A] text-gray-400 transition hover:text-gray-100 focus:outline-none focus:ring-4 focus:ring-[#B7D1EA]/45"
            aria-label="Close staff signing modal"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex flex-1 items-center justify-center p-5 sm:p-8">
            <section className="w-full max-w-3xl rounded-2xl bg-[#0F172A] p-6 text-center shadow-none sm:p-8">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-700">
                <ShieldCheck className="h-7 w-7" />
              </div>
              <h3 className="mt-5 text-2xl font-black text-gray-100">{session.customerName}</h3>
              <p className="mt-2 text-sm font-semibold text-gray-400">{session.quotationId}</p>
              <p className="mt-5 break-all rounded-xl bg-[#0F172A] px-4 py-3 font-mono text-sm font-bold text-gray-100">
                {session.magicLink}
              </p>
              <div className="mt-5 flex flex-col justify-center gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => onCopy(session.magicLink)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0369a1] px-5 py-3 text-sm font-black text-white transition hover:bg-[#0284c7] focus:outline-none focus:ring-4 focus:ring-[#B7D1EA]/45"
                >
                  <Copy className="h-4 w-4" />
                  คัดลอกลิงก์ส่งให้ลูกค้าผ่าน LINE แชท 🔗
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-200"
                >
                  Close
                </button>
              </div>
            </section>
        </div>
      </div>
    </div>
  );
}

function LeadCombobox({
  quotation,
  leads,
  value,
  selectedLead,
  onChange,
}: {
  quotation: QuotationDispatchRow;
  leads: LinkableLeadRow[];
  value: string;
  selectedLead: LinkableLeadRow | null;
  onChange: (leadId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filteredLeads = useMemo(() => {
    const cleanQuery = normalize(query);
    return leads
      .filter((lead) => {
        if (!cleanQuery) return true;
        return [
          lead.customerName,
          lead.email,
          lead.phone,
          lead.targetSystemSize,
        ].some((valueToSearch) => normalize(valueToSearch).includes(cleanQuery));
      })
      .slice(0, 20);
  }, [leads, query]);

  return (
    <div className="relative min-w-[280px]">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl bg-[#0F172A] px-3 py-2 text-left transition focus:outline-none focus:ring-4 focus:ring-[#B7D1EA]/45"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-black text-gray-100">
            {selectedLead ? selectedLead.customerName : "Select lead"}
          </span>
          <span className="mt-0.5 block truncate text-xs font-semibold text-gray-400">
            {selectedLead ? `${selectedLead.phone} · ${selectedLead.targetSystemSize}` : "Suggested by phone or name"}
          </span>
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-gray-400 transition", open && "rotate-180")} />
      </button>

      {open ? (
        <div className="fixed inset-x-3 top-24 z-50 rounded-2xl bg-[#0F172A] p-3 shadow-none ring-1 ring-slate-200 sm:absolute sm:inset-x-0 sm:top-[calc(100%+0.5rem)]">
          <div className="flex items-center gap-2 rounded-xl bg-[#0F172A] px-3 py-2">
            <Search className="h-4 w-4 text-[#0369a1]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoFocus
              placeholder="Search leads"
              className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-gray-100 outline-none placeholder:text-gray-400"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="rounded-full p-1 text-gray-400 transition hover:bg-[#0B1121] hover:text-gray-100"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          <div className="mt-2 max-h-72 overflow-y-auto">
            {filteredLeads.length > 0 ? filteredLeads.map((lead) => {
              const score = leadMatchScore(quotation, lead);
              return (
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
                    <span className="mt-1 block truncate text-xs font-semibold text-gray-400">
                      {lead.phone} · {formatDate(lead.createdAt)} · {lead.targetSystemSize}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    {score > 0 ? (
                      <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] font-black text-emerald-700">
                        Match
                      </span>
                    ) : null}
                    {value === lead.id ? <Check className="h-4 w-4 text-emerald-600" /> : null}
                  </span>
                </button>
              );
            }) : (
              <div className="px-3 py-8 text-center text-sm font-semibold text-gray-400">
                No unresolved leads found.
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
