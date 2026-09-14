"use client";

import React, { useMemo, useState, useEffect, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  Calendar,
  Check,
  Clipboard,
  Copy,
  FileText,
  Layers,
  Mail,
  Phone,
  Search,
  SlidersHorizontal,
  User,
  X,
  Zap,
  Clock3,
} from "@/components/ui/icons";
import { toast } from "sonner";
import {
  updateConsultationLeadStatus,
  type ConsultationLeadStaffStatus,
} from "@/app/actions/lead";
import { cn, formatPrice } from "@/lib/utils";
import { AdminBulkActionBar } from "@/components/admin/AdminBulkActionBar";
import { AdminSelectionCheckbox } from "@/components/admin/AdminSelectionCheckbox";
import { useAdminSelection } from "@/hooks/useAdminSelection";

type JsonRecord = Record<string, unknown>;

export type ClientConsultationLead = {
  id: string;
  customerName: string;
  email: string;
  phone: string;
  postalCode: string | null;
  targetSystemSize: string;
  systemType: "ON_GRID" | "HYBRID";
  addOns: string[];
  customerNotes: string | null;
  status: ConsultationLeadStaffStatus;
  dynamicCalculations: JsonRecord;
  rawPayload: JsonRecord;
  crmPayload: JsonRecord;
  legacyLeadId: string | null;
  createdAt: string;
  updatedAt: string;
  legacyLead: {
    id: string;
    location: string | null;
    notes: string | null;
    status: string;
  } | null;
};

const STATUS_OPTIONS: Array<{
  value: ConsultationLeadStaffStatus;
  label: string;
  className: string;
}> = [
  {
    value: "PENDING_STAFF_REVIEW",
    label: "New Lead",
    className: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  },
  {
    value: "ENGINEER_REVIEW",
    label: "Contacted/In Review",
    className: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  },
  {
    value: "PROPOSAL_SENT",
    label: "Quotation Sent via ERPNext",
    className: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  },
  {
    value: "CUSTOMER_APPROVED",
    label: "Customer Approved",
    className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  },
  {
    value: "REJECTED",
    label: "Rejected",
    className: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  },
];

const LEGACY_STATUS_LABEL: Record<string, string> = {
  NEW_LEAD: "New Lead",
  ARCHIVED: "Archived",
};

function normalizeStaffStatus(status: ConsultationLeadStaffStatus) {
  return status === "NEW_LEAD" ? "PENDING_STAFF_REVIEW" : status;
}

function getStatusLabel(status: ConsultationLeadStaffStatus) {
  return STATUS_OPTIONS.find((option) => option.value === normalizeStaffStatus(status))?.label
    ?? LEGACY_STATUS_LABEL[status]
    ?? status;
}

function getStatusClassName(status: ConsultationLeadStaffStatus) {
  return STATUS_OPTIONS.find((option) => option.value === normalizeStaffStatus(status))?.className
    ?? "bg-[#0B1121] text-gray-300 border-[#1E293B]";
}

function toRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function asString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => asString(item)).filter(Boolean);
  }

  if (typeof value === "string") {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }

  return [];
}

