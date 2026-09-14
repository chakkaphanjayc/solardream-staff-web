"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  ShieldAlert,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Search,
  Wrench,
  ChevronRight,
  X,
  Send,
  Mail,
  Calendar,
  Video,
  UploadCloud,
  ExternalLink,
  RefreshCw,
  Zap,
  Paperclip,
} from "@/components/ui/icons";
import {
  updateSupportTicketAction,
  dispatchSupportTicketToJobAction,
  syncGmailInboxAction,
  sendTicketEmailReplyAction,
  schedulePMBookingCalendarEventAction,
  uploadTicketAttachmentAction,
} from "@/app/actions/support";
import { AdminBulkActionBar } from "@/components/admin/AdminBulkActionBar";
import { AdminSelectionCheckbox } from "@/components/admin/AdminSelectionCheckbox";
import { useAdminSelection } from "@/hooks/useAdminSelection";
import type { SupportTicket, TicketStatus, TicketPriority, TicketCategory } from "@/schemas/support";

interface ExtendedTicket extends SupportTicket {
  googleEventId?: string;
  meetLink?: string;
  driveAttachments?: Array<{ fileId: string; fileName: string; webViewLink: string }>;
  emailReplyLog?: string[];
}

interface AdminSupportClientProps {
  initialTickets: SupportTicket[];
  initialMetrics: {
    totalCount: number;
    newCount: number;
    urgentCount: number;
    inProgressCount: number;
    resolvedCount: number;
  };
}

