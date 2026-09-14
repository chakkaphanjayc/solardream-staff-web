"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Search,
  Calendar,
  User,
  Wrench,
  Clock,
  CheckCircle2,
  MapPin,
  Phone,
  Inbox,
  FileCheck2,
  UsersRound,
} from "@/components/ui/icons";
import { assignJobTicket } from "@/app/actions/tickets";
import { AdminBulkActionBar } from "@/components/admin/AdminBulkActionBar";
import { AdminSelectionCheckbox } from "@/components/admin/AdminSelectionCheckbox";
import DocumentUploaderItem from "@/components/ui/document-uploader-item";
import { AuditLogSidebar, AuditLogTrigger, type AuditTimelineItem } from "@/components/ui/AuditLogSidebar";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { GsapSpinner } from "@/components/ui/GsapMotion";
import StatusBadge, { type StatusBadgeTone } from "@/components/ui/StatusBadge";
import { useAdminSelection } from "@/hooks/useAdminSelection";

type ProjectDocument = {
  id: string;
  phase: number;
  department: string;
  documentGroup: string;
  fileName: string;
  fileUrl: string;
  uploadedBy: string | null;
  uploadedAt: string | Date;
};

type RequiredDocument = {
  title: string;
  phase: number;
  department: string;
  documentGroup: string;
};

const DOCUMENT_PHASES: Array<{
  phase: number;
  label: string;
  shortLabel: string;
  documents: RequiredDocument[];
}> = [
  {
    phase: 1,
    label: "Phase 1: Sales & Setup",
    shortLabel: "Sales",
    documents: [
      { title: "Rooftop Survey Checklist", phase: 1, department: "SALES", documentGroup: "ROOFTOP_SURVEY_CHECKLIST" },
      { title: "Single Line Diagram (SLD)", phase: 1, department: "SALES", documentGroup: "SLD" },
      { title: "Quotation & Proposal", phase: 1, department: "SALES", documentGroup: "QUOTATION_PROPOSAL" },
      { title: "EPC Contract", phase: 1, department: "SALES", documentGroup: "EPC_CONTRACT" },
      { title: "Customer Credit Evaluation", phase: 1, department: "ACCOUNTING", documentGroup: "CUSTOMER_CREDIT_EVALUATION" },
      { title: "Billing Invoice (Down Payment)", phase: 1, department: "ACCOUNTING", documentGroup: "BILLING_INVOICE_DOWN_PAYMENT" },
      { title: "Tax Invoice / Receipt", phase: 1, department: "ACCOUNTING", documentGroup: "TAX_INVOICE_RECEIPT" },
    ],
  },
  {
    phase: 2,
    label: "Phase 2: Eng & Procure",
    shortLabel: "Eng",
    documents: [
      { title: "Bill of Materials (BOM)", phase: 2, department: "ENGINEERING", documentGroup: "BOM" },
      { title: "HIRA Document", phase: 2, department: "ENGINEERING", documentGroup: "HIRA" },
      { title: "Method Statement", phase: 2, department: "ENGINEERING", documentGroup: "METHOD_STATEMENT" },
      { title: "Purchase Requisition (PR)", phase: 2, department: "PROCUREMENT", documentGroup: "PR" },
      { title: "Approved Vendor List (AVL)", phase: 2, department: "PROCUREMENT", documentGroup: "AVL" },
      { title: "Purchase Order (PO)", phase: 2, department: "PROCUREMENT", documentGroup: "PO" },
      { title: "Manufacturer's Test Reports", phase: 2, department: "PROCUREMENT", documentGroup: "MANUFACTURER_TEST_REPORTS" },
    ],
  },
  {
    phase: 3,
    label: "Phase 3: Warehouse",
    shortLabel: "Warehouse",
    documents: [
      { title: "Goods Receive Note (GRN)", phase: 3, department: "WAREHOUSE", documentGroup: "GRN" },
      { title: "Asset Control Register", phase: 3, department: "WAREHOUSE", documentGroup: "ASSET_CONTROL_REGISTER" },
      { title: "Material Requisition (MR)", phase: 3, department: "WAREHOUSE", documentGroup: "MR" },
      { title: "AP Voucher / Payment Voucher", phase: 3, department: "ACCOUNTING", documentGroup: "AP_PAYMENT_VOUCHER" },
    ],
  },
  {
    phase: 4,
    label: "Phase 4: Execution",
    shortLabel: "Execution",
    documents: [
      { title: "Daily Progress Report", phase: 4, department: "PROJECT_TEAM", documentGroup: "DAILY_PROGRESS_REPORT" },
      { title: "Official Permit Applications (Or.1, ERC, MEA/PEA)", phase: 4, department: "PROJECT_TEAM", documentGroup: "OFFICIAL_PERMIT_APPLICATIONS" },
      { title: "Progress Billing Invoice (2nd Milestone)", phase: 4, department: "ACCOUNTING", documentGroup: "PROGRESS_BILLING_INVOICE_2ND_MILESTONE" },
    ],
  },
  {
    phase: 5,
    label: "Phase 5: Handover",
    shortLabel: "Handover",
    documents: [
      { title: "Commissioning & Testing Report", phase: 5, department: "PROJECT_TEAM", documentGroup: "COMMISSIONING_TESTING_REPORT" },
      { title: "Interconnection Approval Letter", phase: 5, department: "PROJECT_TEAM", documentGroup: "INTERCONNECTION_APPROVAL_LETTER" },
      { title: "As-built Drawings (Signed)", phase: 5, department: "PROJECT_TEAM", documentGroup: "AS_BUILT_DRAWINGS_SIGNED" },
      { title: "Operation Manual", phase: 5, department: "PROJECT_TEAM", documentGroup: "OPERATION_MANUAL" },
      { title: "Material Return Form", phase: 5, department: "WAREHOUSE", documentGroup: "MATERIAL_RETURN_FORM" },
      { title: "Scrap/Waste Log", phase: 5, department: "WAREHOUSE", documentGroup: "SCRAP_WASTE_LOG" },
      { title: "Final Billing Invoice", phase: 5, department: "ACCOUNTING", documentGroup: "FINAL_BILLING_INVOICE" },
      { title: "Final Receipt/Tax Invoice", phase: 5, department: "ACCOUNTING", documentGroup: "FINAL_RECEIPT_TAX_INVOICE" },
      { title: "Project Financial Close-Out", phase: 5, department: "ACCOUNTING", documentGroup: "PROJECT_FINANCIAL_CLOSE_OUT" },
      { title: "Warranty Certificate", phase: 5, department: "ACCOUNTING", documentGroup: "WARRANTY_CERTIFICATE" },
    ],
  },
];