function getLeadSpecs(lead: ClientConsultationLead) {
  const dynamic = toRecord(lead.dynamicCalculations);
  const raw = toRecord(lead.rawPayload);
  const contact = toRecord(raw.customerContact);
  const summary = toRecord(dynamic.summary);
  const approxPanels = toRecord(dynamic.approxPanels);
  const approxPanelLabel = asString(approxPanels.label);
  const approxPanelMin = asNumber(approxPanels.min);
  const approxPanelMax = asNumber(approxPanels.max);
  const panelRange = approxPanelMin && approxPanelMax
    ? `${approxPanelMin} - ${approxPanelMax} panels`
    : "";
  const panelCount = asString(dynamic.panelCount)
    || asString(summary.panelCount)
    || approxPanelLabel
    || panelRange
    || asString(dynamic.panelEstimate);
  const addOns = lead.addOns.length
    ? lead.addOns
    : [
        ...asStringArray(dynamic.addOns),
        ...asStringArray(dynamic.smartAddOns),
      ];
  const monthlySavings = asNumber(dynamic.calculatedMonthlySavings)
    ?? asNumber(dynamic.estimatedMonthlySavings)
    ?? asNumber(dynamic.monthlySavings)
    ?? asNumber(summary.monthlySavings);
  const estimatedBudget = asNumber(dynamic.estimatedBudget)
    ?? asNumber(dynamic.totalPrice)
    ?? asNumber(summary.totalPrice)
    ?? asNumber(dynamic.systemPackagePrice);
  const payback = asNumber(dynamic.paybackPeriodYears) ?? asNumber(summary.paybackPeriodYears);

  return {
    systemSize: lead.targetSystemSize,
    systemType: lead.systemType === "HYBRID" ? "Hybrid" : "On-grid",
    inverterType: asString(dynamic.inverterType) || asString(dynamic.inverterProfile) || "-",
    panelCount: panelCount || "-",
    addOns: addOns.length ? addOns.join(", ") : "-",
    customerNotes: lead.customerNotes || asString(raw.remarks) || "-",
    postalCode: lead.postalCode || asString(contact.postalCode) || "-",
    monthlySavings: monthlySavings === null ? "-" : formatPrice(monthlySavings),
    estimatedBudget: estimatedBudget === null ? "-" : formatPrice(estimatedBudget),
    payback: payback === null ? "-" : `${payback.toFixed(1)} years`,
    preferredDateTime: asString(dynamic.preferredDateTime) || asString(raw.preferredDateTime) || "-",
    location: lead.legacyLead?.location || asString(raw.location) || "-",
  };
}

