"use client";

import React, { useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { 
  FileText, 
  Search, 
  Calendar, 
  Layers, 
  Settings2,
  User,
  Mail,
  Phone,
  X,
  FileCheck,
  Zap,
  Info,
  AlertCircle,
  ExternalLink,
  ClipboardList,
  Trash2,
} from "@/components/ui/icons";
import { deleteLeads, updateLeadStatus } from "@/app/actions/lead";
import { getSalesPipelineAuditLogs } from "@/app/actions/salesPipeline";
import { AdminBulkActionBar } from "@/components/admin/AdminBulkActionBar";
import { AdminSelectionCheckbox } from "@/components/admin/AdminSelectionCheckbox";
import { useAdminSelection } from "@/hooks/useAdminSelection";
import { cn, formatPrice } from "@/lib/utils";
import { GsapReveal } from "@/components/ui/GsapMotion";
import {
  AuditLogSidebar,
  AuditLogTrigger,
  type AuditTimelineItem,
} from "@/components/ui/AuditLogSidebar";

interface LeadsClientProps {
  initialLeads: LeadRecord[];
}

type LeadStatus = "NEW" | "CONTACTED" | "QUALIFIED" | "WON" | "LOST";

interface LeadConfigurationItem {
  categoryName?: string | null;
  productName?: string | null;
  quantity?: number | null;
  totalPrice?: number | null;
}

interface LeadConfigurationSnapshot {
  items?: LeadConfigurationItem[];
  totalPrice?: number | null;
}

interface LeadProposalDocument {
  id: string;
  fileUrl: string;
  totalValue: number;
}

interface LeadRecord {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: string;
  notes?: string | null;
  location?: string | null;
  createdAt: string | Date;
  configurationSnapshot?: unknown;
  proposalDocuments?: LeadProposalDocument[] | null;
  installationProject?: {
    id: string;
    status: string;
    assignedTeam: string | null;
    scheduledDate: string | Date | null;
  } | null;
}

function isLeadStatus(value: string): value is LeadStatus {
  return ["NEW", "CONTACTED", "QUALIFIED", "WON", "LOST"].includes(value);
}

function normalizeLeadStatus(value: string | null | undefined): LeadStatus {
  return value && isLeadStatus(value) ? value : "NEW";
}

function getLeadConfigurationSnapshot(value: unknown): LeadConfigurationSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const items = Array.isArray(record.items)
    ? record.items
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
        .map((item) => ({
          categoryName: typeof item.categoryName === "string" ? item.categoryName : null,
          productName: typeof item.productName === "string" ? item.productName : null,
          quantity: typeof item.quantity === "number" ? item.quantity : null,
          totalPrice: typeof item.totalPrice === "number" ? item.totalPrice : null,
        }))
    : [];

  return {
    items,
    totalPrice: typeof record.totalPrice === "number" ? record.totalPrice : null,
  };
}

