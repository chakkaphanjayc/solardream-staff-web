"use client";

import React, { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Inbox,
  Search,
  Plus,
  Filter,
  FileCheck2,
  Clock,
  Phone,
  Mail,
  Tag,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Sparkles,
  X,
  ExternalLink,
  Link2,
  MessageSquare,
  Building2,
  Globe2,
  UserCheck,
  FileText,
  Send,
  Loader2,
  Copy,
  Check,
  MessageCircle,
  ChevronDown,
  ChevronUp,
  Zap,
  Flame,
  User,
} from "@/components/ui/icons";
import type {
  InboundRequestItem,
  InboundRequestType,
  InboundRequestStatus,
} from "@/app/actions/inboundRequests";
import {
  createAdminInboundRequest,
  updateInboundRequestStatus,
  addInboundRequestNote,
  generateQuotationFromInboundRequest,
  verifyInboundRequestErpSync,
} from "@/app/actions/inboundRequests";
import { getSalesPipelineAuditLogs } from "@/app/actions/salesPipeline";
import { cn } from "@/lib/utils";
import { AdminBulkActionBar } from "@/components/admin/AdminBulkActionBar";
import { AdminSelectionCheckbox } from "@/components/admin/AdminSelectionCheckbox";
import { useAdminSelection } from "@/hooks/useAdminSelection";
import {
  AuditLogSidebar,
  AuditLogTrigger,
  type AuditTimelineItem,
} from "@/components/ui/AuditLogSidebar";

type Props = {
  initialRequests: InboundRequestItem[];
  erpnextBaseUrl: string;
};

function getErpnextLeadUrl(erpnextBaseUrl: string, erpnextLeadId: string | null): string {
  if (!erpnextBaseUrl || !erpnextLeadId) {
    return "";
  }

  return `${erpnextBaseUrl.replace(/\/$/, "")}/app/lead/${encodeURIComponent(erpnextLeadId)}`;
}

type RequestDetail = {
  label: string;
  value: string;
};

function getRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function findPayloadValue(value: unknown, keys: readonly string[], depth = 0): unknown {
  if (depth > 3) {
    return undefined;
  }

  const record = getRecord(value);
  if (!record) {
    return undefined;
  }

  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null && record[key] !== "") {
      return record[key];
    }
  }

  for (const nestedValue of Object.values(record)) {
    const nestedResult = findPayloadValue(nestedValue, keys, depth + 1);
    if (nestedResult !== undefined) {
      return nestedResult;
    }
  }

  return undefined;
}