export default function QuotationsClient({ initialLeads }: { initialLeads: ClientConsultationLead[] }) {
  const [leads, setLeads] = useState(initialLeads);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | ConsultationLeadStaffStatus>("ALL");
  const [selectedLead, setSelectedLead] = useState<ClientConsultationLead | null>(null);
  const [updatingLeadId, setUpdatingLeadId] = useState<string | null>(null);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

  const filteredLeads = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return leads.filter((lead) => {
      const specs = getLeadSpecs(lead);
      const matchesSearch = !query || [
        lead.customerName,
        lead.email,
        lead.phone,
        lead.targetSystemSize,
        lead.customerNotes || "",
        specs.addOns,
      ].some((value) => value.toLowerCase().includes(query));
      const matchesStatus = statusFilter === "ALL"
        || normalizeStaffStatus(lead.status) === normalizeStaffStatus(statusFilter);

      return matchesSearch && matchesStatus;
    });
  }, [leads, searchQuery, statusFilter]);
  const selection = useAdminSelection(filteredLeads.map((lead) => lead.id));

  const counts = useMemo(() => ({
    total: leads.length,
    new: leads.filter((lead) => normalizeStaffStatus(lead.status) === "PENDING_STAFF_REVIEW").length,
    review: leads.filter((lead) => lead.status === "ENGINEER_REVIEW").length,
    sent: leads.filter((lead) => lead.status === "PROPOSAL_SENT").length,
    approved: leads.filter((lead) => lead.status === "CUSTOMER_APPROVED").length,
  }), [leads]);

  const handleStatusChange = async (
    leadId: string,
    status: ConsultationLeadStaffStatus,
  ) => {
    setUpdatingLeadId(leadId);
    try {
      const result = await updateConsultationLeadStatus(leadId, status);
      if (result.error) {
        toast.error(result.error);
        return;
      }

      setLeads((current) =>
        current.map((lead) => lead.id === leadId ? { ...lead, status } : lead),
      );
      setSelectedLead((current) =>
        current && current.id === leadId ? { ...current, status } : current,
      );
      toast.success("Updated lead status.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update status.");
    } finally {
      setUpdatingLeadId(null);
    }
  };

  const handleBulkStatusChange = async (status: ConsultationLeadStaffStatus) => {
    if (selection.selectedCount === 0) return;
    setIsBulkUpdating(true);
    try {
      const ids = selection.selectedIds;
      const settled = await Promise.allSettled(ids.map((leadId) => updateConsultationLeadStatus(leadId, status)));
      const succeededIds = ids.filter((id, index) => {
        const result = settled[index];
        return result?.status === "fulfilled" && !result.value.error;
      });
      const failedCount = ids.length - succeededIds.length;
      if (succeededIds.length > 0) {
        setLeads((current) => current.map((lead) => succeededIds.includes(lead.id) ? { ...lead, status } : lead));
        selection.clear();
      }
      if (failedCount > 0) toast.error(`${failedCount} lead(s) could not be updated.`);
      else toast.success(`${succeededIds.length} lead(s) moved to ${getStatusLabel(status)}.`);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to update selected leads.");
    } finally {
      setIsBulkUpdating(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-[#0F172A] px-3 py-1.5 text-xs font-black text-sky-700 shadow-none ring-1 ring-slate-200">
            <FileText className="h-4 w-4" />
            Quotations Q&M
          </div>
          <h1 className="mt-4 text-3xl font-black tracking-[-0.03em] text-gray-100 sm:text-4xl">
            Quotations & Leads
          </h1>
          <p className="mt-2 max-w-2xl text-sm font-medium leading-7 text-gray-400">
            Staff review queue for consultant-driven solar requests before ERPNext quotation generation.
          </p>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <MetricCard icon={<Clipboard className="h-5 w-5" />} label="Total" value={`${counts.total}`} />
        <MetricCard icon={<Zap className="h-5 w-5" />} label="New Lead" value={`${counts.new}`} />
        <MetricCard icon={<User className="h-5 w-5" />} label="In Review" value={`${counts.review}`} />
        <MetricCard icon={<FileText className="h-5 w-5" />} label="ERPNext Sent" value={`${counts.sent}`} />
        <MetricCard icon={<Check className="h-5 w-5" />} label="Approved" value={`${counts.approved}`} />
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-[#1E293B] bg-[#0F172A] p-4 shadow-none sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search customer, phone, kW, brand notes..."
            className="w-full rounded-xl border border-[#1E293B] bg-[#0B1121] py-2.5 pl-10 pr-4 text-sm font-semibold text-gray-100 outline-none transition focus:border-sky-300 focus:bg-[#0F172A] focus:ring-4 focus:ring-sky-100"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setStatusFilter("ALL")}
            className={cn(
              "rounded-full px-3 py-2 text-xs font-black transition",
              statusFilter === "ALL" ? "bg-slate-950 text-white" : "bg-[#0B1121] text-gray-400 hover:bg-[#0B1121]",
            )}
          >
            All
          </button>
          {STATUS_OPTIONS.map((status) => (
            <button
              key={status.value}
              type="button"
              onClick={() => setStatusFilter(status.value)}
              className={cn(
                "rounded-full px-3 py-2 text-xs font-black transition",
                statusFilter === status.value ? "bg-slate-950 text-white" : "bg-[#0B1121] text-gray-400 hover:bg-[#0B1121]",
              )}
            >
              {status.label}
            </button>
          ))}
        </div>
      </section>

      <AdminBulkActionBar
        selectedCount={selection.selectedCount}
        visibleCount={filteredLeads.length}
        allVisibleSelected={selection.allVisibleSelected}
        someVisibleSelected={selection.someVisibleSelected}
        onToggleVisible={selection.toggleVisible}
        onClear={selection.clear}
        isPending={isBulkUpdating}
        actions={[
          {
            id: "review",
            label: "Move to review",
            icon: Clock3,
            tone: "default",
            onClick: () => void handleBulkStatusChange("ENGINEER_REVIEW"),
          },
          {
            id: "quoted",
            label: "Mark quoted",
            icon: FileText,
            tone: "success",
            onClick: () => void handleBulkStatusChange("PROPOSAL_SENT"),
          },
          {
            id: "reject",
            label: "Reject",
            icon: X,
            tone: "danger",
            onClick: () => void handleBulkStatusChange("REJECTED"),
          },
        ]}
      />

      <section className="overflow-hidden rounded-2xl border border-[#1E293B] bg-[#0F172A] shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left">
            <thead className="border-b border-[#1E293B] bg-[#0B1121] text-xs font-black text-gray-400">
              <tr>
                <th className="w-14 px-5 py-4">
                  <AdminSelectionCheckbox
                    checked={selection.allVisibleSelected}
                    indeterminate={selection.someVisibleSelected}
                    disabled={filteredLeads.length === 0 || isBulkUpdating}
                    label="Select all visible consultation leads"
                    onChange={selection.toggleVisible}
                  />
                </th>
                <th className="px-5 py-4">วันที่</th>
                <th className="px-5 py-4">ลูกค้า</th>
                <th className="px-5 py-4">ขนาดระบบ</th>
                <th className="px-5 py-4">หมายเหตุ/แบรนด์ที่ต้องการ</th>
                <th className="px-5 py-4">สถานะ</th>
                <th className="px-5 py-4 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-14 text-center text-sm font-semibold text-gray-500">
                    No consultation leads found.
                  </td>
                </tr>
              ) : filteredLeads.map((lead) => {
                const specs = getLeadSpecs(lead);
                return (
                  <tr
                    key={lead.id}
                    onClick={() => setSelectedLead(lead)}
                    className="cursor-pointer transition hover:bg-[#0B1121]/80"
                  >
                    <td className="px-5 py-4 align-top" onClick={(event) => event.stopPropagation()}>
                      <AdminSelectionCheckbox
                        checked={selection.isSelected(lead.id)}
                        disabled={isBulkUpdating}
                        label={`Select consultation lead ${lead.customerName}`}
                        onChange={() => selection.toggle(lead.id)}
                      />
                    </td>
                    <td className="px-5 py-4 align-top">
                      <div className="flex items-center gap-2 text-sm font-bold text-gray-300">
                        <Calendar className="h-4 w-4 text-gray-500" />
                        {new Date(lead.createdAt).toLocaleDateString("th-TH", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </div>
                    </td>
                    <td className="px-5 py-4 align-top">
                      <p className="text-sm font-black text-gray-100">{lead.customerName}</p>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-gray-400">
                        <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{lead.email}</span>
                        <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{lead.phone}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 align-top">
                      <span className="rounded-full bg-[#B7D1EA]/35 px-3 py-1.5 text-xs font-black text-gray-100">
                        {lead.targetSystemSize}
                      </span>
                    </td>
                    <td className="max-w-xs px-5 py-4 align-top">
                      <p className="line-clamp-2 text-sm font-semibold leading-6 text-gray-300">
                        {specs.customerNotes === "-" ? "ไม่มีหมายเหตุเพิ่มเติม" : specs.customerNotes}
                      </p>
                    </td>
                    <td className="px-5 py-4 align-top">
                      <StatusSelect
                        leadId={lead.id}
                        value={normalizeStaffStatus(lead.status)}
                        disabled={updatingLeadId === lead.id}
                        onChange={handleStatusChange}
                      />
                    </td>
                    <td className="px-5 py-4 text-right align-top">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedLead(lead);
                        }}
                        className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white transition hover:bg-sky-700"
                      >
                        <SlidersHorizontal className="h-4 w-4" />
                        Open
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {selectedLead && typeof document !== "undefined" ? createPortal(
        <LeadDrawer
          lead={selectedLead}
          updating={updatingLeadId === selectedLead.id}
          onClose={() => setSelectedLead(null)}
          onStatusChange={handleStatusChange}
        />,
        document.body,
      ) : null}
    </div>
  );
}

function StatusSelect({
  leadId,
  value,
  disabled,
  onChange,
}: {
  leadId: string;
  value: ConsultationLeadStaffStatus;
  disabled: boolean;
  onChange: (leadId: string, status: ConsultationLeadStaffStatus) => void;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => onChange(leadId, event.target.value as ConsultationLeadStaffStatus)}
      className={cn(
        "min-w-[210px] rounded-xl border px-3 py-2 text-xs font-black outline-none transition focus:ring-4 focus:ring-sky-100 disabled:cursor-wait disabled:opacity-60",
        getStatusClassName(value),
      )}
    >
      {STATUS_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function LeadDrawer({
  lead,
  updating,
  onClose,
  onStatusChange,
}: {
  lead: ClientConsultationLead;
  updating: boolean;
  onClose: () => void;
  onStatusChange: (leadId: string, status: ConsultationLeadStaffStatus) => void;
}) {
  const specs = getLeadSpecs(lead);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close consultation lead drawer"
        className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <aside className="relative z-50 flex h-full w-full max-w-2xl flex-col overflow-y-auto border-l border-[#1E293B] bg-[#0F172A] p-6 shadow-none">
        <div className="flex items-start justify-between gap-4 border-b border-[#1E293B] pb-5">
          <div>
            <p className="text-xs font-black text-sky-700">ConsultationLead</p>
            <h2 className="mt-1 text-2xl font-black tracking-[-0.02em] text-gray-100">
              {lead.customerName}
            </h2>
            <p className="mt-1 text-xs font-semibold text-gray-400">
              {lead.id}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-[#0B1121] p-2 text-gray-400 transition hover:bg-[#0B1121] hover:text-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-6 grid gap-4">
          <section className="rounded-2xl bg-[#0F172A] p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-black text-gray-100">Staff Status</h3>
                <p className="mt-1 text-xs font-semibold text-gray-400">
                  Current stage: {getStatusLabel(lead.status)}
                </p>
              </div>
              <StatusSelect
                leadId={lead.id}
                value={normalizeStaffStatus(lead.status)}
                disabled={updating}
                onChange={onStatusChange}
              />
            </div>
          </section>

          <section className="rounded-2xl border border-[#1E293B] p-5">
            <h3 className="flex items-center gap-2 text-sm font-black text-gray-100">
              <User className="h-4 w-4 text-sky-700" />
              Customer Contact
            </h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <DetailField label="Email" value={lead.email} />
              <DetailField label="Phone" value={lead.phone} />
              <DetailField label="Postal Code" value={specs.postalCode} />
              <DetailField label="Preferred Time" value={specs.preferredDateTime} />
              <DetailField label="Location" value={specs.location} wide />
            </div>
          </section>

          <section className="rounded-2xl border border-[#1E293B] p-5">
            <h3 className="flex items-center gap-2 text-sm font-black text-gray-100">
              <Copy className="h-4 w-4 text-sky-700" />
              ERPNext Copy Fields
            </h3>
            <div className="mt-4 divide-y divide-slate-100 rounded-2xl bg-[#0B1121]">
              <CopySpecRow label="System Size" value={specs.systemSize} />
              <CopySpecRow label="Panel Count" value={specs.panelCount} />
              <CopySpecRow label="Add-ons" value={specs.addOns} />
              <CopySpecRow label="Customer Notes" value={specs.customerNotes} />
            </div>
          </section>

          <section className="rounded-2xl border border-[#1E293B] p-5">
            <h3 className="flex items-center gap-2 text-sm font-black text-gray-100">
              <Layers className="h-4 w-4 text-sky-700" />
              Calculated Specifications
            </h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <DetailField label="System Type" value={specs.systemType} />
              <DetailField label="Inverter Type" value={specs.inverterType} />
              <DetailField label="Calculated Monthly Savings" value={specs.monthlySavings} />
              <DetailField label="Estimated Budget" value={specs.estimatedBudget} />
              <DetailField label="Payback" value={specs.payback} />
              <DetailField label="Raw Add-ons" value={specs.addOns} wide />
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#1E293B] bg-[#0F172A] p-4 shadow-none">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#B7D1EA]/30 text-sky-800">
          {icon}
        </div>
        <div>
          <p className="text-xs font-black text-gray-400">{label}</p>
          <p className="text-xl font-black text-gray-100">{value}</p>
        </div>
      </div>
    </div>
  );
}

function DetailField({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className={cn("rounded-xl bg-[#0B1121] p-4", wide && "sm:col-span-2")}>
      <p className="text-xs font-black text-gray-400">{label}</p>
      <p className="mt-1 break-words text-sm font-bold leading-6 text-gray-100">{value || "-"}</p>
    </div>
  );
}

function CopySpecRow({ label, value }: { label: string; value: string }) {
  const copyValue = async () => {
    try {
      await navigator.clipboard.writeText(value === "-" ? "" : value);
      toast.success(`Copied ${label}.`);
    } catch {
      toast.error("Clipboard permission was not available.");
    }
  };

  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <p className="text-xs font-black text-gray-400">{label}</p>
        <p className="mt-1 break-words text-sm font-bold leading-6 text-gray-100">{value}</p>
      </div>
      <button
        type="button"
        onClick={copyValue}
        className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0F172A] text-gray-400 shadow-none ring-1 ring-slate-200 transition hover:text-sky-700 hover:ring-sky-200"
        aria-label={`Copy ${label}`}
      >
        <Copy className="h-4 w-4" />
      </button>
    </div>
  );
}
