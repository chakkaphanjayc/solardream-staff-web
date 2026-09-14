"use client";

import React, { useMemo, useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Inbox,
  FileText,
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
  X,
  ExternalLink,
  Sparkles,
  Save,
  MessageSquareText,
  Compass,
  Zap,
  User,
  Settings2,
  RefreshCw,
  Link2,
  GitBranch,
  SlidersHorizontal,
  ListFilter,
  ChevronLeft,
  ChevronRight,
  MapPin,
  ShieldCheck,
  Users,
  Building2,
  MapPinned,
  Trash2,
} from "@/components/ui/icons";
import { cn, formatPrice } from "@/lib/utils";
import type {
  InboundRequestItem,
  InboundRequestType,
  InboundRequestStatus,
} from "@/app/actions/inboundRequests";
import {
  updateInboundRequestStatus,
  verifyInboundRequestErpSync,
} from "@/app/actions/inboundRequests";
import {
  deleteSalesPipelineRecords,
  getSalesPipelineAuditLogs,
  type SalesPipelineDeleteTarget,
} from "@/app/actions/salesPipeline";
import ConfirmDeleteModal from "@/components/layout/ConfirmDeleteModal";
import type { CrmRow } from "@/lib/crmRows";
import type { SalesThread } from "@/types/salesThread";
import {
  type SalesCustomer,
  syncCustomersFromErpnext,
  getSalesCustomers,
} from "@/app/actions/salesCustomers";
import SalesThreadCard from "@/components/admin/SalesThreadCard";
import {
  AuditLogSidebar,
  AuditLogTrigger,
  type AuditTimelineItem,
} from "@/components/ui/AuditLogSidebar";
import CrmClient from "../crm/CrmClient";
import LeadPayloadSummary from "@/components/admin/LeadPayloadSummary";
import { AdminBulkActionBar } from "@/components/admin/AdminBulkActionBar";
import { AdminSelectionCheckbox } from "@/components/admin/AdminSelectionCheckbox";
import { useAdminSelection } from "@/hooks/useAdminSelection";

const SiteLocationMap = dynamic(() => import("@/components/admin/SiteLocationMap"), {
  ssr: false,
  loading: () => (
    <div className="h-[220px] w-full animate-pulse rounded-xl bg-slate-900/60 border border-slate-800" />
  ),
});

type Props = {
  initialInboundRequests: InboundRequestItem[];
  crmRows: CrmRow[];
  salesThreads: SalesThread[];
  salesThreadError: string | null;
  initialCustomers?: SalesCustomer[];
  erpnextBaseUrl: string;
};

type PipelineView = "leads" | "quotations" | "threads" | "customers";
type LeadGroupBy = "none" | "status" | "type" | "source";
type ThreadFilter = "all" | "complete" | "attention";
type ThreadGroupBy = "none" | "completion" | "status";

function getErpnextLeadUrl(erpnextBaseUrl: string, erpnextLeadId: string | null): string {
  if (!erpnextBaseUrl || !erpnextLeadId) return "";
  return `${erpnextBaseUrl.replace(/\/$/, "")}/app/lead/${encodeURIComponent(erpnextLeadId)}`;
}

