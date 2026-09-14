"use client";

import React, { useState } from "react";
import {
  Search,
  ChevronRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  Copy,
} from "@/components/ui/icons";
import { toast } from "sonner";
import { GsapSpinner } from "@/components/ui/GsapMotion";
import { AdminBulkActionBar } from "@/components/admin/AdminBulkActionBar";
import { AdminSelectionCheckbox } from "@/components/admin/AdminSelectionCheckbox";
import { useAdminSelection } from "@/hooks/useAdminSelection";

interface OperationsTicketData {
  id: string;
  ticketNumber: string;
  phase: string;
  documentCode: number;
  documentTitle: string;
  status: string;
  assignedRole: string;
  updatedAt: string;
  proposal?: {
    user?: {
      name: string;
    };
  };
}

interface AdminTicketsClientProps {
  initialTickets: OperationsTicketData[];
}

export default function AdminTicketsClient({ initialTickets }: AdminTicketsClientProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const [phaseFilter, setPhaseFilter] = useState<string | null>(null);

  const filteredTickets = initialTickets.filter((ticket) => {
    const customerName = ticket.proposal?.user?.name || "Unknown";
    const matchesSearch =
      ticket.ticketNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ticket.documentTitle.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesRole = !roleFilter || ticket.assignedRole === roleFilter;
    const matchesPhase = !phaseFilter || ticket.phase === phaseFilter;

    return matchesSearch && matchesRole && matchesPhase;
  });
  const ticketSelection = useAdminSelection(filteredTickets.map((ticket) => ticket.id));

  const handleCopySelected = async () => {
    const selected = filteredTickets.filter((ticket) => ticketSelection.selectedIds.includes(ticket.id));
    if (selected.length === 0) return;
    await navigator.clipboard.writeText(selected.map((ticket) => `${ticket.ticketNumber}\t${ticket.id}`).join("\n"));
    toast.success(`Copied ${selected.length} selected ticket${selected.length === 1 ? "" : "s"}.`);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return "bg-emerald-100 text-emerald-900";
      case "WAITING_SIGNATURE":
        return "bg-blue-100 text-blue-900";
      case "IN_PROGRESS":
        return "bg-amber-100 text-amber-900";
      case "REJECTED":
        return "bg-rose-100 text-rose-900";
      default:
        return "bg-[#0B1121] text-gray-100";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return <CheckCircle2 className="w-4 h-4" />;
      case "IN_PROGRESS":
        return <GsapSpinner className="h-4 w-4" />;
      case "PENDING":
        return <Clock className="w-4 h-4" />;
      case "REJECTED":
        return <AlertCircle className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6 md:p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-black text-gray-100 uppercase tracking-tight">
          Operations <span className="text-[#B7D1EA]">Tickets</span>
        </h1>
        <p className="text-gray-400 text-sm uppercase font-bold tracking-widest mt-2">
          Manage compliance documents and operational tasks.
        </p>
      </div>

      {/* Controls */}
      <div className="bg-[#0F172A] border border-[#1E293B] rounded-2xl p-6 mb-8 shadow-none">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search tickets, customers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border border-[#1E293B] rounded-xl focus:ring-2 focus:ring-[#B7D1EA] outline-none text-sm"
            />
          </div>

          <select
            value={roleFilter || ""}
            onChange={(e) => setRoleFilter(e.target.value || null)}
            className="px-4 py-2.5 border border-[#1E293B] rounded-xl focus:ring-2 focus:ring-[#B7D1EA] outline-none text-sm"
          >
            <option value="">All Roles</option>
            <option value="SALES">Sales</option>
            <option value="TECHNICIAN">Technician</option>
            <option value="SAFETY_OFFICER">Safety Officer</option>
            <option value="ELECTRICAL_ENGINEER">Electrical Engineer</option>
            <option value="PROJECT_MANAGER">Project Manager</option>
            <option value="ADMIN">Admin</option>
          </select>

          <select
            value={phaseFilter || ""}
            onChange={(e) => setPhaseFilter(e.target.value || null)}
            className="px-4 py-2.5 border border-[#1E293B] rounded-xl focus:ring-2 focus:ring-[#B7D1EA] outline-none text-sm"
          >
            <option value="">All Phases</option>
            <option value="PHASE_1">Phase 1</option>
            <option value="PHASE_2">Phase 2</option>
            <option value="PHASE_3">Phase 3</option>
            <option value="PHASE_4">Phase 4</option>
            <option value="PHASE_5">Phase 5</option>
          </select>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-emerald-500/10 border border-emerald-200 rounded-xl p-4 text-center">
            <p className="text-2xl font-black text-emerald-800">
              {initialTickets.filter((t) => t.status === "COMPLETED").length}
            </p>
            <p className="text-xs font-bold text-emerald-900 mt-1 uppercase">
              Completed
            </p>
          </div>
          <div className="bg-amber-500/10 border border-amber-200 rounded-xl p-4 text-center">
            <p className="text-2xl font-black text-amber-800">
              {initialTickets.filter((t) => t.status === "PENDING").length}
            </p>
            <p className="text-xs font-bold text-amber-900 mt-1 uppercase">
              Pending
            </p>
          </div>
          <div className="bg-blue-500/10 border border-blue-200 rounded-xl p-4 text-center">
            <p className="text-2xl font-black text-blue-800">
              {initialTickets.filter((t) => t.status === "IN_PROGRESS").length}
            </p>
            <p className="text-xs font-bold text-blue-900 mt-1 uppercase">
              In Progress
            </p>
          </div>
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 text-center">
            <p className="text-2xl font-black text-gray-100">
              {initialTickets.filter((t) => t.status === "WAITING_SIGNATURE").length}
            </p>
            <p className="text-xs font-bold text-indigo-900 mt-1 uppercase">
              Awaiting Sign
            </p>
          </div>
          <div className="bg-rose-500/10 border border-rose-200 rounded-xl p-4 text-center">
            <p className="text-2xl font-black text-rose-800">
              {initialTickets.filter((t) => t.status === "REJECTED").length}
            </p>
            <p className="text-xs font-bold text-rose-900 mt-1 uppercase">
              Rejected
            </p>
          </div>
        </div>
      </div>

      {/* Tickets List */}
      <div className="space-y-3">
        <AdminBulkActionBar
          selectedCount={ticketSelection.selectedCount}
          visibleCount={filteredTickets.length}
          allVisibleSelected={ticketSelection.allVisibleSelected}
          someVisibleSelected={ticketSelection.someVisibleSelected}
          onToggleVisible={ticketSelection.toggleVisible}
          onClear={ticketSelection.clear}
          actions={[
            { id: "copy", label: "Copy selected", icon: Copy, onClick: handleCopySelected },
          ]}
        />
        {filteredTickets.length === 0 ? (
          <div className="bg-[#0F172A] border border-[#1E293B] rounded-2xl p-12 text-center">
            <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-sm font-black text-gray-100 uppercase">
              No Tickets Found
            </h3>
            <p className="text-xs text-gray-400 mt-2">
              Try adjusting your filters or search term.
            </p>
          </div>
        ) : (
          filteredTickets.map((ticket) => {
            const customerName = ticket.proposal?.user?.name || "Unknown Customer";
            return (
              <div
                key={ticket.id}
                className="flex items-center gap-3 rounded-xl border border-[#1E293B] bg-[#0F172A] p-3 transition-all hover:shadow-none"
              >
                <AdminSelectionCheckbox
                  checked={ticketSelection.isSelected(ticket.id)}
                  onChange={() => ticketSelection.toggle(ticket.id)}
                  label={`Select ${ticket.ticketNumber}`}
                  className="shrink-0"
                />
                <a
                  href={`/admin/tickets/${ticket.id}`}
                  className="group flex min-w-0 flex-1 items-center justify-between gap-4 p-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-xs font-bold text-[#B7D1EA]">
                      {ticket.ticketNumber}
                    </p>
                    <p className="mt-1.5 truncate text-sm font-bold text-gray-100">
                      {customerName}
                    </p>
                    <p className="mt-1 truncate text-xs text-gray-400">
                      {ticket.documentTitle} • Doc #{ticket.documentCode}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-4">
                    <span className="hidden text-xs font-bold uppercase text-gray-400 lg:inline">
                      {ticket.assignedRole}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold ${getStatusColor(ticket.status)}`}
                    >
                      {getStatusIcon(ticket.status)}
                      {ticket.status.replace(/_/g, " ")}
                    </span>
                    <ChevronRight className="h-5 w-5 text-gray-500 group-hover:text-[#B7D1EA]" />
                  </div>
                </a>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