export default function AdminSupportClient({ initialTickets, initialMetrics }: AdminSupportClientProps) {
  const [tickets, setTickets] = useState<ExtendedTicket[]>(initialTickets as ExtendedTicket[]);
  const [metrics, setMetrics] = useState(initialMetrics);
  const [selectedTicket, setSelectedTicket] = useState<ExtendedTicket | null>(null);
  const [activeTab, setActiveTab] = useState<"ALL" | TicketStatus>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");

  // Loading States
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDispatching, setIsDispatching] = useState(false);
  const [isSyncingGmail, setIsSyncingGmail] = useState(false);
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [isSchedulingCalendar, setIsSchedulingCalendar] = useState(false);
  const [isUploadingDrive, setIsUploadingDrive] = useState(false);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

  // Email Reply state
  const [replyMessage, setReplyMessage] = useState("");
  const [isReplyBoxOpen, setIsReplyBoxOpen] = useState(false);

  // Filtered tickets list
  const filteredTickets = tickets.filter((t) => {
    if (activeTab !== "ALL" && t.status !== activeTab) return false;
    if (selectedCategory !== "ALL" && t.category !== selectedCategory) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        t.ticketNumber.toLowerCase().includes(q) ||
        t.customerName.toLowerCase().includes(q) ||
        t.customerEmail.toLowerCase().includes(q) ||
        t.subject.toLowerCase().includes(q)
      );
    }
    return true;
  });
  const selection = useAdminSelection(filteredTickets.map((ticket) => ticket.id));

  const handleBulkStatusChange = async (status: TicketStatus) => {
    if (selection.selectedCount === 0) return;
    setIsBulkUpdating(true);
    try {
      const ids = selection.selectedIds;
      const settled = await Promise.allSettled(ids.map((ticketId) => updateSupportTicketAction({ ticketId, status })));
      const succeededIds = ids.filter((id, index) => {
        const result = settled[index];
        return result?.status === "fulfilled" && result.value.success;
      });
      const failedCount = ids.length - succeededIds.length;
      if (succeededIds.length > 0) {
        setTickets((current) => current.map((ticket) => (
          succeededIds.includes(ticket.id) ? { ...ticket, status } : ticket
        )));
        selection.clear();
      }
      if (failedCount > 0) toast.error(`${failedCount} ticket(s) could not be updated.`);
      else toast.success(`${succeededIds.length} ticket(s) marked ${status.replaceAll("_", " ").toLowerCase()}.`);
    } catch {
      toast.error("Failed to update selected tickets.");
    } finally {
      setIsBulkUpdating(false);
    }
  };

  // Google Workspace 1: Gmail Inbox Polling Sync
  const handleSyncGmail = async () => {
    setIsSyncingGmail(true);
    try {
      const res = await syncGmailInboxAction();
      if (res.success && res.ingestedTickets) {
        toast.success(res.message || `Ingested ${res.ingestedCount} new emails.`);

        if (res.ingestedTickets.length > 0) {
          const newGmailTickets: ExtendedTicket[] = res.ingestedTickets.map((ing) => ({
            id: `gmail-${ing.gmailMessageId}`,
            ticketNumber: `TK-MAIL-${ing.gmailMessageId.slice(-6).toUpperCase()}`,
            customerName: ing.senderName,
            customerEmail: ing.senderEmail,
            subject: ing.subject,
            description: ing.bodySnippet,
            category: "GENERAL",
            priority: "MEDIUM",
            status: "NEW",
            createdAt: ing.receivedAt,
            updatedAt: ing.receivedAt,
          }));

          setTickets((prev) => [...newGmailTickets, ...prev]);
          setMetrics((prev) => ({
            ...prev,
            totalCount: prev.totalCount + newGmailTickets.length,
            newCount: prev.newCount + newGmailTickets.length,
          }));
        }
      } else {
        toast.error(res.error || "Failed to sync Gmail inbox.");
      }
    } catch {
      toast.error("Unexpected error during Gmail sync.");
    } finally {
      setIsSyncingGmail(false);
    }
  };

  // Google Workspace 2: Reply to Customer Email via Gmail API
  const handleSendGmailReply = async () => {
    if (!selectedTicket || !replyMessage.trim()) {
      toast.error("Reply text cannot be empty.");
      return;
    }

    setIsSendingReply(true);
    try {
      const res = await sendTicketEmailReplyAction({
        ticketId: selectedTicket.id,
        toEmail: selectedTicket.customerEmail,
        subject: selectedTicket.subject,
        replyMessage,
      });

      if (res.success) {
        toast.success(`Reply sent to ${selectedTicket.customerEmail} via Gmail API!`);
        const replyLogEntry = `[${new Date().toLocaleTimeString()}] Email Sent to ${selectedTicket.customerEmail}: ${replyMessage.slice(0, 40)}...`;

        setSelectedTicket((prev) =>
          prev
            ? {
                ...prev,
                emailReplyLog: [...(prev.emailReplyLog || []), replyLogEntry],
                status: prev.status === "NEW" ? "IN_PROGRESS" : prev.status,
              }
            : null
        );

        setTickets((prev) =>
          prev.map((t) =>
            t.id === selectedTicket.id
              ? {
                  ...t,
                  emailReplyLog: [...(t.emailReplyLog || []), replyLogEntry],
                  status: t.status === "NEW" ? "IN_PROGRESS" : t.status,
                }
              : t
          )
        );

        setReplyMessage("");
        setIsReplyBoxOpen(false);
      } else {
        toast.error(res.error || "Failed to send Gmail reply.");
      }
    } catch {
      toast.error("Unexpected error sending email reply.");
    } finally {
      setIsSendingReply(false);
    }
  };

  // Google Workspace 3: Google Calendar Event & Meet Link Creation
  const handleScheduleCalendarEvent = async (bookingType: "PM_VISIT" | "REMOTE_CONSULTATION") => {
    if (!selectedTicket) return;
    setIsSchedulingCalendar(true);

    try {
      const res = await schedulePMBookingCalendarEventAction({
        customerName: selectedTicket.customerName,
        customerPhone: selectedTicket.customerPhone,
        customerEmail: selectedTicket.customerEmail,
        customerAddress: "Hang Dong, Chiangmai, Thailand",
        notes: selectedTicket.description,
        bookingType,
        scheduledStartTime: new Date(Date.now() + 86400000 * 2).toISOString(), // 2 days from now
      });

      if (res.success) {
        toast.success(res.message);
        setSelectedTicket((prev) =>
          prev
            ? {
                ...prev,
                googleEventId: res.googleEventId,
                meetLink: res.hangoutsLink,
                status: "IN_PROGRESS",
              }
            : null
        );

        setTickets((prev) =>
          prev.map((t) =>
            t.id === selectedTicket.id
              ? {
                  ...t,
                  googleEventId: res.googleEventId,
                  meetLink: res.hangoutsLink,
                  status: "IN_PROGRESS",
                }
              : t
          )
        );
      } else {
        toast.error(res.error || "Failed to schedule Google Calendar event.");
      }
    } catch {
      toast.error("Error scheduling Google Calendar event.");
    } finally {
      setIsSchedulingCalendar(false);
    }
  };

  // Google Workspace 4: Stream Upload Attachment to Google Drive
  const handleUploadDriveAttachment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedTicket) return;

    setIsUploadingDrive(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("ticketNumber", selectedTicket.ticketNumber);

      const res = await uploadTicketAttachmentAction(formData);

      if (res.success && res.webViewLink) {
        toast.success("Attachment streamed to Google Drive!");
        const newAttachment = {
          fileId: res.fileId || `drive-${Date.now()}`,
          fileName: res.fileName || file.name,
          webViewLink: res.webViewLink,
        };

        setSelectedTicket((prev) =>
          prev
            ? {
                ...prev,
                driveAttachments: [...(prev.driveAttachments || []), newAttachment],
              }
            : null
        );

        setTickets((prev) =>
          prev.map((t) =>
            t.id === selectedTicket.id
              ? {
                  ...t,
                  driveAttachments: [...(t.driveAttachments || []), newAttachment],
                }
              : t
          )
        );
      } else {
        toast.error(res.error || "Failed to upload to Google Drive.");
      }
    } catch {
      toast.error("Unexpected error streaming attachment to Drive.");
    } finally {
      setIsUploadingDrive(false);
    }
  };

  const handleUpdateStatus = async (ticketId: string, newStatus: TicketStatus, newPriority?: TicketPriority) => {
    setIsUpdating(true);
    try {
      const res = await updateSupportTicketAction({
        ticketId,
        status: newStatus,
        priority: newPriority || selectedTicket?.priority,
        internalNotes: selectedTicket?.internalNotes,
      });

      if (res.success) {
        toast.success(`Ticket ${ticketId} updated to ${newStatus}`);
        setTickets((prev) =>
          prev.map((t) => (t.id === ticketId ? { ...t, status: newStatus, priority: newPriority || t.priority } : t))
        );
        if (selectedTicket?.id === ticketId) {
          setSelectedTicket((prev) => (prev ? { ...prev, status: newStatus, priority: newPriority || prev.priority } : null));
        }
      } else {
        toast.error(res.error || "Failed to update ticket.");
      }
    } catch {
      toast.error("Unexpected error updating ticket.");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDispatchJob = async (ticketId: string) => {
    setIsDispatching(true);
    try {
      const res = await dispatchSupportTicketToJobAction(ticketId);
      if (res.success) {
        toast.success(`Dispatched! Job Ticket: ${res.jobTicketId}`);
        setTickets((prev) =>
          prev.map((t) => (t.id === ticketId ? { ...t, status: "PENDING_DISPATCH", dispatchJobTicketId: res.jobTicketId } : t))
        );
        if (selectedTicket?.id === ticketId) {
          setSelectedTicket((prev) =>
            prev ? { ...prev, status: "PENDING_DISPATCH", dispatchJobTicketId: res.jobTicketId } : null
          );
        }
      } else {
        toast.error(res.error || "Failed to dispatch job ticket.");
      }
    } catch {
      toast.error("Error dispatching field job ticket.");
    } finally {
      setIsDispatching(false);
    }
  };

  const getPriorityBadge = (priority: TicketPriority) => {
    switch (priority) {
      case "URGENT":
        return <span className="inline-flex items-center gap-1 rounded-md bg-[#f85149]/10 px-2 py-0.5 text-[11px] font-mono font-medium text-[#f85149] border border-[#f85149]/30">URGENT</span>;
      case "HIGH":
        return <span className="inline-flex items-center gap-1 rounded-md bg-[#d29922]/10 px-2 py-0.5 text-[11px] font-mono font-medium text-[#d29922] border border-[#d29922]/30">HIGH</span>;
      case "MEDIUM":
        return <span className="inline-flex items-center gap-1 rounded-md bg-[#58a6ff]/10 px-2 py-0.5 text-[11px] font-mono font-medium text-[#58a6ff] border border-[#58a6ff]/30">MEDIUM</span>;
      case "LOW":
      default:
        return <span className="inline-flex items-center gap-1 rounded-md bg-[#30363d] px-2 py-0.5 text-[11px] font-mono font-medium text-[#8b949e] border border-[#30363d]">LOW</span>;
    }
  };

  const getStatusBadge = (status: TicketStatus) => {
    switch (status) {
      case "NEW":
        return <span className="inline-flex items-center gap-1 rounded-full bg-[#58a6ff]/10 px-2.5 py-0.5 text-[11px] font-mono font-medium text-[#58a6ff] border border-[#58a6ff]/30">New</span>;
      case "IN_PROGRESS":
        return <span className="inline-flex items-center gap-1 rounded-full bg-[#d29922]/10 px-2.5 py-0.5 text-[11px] font-mono font-medium text-[#d29922] border border-[#d29922]/30">In Progress</span>;
      case "PENDING_DISPATCH":
        return <span className="inline-flex items-center gap-1 rounded-full bg-[#7CA8D0]/10 px-2.5 py-0.5 text-[11px] font-mono font-medium text-[#7CA8D0] border border-[#7CA8D0]/30">Field Dispatch</span>;
      case "RESOLVED":
      case "CLOSED":
        return <span className="inline-flex items-center gap-1 rounded-full bg-[#238636]/10 px-2.5 py-0.5 text-[11px] font-mono font-medium text-[#3fb950] border border-[#238636]/30">Resolved</span>;
      default:
        return <span className="inline-flex items-center gap-1 rounded-full bg-[#30363d] px-2.5 py-0.5 text-[11px] font-mono font-medium text-[#8b949e] border border-[#30363d]">{status}</span>;
    }
  };

  return (
    <div className="space-y-6 font-sans pb-12">
      {/* Top Banner with Gmail Sync Action */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-[#30363d] bg-[#161b22] p-6 text-[#f0f6fc] shadow-sm">
        <div>
          <div className="inline-flex items-center gap-2 rounded-md border border-[#30363d] bg-[#0d1117] px-3 py-1 text-xs font-mono text-[#58a6ff]">
            <Zap className="h-3.5 w-3.5" />
            Support Operations Center
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl text-[#f0f6fc]">
            Customer Inquiries & Support Tickets
          </h1>
          <p className="mt-1 text-xs text-[#8b949e] sm:text-sm">
            Powered by Google Workspace (Calendar PM Sync, Gmail Email-to-Ticket, and Drive Storage).
          </p>
        </div>

        {/* Gmail Sync Action Button */}
        <button
          type="button"
          onClick={handleSyncGmail}
          disabled={isSyncingGmail}
          className="inline-flex items-center gap-2 rounded-md bg-[#238636] hover:bg-[#2ea043] border border-[rgba(240,246,252,0.1)] px-4 py-2 text-xs font-medium text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50"
        >
          {isSyncingGmail ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
          {isSyncingGmail ? "Syncing Inbox..." : "Sync Gmail Inbox"}
        </button>
      </div>

      {/* KPI Metrics Dashboard */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-md border border-[#30363d] bg-[#161b22] p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-[#8b949e]">Total Active</span>
            <ShieldAlert className="h-4 w-4 text-[#8b949e]" />
          </div>
          <p className="mt-2 text-2xl font-bold text-[#f0f6fc]">{metrics.totalCount}</p>
        </div>

        <div className="rounded-md border border-[#f85149]/30 bg-[#f85149]/10 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-[#f85149]">Urgent Cases</span>
            <AlertTriangle className="h-4 w-4 text-[#f85149]" />
          </div>
          <p className="mt-2 text-2xl font-bold text-[#f85149]">{metrics.urgentCount}</p>
        </div>

        <div className="rounded-md border border-[#d29922]/30 bg-[#d29922]/10 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-[#d29922]">In Progress</span>
            <Clock className="h-4 w-4 text-[#d29922]" />
          </div>
          <p className="mt-2 text-2xl font-bold text-[#d29922]">{metrics.inProgressCount}</p>
        </div>

        <div className="rounded-md border border-[#238636]/30 bg-[#238636]/10 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-[#3fb950]">Resolved</span>
            <CheckCircle2 className="h-4 w-4 text-[#3fb950]" />
          </div>
          <p className="mt-2 text-2xl font-bold text-[#3fb950]">{metrics.resolvedCount}</p>
        </div>
      </div>

      {/* Filter Bar & Search */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-[#30363d] bg-[#161b22] p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {(["ALL", "NEW", "IN_PROGRESS", "PENDING_DISPATCH", "RESOLVED"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer border ${
                activeTab === tab
                  ? "bg-[#21262d] text-[#f0f6fc] border-[#8b949e]"
                  : "bg-[#0d1117] text-[#8b949e] border-[#30363d] hover:text-[#c9d1d9] hover:border-[#8b949e]"
              }`}
            >
              {tab === "ALL" ? "All Tickets" : tab === "NEW" ? "New" : tab === "IN_PROGRESS" ? "In Progress" : tab === "PENDING_DISPATCH" ? "Field Dispatch" : "Resolved"}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="rounded-md border border-[#30363d] bg-[#0d1117] px-3 py-1.5 text-xs font-medium text-[#f0f6fc] focus:outline-none focus:border-[#58a6ff]"
          >
            <option value="ALL">All Categories</option>
            <option value="INVERTER">Inverter Faults</option>
            <option value="BATTERY">Battery Storage</option>
            <option value="BILLING_PEA">PEA Billing</option>
            <option value="MAINTENANCE">Maintenance</option>
            <option value="WARRANTY">Warranty Claim</option>
          </select>

          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#8b949e]" />
            <input
              type="text"
              placeholder="Search tickets, names..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-md border border-[#30363d] bg-[#0d1117] py-1.5 pl-8 pr-3 text-xs font-medium text-[#f0f6fc] focus:border-[#58a6ff] focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Tickets Table */}
      <AdminBulkActionBar
        selectedCount={selection.selectedCount}
        visibleCount={filteredTickets.length}
        allVisibleSelected={selection.allVisibleSelected}
        someVisibleSelected={selection.someVisibleSelected}
        onToggleVisible={selection.toggleVisible}
        onClear={selection.clear}
        isPending={isBulkUpdating}
        actions={[
          {
            id: "in-progress",
            label: "In progress",
            icon: Clock,
            tone: "default",
            onClick: () => void handleBulkStatusChange("IN_PROGRESS"),
          },
          {
            id: "resolve",
            label: "Resolve",
            icon: CheckCircle2,
            tone: "success",
            onClick: () => void handleBulkStatusChange("RESOLVED"),
          },
        ]}
      />
      <div className="overflow-hidden rounded-md border border-[#30363d] bg-[#161b22] shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#30363d] bg-[#161b22] font-semibold text-[#8b949e]">
              <tr>
                <th className="px-4 py-3">
                  <AdminSelectionCheckbox
                    checked={selection.allVisibleSelected}
                    indeterminate={selection.someVisibleSelected}
                    disabled={filteredTickets.length === 0 || isBulkUpdating}
                    label="Select all visible support tickets"
                    onChange={selection.toggleVisible}
                  />
                </th>
                <th className="px-4 py-3">Ticket Code</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Subject & Category</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#30363d] font-normal text-[#c9d1d9]">
              {filteredTickets.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-[#8b949e]">
                    No tickets found matching current filters.
                  </td>
                </tr>
              ) : (
                filteredTickets.map((ticket) => (
                  <tr
                    key={ticket.id}
                    onClick={() => setSelectedTicket(ticket)}
                    className="hover:bg-[#21262d] cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                      <AdminSelectionCheckbox
                        checked={selection.isSelected(ticket.id)}
                        disabled={isBulkUpdating}
                        label={`Select support ticket ${ticket.ticketNumber}`}
                        onChange={() => selection.toggle(ticket.id)}
                      />
                    </td>
                    <td className="px-4 py-3 font-mono font-medium text-[#f0f6fc]">
                      <div className="flex items-center gap-1.5">
                        {ticket.id.startsWith("gmail-") && <Mail className="h-3.5 w-3.5 text-[#3fb950]" />}
                        {ticket.ticketNumber}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-[#f0f6fc]">{ticket.customerName}</span>
                        {ticket.category === "MAINTENANCE" || ticket.category === "INVERTER" ? (
                          <span className="rounded-full bg-[#238636]/10 px-2 py-0.5 text-[9px] font-mono text-[#3fb950] border border-[#238636]/30">
                            SolarDream Owner
                          </span>
                        ) : (
                          <span className="rounded-full bg-[#30363d] px-2 py-0.5 text-[9px] font-mono text-[#8b949e]">
                            External System
                          </span>
                        )}
                      </div>
                      <span className="block text-[11px] text-[#8b949e]">{ticket.customerEmail}</span>
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <span className="block truncate font-medium text-[#f0f6fc]">{ticket.subject}</span>
                      <span className="inline-block mt-1 rounded bg-[#21262d] px-1.5 py-0.5 text-[10px] font-mono text-[#8b949e] border border-[#30363d]">
                        {ticket.category}
                      </span>
                    </td>
                    <td className="px-4 py-3">{getPriorityBadge(ticket.priority)}</td>
                    <td className="px-4 py-3">{getStatusBadge(ticket.status)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTicket(ticket);
                        }}
                        className="inline-flex items-center gap-1 rounded-md bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] px-2.5 py-1 text-xs font-medium text-[#c9d1d9] transition-colors"
                      >
                        Inspect
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Ticket Inspector Modal / Drawer */}
      {selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-xs p-4 sm:p-6">
          <div className="flex flex-col h-full max-h-[92vh] w-full max-w-2xl overflow-hidden rounded-md border border-[#30363d] bg-[#161b22] shadow-2xl animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-[#30363d] bg-[#161b22] p-5 text-[#f0f6fc]">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-[#58a6ff]">{selectedTicket.ticketNumber}</span>
                  {getPriorityBadge(selectedTicket.priority)}
                  {getStatusBadge(selectedTicket.status)}
                </div>
                <h3 className="mt-2 text-xl font-bold tracking-tight text-[#f0f6fc]">{selectedTicket.subject}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTicket(null)}
                className="rounded-md bg-[#21262d] p-1.5 text-[#8b949e] hover:bg-[#30363d] hover:text-[#f0f6fc] cursor-pointer border border-[#30363d]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Drawer Content Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-[#0d1117]">
              {/* Customer Box */}
              <div className="rounded-md border border-[#30363d] bg-[#161b22] p-4 space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-[#8b949e]">Customer Details</h4>
                <div className="grid grid-cols-2 gap-2 text-xs text-[#c9d1d9]">
                  <div>
                    <span className="text-[#8b949e] block text-[10px]">NAME</span>
                    <span className="font-semibold text-[#f0f6fc]">{selectedTicket.customerName}</span>
                  </div>
                  <div>
                    <span className="text-[#8b949e] block text-[10px]">EMAIL</span>
                    <span className="font-semibold text-[#f0f6fc]">{selectedTicket.customerEmail}</span>
                  </div>
                  {selectedTicket.customerPhone && (
                    <div>
                      <span className="text-[#8b949e] block text-[10px]">PHONE</span>
                      <span className="font-semibold text-[#f0f6fc]">{selectedTicket.customerPhone}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-[#8b949e] block text-[10px]">CATEGORY</span>
                    <span className="font-semibold text-[#f0f6fc]">{selectedTicket.category}</span>
                  </div>
                </div>
              </div>

              {/* Google Workspace Module 1: Google Calendar & Meet Sync */}
              <div className="rounded-md border border-[#58a6ff]/30 bg-[#58a6ff]/10 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#58a6ff]">
                    <Calendar className="h-4 w-4 text-[#58a6ff]" />
                    Google Calendar Sync & Meet Link
                  </div>
                  {selectedTicket.meetLink && (
                    <a
                      href={selectedTicket.meetLink}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-md bg-[#238636] px-3 py-1 text-xs font-medium text-white hover:bg-[#2ea043]"
                    >
                      <Video className="h-3.5 w-3.5" />
                      Join Google Meet
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={isSchedulingCalendar}
                    onClick={() => handleScheduleCalendarEvent("PM_VISIT")}
                    className="inline-flex items-center gap-1.5 rounded-md bg-[#21262d] border border-[#30363d] px-3 py-1.5 text-xs font-medium text-[#c9d1d9] hover:bg-[#30363d] cursor-pointer disabled:opacity-50"
                  >
                    <Calendar className="h-3.5 w-3.5 text-[#58a6ff]" />
                    Schedule On-Site PM Visit
                  </button>

                  <button
                    type="button"
                    disabled={isSchedulingCalendar}
                    onClick={() => handleScheduleCalendarEvent("REMOTE_CONSULTATION")}
                    className="inline-flex items-center gap-1.5 rounded-md bg-[#238636] text-white px-3 py-1.5 text-xs font-medium hover:bg-[#2ea043] cursor-pointer disabled:opacity-50"
                  >
                    <Video className="h-3.5 w-3.5" />
                    Generate Remote Google Meet Link
                  </button>
                </div>
              </div>

              {/* Google Workspace Module 2: Gmail Reply Action */}
              <div className="rounded-md border border-[#238636]/30 bg-[#238636]/10 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#3fb950]">
                    <Mail className="h-4 w-4 text-[#3fb950]" />
                    Gmail Reply Integration
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsReplyBoxOpen(!isReplyBoxOpen)}
                    className="text-xs font-medium text-[#3fb950] hover:underline cursor-pointer"
                  >
                    {isReplyBoxOpen ? "Hide Reply Box" : "Compose Email Reply"}
                  </button>
                </div>

                {isReplyBoxOpen && (
                  <div className="space-y-3 pt-2">
                    <textarea
                      rows={3}
                      placeholder={`Reply to ${selectedTicket.customerEmail}...`}
                      value={replyMessage}
                      onChange={(e) => setReplyMessage(e.target.value)}
                      className="w-full rounded-md border border-[#30363d] bg-[#0d1117] p-3 text-xs font-normal text-[#f0f6fc] focus:outline-none focus:border-[#58a6ff]"
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        disabled={isSendingReply || !replyMessage.trim()}
                        onClick={handleSendGmailReply}
                        className="inline-flex items-center gap-1.5 rounded-md bg-[#238636] hover:bg-[#2ea043] px-3.5 py-1.5 text-xs font-medium text-white shadow-xs disabled:opacity-50 cursor-pointer"
                      >
                        <Send className="h-3.5 w-3.5" />
                        {isSendingReply ? "Sending..." : "Send Gmail Reply"}
                      </button>
                    </div>
                  </div>
                )}

                {selectedTicket.emailReplyLog && selectedTicket.emailReplyLog.length > 0 && (
                  <div className="space-y-1 border-t border-[#30363d] pt-2">
                    <span className="text-[10px] font-mono uppercase text-[#3fb950]">Email Audit Trail</span>
                    {selectedTicket.emailReplyLog.map((log, idx) => (
                      <p key={idx} className="text-[11px] font-mono text-[#c9d1d9]">
                        {log}
                      </p>
                    ))}
                  </div>
                )}
              </div>

              {/* Google Workspace Module 3: Stream Attachment to Drive */}
              <div className="rounded-md border border-[#30363d] bg-[#161b22] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#f0f6fc]">
                    <Paperclip className="h-4 w-4 text-[#8b949e]" />
                    Google Drive File Attachments
                  </div>
                  <label className="inline-flex items-center gap-1.5 rounded-md bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] px-3 py-1 text-xs font-medium text-[#c9d1d9] cursor-pointer">
                    <UploadCloud className="h-3.5 w-3.5 text-[#8b949e]" />
                    {isUploadingDrive ? "Uploading..." : "Upload to Drive"}
                    <input
                      type="file"
                      disabled={isUploadingDrive}
                      onChange={handleUploadDriveAttachment}
                      className="hidden"
                    />
                  </label>
                </div>

                {selectedTicket.driveAttachments && selectedTicket.driveAttachments.length > 0 ? (
                  <div className="space-y-2">
                    {selectedTicket.driveAttachments.map((att) => (
                      <a
                        key={att.fileId}
                        href={att.webViewLink}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between rounded-md border border-[#30363d] bg-[#0d1117] p-2.5 text-xs text-[#c9d1d9] hover:border-[#8b949e] hover:bg-[#21262d]"
                      >
                        <span className="truncate">{att.fileName}</span>
                        <span className="inline-flex items-center gap-1 text-[11px] text-[#58a6ff]">
                          Drive Link <ExternalLink className="h-3 w-3" />
                        </span>
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[#8b949e]">No attachments streamed to Google Drive yet.</p>
                )}
              </div>

              {/* Description Box */}
              <div className="rounded-md border border-[#30363d] bg-[#161b22] p-4 space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-[#8b949e]">Customer Description</h4>
                <p className="text-xs leading-relaxed text-[#c9d1d9] whitespace-pre-wrap font-normal">
                  {selectedTicket.description}
                </p>
              </div>

              {/* Status Update Quick Bar */}
              <div className="rounded-md border border-[#30363d] bg-[#161b22] p-4 space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-[#8b949e]">Lifecycle Operations</h4>
                <div className="flex flex-wrap gap-2">
                  {(["NEW", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      disabled={isUpdating}
                      onClick={() => handleUpdateStatus(selectedTicket.id, st)}
                      className={`rounded-md px-3 py-1 text-xs font-medium transition-colors cursor-pointer border ${
                        selectedTicket.status === st
                          ? "bg-[#21262d] text-[#f0f6fc] border-[#8b949e]"
                          : "bg-[#0d1117] text-[#8b949e] border-[#30363d] hover:bg-[#21262d] hover:text-[#c9d1d9]"
                      }`}
                    >
                      Mark as {st}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Drawer Footer Actions */}
            <div className="flex items-center justify-between border-t border-[#30363d] bg-[#161b22] p-4 sm:p-5">
              <button
                type="button"
                onClick={() => setSelectedTicket(null)}
                className="rounded-md border border-[#30363d] bg-[#21262d] px-3.5 py-1.5 text-xs font-medium text-[#c9d1d9] hover:bg-[#30363d] cursor-pointer"
              >
                Close Drawer
              </button>

              <button
                type="button"
                disabled={isDispatching || selectedTicket.status === "PENDING_DISPATCH"}
                onClick={() => handleDispatchJob(selectedTicket.id)}
                className="inline-flex items-center gap-1.5 rounded-md bg-[#238636] hover:bg-[#2ea043] border border-[rgba(240,246,252,0.1)] px-3.5 py-1.5 text-xs font-medium text-white shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
              >
                <Wrench className="h-3.5 w-3.5" />
                {selectedTicket.dispatchJobTicketId ? "Field Job Dispatched" : "Elevate to Field Job"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