function formatPayloadValue(value: unknown, currency = false): string {
  if (typeof value === "number") {
    return currency
      ? `฿${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
      : value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }

  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => formatPayloadValue(entry)).filter(Boolean).join(", ");
  }

  return "";
}

function getRequestDetails(payload: Record<string, unknown>): RequestDetail[] {
  const definitions: Array<{ label: string; keys: string[]; currency?: boolean }> = [
    { label: "Target System Size", keys: ["systemSizeKwp", "targetSystemSize", "sizeKwp", "recommendedSizeKw", "kwp"] },
    { label: "Budget", keys: ["totalPrice", "estimatedPrice", "budget", "estimatedBudget"], currency: true },
    { label: "Inverter", keys: ["inverter", "inverterBrand", "inverterTech"] },
    { label: "Roof", keys: ["roof", "roofType"] },
    { label: "Services", keys: ["services", "selectedServices", "addOns"] },
    { label: "Monthly Bill Savings", keys: ["monthlyBill", "billAmount", "estimatedSavingsMonthly"], currency: true },
    { label: "Contact Time", keys: ["preferredDateTime", "preferredContactTime"] },
    { label: "Notes", keys: ["notes", "customerNotes"] },
  ];

  return definitions.flatMap(({ label, keys, currency }) => {
    const formatted = formatPayloadValue(findPayloadValue(payload, keys), currency);
    return formatted ? [{ label, value: formatted }] : [];
  });
}

function getLeadIntentBadge(payload: Record<string, unknown>) {
  const kwpVal = findPayloadValue(payload, ["systemSizeKwp", "targetSystemSize", "recommendedSizeKw", "sizeKwp", "kwp"]);
  const numKwp = typeof kwpVal === "number" ? kwpVal : parseFloat(String(kwpVal || 0));
  if (numKwp >= 10) {
    return { label: "High Intent Commercial Tier", color: "text-amber-400 bg-amber-500/10 border-amber-500/30", icon: "🔥" };
  } else if (numKwp >= 5) {
    return { label: "Hot Residential Tier", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30", icon: "⚡" };
  }
  return { label: "Standard Solar Inquiry", color: "text-[#B7D1EA] bg-[#B7D1EA]/10 border-[#B7D1EA]/30", icon: "☀️" };
}

function getWhatsAppUrl(phone: string, customerName: string) {
  const cleanPhone = phone.replace(/[^0-9]/g, "");
  const formattedPhone = cleanPhone.startsWith("0") ? `66${cleanPhone.slice(1)}` : cleanPhone;
  const message = encodeURIComponent(`สวัสดีครับคุณ ${customerName} จากทีมงาน SolarDream ขออนุญาตส่งข้อมูลใบเสนอราคาครับ`);
  return `https://wa.me/${formattedPhone}?text=${message}`;
}

export default function InboundRequestsClient({ initialRequests, erpnextBaseUrl }: Props) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("InboundRequests");
  const [requests, setRequests] = useState<InboundRequestItem[]>(initialRequests);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Modals & Drawers
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<InboundRequestItem | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [checkingErpRequestId, setCheckingErpRequestId] = useState<string | null>(null);
  const [newNoteInput, setNewNoteInput] = useState("");
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [isAdvancedDetailsOpen, setIsAdvancedDetailsOpen] = useState(false);
  const [copiedLead, setCopiedLead] = useState(false);
  const [auditSidebar, setAuditSidebar] = useState<{
    title: string;
    entityLabel: string;
    logs: AuditTimelineItem[];
    isLoading: boolean;
  } | null>(null);
  const auditLoadRef = useRef(0);

  const openAuditSidebar = (request: InboundRequestItem) => {
    const requestId = auditLoadRef.current + 1;
    auditLoadRef.current = requestId;
    setAuditSidebar({
      title: "Lead activity",
      entityLabel: `${request.customerName} · #${request.id.slice(0, 8).toUpperCase()}`,
      logs: [],
      isLoading: true,
    });

    void getSalesPipelineAuditLogs(
      [request.id, request.quotationId, request.consultationLeadId].filter(
        (id): id is string => Boolean(id),
      ),
    )
      .then((result) => {
        if (requestId !== auditLoadRef.current) return;
        setAuditSidebar((current) => current
          ? { ...current, logs: result.success ? result.logs : [], isLoading: false }
          : null);
      })
      .catch((error: unknown) => {
        if (requestId !== auditLoadRef.current) return;
        console.error("Failed to load lead audit logs:", error);
        setAuditSidebar((current) => current ? { ...current, isLoading: false } : null);
      });
  };

  const selectedErpnextLeadUrl = selectedRequest?.erpnextSyncStatus === "SYNCED"
    ? getErpnextLeadUrl(erpnextBaseUrl, selectedRequest.erpnextLeadId)
    : "";

  // Create Form State
  const [createName, setCreateName] = useState("");
  const [createPhone, setCreatePhone] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createType, setCreateType] = useState<InboundRequestType>("WIZARD");
  const [createSource, setCreateSource] = useState("manual");
  const [createNotes, setCreateNotes] = useState("");
  const [createCompanyName, setCreateCompanyName] = useState("");
  const [createTerritory, setCreateTerritory] = useState("Thailand");
  const [createCity, setCreateCity] = useState("");
  const [createPostalCode, setCreatePostalCode] = useState("");
  const [createContactMethod, setCreateContactMethod] = useState("Phone");

  // Replace local row state only after fresh server data arrives from router.refresh().
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setRequests(initialRequests);
      setSelectedRequest((current) => current
        ? initialRequests.find((request) => request.id === current.id) ?? null
        : null);
    });

    return () => {
      cancelled = true;
    };
  }, [initialRequests]);

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName.trim() || !createPhone.trim()) {
      toast.error("Customer name and phone number are required.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await createAdminInboundRequest({
          customerName: createName,
          phone: createPhone,
          email: createEmail || null,
          requestType: createType,
          source: createSource,
          payload: {
            notes: createNotes,
            createdByStaff: true,
          },
          leadProfile: {
            companyName: createCompanyName || null,
            territory: createTerritory || "Thailand",
            city: createCity || null,
            postalCode: createPostalCode || null,
            preferredContactMethod: createContactMethod || null,
          },
        });

        if (res.success && res.request) {
          toast.success("Inbound request created & synced to ERPNext!");
          setRequests((prev) => [res.request!, ...prev]);
          setIsCreateModalOpen(false);
          setCreateName("");
          setCreatePhone("");
          setCreateEmail("");
          setCreateNotes("");
          setCreateCompanyName("");
          setCreateTerritory("Thailand");
          setCreateCity("");
          setCreatePostalCode("");
          setCreateContactMethod("Phone");
        } else {
          toast.error(res.error || "Failed to create request.");
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to create request.");
      }
    });
  };

  const handleStatusChange = (id: string, newStatus: InboundRequestStatus) => {
    startTransition(async () => {
      try {
        const res = await updateInboundRequestStatus(id, newStatus);
        if (res.success) {
          toast.success(`Request status updated to ${newStatus} & synced to ERPNext!`);
          setRequests((prev) =>
            prev.map((item) => (item.id === id ? { ...item, status: newStatus } : item))
          );
          if (selectedRequest && selectedRequest.id === id) {
            setSelectedRequest({ ...selectedRequest, status: newStatus });
          }
        } else {
          toast.error(res.error || "Failed to update status.");
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update status.");
      }
    });
  };

  const handleAddNote = async (id: string) => {
    if (!newNoteInput.trim()) return;
    setIsAddingNote(true);
    try {
      const res = await addInboundRequestNote(id, newNoteInput.trim());
      if (res.success) {
        toast.success("Note added & synced to ERPNext!");
        setRequests((prev) =>
          prev.map((item) => {
            if (item.id === id) {
              const payload = (item.payload as Record<string, unknown>) || {};
              const existingNotes = (payload.notesHistory as Array<{ text: string; date: string }>) || [];
              const updatedHistory = [{ text: newNoteInput.trim(), date: new Date().toISOString() }, ...existingNotes];
              return {
                ...item,
                payload: { ...payload, notesHistory: updatedHistory, latestNote: newNoteInput.trim() },
              };
            }
            return item;
          })
        );
        if (selectedRequest && selectedRequest.id === id) {
          const payload = (selectedRequest.payload as Record<string, unknown>) || {};
          const existingNotes = (payload.notesHistory as Array<{ text: string; date: string }>) || [];
          const updatedHistory = [{ text: newNoteInput.trim(), date: new Date().toISOString() }, ...existingNotes];
          setSelectedRequest({
            ...selectedRequest,
            payload: { ...payload, notesHistory: updatedHistory, latestNote: newNoteInput.trim() },
          });
        }
        setNewNoteInput("");
      } else {
        toast.error(res.error || "Failed to add note.");
      }
    } catch {
      toast.error("Failed to add note.");
    } finally {
      setIsAddingNote(false);
    }
  };

  const handleGenerateQuotation = (id: string) => {
    startTransition(async () => {
      try {
        const res = await generateQuotationFromInboundRequest(id);
        if (res.success && res.quotationId) {
          toast.success(
            res.erpnextQuotationName
              ? `Formal Quotation ${res.erpnextQuotationName} & Customer created in ERPNext!`
              : "Formal quotation generated successfully!"
          );
          setRequests((prev) =>
            prev.map((item) =>
              item.id === id
                ? { ...item, status: "QUOTED", quotationId: res.quotationId! }
                : item
            )
          );
          if (selectedRequest && selectedRequest.id === id) {
            setSelectedRequest({ ...selectedRequest, status: "QUOTED", quotationId: res.quotationId! });
          }
          router.push(`/admin/quotations?highlight=${res.quotationId}`);
        } else {
          toast.error(res.error || "Failed to generate quotation.");
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to generate quotation.");
      }
    });
  };

  const handleVerifyErp = async (id: string) => {
    setCheckingErpRequestId(id);

    try {
      const result = await verifyInboundRequestErpSync(id);
      const update = {
        erpnextLeadId: result.erpnextLeadId,
        erpnextSyncStatus: result.erpnextSyncStatus,
        erpnextSyncError: result.erpnextSyncError,
        erpnextLastSyncedAt: result.erpnextLastSyncedAt,
      };

      setRequests((previous) => previous.map((request) => (
        request.id === id ? { ...request, ...update } : request
      )));

      if (selectedRequest && selectedRequest.id === id) {
        setSelectedRequest({ ...selectedRequest, ...update });
      }

      if (result.erpnextSyncStatus === "SYNCED") {
        toast.success(`ERPNext Lead ${result.erpnextLeadId} verified & synced.`);
      } else {
        toast.error(result.erpnextSyncError || result.error || "ERPNext Lead verification failed.");
      }

      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ERPNext Lead verification failed.");
    } finally {
      setCheckingErpRequestId(null);
    }
  };

  const copyLeadToClipboard = (req: InboundRequestItem) => {
    const details = getRequestDetails(req.payload);
    const specText = details.map((d) => `• ${d.label}: ${d.value}`).join("\n");
    const summary = `📋 [SolarDream Inbound Lead]
👤 Customer: ${req.customerName}
📞 Phone: ${req.phone}
✉️ Email: ${req.email || "N/A"}
🏷️ Type/Source: ${req.requestType} (${req.source})
🏢 ERPNext profile: ${req.companyName || "Individual homeowner"} · ${req.territory} · ${req.preferredContactMethod || "Contact method not specified"}
⚡ Specifications:
${specText}
🔗 ERPNext ID: ${req.erpnextLeadId || "Pending Sync"}`;

    navigator.clipboard.writeText(summary);
    setCopiedLead(true);
    toast.success("Lead details copied to clipboard!");
    setTimeout(() => setCopiedLead(false), 2000);
  };

  // Filter requests
  const filteredRequests = requests.filter((item) => {
    const matchesSearch =
      item.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.phone.includes(searchQuery) ||
      (item.email && item.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
      item.source.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesType = typeFilter === "ALL" || item.requestType === typeFilter;
    const matchesStatus = statusFilter === "ALL" || item.status === statusFilter;

    return matchesSearch && matchesType && matchesStatus;
  });
  const selection = useAdminSelection(filteredRequests.map((request) => request.id));

  const handleBulkStatusChange = async (status: InboundRequestStatus) => {
    if (selection.selectedCount === 0) return;
    setIsBulkUpdating(true);
    try {
      const ids = selection.selectedIds;
      const settled = await Promise.allSettled(ids.map((id) => updateInboundRequestStatus(id, status)));
      const succeededIds = ids.filter((id, index) => {
        const result = settled[index];
        return result?.status === "fulfilled" && result.value.success;
      });
      const failedCount = ids.length - succeededIds.length;
      if (succeededIds.length > 0) {
        setRequests((current) => current.map((request) => succeededIds.includes(request.id) ? { ...request, status } : request));
        selection.clear();
      }
      if (failedCount > 0) toast.error(`${failedCount} request(s) could not be updated.`);
      else toast.success(`${succeededIds.length} request(s) moved to ${status}.`);
    } catch {
      toast.error("Failed to update selected requests.");
    } finally {
      setIsBulkUpdating(false);
    }
  };

  const totalCount = requests.length;
  const newCount = requests.filter((r) => r.status === "NEW").length;
  const contactedCount = requests.filter((r) => r.status === "CONTACTED").length;
  const quotedCount = requests.filter((r) => r.status === "QUOTED").length;

  return (
    <div className="min-h-screen bg-[#0B1121] text-slate-100 p-6 md:p-10 font-sans space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#B7D1EA]/10 border border-[#B7D1EA]/30 rounded-xl text-[#B7D1EA]">
              <Inbox className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
                {t("header.salesPipeline")} <span className="text-[#B7D1EA]">{t("header.quotationsCrm")}</span>
              </h1>
              <p className="text-xs uppercase tracking-widest font-mono text-slate-400 mt-1">
                {t("header.description")}
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsCreateModalOpen(true)}
          className="flex items-center gap-2 px-5 py-3 bg-[#B7D1EA] hover:bg-[#99BFE3] text-[#0F172A] rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>{t("actions.createManualRequest")}</span>
        </button>
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        <div className="bg-[#0F172A] border border-slate-800/80 rounded-2xl p-5 flex items-center justify-between shadow-xl">
          <div className="space-y-1">
            <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">
              {t("metrics.totalInboundLeads")}
            </span>
            <div className="text-3xl font-black text-white">{totalCount}</div>
          </div>
          <div className="p-3 bg-slate-800/50 rounded-xl text-slate-300">
            <Inbox className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-[#0F172A] border border-blue-950/60 rounded-2xl p-5 flex items-center justify-between shadow-xl">
          <div className="space-y-1">
            <span className="text-xs font-mono text-blue-400 uppercase tracking-wider flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" />
              {t("metrics.newUnprocessed")}
            </span>
            <div className="text-3xl font-black text-blue-400">{newCount}</div>
          </div>
          <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-400">
            <Clock className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-[#0F172A] border border-amber-950/60 rounded-2xl p-5 flex items-center justify-between shadow-xl">
          <div className="space-y-1">
            <span className="text-xs font-mono text-amber-400 uppercase tracking-wider">
              {t("metrics.contactedLeads")}
            </span>
            <div className="text-3xl font-black text-amber-400">{contactedCount}</div>
          </div>
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
            <Phone className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-[#0F172A] border border-emerald-950/60 rounded-2xl p-5 flex items-center justify-between shadow-xl">
          <div className="space-y-1">
            <span className="text-xs font-mono text-emerald-400 uppercase tracking-wider">
              {t("metrics.quotationIssued")}
            </span>
            <div className="text-3xl font-black text-emerald-400">{quotedCount}</div>
          </div>
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
            <FileCheck2 className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder={t("filters.searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#0B1121] border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#B7D1EA]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-xs font-mono text-slate-400 uppercase">{t("filters.type")}</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="bg-[#0B1121] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#B7D1EA]"
            >
              <option value="ALL">{t("filters.allTypes")}</option>
              <option value="WIZARD">{t("filters.solarWizard")}</option>
              <option value="BUILD">{t("filters.customBuild")}</option>
              <option value="SERVICE">{t("filters.serviceRepair")}</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-slate-400 uppercase">{t("filters.status")}</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-[#0B1121] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#B7D1EA]"
            >
              <option value="ALL">{t("filters.allStatuses")}</option>
              <option value="NEW">{t("statuses.new")}</option>
              <option value="CONTACTED">{t("statuses.contacted")}</option>
              <option value="QUOTED">{t("statuses.quoted")}</option>
              <option value="REJECTED">{t("statuses.rejected")}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Requests Table */}
      <AdminBulkActionBar
        selectedCount={selection.selectedCount}
        visibleCount={filteredRequests.length}
        allVisibleSelected={selection.allVisibleSelected}
        someVisibleSelected={selection.someVisibleSelected}
        onToggleVisible={selection.toggleVisible}
        onClear={selection.clear}
        isPending={isBulkUpdating}
        actions={[
          {
            id: "contacted",
            label: "Contacted",
            icon: Phone,
            tone: "default",
            onClick: () => void handleBulkStatusChange("CONTACTED"),
          },
          {
            id: "quoted",
            label: "Quoted",
            icon: CheckCircle2,
            tone: "success",
            onClick: () => void handleBulkStatusChange("QUOTED"),
          },
          {
            id: "rejected",
            label: "Reject",
            icon: X,
            tone: "danger",
            onClick: () => void handleBulkStatusChange("REJECTED"),
          },
        ]}
      />
      <div className="bg-[#0F172A] border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-[#0B1121] text-[10px] font-mono uppercase tracking-wider text-slate-400 border-b border-slate-800">
              <tr>
                <th className="p-4">
                  <AdminSelectionCheckbox
                    checked={selection.allVisibleSelected}
                    indeterminate={selection.someVisibleSelected}
                    disabled={filteredRequests.length === 0 || isBulkUpdating}
                    label="Select all visible inbound requests"
                    onChange={selection.toggleVisible}
                  />
                </th>
                <th className="p-4">{t("table.dateTime")}</th>
                <th className="p-4">{t("table.leadDetails")}</th>
                <th className="p-4">{t("table.configType")}</th>
                <th className="p-4">{t("table.sourceTracking")}</th>
                <th className="p-4">{t("table.status")}</th>
                <th className="p-4">{t("table.erpnextCrm")}</th>
                <th className="p-4 text-right">{t("table.actions")}</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-800/60">
              {filteredRequests.map((item) => {
                const details = getRequestDetails(item.payload);
                const kwpVal = findPayloadValue(item.payload, ["systemSizeKwp", "targetSystemSize", "recommendedSizeKw", "sizeKwp", "kwp"]);
                const formattedKwp = formatPayloadValue(kwpVal);
                const erpnextLeadUrl = item.erpnextSyncStatus === "SYNCED"
                  ? getErpnextLeadUrl(erpnextBaseUrl, item.erpnextLeadId)
                  : "";

                return (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-800/40 transition-colors cursor-pointer"
                    onClick={() => setSelectedRequest(item)}
                  >
                    <td className="p-4" onClick={(event) => event.stopPropagation()}>
                      <AdminSelectionCheckbox
                        checked={selection.isSelected(item.id)}
                        disabled={isBulkUpdating}
                        label={`Select inbound request ${item.customerName}`}
                        onChange={() => selection.toggle(item.id)}
                      />
                    </td>
                    <td className="p-4 font-mono text-[11px] text-slate-400">
                      {new Date(item.createdAt).toLocaleString(locale === "th" ? "th-TH" : "en-US", {
                        day: "numeric",
                        month: "numeric",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit"
                      })}
                    </td>

                    <td className="p-4">
                      <div className="font-bold text-white text-sm flex items-center gap-2">
                        <span>{item.customerName}</span>
                        {formattedKwp && (
                          <span className="text-xs font-extrabold text-[#B7D1EA] font-mono">
                            {formattedKwp} kWp
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-slate-400 font-mono text-[11px] mt-0.5">
                        <span className="flex items-center gap-1 text-emerald-400">
                          <Phone className="w-3 h-3" />
                          {item.phone}
                        </span>
                        {item.email && (
                          <span className="flex items-center gap-1 text-slate-400">
                            <Mail className="w-3 h-3 text-sky-400" />
                            <span className="truncate max-w-[140px]">{item.email}</span>
                          </span>
                        )}
                      </div>

                      {/* Technical Quick Summary */}
                      <div className="flex flex-wrap gap-2 mt-2 text-[10px] font-mono text-slate-400">
                        {details.slice(0, 4).map((d, i) => (
                          <span key={i} className="bg-[#0B1121] px-2 py-0.5 rounded border border-slate-800">
                            {d.label}: <strong className="text-slate-200">{d.value}</strong>
                          </span>
                        ))}
                      </div>
                    </td>

                    <td className="p-4">
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase font-bold px-2.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        <Tag className="w-2.5 h-2.5" />
                        {item.requestType}
                      </span>
                    </td>

                    <td className="p-4">
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono text-slate-300 px-2.5 py-0.5 rounded bg-slate-900 border border-slate-800">
                        <Globe2 className="w-2.5 h-2.5 text-[#B7D1EA]" />
                        {item.source}
                      </span>
                    </td>

                    <td className="p-4">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 text-[10px] font-black font-mono uppercase px-2.5 py-1 rounded-full border",
                          item.status === "NEW" && "bg-blue-500/10 text-blue-400 border-blue-500/20",
                          item.status === "CONTACTED" && "bg-amber-500/10 text-amber-400 border-amber-500/20",
                          item.status === "QUOTED" && "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
                          item.status === "REJECTED" && "bg-rose-500/10 text-rose-400 border-rose-500/20"
                        )}
                      >
                        {t(`statuses.${item.status.toLowerCase()}` as "statuses.new" | "statuses.contacted" | "statuses.quoted" | "statuses.rejected")}
                      </span>
                    </td>

                    <td className="p-4" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border",
                            item.erpnextSyncStatus === "SYNCED"
                              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                              : item.erpnextSyncStatus === "FAILED"
                              ? "border-rose-500/20 bg-rose-500/10 text-rose-400"
                              : "border-blue-500/20 bg-blue-500/10 text-blue-400"
                          )}
                        >
                          {t(`sync.${item.erpnextSyncStatus.toLowerCase()}` as "sync.synced" | "sync.pending" | "sync.failed")}
                        </span>

                        <button
                          type="button"
                          onClick={() => void handleVerifyErp(item.id)}
                          disabled={checkingErpRequestId !== null}
                          className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
                          title={t("actions.verifyErp")}
                        >
                          <RefreshCw className={cn("w-3.5 h-3.5", checkingErpRequestId === item.id && "animate-spin")} />
                        </button>

                        {erpnextLeadUrl && (
                          <a
                            href={erpnextLeadUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1 text-[#B7D1EA] hover:text-white rounded hover:bg-slate-800 transition-colors"
                            title={t("actions.openErp")}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    </td>

                    <td className="p-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        {item.status !== "QUOTED" && (
                          <button
                            type="button"
                            onClick={() => handleGenerateQuotation(item.id)}
                            disabled={isPending}
                            className="px-3.5 py-1.5 bg-[#B7D1EA] hover:bg-[#99BFE3] text-[#0F172A] rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
                          >
                            <FileCheck2 className="w-3.5 h-3.5" />
                            <span>{t("actions.generateQuotation")}</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredRequests.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-slate-500 font-mono">
                    {t("table.noResults")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="bg-[#0F172A] border border-slate-800 rounded-3xl w-full max-w-lg p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h3 className="text-lg font-bold text-white">Create New Inbound Lead</h3>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-slate-300">Customer Full Name *</span>
                <input
                  type="text"
                  required
                  placeholder="Somchai Jaidee"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  className="w-full bg-[#0B1121] border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-[#B7D1EA]"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-slate-300">Phone Number *</span>
                  <input
                    type="text"
                    required
                    placeholder="0812345678"
                    value={createPhone}
                    onChange={(e) => setCreatePhone(e.target.value)}
                    className="w-full bg-[#0B1121] border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-[#B7D1EA]"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-slate-300">Email Address</span>
                  <input
                    type="email"
                    placeholder="customer@email.com"
                    value={createEmail}
                    onChange={(e) => setCreateEmail(e.target.value)}
                    className="w-full bg-[#0B1121] border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-[#B7D1EA]"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-slate-300">Inquiry Type</span>
                  <select
                    value={createType}
                    onChange={(e) => setCreateType(e.target.value as InboundRequestType)}
                    className="w-full bg-[#0B1121] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#B7D1EA]"
                  >
                    <option value="WIZARD">Solar Wizard</option>
                    <option value="BUILD">Custom Build</option>
                    <option value="SERVICE">Service & Maintenance</option>
                  </select>
                </label>

                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-slate-300">Source</span>
                  <input
                    type="text"
                    placeholder="LINE / Phone Call / Direct"
                    value={createSource}
                    onChange={(e) => setCreateSource(e.target.value)}
                    className="w-full bg-[#0B1121] border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-[#B7D1EA]"
                  />
                </label>
              </div>

              <details className="group rounded-xl border border-slate-800 bg-[#0B1121] p-3.5">
                <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-bold text-slate-200">
                  <span className="inline-flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-[#B7D1EA]" />
                    ERPNext lead profile
                  </span>
                  <ChevronDown className="h-4 w-4 text-slate-500 transition-transform duration-300 group-open:rotate-180" />
                </summary>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block space-y-1 sm:col-span-2">
                    <span className="text-xs font-semibold text-slate-300">Organization</span>
                    <input
                      type="text"
                      placeholder="Optional company or housing project"
                      value={createCompanyName}
                      onChange={(event) => setCreateCompanyName(event.target.value)}
                      className="w-full rounded-xl border border-slate-700 bg-[#0F172A] px-3.5 py-2.5 text-xs text-white outline-none focus:border-[#B7D1EA]"
                    />
                  </label>

                  <label className="block space-y-1">
                    <span className="text-xs font-semibold text-slate-300">Territory</span>
                    <input
                      type="text"
                      value={createTerritory}
                      onChange={(event) => setCreateTerritory(event.target.value)}
                      className="w-full rounded-xl border border-slate-700 bg-[#0F172A] px-3.5 py-2.5 text-xs text-white outline-none focus:border-[#B7D1EA]"
                    />
                  </label>

                  <label className="block space-y-1">
                    <span className="text-xs font-semibold text-slate-300">Preferred contact</span>
                    <select
                      value={createContactMethod}
                      onChange={(event) => setCreateContactMethod(event.target.value)}
                      className="min-h-11 w-full rounded-xl border border-slate-700 bg-[#0F172A] px-3 text-xs text-white outline-none focus:border-[#B7D1EA]"
                    >
                      <option value="Phone">Phone</option>
                      <option value="LINE">LINE</option>
                      <option value="Email">Email</option>
                    </select>
                  </label>

                  <label className="block space-y-1">
                    <span className="text-xs font-semibold text-slate-300">City / District</span>
                    <input
                      type="text"
                      placeholder="Chiang Mai"
                      value={createCity}
                      onChange={(event) => setCreateCity(event.target.value)}
                      className="w-full rounded-xl border border-slate-700 bg-[#0F172A] px-3.5 py-2.5 text-xs text-white outline-none focus:border-[#B7D1EA]"
                    />
                  </label>

                  <label className="block space-y-1">
                    <span className="text-xs font-semibold text-slate-300">Postal code</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="50000"
                      value={createPostalCode}
                      onChange={(event) => setCreatePostalCode(event.target.value.replace(/\D/g, ""))}
                      className="w-full rounded-xl border border-slate-700 bg-[#0F172A] px-3.5 py-2.5 text-xs text-white outline-none focus:border-[#B7D1EA]"
                    />
                  </label>
                </div>
              </details>

              <label className="block space-y-1">
                <span className="text-xs font-semibold text-slate-300">Inquiry Details / Notes</span>
                <textarea
                  rows={3}
                  placeholder="System requirements, rooftop area, estimated monthly electricity bill..."
                  value={createNotes}
                  onChange={(e) => setCreateNotes(e.target.value)}
                  className="w-full bg-[#0B1121] border border-slate-700 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-[#B7D1EA] resize-none"
                />
              </label>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold hover:bg-slate-700"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2 bg-[#B7D1EA] hover:bg-[#99BFE3] text-[#0F172A] rounded-xl text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50"
                >
                  {isPending ? "Creating..." : "Save Inbound Request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ENTERPRISE TIER INBOUND LEAD RECORD DRAWER */}
      {selectedRequest && (() => {
        const intentBadge = getLeadIntentBadge(selectedRequest.payload);
        const kwpVal = findPayloadValue(selectedRequest.payload, ["systemSizeKwp", "targetSystemSize", "recommendedSizeKw", "sizeKwp", "kwp"]);
        const budgetVal = findPayloadValue(selectedRequest.payload, ["totalPrice", "estimatedPrice", "budget", "estimatedBudget"], 0);
        const savingsVal = findPayloadValue(selectedRequest.payload, ["estimatedSavingsMonthly", "monthlyBill", "billAmount"], 0);
        const inverterVal = findPayloadValue(selectedRequest.payload, ["inverter", "inverterBrand", "inverterTech"]) || "1x 6kW Grid-Tie Inverter (Standard/Certified TIER-1)";
        const preferredTimeVal = findPayloadValue(selectedRequest.payload, ["preferredDateTime", "preferredContactTime"]);
        const addonsVal = findPayloadValue(selectedRequest.payload, ["services", "selectedServices", "addOns"]) || ["Combiner Box AC-DC", "Solar Cable"];

        return (
          <div className="fixed inset-0 z-50 flex justify-end bg-black/75 backdrop-blur-sm">
            <div className="bg-[#0B1121] border-l border-slate-800 w-full max-w-3xl h-full p-6 md:p-8 flex flex-col justify-between shadow-2xl overflow-y-auto space-y-6">

              <div className="space-y-6">
                {/* Header Badge & Title Bar */}
                <div className="flex items-start justify-between border-b border-slate-800 pb-5">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 font-mono text-[10px] font-black uppercase tracking-wider text-[#B7D1EA] bg-[#B7D1EA]/10 border border-[#B7D1EA]/25 px-2.5 py-0.5 rounded-md">
                        <Globe2 className="w-3 h-3 text-[#B7D1EA]" />
                        Inbound lead record
                      </span>

                      <span className={cn("inline-flex items-center gap-1 font-mono text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-md border", intentBadge.color)}>
                        <span>{intentBadge.icon}</span>
                        <span>{intentBadge.label}</span>
                      </span>
                    </div>

                    <h2 className="text-3xl font-black text-white tracking-tight">
                      {selectedRequest.customerName}
                    </h2>

                    <p className="text-xs font-mono text-slate-400 flex items-center gap-2">
                      <span>Request #{selectedRequest.id.slice(0, 8)}</span>
                      <span>•</span>
                      <span className="text-[#B7D1EA] font-bold">{selectedRequest.requestType}</span>
                      <span>•</span>
                      <span>submitted {new Date(selectedRequest.createdAt).toLocaleString("th-TH")}</span>
                    </p>
                  </div>

                  {/* Top Right System Size Box */}
                  <div className="flex items-center gap-4">
                    {kwpVal ? (
                      <div className="bg-[#0F172A] border border-[#B7D1EA]/30 rounded-2xl px-4 py-2.5 text-right shadow-lg">
                        <span className="text-[9px] font-mono font-black uppercase tracking-widest text-[#B7D1EA] block">
                          SYSTEM SIZE
                        </span>
                        <span className="text-xl font-black text-white font-mono">
                          {formatPayloadValue(kwpVal)} kWp
                        </span>
                      </div>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => setSelectedRequest(null)}
                      className="text-slate-400 hover:text-white p-2 rounded-2xl bg-slate-900 border border-slate-800 hover:bg-slate-800 transition-colors"
                    >
                      <X className="w-6 h-6" />
                    </button>
                  </div>
                </div>

                {/* ENTERPRISE STEPPER TIMELINE CONTAINER */}
                <div className="relative pl-6 space-y-8 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-800">

                  {/* NODE 1: ERPNEXT CRM SYNC */}
                  <div className="relative space-y-3">
                    {/* Stepper Dot */}
                    <div className={cn(
                      "absolute -left-6 top-1.5 w-5 h-5 rounded-full border-2 flex items-center justify-center bg-[#0B1121] shadow-md",
                      selectedRequest.erpnextSyncStatus === "SYNCED"
                        ? "border-emerald-400 text-emerald-400"
                        : selectedRequest.erpnextSyncStatus === "FAILED"
                          ? "border-rose-500 text-rose-500"
                          : "border-blue-400 text-blue-400"
                    )}>
                      <div className="w-1.5 h-1.5 rounded-full bg-current" />
                    </div>

                    <div className="bg-[#0F172A] border border-slate-800/90 rounded-2xl p-4 md:p-5 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                        <div>
                          <span className="text-[10px] font-mono font-black uppercase tracking-widest text-slate-400">
                            ERPNEXT CRM SYNC
                          </span>
                          <h4 className="text-sm font-bold text-white mt-0.5">
                            {selectedRequest.erpnextLeadId
                              ? `ERPNext Lead Document: ${selectedRequest.erpnextLeadId}`
                              : "Waiting for ERPNext Lead creation"}
                          </h4>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wider",
                            selectedRequest.erpnextSyncStatus === "SYNCED"
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                              : selectedRequest.erpnextSyncStatus === "FAILED"
                                ? "border-rose-500/30 bg-rose-500/10 text-rose-400"
                                : "border-blue-500/30 bg-blue-500/10 text-blue-400"
                          )}>
                            {selectedRequest.erpnextSyncStatus}
                          </span>

                          <button
                            type="button"
                            onClick={() => void handleVerifyErp(selectedRequest.id)}
                            disabled={checkingErpRequestId !== null}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-900 text-xs font-bold text-slate-200 hover:border-[#B7D1EA] hover:text-[#B7D1EA] transition-all cursor-pointer disabled:opacity-50"
                          >
                            <RefreshCw className={cn("w-3.5 h-3.5", checkingErpRequestId === selectedRequest.id && "animate-spin")} />
                            <span>Verify ERP</span>
                          </button>
                        </div>
                      </div>

                      {selectedRequest.erpnextSyncError ? (
                        <div className="p-3 bg-rose-950/40 border border-rose-800/50 rounded-xl text-xs text-rose-300 font-mono">
                          ❌ <strong>Sync Error:</strong> {selectedRequest.erpnextSyncError}
                        </div>
                      ) : null}

                      {selectedErpnextLeadUrl ? (
                        <a
                          href={selectedErpnextLeadUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 text-xs font-bold text-[#B7D1EA] hover:underline"
                        >
                          <span>Open Full Lead Record in ERPNext CRM Workspace</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      ) : null}
                    </div>
                  </div>

                  {/* NODE 2: ERPNext Lead Profile */}
                  <div className="relative space-y-3">
                    <div className="absolute -left-6 top-1.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-violet-400 bg-[#0B1121] text-violet-400">
                      <Building2 className="h-2.5 w-2.5" />
                    </div>

                    <div className="border border-slate-800 bg-[#0F172A] p-4 md:p-5 rounded-2xl">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <h4 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-[#B7D1EA]">
                            <Building2 className="h-4 w-4 text-[#B7D1EA]" />
                            ERPNext lead profile
                          </h4>
                          <p className="mt-1 text-xs text-slate-500">Customer identity and routing fields sent with the lead document.</p>
                        </div>
                        <span className="rounded-md border border-slate-700 bg-[#0B1121] px-2 py-1 font-mono text-[9px] font-black uppercase tracking-wider text-slate-400">
                          {selectedRequest.leadType}
                        </span>
                      </div>

                      <dl className="grid grid-cols-1 gap-x-5 gap-y-3 border-t border-slate-800 pt-4 text-xs sm:grid-cols-2 lg:grid-cols-3">
                        {[
                          ["Organization", selectedRequest.companyName || "Individual homeowner"],
                          ["Territory", selectedRequest.territory],
                          ["Preferred contact", selectedRequest.preferredContactMethod || "Not specified"],
                          ["Market segment", selectedRequest.marketSegment || "Residential solar"],
                          ["Industry", selectedRequest.industry || "Not specified"],
                          ["Location", [selectedRequest.addressLine1, selectedRequest.city, selectedRequest.province, selectedRequest.postalCode, selectedRequest.country].filter(Boolean).join(", ") || "Not specified"],
                        ].map(([label, value]) => (
                          <div key={label} className="min-w-0">
                            <dt className="font-mono text-[9px] font-black uppercase tracking-wider text-slate-500">{label}</dt>
                            <dd className="mt-1 truncate font-semibold text-slate-200" title={value}>{value}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  </div>

                  {/* NODE 3: BENTO GRID SYSTEM CONFIG & CUSTOMER CONTACT */}
                  <div className="relative space-y-3">
                    {/* Stepper Dot */}
                    <div className="absolute -left-6 top-1.5 w-5 h-5 rounded-full border-2 border-[#B7D1EA] flex items-center justify-center bg-[#0B1121] text-[#B7D1EA]">
                      <Zap className="w-2.5 h-2.5" />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

                      {/* Left: System configuration */}
                      <div className="lg:col-span-7 bg-[#0F172A] border border-slate-800 rounded-2xl p-5 space-y-4">
                        <h4 className="text-xs font-black uppercase tracking-wider text-[#B7D1EA] flex items-center gap-2">
                          <Zap className="w-4 h-4 text-[#B7D1EA]" />
                          <span>System configuration</span>
                        </h4>

                        <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                          <div className="bg-[#0B1121] p-3.5 rounded-xl border border-slate-800 space-y-1">
                            <span className="text-[9px] text-slate-500 uppercase font-black tracking-wider block">TARGET CAPACITY</span>
                            <span className="text-base font-black text-white">{formatPayloadValue(kwpVal)} kWp</span>
                          </div>

                          <div className="bg-[#0B1121] p-3.5 rounded-xl border border-slate-800 space-y-1">
                            <span className="text-[9px] text-slate-500 uppercase font-black tracking-wider block">BUDGET</span>
                            <span className="text-base font-black text-emerald-400">{formatPayloadValue(budgetVal, true)}</span>
                          </div>
                        </div>

                        {savingsVal ? (
                          <div className="bg-[#0B1121] p-3.5 rounded-xl border border-slate-800 space-y-1 font-mono">
                            <span className="text-[9px] text-slate-500 uppercase font-black tracking-wider block">PREDICTED MONTHLY SAVINGS</span>
                            <span className="text-base font-black text-emerald-400">{formatPayloadValue(savingsVal, true)} / mo</span>
                          </div>
                        ) : null}

                        <div className="bg-[#0B1121] p-3.5 rounded-xl border border-slate-800 space-y-1 font-mono">
                          <span className="text-[9px] text-slate-500 uppercase font-black tracking-wider block">INVERTER ARCHITECTURE</span>
                          <span className="text-xs font-bold text-slate-200">{String(inverterVal)}</span>
                        </div>

                        <div className="space-y-1 font-mono">
                          <span className="text-[9px] text-slate-500 uppercase font-black tracking-wider block">SMART ADD-ONS</span>
                          <div className="flex flex-wrap gap-1.5">
                            {Array.isArray(addonsVal) ? addonsVal.map((ad: unknown, idx: number) => (
                              <span key={idx} className="px-2.5 py-1 bg-slate-900 border border-slate-800 text-slate-300 rounded-lg text-[10px] font-bold">
                                {String(ad)}
                              </span>
                            )) : (
                              <span className="text-xs text-slate-500">None selected</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Customer contact */}
                      <div className="lg:col-span-5 bg-[#0F172A] border border-slate-800 rounded-2xl p-5 space-y-4 flex flex-col justify-between">
                        <div className="space-y-3">
                          <h4 className="text-xs font-black uppercase tracking-wider text-[#B7D1EA] flex items-center gap-2">
                            <User className="w-4 h-4 text-[#B7D1EA]" />
                            <span>Customer contact</span>
                          </h4>

                          <div className="space-y-2 text-xs font-mono">
                            <div className="bg-[#0B1121] p-3 rounded-xl border border-slate-800 space-y-0.5">
                              <span className="text-[9px] text-slate-500 uppercase font-black block">FULL NAME</span>
                              <span className="font-extrabold text-white text-sm">{selectedRequest.customerName}</span>
                            </div>

                            <div className="bg-[#0B1121] p-3 rounded-xl border border-slate-800 flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <span className="text-[9px] text-slate-500 uppercase font-black block">PHONE</span>
                                <span className="font-extrabold text-emerald-400 text-xs truncate block">{selectedRequest.phone}</span>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <a
                                  href={`tel:${selectedRequest.phone}`}
                                  className="px-2.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-xl text-[10px] font-black uppercase flex items-center gap-1 transition-colors"
                                  title="Call Customer"
                                >
                                  <Phone className="w-3 h-3" />
                                  <span>Call</span>
                                </a>

                                <a
                                  href={getWhatsAppUrl(selectedRequest.phone, selectedRequest.customerName)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="p-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-xl transition-colors"
                                  title="Open WhatsApp Direct Chat"
                                >
                                  <MessageCircle className="w-3.5 h-3.5" />
                                </a>
                              </div>
                            </div>

                            <div className="bg-[#0B1121] p-3 rounded-xl border border-slate-800 flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <span className="text-[9px] text-slate-500 uppercase font-black block">EMAIL</span>
                                <span className="font-extrabold text-sky-400 text-xs truncate block">{selectedRequest.email || "Not specified"}</span>
                              </div>

                              {selectedRequest.email && (
                                <a
                                  href={`mailto:${selectedRequest.email}`}
                                  className="px-2.5 py-1.5 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 text-sky-400 rounded-xl text-[10px] font-black uppercase flex items-center gap-1 transition-colors shrink-0"
                                >
                                  <Mail className="w-3 h-3" />
                                  <span>Email</span>
                                </a>
                              )}
                            </div>

                            {preferredTimeVal ? (
                              <div className="bg-[#0B1121] p-3 rounded-xl border border-slate-800 space-y-0.5">
                                <span className="text-[9px] text-slate-500 uppercase font-black block">Preferred Contact Time</span>
                                <span className="font-bold text-amber-400 text-xs">{String(preferredTimeVal)}</span>
                                <span className="text-[9px] text-slate-500 block">วันที่และเวลาสะดวกให้ติดต่อกลับ</span>
                              </div>
                            ) : null}
                          </div>
                        </div>

                        {/* Quick Copy Lead Summary Button */}
                        <button
                          type="button"
                          onClick={() => copyLeadToClipboard(selectedRequest)}
                          className="w-full mt-2 py-2 px-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-xl text-xs font-bold font-mono flex items-center justify-center gap-2 transition-all cursor-pointer"
                        >
                          {copiedLead ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-[#B7D1EA]" />}
                          <span>{copiedLead ? "Copied to Clipboard!" : "Copy Lead Summary for LINE / Sales"}</span>
                        </button>
                      </div>

                    </div>
                  </div>

                  {/* NODE 4: LIFECYCLE AND STAFF FOLLOW-UP */}
                  <div className="relative space-y-3">
                    {/* Stepper Dot */}
                    <div className="absolute -left-6 top-1.5 w-5 h-5 rounded-full border-2 border-amber-400 flex items-center justify-center bg-[#0B1121] text-amber-400">
                      <Clock className="w-2.5 h-2.5" />
                    </div>

                    <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-5 space-y-4">
                      <h4 className="text-xs font-black uppercase tracking-wider text-[#B7D1EA] flex items-center gap-2">
                        <UserCheck className="w-4 h-4 text-[#B7D1EA]" />
                        <span>Lifecycle and staff follow-up</span>
                      </h4>

                      {/* Status Buttons */}
                      <div className="grid grid-cols-4 gap-2">
                        {(["NEW", "CONTACTED", "QUOTED", "REJECTED"] as InboundRequestStatus[]).map((st) => (
                          <button
                            key={st}
                            type="button"
                            onClick={() => handleStatusChange(selectedRequest.id, st)}
                            className={cn(
                              "py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer border",
                              selectedRequest.status === st
                                ? "bg-[#B7D1EA] text-[#0F172A] border-[#B7D1EA] shadow-md scale-[1.02]"
                                : "bg-[#0B1121] text-slate-400 border-slate-800 hover:text-white"
                            )}
                          >
                            {st}
                          </button>
                        ))}
                      </div>

                      {/* Custom Staff Notes */}
                      <div className="space-y-2 pt-2 border-t border-slate-800/80">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono font-black uppercase tracking-wider text-slate-400">
                            CUSTOM STAFF NOTES (SYNCS TO ERPNEXT LEAD)
                          </span>

                          <button
                            type="button"
                            disabled={isAddingNote || !newNoteInput.trim()}
                            onClick={() => handleAddNote(selectedRequest.id)}
                            className="px-3 py-1.5 bg-[#B7D1EA] hover:bg-[#99BFE3] text-[#0F172A] rounded-xl text-[10px] font-black uppercase tracking-wider transition-all disabled:opacity-40 cursor-pointer flex items-center gap-1.5 shadow-sm"
                          >
                            {isAddingNote ? <Loader2 className="w-3 h-3 animate-spin" /> : <SaveIcon className="w-3 h-3" />}
                            <span>SAVE NOTE</span>
                          </button>
                        </div>

                        <textarea
                          rows={3}
                          value={newNoteInput}
                          onChange={(e) => setNewNoteInput(e.target.value)}
                          placeholder="Record customer discussion notes, site inspection date, special pricing requests..."
                          className="w-full bg-[#0B1121] border border-slate-800 rounded-xl p-3.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#B7D1EA] resize-none"
                        />

                        {/* Notes History */}
                        {((selectedRequest.payload.notesHistory as Array<{ text: string; date: string }>) || []).length > 0 && (
                          <div className="space-y-2 pt-2">
                            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">Notes History:</span>
                            <div className="space-y-2 max-h-40 overflow-y-auto">
                              {((selectedRequest.payload.notesHistory as Array<{ text: string; date: string }>) || []).map((n, i) => (
                                <div key={i} className="bg-[#0B1121] border border-slate-800 rounded-xl p-3 text-xs space-y-1">
                                  <p className="text-slate-200">{n.text}</p>
                                  <span className="text-[9px] font-mono text-slate-500 block">
                                    {new Date(n.date).toLocaleString("th-TH")}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* NODE 4: RAW REQUEST PAYLOAD / ADVANCED DETAILS */}
                  <div className="relative space-y-3">
                    {/* Stepper Dot */}
                    <div className="absolute -left-6 top-1.5 w-5 h-5 rounded-full border-2 border-slate-600 flex items-center justify-center bg-[#0B1121] text-slate-400">
                      <FileText className="w-2.5 h-2.5" />
                    </div>

                    <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-5 space-y-4">
                      <h4 className="text-xs font-black uppercase tracking-wider text-[#B7D1EA] flex items-center gap-2">
                        <FileText className="w-4 h-4 text-[#B7D1EA]" />
                        <span>Raw request payload & technical audit</span>
                      </h4>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div className="bg-[#0B1121] border border-slate-800 rounded-xl p-3 space-y-1 font-mono">
                          <span className="text-[9px] text-[#B7D1EA] font-black uppercase tracking-widest block flex items-center gap-1">
                            <Zap className="w-3 h-3 text-[#B7D1EA]" /> SYSTEM SIZE
                          </span>
                          <span className="text-sm font-black text-white">{formatPayloadValue(kwpVal)} kWp</span>
                        </div>

                        <div className="bg-[#0B1121] border border-slate-800 rounded-xl p-3 space-y-1 font-mono">
                          <span className="text-[9px] text-sky-400 font-black uppercase tracking-widest block">BATTERY STORAGE</span>
                          <span className="text-sm font-black text-white">No Battery</span>
                        </div>

                        <div className="bg-[#0B1121] border border-slate-800 rounded-xl p-3 space-y-1 font-mono">
                          <span className="text-[9px] text-emerald-400 font-black uppercase tracking-widest block">EST. VALUATION</span>
                          <span className="text-sm font-black text-emerald-400">{formatPayloadValue(budgetVal, true)}</span>
                        </div>
                      </div>

                      {/* Collapsible Accordion for Advanced JSON payload */}
                      <div className="border border-slate-800 rounded-xl bg-[#0B1121] overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setIsAdvancedDetailsOpen((prev) => !prev)}
                          className="w-full p-3 text-xs font-mono text-slate-300 font-bold flex items-center justify-between hover:bg-slate-900 transition-colors"
                        >
                          <span className="flex items-center gap-2">
                            <span>{"< >"}</span>
                            <span>Advanced Data Details ({Object.keys(selectedRequest.payload || {}).length} items)</span>
                          </span>
                          {isAdvancedDetailsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>

                        {isAdvancedDetailsOpen && (
                          <div className="p-4 border-t border-slate-800 bg-[#070B14]">
                            <pre className="text-[11px] font-mono text-emerald-400 overflow-x-auto max-h-64 leading-relaxed">
                              {JSON.stringify(selectedRequest.payload, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                </div>
              </div>

              {/* FIXED BOTTOM ACTION BAR */}
              <div className="flex items-center justify-between border-t border-slate-800 pt-4 bg-[#0B1121] sticky bottom-0">
                <button
                  type="button"
                  onClick={() => setSelectedRequest(null)}
                  className="px-5 py-2.5 bg-slate-900 border border-slate-800 text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Close Drawer
                </button>
                <AuditLogTrigger
                  onClick={() => openAuditSidebar(selectedRequest)}
                  label="Logs"
                  className="min-h-10 px-2.5"
                />

                {selectedRequest.status !== "QUOTED" && (
                  <button
                    type="button"
                    onClick={() => handleGenerateQuotation(selectedRequest.id)}
                    disabled={isPending}
                    className="px-6 py-3 bg-[#B7D1EA] hover:bg-[#99BFE3] text-[#0F172A] rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 shadow-lg disabled:opacity-50"
                  >
                    <FileCheck2 className="w-4 h-4" />
                    <span>Generate Quotation</span>
                  </button>
                )}
              </div>

            </div>
          </div>
        );
      })()}

      {auditSidebar ? (
        <AuditLogSidebar
          isOpen
          onClose={() => setAuditSidebar(null)}
          logs={auditSidebar.logs}
          title={auditSidebar.title}
          entityLabel={auditSidebar.entityLabel}
          loading={auditSidebar.isLoading}
          emptyMessage="No activity has been recorded for this lead yet."
        />
      ) : null}
    </div>
  );
}

function SaveIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
      <polyline points="17 21 17 13 7 13 7 21"></polyline>
      <polyline points="7 3 7 8 15 8"></polyline>
    </svg>
  );
}