export default function LeadsClient({ initialLeads }: LeadsClientProps) {
  const [leads, setLeads] = useState<LeadRecord[]>(initialLeads);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | LeadStatus>("ALL");
  const [selectedLead, setSelectedLead] = useState<LeadRecord | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [editStatus, setEditStatus] = useState<LeadStatus>("NEW");
  const [editNotes, setEditNotes] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [isBulkActionPending, setIsBulkActionPending] = useState(false);
  const [auditSidebar, setAuditSidebar] = useState<{
    title: string;
    entityLabel: string;
    logs: AuditTimelineItem[];
    isLoading: boolean;
  } | null>(null);
  const auditLoadRef = useRef(0);

  const openAuditSidebar = (lead: LeadRecord) => {
    const requestId = auditLoadRef.current + 1;
    auditLoadRef.current = requestId;
    setAuditSidebar({
      title: "Lead activity",
      entityLabel: `${lead.name} · #${lead.id.slice(0, 8).toUpperCase()}`,
      logs: [],
      isLoading: true,
    });

    void getSalesPipelineAuditLogs([lead.id])
      .then((result) => {
        if (requestId !== auditLoadRef.current) return;
        setAuditSidebar((current) => current
          ? { ...current, logs: result.success ? result.logs : [], isLoading: false }
          : null);
      })
      .catch((error: unknown) => {
        if (requestId !== auditLoadRef.current) return;
        console.error("Failed to load legacy lead audit logs:", error);
        setAuditSidebar((current) => current ? { ...current, isLoading: false } : null);
      });
  };

  useEffect(() => {
    if (selectedLead) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [selectedLead]);

  const handleRowClick = (lead: LeadRecord) => {
    setSelectedLead(lead);
    setEditStatus(normalizeLeadStatus(lead.status));
    setEditNotes(lead.notes || "");
    setStatusMsg("");
  };

  const handleUpdateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLead) return;

    setIsUpdating(true);
    setStatusMsg("");

    try {
      const res = await updateLeadStatus(selectedLead.id, editStatus, editNotes);
      if (res.error) {
        setStatusMsg(`❌ Error: ${res.error}`);
        setIsUpdating(false);
        return;
      }

      // Update local state list
      const updatedLeads = leads.map(l => 
        l.id === selectedLead.id 
          ? { 
              ...l, 
              status: editStatus, 
              notes: editNotes,
              installationProject: editStatus === "WON" && !l.installationProject 
                ? { id: "temp", status: "PREP", assignedTeam: null, scheduledDate: null }
                : l.installationProject
            }
          : l
      );
      setLeads(updatedLeads);
      
      // Update active selection
      setSelectedLead({
        ...selectedLead,
        status: editStatus,
        notes: editNotes,
        installationProject: editStatus === "WON" && !selectedLead.installationProject
          ? { id: "temp", status: "PREP", assignedTeam: null, scheduledDate: null }
          : selectedLead.installationProject
      });

      setStatusMsg("✅ Lead updated successfully!");
    } catch (err: unknown) {
      console.error(err);
      setStatusMsg("❌ Failed to update lead details.");
    } finally {
      setIsUpdating(false);
    }
  };

  // Filter logic
  const filteredLeads = leads.filter(lead => {
    const matchesSearch = 
      lead.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.phone.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.id.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === "ALL" || lead.status === statusFilter;

    return matchesSearch && matchesStatus;
  });
  const selection = useAdminSelection(filteredLeads.map((lead) => lead.id));

  const handleBulkDelete = async () => {
    if (selection.selectedCount === 0) return;
    if (!window.confirm(`Delete ${selection.selectedCount} selected lead(s)? This cannot be undone.`)) return;

    setIsBulkActionPending(true);
    try {
      const ids = selection.selectedIds;
      const result = await deleteLeads(ids);
      if (result.error) {
        setStatusMsg(`❌ Error: ${result.error}`);
        return;
      }
      setLeads((current) => current.filter((lead) => !ids.includes(lead.id)));
      selection.clear();
      setStatusMsg(`✅ ${result.count ?? ids.length} lead(s) deleted successfully.`);
    } catch (error: unknown) {
      console.error(error);
      setStatusMsg("❌ Failed to delete selected leads.");
    } finally {
      setIsBulkActionPending(false);
    }
  };

  // Telemetry counts
  const totalCount = leads.length;
  const newCount = leads.filter(l => l.status === "NEW").length;
  const contactedCount = leads.filter(l => l.status === "CONTACTED").length;
  const qualifiedCount = leads.filter(l => l.status === "QUALIFIED").length;
  const wonCount = leads.filter(l => l.status === "WON").length;
  const selectedSnapshot = selectedLead ? getLeadConfigurationSnapshot(selectedLead.configurationSnapshot) : null;

  return (
    <GsapReveal className="relative space-y-8">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-gray-100 font-sans uppercase">
            Leads <span className="text-[#B7D1EA]">CRM</span> Console
          </h1>
          <p className="text-gray-400 text-xs mt-1 uppercase font-black tracking-widest">
            Manage incoming solar array proposal requests and customer conversion pipeline.
          </p>
        </div>
      </div>

      {/* Summary Telemetry Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="p-5 bg-[#0F172A] border border-[#1E293B] rounded-xl shadow-none flex items-center gap-4">
          <div className="w-10 h-10 bg-[#0B1121] border border-[#1E293B] rounded-xl flex items-center justify-center text-gray-400">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[8px] font-black uppercase text-gray-500">Total Requests</p>
            <h3 className="text-lg font-black text-gray-100">{totalCount} Leads</h3>
          </div>
        </div>

        <div className="p-5 bg-[#0F172A] border border-[#1E293B] rounded-xl shadow-none flex items-center gap-4">
          <div className="w-10 h-10 bg-[#B7D1EA]/10 border border-[#B7D1EA]/20 rounded-xl flex items-center justify-center text-[#B7D1EA]">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[8px] font-black uppercase text-[#B7D1EA]">New</p>
            <h3 className="text-lg font-black text-gray-100">{newCount} Leads</h3>
          </div>
        </div>

        <div className="p-5 bg-[#0F172A] border border-[#1E293B] rounded-xl shadow-none flex items-center gap-4">
          <div className="w-10 h-10 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-center text-amber-300">
            <Info className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[8px] font-black uppercase text-amber-300">Contacted</p>
            <h3 className="text-lg font-black text-gray-100">{contactedCount} Leads</h3>
          </div>
        </div>

        <div className="p-5 bg-[#0F172A] border border-[#1E293B] rounded-xl shadow-none flex items-center gap-4">
          <div className="w-10 h-10 bg-sky-500/10 border border-sky-500/20 rounded-xl flex items-center justify-center text-sky-300">
            <ClipboardList className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[8px] font-black uppercase text-sky-300">Qualified</p>
            <h3 className="text-lg font-black text-gray-100">{qualifiedCount} Leads</h3>
          </div>
        </div>

        <div className="p-5 bg-[#0F172A] border border-[#1E293B] rounded-xl shadow-none flex items-center gap-4">
          <div className="w-10 h-10 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center text-emerald-300">
            <FileCheck className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[8px] font-black uppercase text-emerald-300">Won Projects</p>
            <h3 className="text-lg font-black text-gray-100">{wonCount} Won</h3>
          </div>
        </div>
      </div>

      {/* Control Panel (Search & Status Toggle) */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-[#0F172A] border border-[#1E293B] p-4 rounded-xl shadow-none">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search by name, email, phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-[#0B1121] border border-[#1E293B] focus:border-[#B7D1EA] focus:bg-[#0F172A] rounded-xl text-xs font-bold text-gray-100 focus:outline-none transition-all placeholder:text-gray-500 placeholder:font-semibold"
          />
        </div>

        {/* Filters Status Pills */}
        <div className="flex flex-wrap gap-1.5 self-start md:self-auto">
          {(["ALL", "NEW", "CONTACTED", "QUALIFIED", "WON", "LOST"] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={cn(
                "px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer",
                statusFilter === status
                  ? "bg-slate-900 text-white shadow-none border border-slate-900"
                  : "bg-[#0B1121] text-gray-400 hover:text-gray-100 border border-[#1E293B]"
              )}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Leads Table */}
      <AdminBulkActionBar
        selectedCount={selection.selectedCount}
        visibleCount={filteredLeads.length}
        allVisibleSelected={selection.allVisibleSelected}
        someVisibleSelected={selection.someVisibleSelected}
        onToggleVisible={selection.toggleVisible}
        onClear={selection.clear}
        isPending={isBulkActionPending}
        actions={[
          {
            id: "delete",
            label: "Delete",
            icon: Trash2,
            tone: "danger",
            onClick: () => void handleBulkDelete(),
          },
        ]}
      />
      <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl overflow-hidden shadow-none">
        <div className="overflow-x-auto">
          <table className="min-w-[820px] w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#1E293B] bg-[#0B1121] text-[9px] uppercase tracking-widest text-gray-300 font-black">
                <th className="w-14 px-6 py-4">
                  <AdminSelectionCheckbox
                    checked={selection.allVisibleSelected}
                    indeterminate={selection.someVisibleSelected}
                    disabled={filteredLeads.length === 0 || isBulkActionPending}
                    label="Select all visible leads"
                    onChange={selection.toggleVisible}
                  />
                </th>
                <th className="px-6 py-4">Lead Info</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">System Spec Snapshot</th>
                <th className="px-6 py-4">Submitted Date</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E293B]">
              {filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-gray-500 font-semibold text-xs uppercase tracking-widest">
                    No leads found matching query.
                  </td>
                </tr>
              ) : (
                filteredLeads.map((lead) => {
                  const snap = getLeadConfigurationSnapshot(lead.configurationSnapshot);
                  return (
                    <tr 
                      key={lead.id} 
                      className="hover:bg-[#0B1121] transition-colors group cursor-pointer"
                      onClick={() => handleRowClick(lead)}
                    >
                      <td className="px-6 py-4" onClick={(event) => event.stopPropagation()}>
                        <AdminSelectionCheckbox
                          checked={selection.isSelected(lead.id)}
                          disabled={isBulkActionPending}
                          label={`Select lead ${lead.name}`}
                          onChange={() => selection.toggle(lead.id)}
                        />
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-0.5">
                          <p className="text-gray-100 font-bold uppercase text-[11px]">{lead.name}</p>
                          <div className="flex items-center gap-2 text-[9px] text-gray-500 font-bold">
                            <span className="flex items-center gap-0.5"><Mail className="w-3 h-3 text-[#B7D1EA]" /> {lead.email}</span>
                            <span className="text-slate-300">&bull;</span>
                            <span className="flex items-center gap-0.5"><Phone className="w-3 h-3 text-[#B7D1EA]" /> {lead.phone}</span>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <span className={cn(
                          "px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider border",
                          lead.status === "NEW" && "bg-sky-500/10 text-sky-300 border-sky-500/20",
                          lead.status === "CONTACTED" && "bg-amber-500/10 text-amber-300 border-amber-500/20",
                          lead.status === "QUALIFIED" && "bg-indigo-500/10 text-indigo-300 border-indigo-500/20",
                          lead.status === "WON" && "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
                          lead.status === "LOST" && "bg-rose-500/10 text-rose-300 border-rose-500/20"
                        )}>
                          {lead.status}
                        </span>
                      </td>

                      <td className="px-6 py-4">
                        {snap ? (
                          <div className="flex flex-col gap-0.5 text-[9px] font-semibold text-gray-400">
                            <p className="text-gray-300 font-bold">
                              {snap.items?.length || 0} Configured Components
                            </p>
                            <p className="text-[8.5px]">
                              Total Spec Price: <strong className="font-mono text-[#D8A87B]">{formatPrice(snap.totalPrice || 0)}</strong>
                            </p>
                          </div>
                        ) : (
                          <span className="text-[9px] text-gray-500 italic">No configuration snapshot available</span>
                        )}
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 font-bold uppercase">
                          <Calendar className="w-3.5 h-3.5 text-gray-500" />
                          <span>{new Date(lead.createdAt).toLocaleDateString('th-TH')}</span>
                        </div>
                      </td>

                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRowClick(lead);
                          }}
                          className="px-3.5 py-1.5 bg-[#0B1121] border border-[#1E293B] group-hover:border-[#B7D1EA] group-hover:text-[#B7D1EA] text-gray-400 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer shadow-none active:scale-95"
                        >
                          View Config
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

      {/* CRM Detail Slide-over Drawer */}
      {selectedLead && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity"
            onClick={() => setSelectedLead(null)}
          />

          {/* Drawer Container */}
          <GsapReveal from="right" className="relative z-50 flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-[#1E293B] bg-[#0F172A] p-6 shadow-none">
            
            {/* Header */}
            <div className="flex justify-between items-start pb-4 border-b border-[#1E293B]">
              <div>
                <h3 className="text-base font-black text-gray-100 uppercase">
                  Lead Details & Sizing Config
                </h3>
                <p className="text-[9px] text-gray-500 font-bold uppercase mt-0.5 tracking-widest">
                  Lead ID: {selectedLead.id.substring(0, 8).toUpperCase()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <AuditLogTrigger
                  onClick={() => openAuditSidebar(selectedLead)}
                  label="Logs"
                  className="min-h-9 px-2 text-[10px]"
                />
                <button
                  onClick={() => setSelectedLead(null)}
                  aria-label="Close lead details"
                  className="p-1.5 hover:bg-[#0B1121] rounded-full transition-colors cursor-pointer text-gray-500 hover:text-gray-300"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Info & Update Status Forms */}
            <form onSubmit={handleUpdateLead} className="space-y-6 pt-4">
              
              {/* Telemetry updates status banner */}
              {statusMsg && (
                <div className={cn(
                  "p-3 rounded-xl text-xs font-bold border",
                  statusMsg.includes("Error") || statusMsg.includes("Failed")
                    ? "bg-rose-500/10 border-rose-500/20 text-rose-300"
                    : "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                )}>
                  {statusMsg}
                </div>
              )}

              {/* Client Info Block */}
              <div className="bg-[#0B1121] border border-[#1E293B]/60 p-4 rounded-xl space-y-3">
                <h4 className="text-[9px] font-black uppercase tracking-wider text-[#B7D1EA] flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" />
                  <span>Contact Information</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[10px] font-semibold text-gray-400">
                  <div>
                    <span className="text-[8px] uppercase font-black text-gray-500 block">Name</span>
                    <span className="text-gray-100 font-bold text-xs uppercase">{selectedLead.name}</span>
                  </div>
                  <div>
                    <span className="text-[8px] uppercase font-black text-gray-500 block">Phone</span>
                    <span className="text-gray-100 font-mono font-bold text-xs">{selectedLead.phone}</span>
                  </div>
                  <div className="sm:col-span-2">
                    <span className="text-[8px] uppercase font-black text-gray-500 block">Email Address</span>
                    <span className="text-gray-100 font-mono font-bold text-xs">{selectedLead.email}</span>
                  </div>
                  {selectedLead.location && (
                    <div className="sm:col-span-2">
                      <span className="text-[8px] uppercase font-black text-gray-500 block">Installation Location</span>
                      <span className="text-gray-100 font-bold text-xs">{selectedLead.location}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Proposal Document (PDF) Block */}
              {selectedLead.proposalDocuments && selectedLead.proposalDocuments.length > 0 && (
                <div className="bg-[#0B1121] border border-[#1E293B]/60 p-4 rounded-xl space-y-3">
                  <h4 className="text-[9px] font-black uppercase tracking-wider text-[#D8A87B] flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" />
                    <span>Generated Quotation Documents</span>
                  </h4>
                  <div className="space-y-2">
                    {selectedLead.proposalDocuments.map((doc) => (
                      <div key={doc.id} className="flex justify-between items-center bg-[#0F172A] border border-[#1E293B] p-3 rounded-xl shadow-none">
                        <div>
                          <p className="text-[10px] font-bold text-gray-100">Proposal Quotation PDF</p>
                          <p className="text-[8px] text-gray-500 font-bold font-mono">Value: {formatPrice(doc.totalValue)}</p>
                        </div>
                        <a
                          href={doc.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#B7D1EA]/10 text-[#B7D1EA] hover:bg-[#B7D1EA] hover:text-white rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer"
                        >
                          View PDF
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Status Update Select & notes */}
              <div className="space-y-4 bg-[#0B1121] border border-[#1E293B]/60 p-4 rounded-xl">
                <h4 className="text-[9px] font-black uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                  <Settings2 className="w-3.5 h-3.5" />
                  <span>Update Pipeline Stage</span>
                </h4>
                
                <div className="grid grid-cols-2 gap-3 items-end">
                  <div className="space-y-1">
                    <label className="text-[8px] font-black uppercase text-gray-500">Status</label>
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value as LeadStatus)}
                      className="w-full p-2 bg-[#0F172A] border border-[#1E293B] rounded-xl text-xs font-bold text-gray-100 focus:outline-none focus:border-[#B7D1EA]"
                    >
                      <option value="NEW">NEW</option>
                      <option value="CONTACTED">CONTACTED</option>
                      <option value="QUALIFIED">QUALIFIED</option>
                      <option value="WON">WON</option>
                      <option value="LOST">LOST</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={isUpdating}
                    className="py-2.5 bg-[#B7D1EA] hover:bg-[#99BFE3] text-white text-[9px] font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-none shadow-[#B7D1EA]/10"
                  >
                    Save Changes
                  </button>
                </div>

                <div className="space-y-1">
                  <label className="text-[8px] font-black uppercase text-gray-500">Admin CRM Notes</label>
                  <textarea
                    rows={3}
                    placeholder="Log status notes (e.g., Called client to schedule site visit on next Monday...)"
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    className="w-full p-3 bg-[#0F172A] border border-[#1E293B] rounded-xl text-xs font-semibold text-gray-100 focus:outline-none focus:border-[#B7D1EA]"
                  />
                </div>

                {/* Linked project details */}
                {selectedLead.status === "WON" && (
                  <div className="mt-4 pt-4 border-t border-[#1E293B] flex flex-col gap-2.5 bg-[#B7D1EA]/5 border border-[#B7D1EA]/15 p-3.5 rounded-xl">
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] font-black uppercase tracking-wider text-[#B7D1EA]">Installation Project Activated</span>
                      <span className="px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                        {selectedLead.installationProject?.status || "PREP"}
                      </span>
                    </div>
                    <Link
                      href="/admin/projects"
                      className="w-full text-center py-2 bg-slate-900 hover:bg-[#B7D1EA] text-white text-[9px] font-black uppercase tracking-widest rounded-lg transition-all"
                    >
                      Open Installer Portal &rarr;
                    </Link>
                  </div>
                )}
              </div>

              {/* Configuration Snapshot details */}
              {selectedSnapshot ? (
                <div className="space-y-4">
                  <div className="border-t border-[#1E293B] pt-4">
                    <h4 className="text-[10px] font-black uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-[#B7D1EA]" />
                      <span>Configured System Sizing Metrics</span>
                    </h4>
                    
                    {/* Size telemetry */}
                    <div className="grid grid-cols-2 gap-2.5 text-center text-gray-300">
                      <div className="p-2.5 bg-[#0B1121] border border-[#1E293B] rounded-xl">
                        <span className="text-[7.5px] uppercase font-black text-gray-500 block">Total Sized Value</span>
                        <span className="text-xs font-black font-mono text-[#D8A87B]">
                          {formatPrice(selectedSnapshot.totalPrice || 0)}
                        </span>
                      </div>
                      <div className="p-2.5 bg-[#0B1121] border border-[#1E293B] rounded-xl">
                        <span className="text-[7.5px] uppercase font-black text-gray-500 block">Items Count</span>
                        <span className="text-xs font-black font-mono">
                          {selectedSnapshot.items?.length || 0} Components
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Bill of Materials table */}
                  {selectedSnapshot.items && (
                    <div className="space-y-2">
                      <span className="text-[8px] font-black uppercase text-gray-500 tracking-wider">
                        Configured BOM Snapshot
                      </span>
                      <div className="bg-[#0B1121] border border-[#1E293B] rounded-xl overflow-hidden p-2">
                        <div className="space-y-1.5">
                          {selectedSnapshot.items.map((item, idx: number) => (
                            <div key={idx} className="flex justify-between items-center text-[9px] bg-[#0F172A] px-3 py-2 rounded-lg shadow-none border border-[#1E293B]">
                              <div className="space-y-0.5 flex-1 pr-2">
                                <span className="text-[7.5px] font-black uppercase text-[#B7D1EA] block">{item.categoryName}</span>
                                <span className="text-gray-100 font-bold uppercase line-clamp-1">
                                  {item.productName} {(item.quantity || 0) > 1 ? `x${item.quantity}` : ""}
                                </span>
                              </div>
                              <span className="font-mono font-black text-gray-300">
                                {formatPrice(item.totalPrice || 0)}
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider text-gray-100 px-3 pt-3 border-t border-[#1E293B] mt-2.5">
                          <span>Total Config Cost:</span>
                          <span className="text-xs font-mono font-black text-[#D8A87B]">
                            {formatPrice(selectedSnapshot.totalPrice || 0)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 text-amber-200 rounded-xl text-xs font-semibold">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>No configurations recorded for this lead submission.</span>
                </div>
              )}
            </form>
          </GsapReveal>
        </div>,
        document.body
      )}

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
    </GsapReveal>
  );
}