interface JobTicket {
  id: string;
  quotationId: string;
  status: string;
  assignedTeamId: string | null;
  scheduledDate: string | Date | null;
  installerId: string | null;
  installationNotes: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  documents?: ProjectDocument[];
  activityLogs?: AuditTimelineItem[];
  quotation: {
    systemSizeKwp: number;
    panelCount: number;
    totalPrice: number;
    configurationData: {
      items?: BomItem[];
      location?: string;
      address?: string;
      phone?: string;
    };
    signedDocumentDriveUrl?: string | null;
    user: {
      name: string | null;
      email: string;
      phoneNumber: string | null;
    };
  };
}

type BomItem = {
  productName?: string;
  model?: string;
  name?: string;
  description?: string;
  quantity?: number;
  qty?: number;
};

interface Installer {
  id: string;
  name: string | null;
  email: string;
  role: string;
}

interface JobTicketsClientProps {
  initialTickets: JobTicket[];
  installers: Installer[];
}

export default function JobTicketsClient({
  initialTickets,
  installers,
}: JobTicketsClientProps) {
  const t = useTranslations("AdminJobTickets");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // State
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [selectedTicket, setSelectedTicket] = useState<JobTicket | null>(null);
  const [isBulkAssignment, setIsBulkAssignment] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAuditOpen, setIsAuditOpen] = useState(false);
  const [activePhase, setActivePhase] = useState(1);

  // Form State
  const [scheduledDateStr, setScheduledDateStr] = useState("");
  const [selectedInstallerId, setSelectedInstallerId] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Filters
  const filteredTickets = initialTickets.filter((ticket) => {
    const customerName = ticket.quotation?.user?.name || "Unknown";
    const config = ticket.quotation?.configurationData || {};
    const customerAddress = String(config.location || config.address || "");
    const ticketId = ticket.id;

    const matchesSearch =
      customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customerAddress.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ticketId.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus =
      statusFilter === "ALL" || ticket.status === statusFilter;

    return matchesSearch && matchesStatus;
  });
  const selection = useAdminSelection(filteredTickets.map((ticket) => ticket.id));

  const handleOpenManageModal = (ticket: JobTicket) => {
    setIsBulkAssignment(false);
    setSelectedTicket(ticket);
    setScheduledDateStr(
      ticket.scheduledDate
        ? new Date(ticket.scheduledDate).toISOString().split("T")[0]
        : ""
    );
    setSelectedInstallerId(ticket.installerId || "");
    setSubmitError(null);
    setActivePhase(1);
    setIsAuditOpen(false);
    setIsModalOpen(true);
  };

  const handleOpenBulkManageModal = () => {
    const firstSelectedTicket = initialTickets.find((ticket) => selection.selectedIds.includes(ticket.id));
    if (!firstSelectedTicket) return;
    setIsBulkAssignment(true);
    setSelectedTicket(firstSelectedTicket);
    setScheduledDateStr("");
    setSelectedInstallerId("");
    setSubmitError(null);
    setActivePhase(1);
    setIsModalOpen(true);
  };

  const handleSaveAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket) return;

    if (!scheduledDateStr) {
      setSubmitError("Please select a scheduled date.");
      return;
    }

    if (!selectedInstallerId) {
      setSubmitError("Please select an installer/technician.");
      return;
    }

    setSubmitError(null);

    startTransition(async () => {
      try {
        const date = new Date(`${scheduledDateStr}T00:00:00`);
        if (Number.isNaN(date.getTime())) {
          setSubmitError("Please select a valid scheduled date.");
          return;
        }

        const ticketIds = Array.from(new Set(
          isBulkAssignment ? selection.selectedIds : [selectedTicket.id],
        )).slice(0, 100);
        if (ticketIds.length === 0) {
          setSubmitError("Select at least one job ticket.");
          return;
        }

        const settled = await Promise.allSettled(
          ticketIds.map((ticketId) => assignJobTicket(ticketId, date, selectedInstallerId)),
        );
        const failures = settled.filter((result) =>
          result.status === "rejected" || (result.status === "fulfilled" && Boolean(result.value.error)),
        );

        if (failures.length > 0) {
          const completedCount = settled.length - failures.length;
          setSubmitError(
            completedCount > 0
              ? `${completedCount} ticket(s) assigned, but ${failures.length} could not be updated.`
              : "No job tickets could be assigned. Please try again.",
          );
          if (completedCount > 0) router.refresh();
          return;
        }

        setIsModalOpen(false);
        setIsBulkAssignment(false);
        selection.clear();
        router.refresh();
      } catch (error) {
        console.error("Failed to assign job ticket(s):", error);
        setSubmitError("Could not assign the selected job ticket(s). Please try again.");
      }
    });
  };

  const getStatusBadge = (status: string) => {
    let tone: StatusBadgeTone = "slate";
    let icon: React.ReactNode = null;
    let label = status.replaceAll("_", " ");

    switch (status.toUpperCase()) {
      case "SCHEDULED":
        tone = "info";
        icon = <CheckCircle2 className="h-3.5 w-3.5" />;
        label = "SCHEDULED";
        break;
      case "IN_PROGRESS":
        tone = "info";
        icon = <Wrench className="h-3.5 w-3.5" />;
        label = "IN PROGRESS";
        break;
      case "COMPLETED":
        tone = "success";
        icon = <CheckCircle2 className="h-3.5 w-3.5" />;
        label = "COMPLETED";
        break;
      case "PENDING":
      case "PENDING_ASSIGNMENT":
        tone = "danger";
        icon = <Clock className="h-3.5 w-3.5" />;
        label = "PENDING ASSIGNMENT";
        break;
      default:
        break;
    }

    return <StatusBadge tone={tone}>{icon}{label}</StatusBadge>;
  };

  // Extract BOM items
  const getBOMItems = (ticket: JobTicket) => {
    return ticket.quotation?.configurationData?.items || [];
  };

  const getTicketInstaller = (ticket: JobTicket) => {
    return installers.find((installer) => installer.id === ticket.installerId) || null;
  };

  const getTicketPhone = (ticket: JobTicket) => {
    const config = ticket.quotation?.configurationData || {};
    return String(config.phone || ticket.quotation?.user?.phoneNumber || "N/A");
  };

  const getTicketAddress = (ticket: JobTicket) => {
    const config = ticket.quotation?.configurationData || {};
    return String(config.location || config.address || "N/A");
  };

  const getDocumentForSlot = (ticket: JobTicket, slot: RequiredDocument) => {
    return (ticket.documents || []).find(
      (document) =>
        document.phase === slot.phase &&
        document.department === slot.department &&
        document.documentGroup === slot.documentGroup
    ) || null;
  };

  const getPhaseCompletion = (ticket: JobTicket, phase: number) => {
    const phaseConfig = DOCUMENT_PHASES.find((item) => item.phase === phase);
    if (!phaseConfig) return { completed: 0, total: 0 };
    const completed = phaseConfig.documents.filter((document) => getDocumentForSlot(ticket, document)).length;
    return { completed, total: phaseConfig.documents.length };
  };

  return (
    <div className="min-h-dvh bg-[#0B1121] px-4 py-8 sm:px-6 lg:px-8">
      <div className="max-w-full mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8 gap-4">
          <div>
            <h1 className="flex items-center gap-3 text-3xl font-black tracking-tight text-[#F8FAFC]">
              <Wrench className="h-8 w-8 text-[#B7D1EA]" />
              Job Ticket <span className="text-[#B7D1EA]">Manager</span>
            </h1>
            <p className="text-gray-400 text-xs font-bold tracking-widest uppercase mt-2">
              Operations Scheduling & Tech Assignment Control
            </p>
          </div>
        </div>

        {/* Filters Controls */}
        <div className="mb-8 rounded-xl border border-slate-800 bg-[#0F172A] p-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                placeholder="Search ticket ID, customer name, address..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="min-h-12 w-full rounded-lg border border-slate-700 bg-[#0B1121] py-3 pl-10 pr-4 text-sm font-semibold outline-none focus:border-transparent focus:ring-2 focus:ring-[#B7D1EA]"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="min-h-12 min-w-[200px] rounded-lg border border-slate-700 bg-[#0B1121] px-4 text-sm font-semibold outline-none focus:border-transparent focus:ring-2 focus:ring-[#B7D1EA]"
            >
              <option value="ALL">All Statuses</option>
              <option value="PENDING_ASSIGNMENT">Pending Assignment</option>
              <option value="SCHEDULED">Scheduled</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="COMPLETED">Completed</option>
            </select>
          </div>
        </div>

        {/* Main List Table */}
        {filteredTickets.length > 0 ? (
          <div className="space-y-3">
          <AdminBulkActionBar
            selectedCount={selection.selectedCount}
            visibleCount={filteredTickets.length}
            allVisibleSelected={selection.allVisibleSelected}
            someVisibleSelected={selection.someVisibleSelected}
            onToggleVisible={selection.toggleVisible}
            onClear={selection.clear}
            isPending={isPending}
            actions={[{
              id: "assign",
              label: "Assign selected",
              icon: UsersRound,
              tone: "default",
              onClick: handleOpenBulkManageModal,
            }]}
          />
          <div className="overflow-hidden rounded-xl border border-slate-800 bg-[#0F172A]">
            <div className="overflow-x-auto">
              <table className="min-w-[900px] w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#1E293B] bg-[#0B1121]/70">
                    <th className="w-14 py-4 px-6 text-[10px] font-black uppercase tracking-wider text-gray-500">
                      <AdminSelectionCheckbox
                        checked={selection.allVisibleSelected}
                        indeterminate={selection.someVisibleSelected}
                        disabled={isPending}
                        label="Select all visible job tickets"
                        onChange={selection.toggleVisible}
                      />
                    </th>
                    <th className="py-4 px-6 text-[10px] font-black uppercase tracking-wider text-gray-500">
                      Ticket ID
                    </th>
                    <th className="py-4 px-6 text-[10px] font-black uppercase tracking-wider text-gray-500">
                      Customer & Address
                    </th>
                    <th className="py-4 px-6 text-[10px] font-black uppercase tracking-wider text-gray-500">
                      Scheduled Date
                    </th>
                    <th className="py-4 px-6 text-[10px] font-black uppercase tracking-wider text-gray-500">
                      Assigned Tech
                    </th>
                    <th className="py-4 px-6 text-[10px] font-black uppercase tracking-wider text-gray-500">
                      Status
                    </th>
                    <th className="py-4 px-6 text-right text-[10px] font-black uppercase tracking-wider text-gray-500">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {filteredTickets.map((ticket) => {
                    const customerName =
                      ticket.quotation?.user?.name || "Unknown Customer";
                    const phone = getTicketPhone(ticket);
                    const address = getTicketAddress(ticket);
                    const installer = getTicketInstaller(ticket);

                    return (
                      <tr
                        key={ticket.id}
                        className="transition-colors hover:bg-slate-800/30"
                      >
                        <td className="py-5 px-6" onClick={(event) => event.stopPropagation()}>
                          <AdminSelectionCheckbox
                            checked={selection.isSelected(ticket.id)}
                            disabled={isPending}
                            label={`Select job ticket ${ticket.id}`}
                            onChange={() => selection.toggle(ticket.id)}
                          />
                        </td>
                        <td className="py-5 px-6 font-mono text-xs font-bold text-gray-400">
                          #{ticket.id.slice(0, 8).toUpperCase()}
                        </td>
                        <td className="py-5 px-6 max-w-xs">
                          <div className="space-y-1">
                            <p className="font-bold text-gray-100">
                              {customerName}
                            </p>
                            <div className="flex items-center gap-1 text-[11px] text-gray-400">
                              <Phone className="w-3 h-3" />
                              <span>{phone}</span>
                            </div>
                            <div className="flex items-start gap-1 text-[11px] text-gray-400">
                              <MapPin className="w-3 h-3 shrink-0 mt-0.5" />
                              <span className="line-clamp-2">{address}</span>
                            </div>
                          </div>
                        </td>
                        <td className="py-5 px-6 text-sm font-semibold text-gray-300">
                          {ticket.scheduledDate ? (
                            <div className="flex items-center gap-1.5">
                              <Calendar className="w-4 h-4 text-gray-500" />
                              <span>
                                {new Date(
                                  ticket.scheduledDate
                                ).toLocaleDateString("th-TH", {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                })}
                              </span>
                            </div>
                          ) : (
                            <span className="text-gray-500 italic">Unscheduled</span>
                          )}
                        </td>
                        <td className="py-5 px-6 text-sm font-semibold text-gray-300">
                          {installer ? (
                            <div className="flex items-center gap-1.5">
                              <User className="w-4 h-4 text-gray-500" />
                              <span>{installer.name || installer.email}</span>
                            </div>
                          ) : (
                            <span className="text-gray-500 italic">Unassigned</span>
                          )}
                        </td>
                        <td className="py-5 px-6">
                          {getStatusBadge(ticket.status)}
                        </td>
                        <td className="py-5 px-6 text-right">
                          <button
                            onClick={() => handleOpenManageModal(ticket)}
                            className="min-h-11 rounded-lg bg-[#B7D1EA] px-4 text-xs font-bold text-[#0F172A] transition-colors hover:bg-[#99BFE3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA]"
                          >
                            Manage Ticket
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          </div>
        ) : (
          <div className="border-2 border-dashed border-[#1E293B] bg-[#0F172A]/40 rounded-3xl p-12 text-center flex flex-col items-center justify-center max-w-lg mx-auto space-y-5">
            <div className="p-4 rounded-full bg-[#0F172A] border border-slate-150 shadow-xs">
              <Inbox className="w-12 h-12 text-slate-350" />
            </div>
            <div className="space-y-1">
              <h4 className="text-gray-300 font-bold text-base uppercase tracking-tight">No Job Tickets Assigned</h4>
              <p className="text-xs text-gray-400 font-semibold max-w-xs leading-relaxed">
                There are currently no active job tickets scheduled. Try adjusting your status filters or search query, or navigate back to the main console.
              </p>
            </div>
            <button
              type="button"
              onClick={() => router.push("/admin")}
              className="mt-2 inline-flex items-center gap-1.5 px-5 py-3 bg-[#B7D1EA] hover:bg-[#B7D1EA]/85 text-[#2C486A] text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-xs"
            >
              Back to Dashboard
            </button>
          </div>
        )}
      </div>

      {/* Assignment & Scheduling Dialog Modal */}
      <Dialog isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} size="md">
        <DialogContent className="bg-[#0F172A] rounded-3xl overflow-hidden flex flex-col max-h-[85vh]">
          {selectedTicket && (
            <form onSubmit={handleSaveAssignment} className="flex flex-col h-full">
              <DialogHeader className="border-b border-[#1E293B] bg-[#0B1121]/70 px-6 py-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                  <h3 className="text-lg font-black text-[#2C486A] uppercase flex items-center gap-2">
                    <Wrench className="w-5 h-5" />
                    Manage Operations Ticket
                  </h3>
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">
                    Ticket ID: #{selectedTicket.id.slice(0, 8).toUpperCase()}
                  </p>
                  </div>
                  <AuditLogTrigger
                    onClick={() => setIsAuditOpen(true)}
                    count={selectedTicket.activityLogs?.length || 0}
                    label="Logs"
                    className="min-h-9 px-2 text-[10px]"
                  />
                </div>
              </DialogHeader>

              <DialogBody className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
                {/* Project Details */}
                <div className="space-y-3">
                  <h4 className="text-xs font-black text-gray-500 uppercase tracking-wider">
                    Project Details
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-2xl border border-[#1E293B] bg-[#0B1121]/70 p-4">
                      <p className="text-[10px] font-black uppercase tracking-wider text-gray-500">Customer</p>
                      <p className="mt-1 text-sm font-bold text-gray-100">
                        {selectedTicket.quotation?.user?.name || selectedTicket.quotation?.user?.email || "Unknown Customer"}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-[#1E293B] bg-[#0B1121]/70 p-4">
                      <p className="text-[10px] font-black uppercase tracking-wider text-gray-500">System</p>
                      <p className="mt-1 text-sm font-bold text-gray-100">
                        {selectedTicket.quotation?.systemSizeKwp} kWp • {selectedTicket.quotation?.panelCount} panels
                      </p>
                    </div>
                    <div className="rounded-2xl border border-[#1E293B] bg-[#0B1121]/70 p-4">
                      <p className="text-[10px] font-black uppercase tracking-wider text-gray-500">Address</p>
                      <p className="mt-1 line-clamp-2 text-sm font-bold text-gray-100">
                        {getTicketAddress(selectedTicket)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Bill of Materials (BOM) Section */}
                <div className="space-y-3">
                  <h4 className="text-xs font-black text-gray-500 uppercase tracking-wider">
                    Equipment List (BOM)
                  </h4>
                  <div className="bg-[#0B1121]/70 border border-[#1E293B]/60 rounded-2xl p-4 space-y-2.5 max-h-[180px] overflow-y-auto">
                    {getBOMItems(selectedTicket).length > 0 ? (
                      getBOMItems(selectedTicket).map((item, idx) => {
                        const name =
                          item.productName ||
                          item.model ||
                          item.name ||
                          item.description ||
                          t("fallbacks.solarEquipment");
                        const qty = item.quantity || item.qty || 1;
                        return (
                          <div
                            key={idx}
                            className="flex justify-between items-center text-xs border-b border-[#1E293B] pb-2 last:pb-0 last:border-0"
                          >
                            <span className="font-bold text-gray-300">{name}</span>
                            <span className="font-bold text-[#2C486A] px-2 py-0.5 rounded-md bg-[#0F172A] border border-[#1E293B]">
                              x{qty}
                            </span>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-xs text-gray-500 italic">
                        No products configured. System Size:{" "}
                        {selectedTicket.quotation?.systemSizeKwp} kWp, Panel Count:{" "}
                        {selectedTicket.quotation?.panelCount}
                      </p>
                    )}
                  </div>
                </div>

                {/* Document Master Hub */}
                <section className="space-y-4 border-t border-[#1E293B] pt-6">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <h4 className="flex items-center gap-2 text-sm font-black uppercase tracking-tight text-[#2C486A]">
                        <FileCheck2 className="h-4 w-4" />
                        Document Master Hub
                      </h4>
                      <p className="mt-1 text-xs font-semibold text-gray-400">
                        ISO compliance checklist across Sales, Accounting, Engineering, Warehouse, and Project Team phases.
                      </p>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-2xl border border-[#1E293B] bg-[#0F172A] p-1">
                    <div className="grid min-w-[760px] grid-cols-5 gap-1">
                      {DOCUMENT_PHASES.map((phase) => {
                        const completion = getPhaseCompletion(selectedTicket, phase.phase);
                        const isActive = activePhase === phase.phase;
                        return (
                          <button
                            key={phase.phase}
                            type="button"
                            onClick={() => setActivePhase(phase.phase)}
                            className={cn(
                              "rounded-xl px-3 py-3 text-left transition-all",
                              isActive
                                ? "bg-[#B7D1EA] text-gray-100 shadow-xs"
                                : "text-gray-400 hover:bg-[#0B1121]"
                            )}
                          >
                            <span className="block text-xs font-black leading-tight">
                              {phase.label}
                            </span>
                            <span className="mt-1 block text-[10px] font-bold uppercase tracking-wider opacity-75">
                              {completion.completed}/{completion.total} complete
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {DOCUMENT_PHASES.filter((phase) => phase.phase === activePhase).map((phase) => (
                    <div key={phase.phase} className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-black uppercase tracking-wider text-gray-500">
                          {phase.label}
                        </p>
                        <p className="text-xs font-bold text-gray-400">
                          {getPhaseCompletion(selectedTicket, phase.phase).completed} of{" "}
                          {phase.documents.length} uploaded
                        </p>
                      </div>
                      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                        {phase.documents.map((document) => (
                          <DocumentUploaderItem
                            key={document.documentGroup}
                            title={document.title}
                            phase={document.phase}
                            department={document.department}
                            documentGroup={document.documentGroup}
                            jobTicketId={selectedTicket.id}
                            existingDocument={getDocumentForSlot(selectedTicket, document)}
                            onUploadSuccess={() => router.refresh()}
                            onDeleteSuccess={() => router.refresh()}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </section>

                {/* Scheduling Date Input */}
                <div className="space-y-2">
                  <label className="text-xs font-black text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    Scheduled Date
                  </label>
                  <input
                    type="date"
                    value={scheduledDateStr}
                    onChange={(e) => setScheduledDateStr(e.target.value)}
                    required
                    className="w-full px-4 py-3 bg-[#0F172A] border border-[#1E293B] rounded-2xl focus:ring-2 focus:ring-[#B7D1EA] outline-none text-sm font-semibold transition-all"
                  />
                </div>

                {/* Installer Selection */}
                <div className="space-y-2">
                  <label className="text-xs font-black text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" />
                    Assigned Technician / Installer
                  </label>
                  <select
                    value={selectedInstallerId}
                    onChange={(e) => setSelectedInstallerId(e.target.value)}
                    required
                    className="w-full px-4 py-3 bg-[#0F172A] border border-[#1E293B] rounded-2xl focus:ring-2 focus:ring-[#B7D1EA] outline-none text-sm font-semibold transition-all"
                  >
                    <option value="">Select Technician...</option>
                    {installers.map((inst) => (
                      <option key={inst.id} value={inst.id}>
                        {inst.name || inst.email} ({inst.role})
                      </option>
                    ))}
                  </select>
                </div>

                {submitError && (
                  <p className="text-xs font-bold text-rose-500 bg-rose-500/10 border border-rose-100 rounded-xl p-3">
                    {submitError}
                  </p>
                )}
              </DialogBody>

              <DialogFooter className="border-t border-[#1E293B] bg-[#0B1121]/50 px-6 py-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-3 text-xs font-black uppercase tracking-wider text-gray-400 hover:bg-[#0B1121] border border-[#1E293B] rounded-2xl transition-all cursor-pointer text-center"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex-1 bg-[#B7D1EA] hover:bg-[#B7D1EA]/80 disabled:bg-[#1E293B] text-[#2C486A] disabled:text-gray-500 py-3 rounded-2xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isPending && <GsapSpinner className="h-4 w-4" />}
                  Assign & Schedule
                </button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {selectedTicket ? (
        <AuditLogSidebar
          isOpen={isAuditOpen}
          onClose={() => setIsAuditOpen(false)}
          logs={selectedTicket.activityLogs || []}
          title="Job ticket activity"
          entityLabel={`#${selectedTicket.id.slice(0, 8).toUpperCase()}`}
          emptyMessage="No job ticket audit activity recorded yet."
        />
      ) : null}
    </div>
  );
}