export default function UnifiedSalesPipelineClient({
  initialInboundRequests,
  crmRows,
  salesThreads,
  salesThreadError,
  initialCustomers = [],
  erpnextBaseUrl,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useTranslations("UnifiedSalesPipeline");
  const locale = pathname.split("/").filter(Boolean)[0] || "en";

  const initialView = searchParams.get("view") === "threads"
    ? "threads"
    : searchParams.get("view") === "customers"
      ? "customers"
      : searchParams.get("view") === "leads" || searchParams.get("tab") === "leads"
        ? "leads"
        : "quotations";
  const [activeView, setActiveView] = useState<PipelineView>(initialView);
  const requestedLeadId = searchParams.get("lead");
  const initialSelectedRequest = requestedLeadId
    ? initialInboundRequests.find(
        (item) => item.id === requestedLeadId || item.consultationLeadId === requestedLeadId,
      ) ?? null
    : null;

  // Inbound Requests / Leads state
  const [createdRequests, setCreatedRequests] = useState<InboundRequestItem[]>([]);
  const [requestPatches, setRequestPatches] = useState<Record<string, Partial<InboundRequestItem>>>({});
  const requests = [
    ...createdRequests.map((request) => ({ ...request, ...requestPatches[request.id] })),
    ...initialInboundRequests
      .filter((request) => !createdRequests.some((created) => created.id === request.id))
      .map((request) => ({ ...request, ...requestPatches[request.id] })),
  ];

  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [leadGroupBy, setLeadGroupBy] = useState<LeadGroupBy>("none");
  const [threadFilter, setThreadFilter] = useState<ThreadFilter>("all");
  const [threadGroupBy, setThreadGroupBy] = useState<ThreadGroupBy>("completion");
  const [hiddenThreadIds, setHiddenThreadIds] = useState<string[]>([]);
  const [isBulkThreadDeleteOpen, setIsBulkThreadDeleteOpen] = useState(false);
  const [isDeletingThreadSelection, setIsDeletingThreadSelection] = useState(false);

  // Modals & Drawers
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<InboundRequestItem | null>(initialSelectedRequest);
  const [requestToDelete, setRequestToDelete] = useState<InboundRequestItem | null>(null);
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [isDeletingRequest, setIsDeletingRequest] = useState(false);
  const [staffNote, setStaffNote] = useState(
    () => String(initialSelectedRequest?.payload.staffNotes || initialSelectedRequest?.payload.notes || ""),
  );
  const [isPending, startTransition] = useTransition();
  const [checkingErpRequestId, setCheckingErpRequestId] = useState<string | null>(null);
  const [linkedRecordToDelete, setLinkedRecordToDelete] = useState<{
    target: SalesPipelineDeleteTarget;
    name: string;
    kind: "thread" | "customer";
  } | null>(null);
  const [isDeletingLinkedRecord, setIsDeletingLinkedRecord] = useState(false);

  const handleDeleteRequest = async () => {
    if (!requestToDelete) return;
    const targetId = requestToDelete.id;
    const targetName = requestToDelete.customerName;
    setIsDeletingRequest(true);

    try {
      const res = await deleteSalesPipelineRecords([
        { type: "INBOUND_REQUEST", id: targetId },
      ]);
      if (res.success) {
        toast.success(`Deleted the linked sales thread for "${targetName}".`);
        setCreatedRequests((current) => current.filter((req) => req.id !== targetId));
        setRequestPatches((current) => {
          const next = { ...current };
          delete next[targetId];
          return next;
        });
        if (selectedRequest?.id === targetId) {
          setSelectedRequest(null);
        }
        requestSelection.remove([targetId]);
        setRequestToDelete(null);
        router.refresh();
      } else {
        toast.error(res.error || "Failed to delete request.");
      }
    } catch (err) {
      console.error("Error deleting request:", err);
      toast.error("Failed to delete request.");
    } finally {
      setIsDeletingRequest(false);
    }
  };

  const handleBulkDeleteRequests = async () => {
    const selectedIds = Array.from(requestSelection.selectedIds);
    if (selectedIds.length === 0) return;
    setIsDeletingRequest(true);

    try {
      const res = await deleteSalesPipelineRecords(
        selectedIds.map((id): SalesPipelineDeleteTarget => ({
          type: "INBOUND_REQUEST",
          id,
        })),
      );
      if (res.success) {
        toast.success(`Deleted ${res.counts?.inboundRequests ?? selectedIds.length} selected linked thread(s).`);
        setCreatedRequests((current) => current.filter((req) => !selectedIds.includes(req.id)));
        setRequestPatches((current) => {
          const next = { ...current };
          for (const id of selectedIds) delete next[id];
          return next;
        });
        if (selectedRequest && selectedIds.includes(selectedRequest.id)) {
          setSelectedRequest(null);
        }
        requestSelection.clear();
        setIsBulkDeleteOpen(false);
        router.refresh();
      } else {
        toast.error(res.error || "Failed to bulk delete requests.");
      }
    } catch (err) {
      console.error("Error bulk deleting requests:", err);
      toast.error("Failed to bulk delete requests.");
    } finally {
      setIsDeletingRequest(false);
    }
  };

  // Customers Directory state
  const [customers, setCustomers] = useState<SalesCustomer[]>(initialCustomers);
  const [isSyncingErpCustomers, setIsSyncingErpCustomers] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<SalesCustomer | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerSyncFilter, setCustomerSyncFilter] = useState<"all" | "synced" | "local">("all");
  const [customerLocationFilter, setCustomerLocationFilter] = useState<"all" | "pinned">("all");
  const [auditSidebar, setAuditSidebar] = useState<{
    title: string;
    entityLabel: string;
    logs: AuditTimelineItem[];
    isLoading: boolean;
  } | null>(null);
  const auditLoadRef = useRef(0);

  const openAuditSidebar = (
    entityIds: Array<string | null | undefined>,
    title: string,
    entityLabel: string,
  ) => {
    const requestId = auditLoadRef.current + 1;
    auditLoadRef.current = requestId;
    setAuditSidebar({ title, entityLabel, logs: [], isLoading: true });

    void getSalesPipelineAuditLogs(
      Array.from(new Set(entityIds.filter((id): id is string => Boolean(id)))),
    ).then((result) => {
      if (requestId !== auditLoadRef.current) return;
      setAuditSidebar((current) => current
        ? { ...current, logs: result.success ? result.logs : [], isLoading: false }
        : null);
    }).catch((error: unknown) => {
      if (requestId !== auditLoadRef.current) return;
      console.error("Failed to load sales pipeline audit logs:", error);
      setAuditSidebar((current) => current ? { ...current, isLoading: false } : null);
    });
  };

  const handleDeleteLinkedRecord = async () => {
    if (!linkedRecordToDelete) return;
    setIsDeletingLinkedRecord(true);
    try {
      const result = await deleteSalesPipelineRecords([linkedRecordToDelete.target]);
      if (!result.success) {
        toast.error(result.error || "Failed to delete the linked sales thread.");
        return;
      }

      if (linkedRecordToDelete.kind === "customer") {
        setCustomers((current) => current.filter((customer) => customer.id !== linkedRecordToDelete.target.id));
        setSelectedCustomer(null);
      } else {
        setHiddenThreadIds((current) => [...new Set([...current, linkedRecordToDelete.target.id])]);
        threadSelection.remove([linkedRecordToDelete.target.id]);
      }
      setLinkedRecordToDelete(null);
      toast.success(`Deleted the linked sales thread for "${linkedRecordToDelete.name}".`);
      router.refresh();
    } catch (error: unknown) {
      console.error("Failed to delete linked sales record:", error);
      toast.error("Failed to delete the linked sales thread.");
    } finally {
      setIsDeletingLinkedRecord(false);
    }
  };

  const handleSyncErpnextCustomers = async () => {
    setIsSyncingErpCustomers(true);
    try {
      const result = await syncCustomersFromErpnext();
      if (result.success) {
        toast.success(
          locale === "th"
            ? `ซิงก์ข้อมูลลูกค้าสำเร็จ: ตรวจพบ ${result.syncedCount} รายการ (จับคู่ใหม่ ${result.newMatchesCount} รายการ)`
            : `ERPNext customer sync completed: ${result.syncedCount} records processed (${result.newMatchesCount} new links)`
        );
        const updated = await getSalesCustomers();
        setCustomers(updated);
      } else {
        toast.error(result.error || "Failed to sync customers from ERPNext.");
      }
    } catch {
      toast.error("Failed to sync customers from ERPNext.");
    } finally {
      setIsSyncingErpCustomers(false);
    }
  };

  const setPipelineView = (view: PipelineView) => {
    setActiveView(view);
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("tab");
    nextParams.set("view", view);
    router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
  };

  // Create Manual Lead Form State
  const [createName, setCreateName] = useState("");
  const [createPhone, setCreatePhone] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createType, setCreateType] = useState<InboundRequestType>("WIZARD");
  const [createSource, setCreateSource] = useState("manual");
  const [createNotes, setCreateNotes] = useState("");

  const openRequestPanel = (request: InboundRequestItem) => {
    setSelectedRequest(request);
    setStaffNote(String(request.payload.staffNotes || request.payload.notes || ""));
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
      setRequestPatches((current) => ({ ...current, [id]: { ...current[id], ...update } }));
      setSelectedRequest((current) => current?.id === id ? { ...current, ...update } : current);

      if (result.erpnextSyncStatus === "SYNCED") {
        toast.success(`ERPNext Lead ${result.erpnextLeadId} verified.`);
      } else if (result.erpnextSyncStatus === "PENDING") {
        toast.info("This lead is waiting for ERPNext creation.");
      } else {
        toast.error(result.erpnextSyncError || result.error || "ERPNext verification failed.");
      }
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ERPNext verification failed.");
    } finally {
      setCheckingErpRequestId(null);
    }
  };

  const handleCreateManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName.trim() || !createPhone.trim()) {
      toast.error("Customer name and phone number are required.");
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch("/api/erpnext/leads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            first_name: createName,
            mobile_no: createPhone,
            email_id: createEmail || undefined,
            request_type: createType,
            source: createSource,
            notes: createNotes,
          }),
        });

        const data = await response.json();

        if (data.success && data.request) {
          toast.success("Lead created in ERPNext & Sales Pipeline!");
          setCreatedRequests((current) => [data.request, ...current]);
          setIsCreateModalOpen(false);
          setCreateName("");
          setCreatePhone("");
          setCreateEmail("");
          setCreateNotes("");
          router.refresh();
        } else {
          toast.error(data.error || "Failed to create lead.");
        }
      } catch {
        toast.error("Error submitting manual request to server.");
      }
    });
  };

  const handleStatusChange = (id: string, newStatus: InboundRequestStatus) => {
    startTransition(async () => {
      try {
        const res = await updateInboundRequestStatus(id, newStatus);
        if (res.success) {
          toast.success(`Lead status updated to ${newStatus}`);
          setRequestPatches((current) => ({ ...current, [id]: { ...current[id], status: newStatus } }));
          if (selectedRequest && selectedRequest.id === id) {
            setSelectedRequest({ ...selectedRequest, status: newStatus });
          }
          router.refresh();
        } else {
          toast.error(res.error || "Failed to update status.");
        }
      } catch (error) {
        console.error("Inbound request status update error:", error);
        toast.error("Failed to update status. Please try again.");
      }
    });
  };

  const handleBulkStatusChange = (newStatus: InboundRequestStatus) => {
    const selectedIds = Array.from(requestSelection.selectedIds);
    if (selectedIds.length === 0) return;

    startTransition(async () => {
      try {
        const settled = await Promise.allSettled(
          selectedIds.map(async (id) => ({
            id,
            result: await updateInboundRequestStatus(id, newStatus),
          })),
        );
        const successfulIds = settled.flatMap((item) =>
          item.status === "fulfilled" && item.value.result.success ? [item.value.id] : [],
        );
        const failedCount = settled.length - successfulIds.length;

        if (successfulIds.length > 0) {
          setRequestPatches((current) => {
            const next = { ...current };
            for (const id of successfulIds) {
              next[id] = { ...next[id], status: newStatus };
            }
            return next;
          });
          requestSelection.clear();
          toast.success(`${successfulIds.length} lead${successfulIds.length === 1 ? "" : "s"} updated.`);
          router.refresh();
        }
        if (failedCount > 0) {
          toast.error(`${failedCount} lead${failedCount === 1 ? "" : "s"} could not be updated.`);
        }
      } catch (error) {
        console.error("Bulk inbound request status update error:", error);
        toast.error("Could not update the selected leads. Please try again.");
      }
    });
  };

  const handleSaveStaffNotes = () => {
    if (!selectedRequest) return;
    startTransition(async () => {
      try {
        const updatedPayload = {
          ...selectedRequest.payload,
          staffNotes: staffNote.trim(),
        };

        const updatedReq = {
          ...selectedRequest,
          payload: updatedPayload,
        };

        setSelectedRequest(updatedReq);
        setRequestPatches((current) => ({ ...current, [selectedRequest.id]: updatedReq }));

        toast.success("Custom staff notes synced with lead.");
      } catch {
        toast.error("Failed to save notes.");
      }
    });
  };

  const handleConvertLeadToQuotation = (id: string, customerName: string) => {
    startTransition(async () => {
      try {
        const response = await fetch("/api/erpnext/convert-lead", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requestId: id,
            lead_name: customerName,
          }),
        });

        const data = await response.json();

        if (data.success && data.quotationId) {
          toast.success("Lead successfully converted to formal Quotation!");

          setRequestPatches((current) => ({
            ...current,
            [id]: { ...current[id], status: "QUOTED", quotationId: data.quotationId },
          }));

          if (selectedRequest && selectedRequest.id === id) {
            setSelectedRequest({
              ...selectedRequest,
              status: "QUOTED",
              quotationId: data.quotationId,
            });
          }

          // Trigger full server revalidation & switch to Tab 2 (Quotations CRM)
          router.refresh();
          setPipelineView("quotations");
        } else {
          toast.error(data.error || "Failed to convert lead.");
        }
      } catch {
        toast.error("Error executing lead to quotation conversion.");
      }
    });
  };

  // Filtered Leads
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

  const requestSelection = useAdminSelection(filteredRequests.map((item) => item.id));

  const groupedRequests = useMemo(() => {
    const groups = new Map<string, InboundRequestItem[]>();
    for (const request of filteredRequests) {
      const key = leadGroupBy === "status"
        ? request.status
        : leadGroupBy === "type"
          ? request.requestType
          : leadGroupBy === "source"
            ? request.source
            : "all";
      const items = groups.get(key) ?? [];
      items.push(request);
      groups.set(key, items);
    }

    return Array.from(groups, ([key, items]) => ({ key, items }));
  }, [filteredRequests, leadGroupBy]);

  const filteredThreads = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return salesThreads.filter((thread) => {
      if (hiddenThreadIds.includes(thread.id)) return false;
      const complete = Boolean(thread.lead && thread.quotation && thread.installation);
      const matchesFilter = threadFilter === "all" || (threadFilter === "complete" ? complete : !complete);
      const haystack = [
        thread.id,
        thread.customerName,
        thread.email,
        thread.phone,
        thread.lead?.name,
        thread.lead?.erpnextLeadId,
        thread.quotation?.documentNo,
        thread.quotation?.erpnextQuotationId,
        thread.installation?.projectCode,
        thread.installation?.erpnextProjectId,
        thread.installation?.jobTicketId,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return matchesFilter && (!query || haystack.includes(query));
    });
  }, [salesThreads, hiddenThreadIds, searchQuery, threadFilter]);

  const threadSelection = useAdminSelection(filteredThreads.map((thread) => thread.id));

  const handleBulkDeleteThreads = async () => {
    const selectedIds = Array.from(threadSelection.selectedIds);
    if (selectedIds.length === 0) return;

    setIsDeletingThreadSelection(true);
    try {
      const result = await deleteSalesPipelineRecords(
        selectedIds.map((id): SalesPipelineDeleteTarget => ({
          type: "THREAD",
          id,
        })),
      );

      if (!result.success) {
        toast.error(result.error || "Failed to delete the selected sales threads.");
        return;
      }

      setHiddenThreadIds((current) => [...new Set([...current, ...selectedIds])]);
      threadSelection.clear();
      setIsBulkThreadDeleteOpen(false);
      toast.success(
        `Deleted ${result.counts?.customerThreads || selectedIds.length} selected linked sales thread(s).`,
      );
      router.refresh();
    } catch (error: unknown) {
      console.error("Failed to bulk delete sales threads:", error);
      toast.error("Failed to delete the selected sales threads.");
    } finally {
      setIsDeletingThreadSelection(false);
    }
  };

  const groupedThreads = useMemo(() => {
    const groups = new Map<string, SalesThread[]>();
    for (const thread of filteredThreads) {
      const key = threadGroupBy === "completion"
        ? thread.lead && thread.quotation && thread.installation ? "complete" : "attention"
        : threadGroupBy === "status"
          ? thread.quotation?.status || thread.lead?.status || "NOT_STARTED"
          : "all";
      const items = groups.get(key) ?? [];
      items.push(thread);
      groups.set(key, items);
    }

    return Array.from(groups, ([key, items]) => ({ key, items }));
  }, [filteredThreads, threadGroupBy]);

  const totalCount = requests.length;
  const newCount = requests.filter((r) => r.status === "NEW").length;
  const contactedCount = requests.filter((r) => r.status === "CONTACTED").length;
  const quotedCount = requests.filter((r) => r.status === "QUOTED").length;
  const visibleSalesThreads = salesThreads.filter((thread) => !hiddenThreadIds.includes(thread.id));
  const completeThreadCount = visibleSalesThreads.filter((thread) => Boolean(thread.lead && thread.quotation && thread.installation)).length;
  const attentionThreadCount = visibleSalesThreads.length - completeThreadCount;

  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      const q = customerSearch.trim().toLowerCase();
      if (q) {
        const matchesName = c.customerName.toLowerCase().includes(q);
        const matchesEmail = (c.email || "").toLowerCase().includes(q);
        const matchesPhone = (c.phone || "").toLowerCase().includes(q);
        const matchesErp = (c.erpnextCustomerId || "").toLowerCase().includes(q);
        const matchesAddress = (c.address || "").toLowerCase().includes(q);
        if (!matchesName && !matchesEmail && !matchesPhone && !matchesErp && !matchesAddress) {
          return false;
        }
      }
      if (customerSyncFilter === "synced" && !c.erpnextCustomerId) return false;
      if (customerSyncFilter === "local" && c.erpnextCustomerId) return false;
      if (customerLocationFilter === "pinned" && !c.hasLocationPin) return false;
      return true;
    });
  }, [customers, customerSearch, customerSyncFilter, customerLocationFilter]);

  const syncedCustomersCount = useMemo(() => customers.filter((c) => c.erpnextCustomerId).length, [customers]);
  const pinnedCustomersCount = useMemo(() => customers.filter((c) => c.hasLocationPin).length, [customers]);
  const totalCustomerPipelineValue = useMemo(() => customers.reduce((acc, c) => acc + c.totalPipelineValue, 0), [customers]);

  return (
    <div className="sd-page-shell mx-auto w-full max-w-[100rem] space-y-6 px-4 py-5 text-[#c9d1d9] sm:px-6 sm:py-6 lg:px-8">
      {/* Header & Unified 2-Tab Navigation */}
      <div className="flex min-w-0 flex-col gap-5 border-b border-[#30363d] pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-mono font-semibold uppercase tracking-[0.14em] text-[#58a6ff]">{t("header.workspace")}</p>
          <h1 className="mt-2 text-balance text-3xl font-bold leading-tight tracking-tight text-[#f0f6fc] sm:text-4xl">{t("header.title")}</h1>
          <p className="mt-2 max-w-[68ch] text-pretty text-sm leading-6 text-[#8b949e]">{t("header.description")}</p>
        </div>

        <div className="flex w-full min-w-0 flex-col gap-3 sm:items-end lg:w-auto">
          <div className="inline-flex w-full gap-1 overflow-x-auto rounded-md border border-[#30363d] bg-[#161b22] p-1 sm:w-auto" role="tablist" aria-label={t("tabs.label")}>
            <button
              type="button"
              role="tab"
              aria-selected={activeView === "leads"}
              onClick={() => setPipelineView("leads")}
              className={cn(
                "flex min-h-9 flex-1 shrink-0 items-center justify-center gap-2 rounded-md px-3.5 text-xs font-medium transition-colors sm:flex-none cursor-pointer",
                activeView === "leads"
                  ? "bg-[#21262d] text-[#f0f6fc] border border-[#8b949e] font-semibold"
                  : "text-[#8b949e] hover:bg-[#21262d] hover:text-[#c9d1d9] border border-transparent"
              )}
            >
              <Inbox className="w-4 h-4" />
              <span>{t("tabs.leads", { count: totalCount })}</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeView === "quotations"}
              onClick={() => setPipelineView("quotations")}
              className={cn(
                "flex min-h-9 flex-1 shrink-0 items-center justify-center gap-2 rounded-md px-3.5 text-xs font-medium transition-colors sm:flex-none cursor-pointer",
                activeView === "quotations"
                  ? "bg-[#21262d] text-[#f0f6fc] border border-[#8b949e] font-semibold"
                  : "text-[#8b949e] hover:bg-[#21262d] hover:text-[#c9d1d9] border border-transparent"
              )}
            >
              <FileText className="w-4 h-4" />
              <span>{t("tabs.quotations", { count: crmRows.length })}</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeView === "threads"}
              onClick={() => setPipelineView("threads")}
              className={cn(
                "flex min-h-9 flex-1 shrink-0 items-center justify-center gap-2 rounded-md px-3.5 text-xs font-medium transition-colors sm:flex-none cursor-pointer",
                activeView === "threads"
                  ? "border border-[#8b949e] bg-[#21262d] font-semibold text-[#f0f6fc]"
                  : "border border-transparent text-[#8b949e] hover:bg-[#21262d] hover:text-[#c9d1d9]",
              )}
            >
              <GitBranch className="h-4 w-4" aria-hidden="true" />
              <span>{t("tabs.threads", { count: visibleSalesThreads.length })}</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeView === "customers"}
              onClick={() => setPipelineView("customers")}
              className={cn(
                "flex min-h-9 flex-1 shrink-0 items-center justify-center gap-2 rounded-md px-3.5 text-xs font-medium transition-colors sm:flex-none cursor-pointer",
                activeView === "customers"
                  ? "border border-[#8b949e] bg-[#21262d] font-semibold text-[#f0f6fc]"
                  : "border border-transparent text-[#8b949e] hover:bg-[#21262d] hover:text-[#c9d1d9]",
              )}
            >
              <Users className="h-4 w-4" aria-hidden="true" />
              <span>{t("tabs.customers", { count: customers.length })}</span>
            </button>
          </div>
        </div>
      </div>

      {/* TAB 1: INBOUND REQUESTS (LEAD MANAGEMENT COMPONENT) */}
      {activeView === "leads" && (
        <div className="space-y-6 animate-in fade-in-50 duration-300">
          {/* Summary Metrics */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="flex items-center justify-between rounded-md border border-[#30363d] bg-[#161b22] p-5 shadow-sm">
              <div>
                <span className="block text-xs font-mono font-semibold uppercase tracking-[0.12em] text-[#8b949e]">
                  {t("metrics.totalInboundLeads")}
                </span>
                <div className="text-3xl font-bold text-[#f0f6fc] mt-1">{totalCount}</div>
              </div>
              <div className="p-3 bg-[#21262d] border border-[#30363d] rounded-md text-[#c9d1d9]">
                <Inbox className="w-6 h-6" />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border border-[#58a6ff]/30 bg-[#161b22] p-5 shadow-sm">
              <div>
                <span className="flex items-center gap-1 text-xs font-mono font-semibold uppercase tracking-[0.12em] text-[#58a6ff]">
                  <Sparkles className="w-3.5 h-3.5" />
                  {t("metrics.newUnprocessed")}
                </span>
                <div className="text-3xl font-bold text-[#58a6ff] mt-1">{newCount}</div>
              </div>
              <div className="p-3 bg-[#58a6ff]/10 border border-[#58a6ff]/30 rounded-md text-[#58a6ff]">
                <Clock className="w-6 h-6" />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border border-[#d29922]/30 bg-[#161b22] p-5 shadow-sm">
              <div>
                <span className="flex items-center gap-1 text-xs font-mono font-semibold uppercase tracking-[0.12em] text-[#d29922]">
                  <Phone className="w-3.5 h-3.5" />
                  {t("metrics.contacted")}
                </span>
                <div className="mt-1 text-3xl font-bold text-[#d29922]">{contactedCount}</div>
              </div>
              <div className="rounded-md border border-[#d29922]/30 bg-[#d29922]/10 p-3 text-[#d29922]">
                <AlertCircle className="w-6 h-6" />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border border-[#238636]/30 bg-[#161b22] p-5 shadow-sm">
              <div>
                <span className="flex items-center gap-1 text-xs font-mono font-semibold uppercase tracking-[0.12em] text-[#3fb950]">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {t("metrics.quotationIssued")}
                </span>
                <div className="text-3xl font-bold text-[#3fb950] mt-1">{quotedCount}</div>
              </div>
              <div className="p-3 bg-[#238636]/10 border border-[#238636]/30 rounded-md text-[#3fb950]">
                <FileCheck2 className="w-6 h-6" />
              </div>
            </div>
          </div>

          {/* Filter Toolbar */}
          <div className="flex flex-col items-center justify-between gap-4 rounded-md border border-[#30363d] bg-[#161b22] p-4 lg:flex-row shadow-sm">
            <div className="relative w-full lg:w-96">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b949e]" />
              <input
                type="text"
                placeholder={t("filters.searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="min-h-10 w-full rounded-md border border-[#30363d] bg-[#0d1117] py-2 pl-10 pr-4 text-xs text-[#f0f6fc] placeholder-[#8b949e] outline-none focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff]"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between lg:justify-end gap-3 w-full lg:w-auto">
              <div className="flex items-center gap-2">
                <Filter className="w-3.5 h-3.5 text-[#8b949e]" />
                <span className="text-xs font-mono text-[#8b949e]">{t("filters.type")}</span>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="min-h-10 rounded-md border border-[#30363d] bg-[#0d1117] px-3 text-xs text-[#f0f6fc] outline-none focus:border-[#58a6ff]"
                >
                  <option value="ALL">{t("filters.allTypes")}</option>
                  <option value="WIZARD">{t("filters.wizardInquiry")}</option>
                  <option value="BUILD">{t("filters.buildConfig")}</option>
                  <option value="SERVICE">{t("filters.solarServices")}</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-[#8b949e]">{t("filters.status")}</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="min-h-10 rounded-md border border-[#30363d] bg-[#0d1117] px-3 text-xs text-[#f0f6fc] outline-none focus:border-[#58a6ff]"
                >
                  <option value="ALL">{t("filters.allStatuses")}</option>
                  <option value="NEW">{t("statuses.new")}</option>
                  <option value="CONTACTED">{t("statuses.contacted")}</option>
                  <option value="QUOTED">{t("statuses.quoted")}</option>
                  <option value="REJECTED">{t("statuses.rejected")}</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-3.5 w-3.5 text-[#8b949e]" aria-hidden="true" />
                <span className="text-xs font-mono text-[#8b949e]">{t("filters.groupBy")}</span>
                <select
                  value={leadGroupBy}
                  onChange={(e) => setLeadGroupBy(e.target.value as LeadGroupBy)}
                  className="min-h-10 rounded-md border border-[#30363d] bg-[#0d1117] px-3 text-xs text-[#f0f6fc] outline-none focus:border-[#58a6ff]"
                >
                  <option value="none">{t("filters.noGrouping")}</option>
                  <option value="status">{t("filters.groupStatus")}</option>
                  <option value="type">{t("filters.groupType")}</option>
                  <option value="source">{t("filters.groupSource")}</option>
                </select>
              </div>

              {(searchQuery || typeFilter !== "ALL" || statusFilter !== "ALL" || leadGroupBy !== "none") ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setTypeFilter("ALL");
                    setStatusFilter("ALL");
                    setLeadGroupBy("none");
                  }}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-[#30363d] px-3 text-xs font-semibold text-[#8b949e] transition-colors hover:border-[#8b949e] hover:text-[#f0f6fc]"
                >
                  <ListFilter className="size-3.5" aria-hidden="true" />
                  {t("filters.clear")}
                </button>
              ) : null}

              {/* GitHub Green Primary Action Button */}
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(true)}
                className="ml-2 flex min-h-10 items-center gap-2 rounded-md bg-[#238636] border border-[rgba(240,246,252,0.1)] px-4 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-[#2ea043] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#58a6ff] cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>{t("actions.createManualRequest")}</span>
              </button>
            </div>
          </div>

          {/* Lead Data Table */}
          <AdminBulkActionBar
            selectedCount={requestSelection.selectedCount}
            visibleCount={filteredRequests.length}
            allVisibleSelected={requestSelection.allVisibleSelected}
            someVisibleSelected={requestSelection.someVisibleSelected}
            onToggleVisible={requestSelection.toggleVisible}
            onClear={requestSelection.clear}
            actions={[
              { id: "contacted", label: "Mark contacted", onClick: () => handleBulkStatusChange("CONTACTED") },
              { id: "quoted", label: "Mark quoted", onClick: () => handleBulkStatusChange("QUOTED") },
              { id: "rejected", label: "Reject", tone: "danger", onClick: () => handleBulkStatusChange("REJECTED") },
              { id: "delete", label: "Delete selected", tone: "danger", onClick: () => setIsBulkDeleteOpen(true) },
            ]}
          />
          <div className="overflow-hidden rounded-md border border-[#30363d] bg-[#161b22]">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-[#c9d1d9]">
                <thead className="bg-[#161b22] text-[#8b949e] font-mono text-[11px] uppercase tracking-wider border-b border-[#30363d]">
                  <tr>
                    <th className="py-3.5 px-4">
                      <AdminSelectionCheckbox
                        checked={requestSelection.allVisibleSelected}
                        indeterminate={requestSelection.someVisibleSelected}
                        onChange={requestSelection.toggleVisible}
                        label="Select all visible leads"
                      />
                    </th>
                    <th className="py-3.5 px-6">{t("table.dateTime")}</th>
                    <th className="py-3.5 px-6">{t("table.leadDetails")}</th>
                    <th className="py-3.5 px-6">{t("table.configType")}</th>
                    <th className="py-3.5 px-6">{t("table.sourceTracking")}</th>
                    <th className="py-3.5 px-6">{t("table.status")}</th>
                    <th className="py-3.5 px-6">{t("table.erpnextCrm")}</th>
                    <th className="py-3.5 px-6 text-right">{t("table.actions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-sans">
                  {filteredRequests.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-500">
                        <Inbox className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                        {t("table.noResults")}
                      </td>
                    </tr>
                  ) : (
                    groupedRequests.map((group) => (
                      <React.Fragment key={group.key}>
                        {leadGroupBy !== "none" ? (
                          <tr className="bg-[#0d1117]">
                            <td colSpan={8} className="px-6 py-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#8b949e]">
                              {group.key} <span className="font-mono text-[#6e7681]">· {group.items.length}</span>
                            </td>
                          </tr>
                        ) : null}
                        {group.items.map((item) => {
                      const profile = parseLeadPayload(item.payload);
                      const notes = String(item.payload.customerNotes || item.payload.notes || "").trim();
                      const staffNotes = String(item.payload.staffNotes || "").trim();
                      const erpnextLeadUrl = item.erpnextSyncStatus === "SYNCED"
                        ? getErpnextLeadUrl(erpnextBaseUrl, item.erpnextLeadId)
                        : "";

                      return (
                      <React.Fragment key={item.id}>
                      <tr
                        onClick={() => openRequestPanel(item)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openRequestPanel(item);
                          }
                        }}
                        tabIndex={0}
                        className="cursor-pointer transition-colors hover:bg-[#21262d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#58a6ff]"
                      >
                        <td className="py-4 px-4" onClick={(event) => event.stopPropagation()}>
                          <AdminSelectionCheckbox
                            checked={requestSelection.isSelected(item.id)}
                            onChange={() => requestSelection.toggle(item.id)}
                            label={`Select lead ${item.customerName}`}
                          />
                        </td>
                        <td className="py-4 px-6 whitespace-nowrap font-mono text-[#8b949e]">
                          {new Date(item.createdAt).toLocaleString("th-TH")}
                        </td>

                        <td className="py-4 px-6">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-bold text-[#f0f6fc] hover:text-[#58a6ff]">
                              {item.customerName}
                            </div>
                            <span className="inline-flex items-center gap-1 rounded-md border border-[#30363d] bg-[#0d1117] px-2 py-0.5 font-mono text-xs font-semibold text-[#58a6ff]">
                              <Zap className="h-3 w-3 text-[#58a6ff]" />
                              {profile.targetCapacity > 0 ? `${profile.targetCapacity.toLocaleString()} kWp` : "Custom kW"}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-3 font-mono text-xs text-[#8b949e]">
                            <span className="flex items-center gap-1.5 font-semibold text-[#c9d1d9]">
                              <Phone className="h-3.5 w-3.5 text-[#3fb950] shrink-0" />
                              {item.phone}
                            </span>
                            {item.email && (
                              <span className="flex items-center gap-1.5 text-[#8b949e] truncate max-w-[200px]">
                                <Mail className="h-3.5 w-3.5 text-[#58a6ff] shrink-0" />
                                {item.email}
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-4 px-6 whitespace-nowrap">
                          <span
                            className={cn(
                              "px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold uppercase border",
                              item.requestType === "WIZARD"
                                ? "border-[#58a6ff]/30 bg-[#58a6ff]/10 text-[#58a6ff]"
                                : item.requestType === "BUILD"
                                ? "border-[#7CA8D0]/30 bg-[#7CA8D0]/10 text-[#7CA8D0]"
                                : "border-[#d29922]/30 bg-[#d29922]/10 text-[#d29922]"
                            )}
                          >
                            {item.requestType}
                          </span>
                        </td>

                        <td className="py-4 px-6 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 bg-[#0d1117] border border-[#30363d] text-[#8b949e] px-2.5 py-0.5 rounded-md text-[11px] font-mono">
                            <Tag className="w-3 h-3 text-[#58a6ff]" />
                            {item.source}
                          </span>
                        </td>

                        <td className="py-4 px-6 whitespace-nowrap">
                          <span
                            className={cn(
                              "px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold uppercase border inline-flex items-center gap-1.5",
                              item.status === "NEW"
                                ? "border-[#58a6ff]/30 bg-[#58a6ff]/10 text-[#58a6ff]"
                                : item.status === "CONTACTED"
                                ? "border-[#d29922]/30 bg-[#d29922]/10 text-[#d29922]"
                                : item.status === "QUOTED"
                                ? "border-[#238636]/30 bg-[#238636]/10 text-[#3fb950]"
                                : "bg-[#21262d] text-[#8b949e] border-[#30363d]"
                            )}
                          >
                            <span
                              className={cn(
                                "h-1.5 w-1.5 rounded-full",
                                item.status === "NEW"
                                  ? "bg-[#58a6ff] animate-pulse"
                                  : item.status === "CONTACTED"
                                  ? "bg-[#d29922]"
                                  : item.status === "QUOTED"
                                  ? "bg-[#3fb950]"
                                  : "bg-[#8b949e]"
                              )}
                            />
                            {item.status}
                          </span>
                        </td>

                        <td className="py-4 px-6 whitespace-nowrap" onClick={(event) => event.stopPropagation()}>
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-mono font-semibold uppercase",
                              item.erpnextSyncStatus === "SYNCED"
                                ? "border-[#238636]/30 bg-[#238636]/10 text-[#3fb950]"
                                : item.erpnextSyncStatus === "FAILED"
                                  ? "border-[#f85149]/30 bg-[#f85149]/10 text-[#f85149]"
                                  : "border-[#58a6ff]/30 bg-[#58a6ff]/10 text-[#58a6ff]",
                            )}>
                              <Link2 className="h-3 w-3" />
                              {item.erpnextSyncStatus === "SYNCED" ? "Synced" : item.erpnextSyncStatus}
                            </span>
                            <button
                              type="button"
                              onClick={() => void handleVerifyErp(item.id)}
                              disabled={checkingErpRequestId !== null}
                              title="Verify ERPNext Lead"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[#30363d] bg-[#21262d] text-[#c9d1d9] transition-colors hover:border-[#58a6ff] hover:text-[#58a6ff] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                            >
                              <RefreshCw className={cn("h-3.5 w-3.5", checkingErpRequestId === item.id && "animate-spin")} />
                            </button>
                            {erpnextLeadUrl ? (
                              <a href={erpnextLeadUrl} target="_blank" rel="noreferrer" title="Open ERPNext CRM lead" className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[#30363d] bg-[#21262d] text-[#c9d1d9] transition-colors hover:border-[#58a6ff] hover:text-[#58a6ff]">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            ) : null}
                          </div>
                        </td>

                        <td className="py-4 px-6 text-right whitespace-nowrap space-x-2" onClick={(event) => event.stopPropagation()}>
                          {item.status !== "QUOTED" ? (
                            <button
                              type="button"
                              onClick={() => handleConvertLeadToQuotation(item.id, item.customerName)}
                              disabled={isPending}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#238636] hover:bg-[#2ea043] border border-[rgba(240,246,252,0.1)] text-white rounded-md text-xs font-semibold transition-all cursor-pointer disabled:opacity-50 shadow-xs"
                            >
                              <FileCheck2 className="w-3.5 h-3.5" />
                              Generate Quotation
                            </button>
                          ) : (
                            <span className="text-[11px] font-mono text-[#3fb950] font-semibold inline-flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Quoted
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={() => setRequestToDelete(item)}
                            disabled={isPending}
                            title="Delete request / service order"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[#f85149]/40 bg-[#f85149]/10 text-[#ff7b72] transition-colors hover:bg-[#f85149]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f85149] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                          >
                            <Trash2 className="size-3.5" aria-hidden="true" />
                            <span className="sr-only">Delete</span>
                          </button>
                        </td>
                      </tr>
                      <tr className="cursor-pointer bg-[#0B1121] hover:bg-slate-900/90" onClick={() => openRequestPanel(item)}>
                        <td colSpan={8} className="px-6 pb-4 pt-1">
                          <div className="grid grid-cols-2 gap-x-5 gap-y-2 border border-slate-800 bg-[#0F172A] p-4 rounded-xl text-xs sm:grid-cols-3 xl:grid-cols-5">
                            <div className="min-w-0">
                              <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-slate-400">Budget</p>
                              <p className="truncate font-bold text-slate-100 text-xs mt-0.5">{profile.estimatedBudget > 0 ? formatPrice(profile.estimatedBudget) : "TBD"}</p>
                            </div>
                            <div className="min-w-0">
                              <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-slate-400">Inverter</p>
                              <p className="truncate font-semibold text-slate-200 text-xs mt-0.5" title={profile.inverterArchitecture}>{profile.inverterArchitecture}</p>
                            </div>
                            <div className="min-w-0">
                              <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-slate-400">Monthly savings</p>
                              <p className="truncate font-bold text-emerald-400 text-xs mt-0.5">{profile.monthlySavings > 0 ? `${formatPrice(profile.monthlySavings)}/mo` : "TBD"}</p>
                            </div>
                            <div className="min-w-0">
                              <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-slate-400">Add-ons</p>
                              <p className="truncate font-semibold text-slate-200 text-xs mt-0.5" title={profile.addOns.join(", ")}>{profile.addOns.length ? profile.addOns.join(", ") : "None selected"}</p>
                            </div>
                            <div className="min-w-0">
                              <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-slate-400">Follow-up</p>
                              <p className="truncate font-semibold text-slate-200 text-xs mt-0.5" title={[profile.postalCode, profile.preferredDateTime].filter(Boolean).join(" · ")}>{[profile.postalCode, profile.preferredDateTime].filter(Boolean).join(" · ") || "Not specified"}</p>
                            </div>
                          </div>
                          {notes || staffNotes ? (
                            <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-300">
                              <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-slate-400">Notes: </span>
                              {staffNotes || notes}
                            </p>
                          ) : null}
                        </td>
                      </tr>
                      </React.Fragment>
                      );
                        })}
                      </React.Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: QUOTATIONS CRM */}
      {activeView === "quotations" && (
        <div className="animate-in fade-in-50 duration-300">
          <CrmClient initialRows={crmRows} hideHeader />
        </div>
      )}

      {activeView === "threads" && (
        <div className="space-y-6 animate-in fade-in-50 duration-300">
          <div className="flex flex-col gap-2 border-b border-[#30363d] pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#58a6ff]">
                <GitBranch className="size-3.5" aria-hidden="true" />
                {t("threadView.eyebrow")}
              </p>
              <h2 className="mt-2 text-xl font-semibold text-[#f0f6fc]">{t("threadView.title")}</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-[#8b949e]">{t("threadView.description")}</p>
            </div>
            <span className="text-xs text-[#8b949e]">{t("threadView.explicitLinks")}</span>
          </div>

          {salesThreadError ? (
            <div className="flex items-start gap-3 border border-[#da3633]/50 bg-[#da3633]/10 p-4 text-sm text-[#f85149]" role="alert">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span>{salesThreadError}</span>
                <button
                  type="button"
                  onClick={() => startTransition(() => router.refresh())}
                  disabled={isPending}
                  className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md border border-[#f85149]/50 px-3 text-xs font-semibold text-[#f85149] transition-colors hover:bg-[#f85149]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f85149] disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
                >
                  {isPending ? "Refreshing…" : "Retry"}
                </button>
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-3" role="group" aria-label={t("threadView.summaryLabel")}>
            <div className="ops-surface rounded-md p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8b949e]">{t("threadView.total")}</p>
              <p className="mt-2 font-mono text-2xl font-semibold text-[#f0f6fc]">{visibleSalesThreads.length}</p>
            </div>
            <div className="ops-surface rounded-md p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8b949e]">{t("threadView.complete")}</p>
              <p className="mt-2 font-mono text-2xl font-semibold text-[#3fb950]">{completeThreadCount}</p>
            </div>
            <div className="ops-surface rounded-md p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8b949e]">{t("threadView.attention")}</p>
              <p className="mt-2 font-mono text-2xl font-semibold text-[#d29922]">{attentionThreadCount}</p>
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-md border border-[#30363d] bg-[#161b22] p-3 lg:flex-row lg:items-center lg:justify-between">
            <label className="relative block min-w-0 flex-1 lg:max-w-xl">
              <span className="sr-only">{t("threadView.searchLabel")}</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#8b949e]" aria-hidden="true" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={t("threadView.searchPlaceholder")}
                className="min-h-11 w-full border border-[#30363d] bg-[#0d1117] pl-10 pr-3 text-sm text-[#f0f6fc] outline-none placeholder:text-[#6e7681] focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff]"
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2">
                <Filter className="size-3.5 text-[#8b949e]" aria-hidden="true" />
                <select
                  value={threadFilter}
                  onChange={(event) => setThreadFilter(event.target.value as ThreadFilter)}
                  aria-label={t("threadView.filterLabel")}
                  className="min-h-11 border border-[#30363d] bg-[#0d1117] px-3 text-xs font-medium text-[#c9d1d9] outline-none focus:border-[#58a6ff]"
                >
                  <option value="all">{t("threadView.filters.all", { count: visibleSalesThreads.length })}</option>
                  <option value="complete">{t("threadView.filters.complete", { count: completeThreadCount })}</option>
                  <option value="attention">{t("threadView.filters.attention", { count: attentionThreadCount })}</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="size-3.5 text-[#8b949e]" aria-hidden="true" />
                <select
                  value={threadGroupBy}
                  onChange={(event) => setThreadGroupBy(event.target.value as ThreadGroupBy)}
                  aria-label={t("threadView.groupLabel")}
                  className="min-h-11 border border-[#30363d] bg-[#0d1117] px-3 text-xs font-medium text-[#c9d1d9] outline-none focus:border-[#58a6ff]"
                >
                  <option value="completion">{t("threadView.groups.completion")}</option>
                  <option value="status">{t("threadView.groups.status")}</option>
                  <option value="none">{t("threadView.groups.none")}</option>
                </select>
              </div>
              {(searchQuery || threadFilter !== "all" || threadGroupBy !== "completion") ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setThreadFilter("all");
                    setThreadGroupBy("completion");
                  }}
                  className="inline-flex min-h-11 items-center gap-1.5 border border-[#30363d] px-3 text-xs font-semibold text-[#8b949e] transition-colors hover:border-[#8b949e] hover:text-[#f0f6fc]"
                >
                  <ListFilter className="size-3.5" aria-hidden="true" />
                  {t("filters.clear")}
                </button>
              ) : null}
            </div>
          </div>

          <AdminBulkActionBar
            selectedCount={threadSelection.selectedCount}
            visibleCount={filteredThreads.length}
            allVisibleSelected={threadSelection.allVisibleSelected}
            someVisibleSelected={threadSelection.someVisibleSelected}
            onToggleVisible={threadSelection.toggleVisible}
            onClear={threadSelection.clear}
            isPending={isDeletingThreadSelection}
            actions={[
              {
                id: "delete",
                label: "Delete selected",
                tone: "danger",
                onClick: () => setIsBulkThreadDeleteOpen(true),
              },
            ]}
          />

          {groupedThreads.length === 0 ? (
            <div className="border border-dashed border-[#484f58] bg-[#161b22] px-4 py-14 text-center">
              <GitBranch className="mx-auto size-8 text-[#484f58]" aria-hidden="true" />
              <h3 className="mt-3 text-sm font-semibold text-[#f0f6fc]">{t("threadView.emptyTitle")}</h3>
              <p className="mt-1 text-xs text-[#8b949e]">{t("threadView.emptyDescription")}</p>
            </div>
          ) : (
            <div className="space-y-6">
              {groupedThreads.map((group) => (
                <section key={group.key} aria-labelledby={`thread-group-${group.key}`}>
                  {threadGroupBy !== "none" ? (
                    <div className="mb-2 flex items-center justify-between px-1">
                      <h3 id={`thread-group-${group.key}`} className="text-xs font-semibold uppercase tracking-[0.1em] text-[#8b949e]">{group.key.replaceAll("_", " ")}</h3>
                      <span className="font-mono text-[11px] text-[#6e7681]">{group.items.length}</span>
                    </div>
                  ) : null}
                  <div className="space-y-4">
                    {group.items.map((thread) => (
                      <div key={thread.id}>
                        <SalesThreadCard
                          thread={thread}
                          locale={locale}
                          isSelected={threadSelection.isSelected(thread.id)}
                          onToggleSelect={() => threadSelection.toggle(thread.id)}
                          onOpenAudit={() => openAuditSidebar(
                            [
                              thread.id.includes(":") ? null : thread.id,
                              thread.lead?.id,
                              thread.lead?.consultationLeadId,
                              thread.lead?.inboundRequestId,
                              thread.quotation?.id,
                            ],
                            "Sales thread activity",
                            `${thread.customerName} · ${thread.id.includes(":") ? thread.id : `#${thread.id.slice(0, 8).toUpperCase()}`}`,
                          )}
                          onDelete={() => setLinkedRecordToDelete({
                            target: { type: "THREAD", id: thread.id },
                            name: thread.customerName,
                            kind: "thread",
                          })}
                        />
                        <p className="mt-1 px-1 text-[10px] text-[#6e7681]">
                          {new Date(thread.createdAt).toLocaleDateString(locale === "th" ? "th-TH" : "en-US", { day: "2-digit", month: "short", year: "numeric" })}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: CUSTOMER DIRECTORY & ERPNEXT SYNC */}
      {activeView === "customers" && (
        <div className="space-y-6 animate-in fade-in-50 duration-300">
          {/* Header & Sync Button */}
          <div className="flex flex-col gap-4 border-b border-[#30363d] pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#58a6ff]">
                <Users className="size-3.5" aria-hidden="true" />
                <span>Customer Directory & ERPNext CRM</span>
              </p>
              <h2 className="mt-2 text-xl font-semibold text-[#f0f6fc]">
                {locale === "th" ? "รายชื่อลูกค้าและการซิงก์ ERPNext" : "Customers & ERPNext Sync"}
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-[#8b949e]">
                {locale === "th"
                  ? "จัดการรายชื่อลูกค้า ที่ตั้งหน้างานติดตั้ง (พิกัด GPS สำหรับ After-Sale Support) และประวัติใบเสนอราคาที่เชื่อมโยงกับ ERPNext"
                  : "Consolidated directory of solar customers, installation site coordinates (GPS for after-sale support), and linked quotation histories synced with ERPNext."}
              </p>
            </div>
            <button
              type="button"
              onClick={handleSyncErpnextCustomers}
              disabled={isSyncingErpCustomers}
              aria-busy={isSyncingErpCustomers}
              className="inline-flex min-h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md bg-[#238636] px-4 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#2ea043] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#58a6ff] disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
            >
              <RefreshCw className={cn("size-3.5", isSyncingErpCustomers && "animate-spin")} />
              <span>
                {isSyncingErpCustomers
                  ? (locale === "th" ? "กำลังซิงก์..." : "Syncing ERPNext...")
                  : (locale === "th" ? "ซิงก์ข้อมูลกับ ERPNext" : "Sync with ERPNext")}
              </span>
            </button>
          </div>

          {/* 4 Metrics Cards */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="flex items-center justify-between rounded-md border border-[#30363d] bg-[#161b22] p-5 shadow-sm">
              <div>
                <span className="block text-xs font-mono font-semibold uppercase tracking-[0.12em] text-[#8b949e]">
                  {locale === "th" ? "ลูกค้าทั้งหมด" : "Total Customers"}
                </span>
                <div className="text-3xl font-bold text-[#f0f6fc] mt-1">{customers.length}</div>
              </div>
              <div className="p-3 bg-[#21262d] border border-[#30363d] rounded-md text-[#c9d1d9]">
                <Users className="w-6 h-6" />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border border-[#238636]/30 bg-[#161b22] p-5 shadow-sm">
              <div>
                <span className="flex items-center gap-1 text-xs font-mono font-semibold uppercase tracking-[0.12em] text-[#3fb950]">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {locale === "th" ? "ซิงก์กับ ERPNext แล้ว" : "Synced with ERPNext"}
                </span>
                <div className="text-3xl font-bold text-[#3fb950] mt-1">{syncedCustomersCount}</div>
              </div>
              <div className="p-3 bg-[#238636]/10 border border-[#238636]/30 rounded-md text-[#3fb950]">
                <Building2 className="w-6 h-6" />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border border-[#58a6ff]/30 bg-[#161b22] p-5 shadow-sm">
              <div>
                <span className="flex items-center gap-1 text-xs font-mono font-semibold uppercase tracking-[0.12em] text-[#58a6ff]">
                  <MapPin className="w-3.5 h-3.5 text-[#B7D1EA]" />
                  {locale === "th" ? "ปักหมุดพิกัดหน้างาน" : "Pinned Site Locations"}
                </span>
                <div className="text-3xl font-bold text-[#58a6ff] mt-1">{pinnedCustomersCount}</div>
              </div>
              <div className="p-3 bg-[#58a6ff]/10 border border-[#58a6ff]/30 rounded-md text-[#58a6ff]">
                <MapPinned className="w-6 h-6" />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border border-[#d29922]/30 bg-[#161b22] p-5 shadow-sm">
              <div>
                <span className="block text-xs font-mono font-semibold uppercase tracking-[0.12em] text-[#d29922]">
                  {locale === "th" ? "มูลค่ารวมไปป์ไลน์" : "Total Pipeline Value"}
                </span>
                <div className="text-2xl font-bold text-[#e3b341] mt-1">
                  {formatPrice(totalCustomerPipelineValue)}
                </div>
              </div>
              <div className="p-3 bg-[#d29922]/10 border border-[#d29922]/30 rounded-md text-[#d29922]">
                <Tag className="w-6 h-6" />
              </div>
            </div>
          </div>

          {/* Search and Filters */}
          <div className="flex flex-col gap-3 rounded-md border border-[#30363d] bg-[#161b22] p-3 lg:flex-row lg:items-center lg:justify-between">
            <label className="relative block min-w-0 flex-1 lg:max-w-xl">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#8b949e]" />
              <input
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                placeholder={locale === "th" ? "ค้นหาชื่อลูกค้า อีเมล เบอร์โทร หรือ ERPNext ID..." : "Search customer name, email, phone, location, or ERPNext ID..."}
                className="min-h-11 w-full border border-[#30363d] bg-[#0d1117] pl-10 pr-3 text-sm text-[#f0f6fc] outline-none placeholder:text-[#6e7681] focus:border-[#58a6ff]"
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={customerSyncFilter}
                onChange={(e) => setCustomerSyncFilter(e.target.value as "all" | "synced" | "local")}
                className="min-h-11 border border-[#30363d] bg-[#0d1117] px-3 text-xs font-medium text-[#c9d1d9] outline-none focus:border-[#58a6ff]"
              >
                <option value="all">{locale === "th" ? "สถานะ ERPNext ทั้งหมด" : "All ERPNext Statuses"}</option>
                <option value="synced">{locale === "th" ? "เฉพาะที่ซิงก์กับ ERPNext แล้ว" : "Synced with ERPNext Only"}</option>
                <option value="local">{locale === "th" ? "เฉพาะในระบบ SolarDream" : "Local Records Only"}</option>
              </select>

              <select
                value={customerLocationFilter}
                onChange={(e) => setCustomerLocationFilter(e.target.value as "all" | "pinned")}
                className="min-h-11 border border-[#30363d] bg-[#0d1117] px-3 text-xs font-medium text-[#c9d1d9] outline-none focus:border-[#58a6ff]"
              >
                <option value="all">{locale === "th" ? "พิกัดหน้างานทั้งหมด" : "All Locations"}</option>
                <option value="pinned">{locale === "th" ? "เฉพาะที่มีพิกัดแผนที่ (Pinned GPS)" : "Has Pinned GPS Only"}</option>
              </select>

              {(customerSearch || customerSyncFilter !== "all" || customerLocationFilter !== "all") && (
                <button
                  type="button"
                  onClick={() => {
                    setCustomerSearch("");
                    setCustomerSyncFilter("all");
                    setCustomerLocationFilter("all");
                  }}
                  className="inline-flex min-h-11 items-center gap-1.5 border border-[#30363d] px-3 text-xs font-semibold text-[#8b949e] transition-colors hover:border-[#8b949e] hover:text-[#f0f6fc]"
                >
                  <ListFilter className="size-3.5" />
                  <span>{locale === "th" ? "ล้างตัวกรอง" : "Clear filters"}</span>
                </button>
              )}
            </div>
          </div>

          {/* Customer Table */}
          <div className="overflow-hidden rounded-md border border-[#30363d] bg-[#161b22]">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-[#c9d1d9]">
                <thead className="border-b border-[#30363d] bg-[#0d1117] font-mono text-[11px] uppercase tracking-wider text-[#8b949e]">
                  <tr>
                    <th className="py-3.5 pl-4 pr-3 font-semibold sm:pl-6">{locale === "th" ? "ลูกค้า" : "Customer"}</th>
                    <th className="px-3 py-3.5 font-semibold">{locale === "th" ? "ข้อมูลติดต่อ" : "Contact"}</th>
                    <th className="px-3 py-3.5 font-semibold">{locale === "th" ? "ERPNext CRM" : "ERPNext CRM"}</th>
                    <th className="px-3 py-3.5 font-semibold">{locale === "th" ? "พิกัดหน้างาน (After-Sale)" : "Site Location (After-Sale)"}</th>
                    <th className="px-3 py-3.5 font-semibold text-right">{locale === "th" ? "โครงการ / มูลค่า" : "Projects / Value"}</th>
                    <th className="py-3.5 pl-3 pr-4 text-right font-semibold sm:pr-6">{locale === "th" ? "การกระทำ" : "Actions"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#30363d]/60 bg-[#161b22]">
                  {filteredCustomers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-sm text-[#8b949e]">
                        {locale === "th" ? "ไม่พบข้อมูลลูกค้าที่ตรงกับเงื่อนไขการค้นหา" : "No customers found matching the search criteria."}
                      </td>
                    </tr>
                  ) : (
                    filteredCustomers.map((cust) => {
                      const erpUrl = getErpnextLeadUrl(erpnextBaseUrl, cust.erpnextCustomerId);
                      return (
                        <tr
                          key={cust.id}
                          onClick={() => setSelectedCustomer(cust)}
                          className="hover:bg-[#21262d]/60 cursor-pointer transition-colors"
                        >
                          <td className="py-3.5 pl-4 pr-3 sm:pl-6">
                            <div className="flex items-center gap-3">
                              <div className="size-8 rounded-full bg-[#30363d] border border-[#484f58] flex items-center justify-center text-xs font-bold text-slate-200 shrink-0">
                                {cust.customerName.charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-[#f0f6fc] truncate max-w-[180px]">
                                  {cust.customerName}
                                </p>
                                {cust.userId && (
                                  <span className="inline-flex items-center gap-1 text-[10px] text-sky-400">
                                    <User className="size-2.5" /> Member
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          <td className="px-3 py-3.5">
                            <div className="space-y-0.5">
                              {cust.phone ? (
                                <a
                                  href={`tel:${cust.phone}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white"
                                >
                                  <Phone className="size-3 text-slate-500" />
                                  <span>{cust.phone}</span>
                                </a>
                              ) : (
                                <span className="text-[11px] text-slate-500">-</span>
                              )}
                              {cust.email && (
                                <a
                                  href={`mailto:${cust.email}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white truncate max-w-[160px]"
                                >
                                  <Mail className="size-3 text-slate-500" />
                                  <span className="truncate">{cust.email}</span>
                                </a>
                              )}
                            </div>
                          </td>

                          <td className="px-3 py-3.5">
                            {cust.erpnextCustomerId ? (
                              <div className="flex items-center gap-1.5">
                                <span className="inline-flex items-center gap-1 rounded bg-[#238636]/15 border border-[#238636]/30 px-2 py-0.5 text-[11px] font-mono text-[#3fb950]">
                                  <CheckCircle2 className="size-2.5" />
                                  {cust.erpnextCustomerId}
                                </span>
                                {erpUrl && (
                                  <a
                                    href={erpUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="p-1 text-slate-400 hover:text-white transition-colors"
                                    title="Open Customer in ERPNext"
                                  >
                                    <ExternalLink className="size-3" />
                                  </a>
                                )}
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">
                                Local Only
                              </span>
                            )}
                          </td>

                          <td className="px-3 py-3.5">
                            {cust.hasLocationPin && cust.latitude && cust.longitude ? (
                              <div className="space-y-1">
                                <div className="inline-flex items-center gap-1 rounded bg-[#0B1121] border border-[#B7D1EA]/30 px-2 py-0.5 text-[11px] font-mono text-[#B7D1EA]">
                                  <MapPin className="size-2.5 shrink-0" />
                                  <span>{cust.latitude.toFixed(4)}, {cust.longitude.toFixed(4)}</span>
                                </div>
                                {cust.address && (
                                  <p className="text-[10px] text-slate-400 truncate max-w-[180px]">
                                    {cust.address}
                                  </p>
                                )}
                              </div>
                            ) : cust.address ? (
                              <div className="flex items-center gap-1 text-[11px] text-slate-400">
                                <MapPin className="size-3 text-slate-500 shrink-0" />
                                <span className="truncate max-w-[160px]">{cust.address}</span>
                              </div>
                            ) : (
                              <span className="text-[11px] text-slate-500">-</span>
                            )}
                          </td>

                          <td className="px-3 py-3.5 text-right font-mono">
                            <div className="font-semibold text-slate-200">
                              {formatPrice(cust.totalPipelineValue)}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              {cust.proposalsCount} {cust.proposalsCount === 1 ? "Quotation" : "Quotations"}
                            </div>
                          </td>

                          <td className="py-3.5 pl-3 pr-4 text-right sm:pr-6">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedCustomer(cust);
                              }}
                              className="inline-flex items-center gap-1 rounded border border-[#30363d] bg-[#21262d] px-2.5 py-1 text-xs font-semibold text-slate-300 hover:border-[#8b949e] hover:text-white transition-colors"
                            >
                              <span>{locale === "th" ? "ดูรายละเอียด" : "Details"}</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* CREATE MANUAL REQUEST MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg space-y-6 rounded-xl border border-slate-800 bg-[#0F172A] p-6 shadow-2xl shadow-black/30">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-[#B7D1EA]" />
                Create Manual Request (Offline Lead)
              </h3>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateManualSubmit} className="space-y-4">
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-slate-300">Customer Name *</span>
                <input
                  type="text"
                  required
                  placeholder="e.g. คุณสมชาย วงศ์สว่าง"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  className="w-full bg-[#0B1121] border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#B7D1EA]"
                />
              </label>

              <div className="grid grid-cols-2 gap-4">
                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-slate-300">Phone Number *</span>
                  <input
                    type="text"
                    required
                    placeholder="081-234-5678"
                    value={createPhone}
                    onChange={(e) => setCreatePhone(e.target.value)}
                    className="w-full bg-[#0B1121] border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#B7D1EA]"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-slate-300">Email Address</span>
                  <input
                    type="email"
                    placeholder="customer@example.com"
                    value={createEmail}
                    onChange={(e) => setCreateEmail(e.target.value)}
                    className="w-full bg-[#0B1121] border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#B7D1EA]"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-slate-300">Config Type</span>
                  <select
                    value={createType}
                    onChange={(e) => setCreateType(e.target.value as InboundRequestType)}
                    className="w-full bg-[#0B1121] border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white"
                  >
                    <option value="WIZARD">Wizard Inquiry</option>
                    <option value="BUILD">Build Configurator</option>
                    <option value="SERVICE">Solar Services</option>
                  </select>
                </label>

                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-slate-300">Source</span>
                  <select
                    value={createSource}
                    onChange={(e) => setCreateSource(e.target.value)}
                    className="w-full bg-[#0B1121] border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white font-mono"
                  >
                    <option value="manual">manual (Walk-in/Phone)</option>
                    <option value="LINE">LINE</option>
                    <option value="Facebook">Facebook</option>
                    <option value="referral">Referral</option>
                    <option value="direct">Direct</option>
                  </select>
                </label>
              </div>

              <label className="block space-y-1">
                <span className="text-xs font-semibold text-slate-300">Notes / Build Specs</span>
                <textarea
                  rows={3}
                  placeholder="System requirements, target kW size, customer notes..."
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
                  {isPending ? "Submitting..." : "Save ERPNext Lead"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FULL-PAGE WORKSPACE MODAL: INBOUND LEAD RECORD */}
      {selectedRequest && (() => {
        const parsed = parseLeadPayload(selectedRequest.payload);
        const locDetails = extractLocationDetails(selectedRequest.payload);
        const selectedErpnextLeadUrl = selectedRequest.erpnextSyncStatus === "SYNCED"
          ? getErpnextLeadUrl(erpnextBaseUrl, selectedRequest.erpnextLeadId)
          : "";
        const currentLeadIndex = filteredRequests.findIndex((r) => r.id === selectedRequest.id);
        const totalLeadsCount = filteredRequests.length;
        const hasPrevLead = currentLeadIndex > 0;
        const hasNextLead = currentLeadIndex >= 0 && currentLeadIndex < totalLeadsCount - 1;
        const handlePrevLead = () => {
          if (hasPrevLead) openRequestPanel(filteredRequests[currentLeadIndex - 1]);
        };
        const handleNextLead = () => {
          if (hasNextLead) openRequestPanel(filteredRequests[currentLeadIndex + 1]);
        };

        return (
          <div className="fixed inset-0 z-50 flex flex-col bg-[#0B1121] animate-in fade-in-50 duration-200">
            {/* FIXED TOP HEADER BAR */}
            <div className="flex shrink-0 flex-col gap-4 border-b border-slate-800 bg-[#0F172A] px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8 z-10 shadow-md">
              <div className="flex flex-wrap items-center gap-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-[#B7D1EA]/30 bg-[#B7D1EA]/15 px-3 py-1 text-xs font-bold text-[#B7D1EA]">
                  <Compass className="h-3.5 w-3.5" />
                  <span>Inbound lead record</span>
                </div>
                <h2 className="text-xl font-bold text-white truncate max-w-md">
                  {selectedRequest.customerName}
                </h2>
                <span className="hidden font-mono text-xs text-slate-400 sm:inline">
                  #{selectedRequest.id.slice(0, 8)} · {selectedRequest.requestType}
                </span>
              </div>

              {/* PREVIOUS / NEXT LEAD NAVIGATION CONTROLS */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 rounded-xl border border-slate-800 bg-[#0B1121] p-1 text-xs font-mono text-slate-300">
                  <button
                    type="button"
                    onClick={handlePrevLead}
                    disabled={!hasPrevLead}
                    className="flex h-8 items-center gap-1 rounded-lg px-2.5 font-bold transition hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent cursor-pointer"
                    title="Previous lead"
                  >
                    <ChevronLeft className="h-4 w-4 text-[#B7D1EA]" />
                    <span className="hidden sm:inline">Prev</span>
                  </button>
                  <span className="px-2 text-[11px] font-bold text-slate-400 border-x border-slate-800">
                    {currentLeadIndex >= 0 ? `${currentLeadIndex + 1} of ${totalLeadsCount}` : "Lead record"}
                  </span>
                  <button
                    type="button"
                    onClick={handleNextLead}
                    disabled={!hasNextLead}
                    className="flex h-8 items-center gap-1 rounded-lg px-2.5 font-bold transition hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent cursor-pointer"
                    title="Next lead"
                  >
                    <span className="hidden sm:inline">Next</span>
                    <ChevronRight className="h-4 w-4 text-[#B7D1EA]" />
                  </button>
                </div>

                <div className="rounded-xl border border-slate-700 bg-[#0F172A] px-3.5 py-1.5 text-right">
                  <span className="block text-[10px] font-mono uppercase text-slate-400">System size</span>
                  <span className="text-sm font-bold text-[#B7D1EA]">
                    {parsed.targetCapacity > 0 ? `${parsed.targetCapacity.toFixed(2)} kWp` : "Capacity pending"}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setRequestToDelete(selectedRequest)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 text-xs font-bold text-rose-400 hover:bg-rose-500/20 transition-colors cursor-pointer"
                  title="Delete lead / service order"
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Delete Record</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedRequest(null)}
                  className="rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
                  title="Close Workspace Modal"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
            </div>

            {/* SCROLLABLE WORKSPACE CONTENT BODY */}
            <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6 bg-[#0B1121] max-w-7xl mx-auto w-full">
              {/* ERPNext CRM Sync Zone */}
              <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-[#0F172A] p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300">ERPNext CRM sync</p>
                  <p className="mt-1 text-sm font-bold text-slate-100">
                    {selectedRequest.erpnextLeadId || "Waiting for ERPNext Lead creation"}
                  </p>
                  {selectedRequest.erpnextSyncError ? (
                    <p className="mt-1 text-xs font-medium text-rose-400">{selectedRequest.erpnextSyncError}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn(
                    "rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wider",
                    selectedRequest.erpnextSyncStatus === "SYNCED"
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                      : selectedRequest.erpnextSyncStatus === "FAILED"
                        ? "border-rose-500/30 bg-rose-500/10 text-rose-400"
                        : "border-sky-500/30 bg-sky-500/10 text-sky-400",
                  )}>
                    {selectedRequest.erpnextSyncStatus === "SYNCED" ? "CRM synced" : selectedRequest.erpnextSyncStatus}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleVerifyErp(selectedRequest.id)}
                    disabled={checkingErpRequestId !== null}
                    className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/60 px-3.5 text-xs font-bold text-slate-200 transition-colors hover:border-[#B7D1EA] hover:text-[#B7D1EA] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5", checkingErpRequestId === selectedRequest.id && "animate-spin")} />
                    Verify ERP
                  </button>
                  {selectedErpnextLeadUrl ? (
                    <a href={selectedErpnextLeadUrl} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#B7D1EA] px-3.5 text-xs font-bold text-[#0F172A] transition-colors hover:bg-[#99BFE3]">
                      View CRM <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : null}
                </div>
              </div>

              {/* Lead detail tree */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* System Specifications Matrix */}
                <div className="rounded-xl border border-slate-800 bg-[#0F172A] p-5 space-y-4 shadow-sm">
                  <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
                    <Zap className="h-5 w-5 text-[#B7D1EA]" />
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                      System configuration
                    </h3>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <ProfileTile
                      label="Target Capacity"
                      value={parsed.targetCapacity > 0 ? `${parsed.targetCapacity.toFixed(2)} kWp` : "Not specified"}
                      emphasis
                    />
                    <ProfileTile
                      label="System Price / Budget"
                      value={parsed.estimatedBudget > 0 ? formatPrice(parsed.estimatedBudget) : "Not specified"}
                      emphasis
                    />
                    <ProfileTile
                      label="Predicted Monthly Savings"
                      value={parsed.monthlySavings > 0 ? formatPrice(parsed.monthlySavings) : "Not specified"}
                      emphasis
                      colSpan
                    />
                    <ProfileTile
                      label="Inverter Architecture"
                      value={parsed.inverterArchitecture}
                      colSpan
                    />
                  </div>

                  {/* Smart Add-ons */}
                  <div className="rounded-xl border border-slate-800 bg-[#0B1121] p-4 space-y-2">
                    <p className="text-xs font-mono uppercase text-slate-300 tracking-wider font-bold">Smart Add-ons</p>
                    {parsed.addOns.length > 0 ? (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {parsed.addOns.map((addon, i) => (
                          <span
                            key={i}
                            className="rounded-full border border-slate-700 bg-[#141B2D] px-3 py-1.5 text-xs font-bold text-slate-100"
                          >
                            {addon}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-lg bg-slate-900/60 border border-slate-800 px-3 py-2 text-center text-xs text-slate-400 font-mono">
                        No smart add-ons selected
                      </div>
                    )}
                  </div>
                </div>

                {/* Outreach & Communication Profile */}
                <div className="rounded-xl border border-slate-800 bg-[#0F172A] p-5 space-y-4 shadow-sm">
                  <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
                    <User className="h-5 w-5 text-[#B7D1EA]" />
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                      Customer contact
                    </h3>
                  </div>

                  <div className="space-y-3">
                    <ProfileTile label="Full Name" value={selectedRequest.customerName || "Unknown customer"} compact />

                    <div className="rounded-xl border border-slate-800 bg-[#0B1121] p-3.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-mono uppercase text-slate-300 tracking-wider font-bold">Phone</p>
                        <p className="mt-0.5 text-sm font-bold text-slate-100 truncate">{selectedRequest.phone || "No phone provided"}</p>
                      </div>
                      {selectedRequest.phone && (
                        <a
                          href={`tel:${selectedRequest.phone}`}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold hover:bg-emerald-500/20 transition-colors shrink-0"
                        >
                          <Phone className="w-3.5 h-3.5" />
                          <span>Call</span>
                        </a>
                      )}
                    </div>

                    <div className="rounded-xl border border-slate-800 bg-[#0B1121] p-3.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-mono uppercase text-slate-300 tracking-wider font-bold">Email</p>
                        <p className="mt-0.5 text-xs font-bold text-slate-100 truncate">
                          {selectedRequest.email || "No email provided"}
                        </p>
                      </div>
                      {selectedRequest.email && (
                        <a
                          href={`mailto:${selectedRequest.email}`}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs font-bold hover:bg-sky-500/20 transition-colors shrink-0"
                        >
                          <Mail className="w-3.5 h-3.5" />
                          <span>Email</span>
                        </a>
                      )}
                    </div>
                    <ProfileTile label="Postal Code" value={parsed.postalCode || "Not specified"} compact />

                    {/* Preferred Contact Time Box */}
                    <div className="rounded-xl border border-[#B7D1EA]/40 bg-[#B7D1EA]/10 p-4">
                      <p className="text-xs font-bold text-[#B7D1EA]">Preferred Contact Time</p>
                      <p className="mt-1 text-sm font-bold text-white">
                        {parsed.preferredDateTime || new Date(selectedRequest.createdAt).toLocaleString("th-TH")}
                      </p>
                      <p className="mt-1 text-xs font-medium text-slate-300">
                        วันที่และเวลาสะดวกให้ติดต่อกลับ
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Pinned Installation Location & Map Section */}
              {(locDetails.latitude !== null || locDetails.displayName) && (
                <div className="rounded-xl border border-slate-800 bg-[#0F172A] p-5 space-y-4 shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-5 w-5 text-[#B7D1EA]" />
                      <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                        Pinned Site Location
                      </h3>
                    </div>
                    {locDetails.hasPdpaConsent && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-[11px] font-bold text-emerald-400">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>PDPA Consent Granted</span>
                      </span>
                    )}
                  </div>

                  <SiteLocationMap
                    latitude={locDetails.latitude}
                    longitude={locDetails.longitude}
                    displayName={locDetails.displayName}
                    address={locDetails.address}
                  />
                </div>
              )}

              {/* Workflow branch */}
              <div className="rounded-xl border border-slate-800 bg-[#0F172A] p-5 space-y-4 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Settings2 className="w-4 h-4 text-[#B7D1EA]" />
                    <span className="text-sm font-bold text-white uppercase tracking-wider">
                      Lifecycle and staff follow-up
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {(["NEW", "CONTACTED", "QUOTED", "REJECTED"] as InboundRequestStatus[]).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => handleStatusChange(selectedRequest.id, st)}
                        className={cn(
                          "px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all border cursor-pointer",
                          selectedRequest.status === st
                            ? "bg-[#B7D1EA] text-[#0F172A] border-[#B7D1EA] shadow-md"
                            : "bg-[#0B1121] text-slate-300 border-slate-800 hover:text-white"
                        )}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Staff Notes */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <MessageSquareText className="w-3.5 h-3.5 text-[#B7D1EA]" />
                      Custom Staff Notes (Syncs to ERPNext Lead)
                    </label>
                    <button
                      type="button"
                      onClick={handleSaveStaffNotes}
                      disabled={isPending}
                      className="flex items-center gap-1 px-3 py-1.5 bg-[#B7D1EA] text-[#0F172A] rounded-lg text-xs font-bold uppercase hover:bg-[#99BFE3] transition-all cursor-pointer disabled:opacity-50"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Save Note</span>
                    </button>
                  </div>
                  <textarea
                    rows={3}
                    value={staffNote}
                    onChange={(e) => setStaffNote(e.target.value)}
                    placeholder="Record customer discussion notes, site inspection date, special pricing requests..."
                    className="w-full bg-[#0B1121] border border-slate-800 rounded-xl p-3.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#B7D1EA] resize-none"
                  />
                </div>

                {/* Linked Quotation Status */}
                {selectedRequest.quotationId && (
                  <div className="p-4 bg-emerald-950/40 border border-emerald-800/60 rounded-xl flex items-center justify-between text-xs text-emerald-300">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>Linked Quotation: ID #{selectedRequest.quotationId}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedRequest(null);
                        setPipelineView("quotations");
                      }}
                      className="flex items-center gap-1 text-[#B7D1EA] hover:underline font-bold cursor-pointer"
                    >
                      <span>View in Quotations CRM</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Advanced payload branch */}
              <details className="group rounded-xl border border-slate-800 bg-[#0F172A] p-5 shadow-sm">
                <summary className="cursor-pointer font-mono text-xs text-slate-300 hover:text-white font-bold flex items-center justify-between select-none">
                  <span className="flex items-center gap-2">
                    <Compass className="w-4 h-4 text-[#B7D1EA]" />
                    Raw request payload
                  </span>
                  <span className="text-[10px] text-slate-400 font-normal group-open:hidden">Click to expand</span>
                </summary>
                <div className="mt-4 pt-3 border-t border-slate-800">
                  <LeadPayloadSummary payload={selectedRequest.payload} />
                </div>
              </details>
            </div>

            {/* FIXED BOTTOM ACTION BAR */}
            <div className="flex shrink-0 items-center justify-between border-t border-slate-800 bg-[#0F172A] px-6 py-4 sm:px-8 z-10 shadow-lg">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedRequest(null)}
                  className="px-4 py-2.5 bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold hover:bg-slate-700 cursor-pointer"
                >
                  Close Drawer
                </button>
                <AuditLogTrigger
                  onClick={() => openAuditSidebar(
                    [selectedRequest.id, selectedRequest.quotationId, selectedRequest.consultationLeadId],
                    "Lead activity",
                    `${selectedRequest.customerName} · #${selectedRequest.id.slice(0, 8).toUpperCase()}`,
                  )}
                  label="Logs"
                  className="min-h-10 px-2.5"
                />
              </div>

              <button
                type="button"
                onClick={() => handleConvertLeadToQuotation(selectedRequest.id, selectedRequest.customerName)}
                disabled={isPending || Boolean(selectedRequest.quotationId)}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#B7D1EA] hover:bg-[#99BFE3] text-[#0F172A] rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md cursor-pointer disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
                <span>
                  {selectedRequest.quotationId ? "Quotation Generated" : "Generate Quotation"}
                </span>
              </button>
            </div>
          </div>
        );
      })()}

      {/* FULL-PAGE WORKSPACE MODAL: CUSTOMER RECORD */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-xs">
          <div className="flex h-full w-full max-w-2xl flex-col border-l border-slate-800 bg-[#0B1121] shadow-2xl animate-in slide-in-from-right duration-300">
            {/* DRAWER HEADER */}
            <div className="flex shrink-0 items-center justify-between border-b border-slate-800 bg-[#0F172A] px-6 py-5 sm:px-8">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-full bg-[#161b22] border border-[#30363d] flex items-center justify-center text-sm font-bold text-slate-200">
                  {selectedCustomer.customerName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-white tracking-tight sm:text-lg">
                      {selectedCustomer.customerName}
                    </h2>
                    {selectedCustomer.userId && (
                      <span className="inline-flex items-center gap-1 rounded bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 text-[10px] font-medium text-sky-400">
                        <User className="size-2.5" /> Member
                      </span>
                    )}
                  </div>
              <p className="mt-0.5 text-xs text-slate-400">
                Customer ID: <span className="font-mono text-slate-300">{selectedCustomer.id}</span>
              </p>
            </div>
          </div>
              <div className="flex items-center gap-2">
                <AuditLogTrigger
                  onClick={() => openAuditSidebar(
                    [
                      selectedCustomer.userId,
                      selectedCustomer.id,
                      ...crmRows
                        .filter((row) => {
                          const sameEmail = Boolean(selectedCustomer.email && row.email && selectedCustomer.email.toLowerCase() === row.email.toLowerCase());
                          const samePhone = Boolean(selectedCustomer.phone && row.phone && selectedCustomer.phone === row.phone);
                          const hasStableContact = Boolean(selectedCustomer.email || selectedCustomer.phone);
                          const sameName = !hasStableContact && Boolean(selectedCustomer.customerName && row.customerName && selectedCustomer.customerName.toLowerCase() === row.customerName.toLowerCase());
                          return sameEmail || samePhone || sameName;
                        })
                        .map((row) => row.id),
                      ...requests
                        .filter((request) => {
                          const sameEmail = Boolean(selectedCustomer.email && request.email && selectedCustomer.email.toLowerCase() === request.email.toLowerCase());
                          const samePhone = Boolean(selectedCustomer.phone && request.phone && selectedCustomer.phone === request.phone);
                          const hasStableContact = Boolean(selectedCustomer.email || selectedCustomer.phone);
                          const sameName = !hasStableContact && Boolean(selectedCustomer.customerName && request.customerName && selectedCustomer.customerName.toLowerCase() === request.customerName.toLowerCase());
                          return sameEmail || samePhone || sameName;
                        })
                        .flatMap((request) => [request.id, request.quotationId, request.consultationLeadId]),
                      ...salesThreads
                        .filter((thread) => {
                          const sameEmail = Boolean(selectedCustomer.email && thread.email && selectedCustomer.email.toLowerCase() === thread.email.toLowerCase());
                          const samePhone = Boolean(selectedCustomer.phone && thread.phone && selectedCustomer.phone === thread.phone);
                          const hasStableContact = Boolean(selectedCustomer.email || selectedCustomer.phone);
                          const sameName = !hasStableContact && Boolean(selectedCustomer.customerName && thread.customerName && selectedCustomer.customerName.toLowerCase() === thread.customerName.toLowerCase());
                          return sameEmail || samePhone || sameName;
                        })
                        .flatMap((thread) => [
                          thread.id.includes(":") ? null : thread.id,
                          thread.lead?.id,
                          thread.lead?.consultationLeadId,
                          thread.lead?.inboundRequestId,
                          thread.quotation?.id,
                        ]),
                    ],
                    "Customer activity",
                    `${selectedCustomer.customerName} · ${selectedCustomer.email || selectedCustomer.phone || selectedCustomer.id}`,
                  )}
                  label="Logs"
                  className="min-h-9 px-2 text-[10px]"
                />
                <button
                type="button"
                onClick={() => setSelectedCustomer(null)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
              </div>
            </div>

            {/* DRAWER SCROLLABLE CONTENT */}
            <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6">
              {/* ERPNext Sync Status Card */}
              <div className="rounded-xl border border-slate-800 bg-[#0F172A] p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-[#58a6ff]" />
                    <h3 className="text-xs font-mono uppercase tracking-wider font-bold text-slate-200">
                      ERPNext CRM Integration
                    </h3>
                  </div>
                  {selectedCustomer.erpnextCustomerId ? (
                    <span className="inline-flex items-center gap-1 rounded bg-[#238636]/20 border border-[#238636]/40 px-2.5 py-1 text-xs font-mono text-[#3fb950] font-bold">
                      <CheckCircle2 className="size-3" />
                      {selectedCustomer.erpnextCustomerId}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded bg-slate-800 px-2.5 py-1 text-xs text-slate-400">
                      Local Record Only
                    </span>
                  )}
                </div>

                {selectedCustomer.erpnextCustomerId && erpnextBaseUrl && (
                  <a
                    href={getErpnextLeadUrl(erpnextBaseUrl, selectedCustomer.erpnextCustomerId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#58a6ff] hover:underline"
                  >
                    <span>Open Customer Document in ERPNext</span>
                    <ExternalLink className="size-3" />
                  </a>
                )}
              </div>

              {/* Contact Information */}
              <div className="rounded-xl border border-slate-800 bg-[#0F172A] p-5 shadow-sm space-y-4">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-[#B7D1EA]" />
                  <h3 className="text-xs font-mono uppercase tracking-wider font-bold text-slate-200">
                    Contact Details
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-xl border border-slate-800 bg-[#0B1121] p-3.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-mono uppercase text-slate-300 tracking-wider font-bold">Phone</p>
                      <p className="mt-0.5 text-xs font-bold text-slate-100 truncate">
                        {selectedCustomer.phone || "No phone registered"}
                      </p>
                    </div>
                    {selectedCustomer.phone && (
                      <a
                        href={`tel:${selectedCustomer.phone}`}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold hover:bg-emerald-500/20 transition-colors shrink-0"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span>Call</span>
                      </a>
                    )}
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-[#0B1121] p-3.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-mono uppercase text-slate-300 tracking-wider font-bold">Email</p>
                      <p className="mt-0.5 text-xs font-bold text-slate-100 truncate">
                        {selectedCustomer.email || "No email registered"}
                      </p>
                    </div>
                    {selectedCustomer.email && (
                      <a
                        href={`mailto:${selectedCustomer.email}`}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs font-bold hover:bg-sky-500/20 transition-colors shrink-0"
                      >
                        <Mail className="w-3.5 h-3.5" />
                        <span>Email</span>
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {/* Pinned Site Location Map (After-Sale Support) */}
              <div className="rounded-xl border border-slate-800 bg-[#0F172A] p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-[#B7D1EA]" />
                    <h3 className="text-xs font-mono uppercase tracking-wider font-bold text-slate-200">
                      Pinned Site Location (After-Sale Support)
                    </h3>
                  </div>
                  {selectedCustomer.hasLocationPin && (
                    <span className="inline-flex items-center gap-1 rounded bg-[#238636]/15 border border-[#238636]/30 px-2 py-0.5 text-[10px] font-medium text-[#3fb950]">
                      <ShieldCheck className="w-3 h-3" />
                      PDPA Consent Verified
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-400">
                  {locale === "th"
                    ? "พิกัดแผนที่จริงสำหรับงานบริการหลังการขาย การตรวจเช็คหน้างาน และการเข้าติดตั้ง"
                    : "Accurate GPS coordinates and installation site address for after-sale support, site surveys, and technician dispatch."}
                </p>

                <div className="mt-2">
                  <SiteLocationMap
                    latitude={selectedCustomer.latitude}
                    longitude={selectedCustomer.longitude}
                    displayName={selectedCustomer.address}
                    address={selectedCustomer.address}
                    heightClass="h-[220px]"
                  />
                </div>
              </div>

              {/* Linked Proposals / Quotations */}
              <div className="rounded-xl border border-slate-800 bg-[#0F172A] p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#d29922]" />
                    <h3 className="text-xs font-mono uppercase tracking-wider font-bold text-slate-200">
                      Quotations & Projects ({selectedCustomer.proposalsCount})
                    </h3>
                  </div>
                  <span className="text-xs font-mono font-bold text-[#e3b341]">
                    {formatPrice(selectedCustomer.totalPipelineValue)}
                  </span>
                </div>

                {crmRows
                  .filter((r) => {
                    const normCust = selectedCustomer.customerName.toLowerCase();
                    const normRow = (r.customerName || "").toLowerCase();
                    const normEmail = (selectedCustomer.email || "").toLowerCase();
                    const rowEmail = (r.email || "").toLowerCase();
                    return (normEmail && rowEmail === normEmail) || (normCust && normRow === normCust);
                  })
                  .slice(0, 5)
                  .map((row) => (
                    <div
                      key={row.id}
                      className="flex items-center justify-between rounded-lg border border-slate-800 bg-[#0B1121] p-3 text-xs"
                    >
                      <div>
                        <p className="font-semibold text-slate-200">{row.trackRequestNumber || `Quotation #${row.id.slice(0, 8)}`}</p>
                        <p className="text-[10px] text-slate-400">
                          {new Date(row.createdAt).toLocaleDateString(locale === "th" ? "th-TH" : "en-US")} · Status: {row.status}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-semibold text-slate-200">
                          {formatPrice(row.value || 0)}
                        </span>
                        <a
                          href={`/${locale}/admin/crm/${row.id}`}
                          className="p-1 text-slate-400 hover:text-white"
                          title="Open Quotation Workbench"
                        >
                          <ExternalLink className="size-3.5" />
                        </a>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {/* FIXED BOTTOM ACTION BAR */}
            <div className="flex shrink-0 items-center justify-between border-t border-slate-800 bg-[#0F172A] px-6 py-4 sm:px-8 z-10 shadow-lg">
              <button
                type="button"
                onClick={() => setSelectedCustomer(null)}
                className="px-4 py-2.5 bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold hover:bg-slate-700 cursor-pointer"
              >
                Close Drawer
              </button>

              <button
                type="button"
                onClick={() => setLinkedRecordToDelete({
                  target: {
                    type: "CUSTOMER",
                    id: selectedCustomer.userId || selectedCustomer.id,
                    customerName: selectedCustomer.customerName,
                    email: selectedCustomer.email,
                    phone: selectedCustomer.phone,
                  },
                  name: selectedCustomer.customerName,
                  kind: "customer",
                })}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 text-xs font-semibold text-rose-300 transition-colors hover:bg-rose-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0F172A] motion-reduce:transition-none"
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
                Delete thread
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedCustomer(null);
                  setPipelineView("quotations");
                }}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#B7D1EA] hover:bg-[#99BFE3] text-[#0F172A] rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>View Quotations</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SINGLE REQUEST DELETE CONFIRMATION MODAL */}
      <ConfirmDeleteModal
        isOpen={requestToDelete !== null}
        onClose={() => setRequestToDelete(null)}
        onConfirm={handleDeleteRequest}
        isDeleting={isDeletingRequest}
        title={
          requestToDelete?.requestType === "SERVICE"
            ? (locale === "th" ? "ลบรายการสั่งซื้อบริการ (Services Order)" : "Delete Services Order")
            : (locale === "th" ? "ลบรายการ Lead / คำขอเสนอราคา" : "Delete Lead Request")
        }
        message={
          locale === "th"
            ? `คุณแน่ใจหรือไม่ว่าต้องการลบรายการของ "${requestToDelete?.customerName}" (${requestToDelete?.requestType}) ออกจากระบบ? การกระทำนี้ไม่สามารถย้อนกลับได้`
            : `Are you sure you want to permanently delete the request for "${requestToDelete?.customerName}" (${requestToDelete?.requestType}) from the Sales Pipeline? This action cannot be undone.`
        }
      />

      {/* BULK DELETE CONFIRMATION MODAL */}
      <ConfirmDeleteModal
        isOpen={isBulkDeleteOpen}
        onClose={() => setIsBulkDeleteOpen(false)}
        onConfirm={handleBulkDeleteRequests}
        isDeleting={isDeletingRequest}
        title={locale === "th" ? "ลบรายการที่เลือกทั้งหมด" : "Delete Selected Requests"}
        message={
          locale === "th"
            ? `คุณแน่ใจหรือไม่ว่าต้องการลบ ${requestSelection.selectedCount} รายการที่เลือกออกจากระบบ? การกระทำนี้ไม่สามารถย้อนกลับได้`
            : `Are you sure you want to permanently delete ${requestSelection.selectedCount} selected request(s) / order(s)? This action cannot be undone.`
        }
      />

      <ConfirmDeleteModal
        isOpen={isBulkThreadDeleteOpen}
        onClose={() => setIsBulkThreadDeleteOpen(false)}
        onConfirm={handleBulkDeleteThreads}
        isDeleting={isDeletingThreadSelection}
        title="Delete selected sales threads"
        message={`Permanently delete ${threadSelection.selectedCount} selected linked sales thread(s), including their leads, quotations, service/order records, and customer activity? Customer login accounts will be retained. This action cannot be undone.`}
      />

      <ConfirmDeleteModal
        isOpen={linkedRecordToDelete !== null}
        onClose={() => setLinkedRecordToDelete(null)}
        onConfirm={handleDeleteLinkedRecord}
        isDeleting={isDeletingLinkedRecord}
        title="Delete linked sales thread"
        message={linkedRecordToDelete
          ? `Permanently delete the linked lead, quotation, service/order records, and customer activity thread for "${linkedRecordToDelete.name}"? The customer login account will be retained. This action cannot be undone.`
          : "This action permanently deletes the linked sales thread."}
      />

      {auditSidebar ? (
        <AuditLogSidebar
          isOpen
          onClose={() => setAuditSidebar(null)}
          logs={auditSidebar.logs}
          title={auditSidebar.title}
          entityLabel={auditSidebar.entityLabel}
          loading={auditSidebar.isLoading}
          emptyMessage="No activity has been recorded for this linked sales thread yet."
        />
      ) : null}
    </div>
  );
}

function parseLeadPayload(payload: Record<string, unknown> | null | undefined) {
  if (!payload || typeof payload !== "object") {
    return {
      targetCapacity: 0,
      estimatedBudget: 0,
      inverterArchitecture: "1x 6kW Grid-Tie Inverter (Standard/Certified TIER-1)",
      monthlySavings: 0,
      addOns: [] as string[],
      postalCode: "",
      preferredDateTime: "",
    };
  }

  const targetCapacity = Number(
    payload.systemSizeKwp || payload.sizeKwp || payload.recommendedSizeKw || payload.targetSystemSize || payload.systemCapacityKwp || 0
  );
  const estimatedBudget = Number(
    payload.totalPrice || payload.estimatedPrice || payload.estimatedBudget || payload.price || 0
  );

  let inverterArchitecture = String(
    payload.inverterArchitecture || payload.architecture || payload.inverterType || "1x 6kW Grid-Tie Inverter (Standard/Certified TIER-1)"
  );
  if (inverterArchitecture.toLowerCase() === "on-grid") {
    inverterArchitecture = "1x 6kW Grid-Tie Inverter (Standard/Certified TIER-1)";
  } else if (inverterArchitecture.toLowerCase() === "hybrid") {
    inverterArchitecture = "Hybrid Storage Inverter System";
  }

  const monthlySavings = Number(
    payload.monthlySavings || payload.estimatedMonthlySavings || payload.calculatedMonthlySavings || (targetCapacity > 0 ? targetCapacity * 4.2 * 30 * 4.2 : 0)
  );

  const rawAddOns = Array.isArray(payload.addOns)
    ? payload.addOns.map(String)
    : Array.isArray(payload.addons)
    ? payload.addons.map(String)
    : typeof payload.smartAddOns === "string" && payload.smartAddOns.trim()
    ? payload.smartAddOns.split(",").map((s) => s.trim())
    : [];

  const addOns = rawAddOns.filter(Boolean);

  const postalCode = String(payload.postalCode || payload.zipCode || payload.postal || "");
  const preferredDateTime = String(payload.preferredDateTime || payload.preferredTime || payload.contactTime || "");

  return {
    targetCapacity,
    estimatedBudget,
    inverterArchitecture,
    monthlySavings,
    addOns,
    postalCode,
    preferredDateTime,
  };
}

function extractLocationDetails(payload: Record<string, unknown> | null | undefined): {
  latitude: number | null;
  longitude: number | null;
  displayName: string | null;
  address: string | null;
  hasPdpaConsent: boolean;
} {
  if (!payload || typeof payload !== "object") {
    return { latitude: null, longitude: null, displayName: null, address: null, hasPdpaConsent: false };
  }

  const siteLocation = (payload.siteLocation ||
    (payload.wizardAnswers as Record<string, unknown> | undefined)?.siteLocation ||
    (payload.systemProfile as Record<string, unknown> | undefined)?.siteLocation ||
    payload.locationSnapshot) as Record<string, unknown> | undefined;

  let latitude: number | null = null;
  let longitude: number | null = null;
  let displayName: string | null = null;
  let address: string | null = null;
  let hasPdpaConsent = false;

  if (siteLocation && typeof siteLocation === "object") {
    const lat = Number(siteLocation.latitude ?? siteLocation.lat);
    const lng = Number(siteLocation.longitude ?? siteLocation.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      latitude = lat;
      longitude = lng;
    }
    if (typeof siteLocation.displayName === "string") {
      displayName = siteLocation.displayName;
    }
    if (typeof siteLocation.address === "string") {
      address = siteLocation.address;
    }
    if (siteLocation.pdpaLocationConsent || siteLocation.pdpaConsent) {
      hasPdpaConsent = true;
    }
  }

  if (latitude === null || longitude === null) {
    const lat = Number(payload.latitude ?? payload.lat);
    const lng = Number(payload.longitude ?? payload.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      latitude = lat;
      longitude = lng;
    }
  }

  if (!displayName) {
    if (typeof payload.location === "string" && payload.location.trim()) {
      displayName = payload.location.trim();
    } else if (typeof payload.address === "string" && payload.address.trim()) {
      displayName = payload.address.trim();
    }
  }

  if (payload.pdpaLocationConsent || payload.pdpaConsent) {
    hasPdpaConsent = true;
  }

  return { latitude, longitude, displayName, address, hasPdpaConsent };
}

function ProfileTile({
  label,
  value,
  compact = false,
  emphasis = false,
  colSpan = false,
}: {
  label: string;
  value: string;
  compact?: boolean;
  emphasis?: boolean;
  colSpan?: boolean;
}) {
  return (
    <div className={cn("rounded-xl border border-slate-800 bg-[#0B1121] p-3.5", colSpan && "col-span-2")}>
      <p className="text-xs font-mono uppercase text-slate-300 tracking-wider font-bold">{label}</p>
      <p
        className={cn(
          "mt-1 break-words font-bold text-slate-100",
          emphasis ? "text-lg leading-tight tracking-tight text-[#B7D1EA]" : compact ? "text-xs leading-5" : "text-sm leading-6"
        )}
      >
        {value}
      </p>
    </div>
  );
}
