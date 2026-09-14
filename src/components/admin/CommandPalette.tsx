"use client";

import React, { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Search,
  ArrowLeft,
  FileText,
  ClipboardList,
  FolderKanban,
  SlidersHorizontal,
  Wrench,
  CornerDownLeft,
  Inbox,
  BarChart3,
  Sparkles,
  Globe,
  ShieldAlert,
  Layers,
  Loader2,
} from "@/components/ui/icons";
import { searchCommandPaletteData } from "@/app/actions/tickets";

interface ProposalSearchResult {
  id: string;
  status: string;
  userName: string | null;
  userEmail: string | null;
}

interface TicketSearchResult {
  id: string;
  status: string;
  customerAddress: string | null;
  userName: string | null;
}

interface LeadSearchResult {
  id: string;
  customerName: string;
  email: string | null;
  status: string;
}

export default function CommandPalette({ initialOpen = false }: { initialOpen?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(initialOpen);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<{
    recent: ProposalSearchResult[];
    proposals: ProposalSearchResult[];
    tickets: TicketSearchResult[];
    leads: LeadSearchResult[];
  }>({ recent: [], proposals: [], tickets: [], leads: [] });

  // ── Cmd+K Shortcut Listener ──────────────────
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };

    const handleOpenEvent = () => {
      setOpen(true);
    };

    document.addEventListener("keydown", down);
    window.addEventListener("open-command-palette", handleOpenEvent);
    return () => {
      document.removeEventListener("keydown", down);
      window.removeEventListener("open-command-palette", handleOpenEvent);
    };
  }, []);

  // ── Debounced Search Fetcher ────────────────
  useEffect(() => {
    if (!open) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await searchCommandPaletteData(query);
        if (res.success) {
          setResults({
            recent: res.recent || [],
            proposals: res.proposals || [],
            tickets: res.tickets || [],
            leads: (res.leads || []) as LeadSearchResult[],
          });
        }
      } catch (err) {
        console.error("Failed to query command palette:", err);
      } finally {
        setLoading(false);
      }
    };

    const timer = setTimeout(fetchData, query ? 250 : 0);
    return () => clearTimeout(timer);
  }, [query, open]);

  const handleSelectRoute = (path: string) => {
    const localePrefix = /^\/(en|th|ja|zh|ko|vi)(?:\/|$)/.exec(pathname)?.[0].replace(/\/$/, "") ?? "";
    router.push(`${localePrefix}${path}`);
    setOpen(false);
    setQuery("");
  };

  return (
    <Dialog isOpen={open} onClose={() => setOpen(false)} size="md">
      <DialogContent className="flex h-[min(680px,85dvh)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[#30363d] bg-[#161b22] p-0 shadow-2xl shadow-black/40">
        <Command className="flex flex-col h-full w-full bg-transparent overflow-hidden">
          {/* Search Header Bar with Back Button */}
          <div className="flex shrink-0 items-center gap-3 border-b border-[#30363d] bg-[#161b22] px-4 py-3">
            <button
              type="button"
              onClick={() => {
                if (query.trim()) {
                  setQuery("");
                } else {
                  router.back();
                  setOpen(false);
                }
              }}
              className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md border border-[#30363d] bg-[#0d1117] text-[#8b949e] transition-colors hover:border-[#8b949e] hover:bg-[#21262d] hover:text-[#f0f6fc]"
              title="Go back / Clear search"
              aria-label="Go back or clear search"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <Search className="size-4 shrink-0 text-[#8b949e]" />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder="Search features, leads, proposals, tickets..."
              className="w-full rounded-md border border-[#30363d] bg-[#0d1117] px-3 py-2.5 text-sm font-medium text-[#f0f6fc] outline-none placeholder:text-[#8b949e] focus-visible:border-[#58a6ff] focus-visible:ring-1 focus-visible:ring-[#58a6ff]"
            />
            {loading ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#B7D1EA]" aria-hidden="true" />
            ) : (
              <span className="shrink-0 rounded-md border border-[#30363d] bg-[#21262d] px-2 py-1 font-mono text-[10px] font-semibold text-[#8b949e]">
                ESC
              </span>
            )}
          </div>

          {/* Scrollable Results List */}
          <Command.List className="min-h-[300px] flex-1 space-y-4 overflow-y-auto px-4 py-4 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
            <Command.Empty className="py-8 text-center text-sm font-medium text-[#8b949e]">
              No matching records or features found.
            </Command.Empty>

            {/* Dynamic Lead Results */}
            {query !== "" && results.leads && results.leads.length > 0 && (
              <Command.Group
                heading="Matching Inbound Leads"
              className="space-y-1 text-[11px] font-semibold text-[#8b949e]"
              >
                <div className="mt-1.5 space-y-1">
                  {results.leads.map((lead) => (
                    <Command.Item
                      key={lead.id}
                      onSelect={() => handleSelectRoute("/admin/quotations?tab=leads")}
                      className="flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold text-slate-300 hover:bg-slate-800/60 aria-selected:bg-slate-800/90 transition-all cursor-pointer group"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Inbox className="w-4 h-4 text-[#B7D1EA] shrink-0" />
                        <span className="truncate">{lead.customerName}</span>
                        {lead.email && <span className="text-slate-500 font-normal truncate">({lead.email})</span>}
                      </div>
                      <span className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full font-bold uppercase shrink-0">
                        {lead.status}
                      </span>
                    </Command.Item>
                  ))}
                </div>
              </Command.Group>
            )}

            {/* Dynamic Proposal Results */}
            {query !== "" && results.proposals.length > 0 && (
              <Command.Group
                heading="Matching Proposals & Quotations"
                className="space-y-1 text-[11px] font-semibold text-[#8b949e]"
              >
                <div className="mt-1.5 space-y-1">
                  {results.proposals.map((prop) => (
                    <Command.Item
                      key={prop.id}
                      onSelect={() => handleSelectRoute(`/admin/crm/${prop.id}`)}
                      className="flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold text-slate-300 hover:bg-slate-800/60 aria-selected:bg-slate-800/90 transition-all cursor-pointer group"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="w-4 h-4 text-[#94A3B8] shrink-0" />
                        <span className="truncate">{prop.userName || prop.userEmail}</span>
                        <span className="font-mono text-[10px] text-slate-400 bg-slate-800 border border-slate-700/60 px-1.5 py-0.5 rounded-md shrink-0">
                          #{prop.id.slice(0, 8).toUpperCase()}
                        </span>
                      </div>
                      <span className="text-[10px] text-[#B7D1EA] bg-[#B7D1EA]/10 border border-[#B7D1EA]/20 px-2 py-0.5 rounded-full font-bold uppercase shrink-0">
                        {prop.status}
                      </span>
                    </Command.Item>
                  ))}
                </div>
              </Command.Group>
            )}

            {/* Dynamic Ticket Results */}
            {query !== "" && results.tickets.length > 0 && (
              <Command.Group
                heading="Matching Job Tickets"
                className="space-y-1 text-[11px] font-semibold text-[#8b949e]"
              >
                <div className="mt-1.5 space-y-1">
                  {results.tickets.map((ticket) => (
                    <Command.Item
                      key={ticket.id}
                      onSelect={() => handleSelectRoute("/admin/job-tickets")}
                      className="flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold text-slate-300 hover:bg-slate-800/60 aria-selected:bg-slate-800/90 transition-all cursor-pointer group"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Wrench className="w-4 h-4 text-[#94A3B8] shrink-0" />
                        <span className="truncate">{ticket.userName || "Customer"}</span>
                        <span className="font-mono text-[10px] text-slate-400 bg-slate-800 border border-slate-700/60 px-1.5 py-0.5 rounded-md shrink-0">
                          #{ticket.id.slice(0, 8).toUpperCase()}
                        </span>
                      </div>
                      <span className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full font-bold uppercase shrink-0">
                        {ticket.status}
                      </span>
                    </Command.Item>
                  ))}
                </div>
              </Command.Group>
            )}

            {/* Group 1: All System Features & Modules */}
            <Command.Group
              heading="All System Features & Modules"
                className="space-y-1 text-[11px] font-semibold text-[#8b949e]"
            >
              <div className="mt-1.5 space-y-1">
                <Command.Item
                  onSelect={() => handleSelectRoute("/admin")}
                  className="flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold text-slate-300 hover:bg-slate-800/60 aria-selected:bg-slate-800/90 transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-[#B7D1EA]" />
                    <span>Dashboard & Operations Control</span>
                  </div>
                  <CornerDownLeft className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 group-aria-selected:opacity-100 text-[#94A3B8]" />
                </Command.Item>

                <Command.Item
                  onSelect={() => handleSelectRoute("/admin/quotations?tab=leads")}
                  className="flex cursor-pointer items-center justify-between rounded-lg px-3 py-2.5 text-xs font-bold text-slate-300 transition hover:bg-slate-800/60 aria-selected:bg-slate-800/90"
                >
                  <div className="flex items-center gap-2"><Inbox className="h-4 w-4 text-[#B7D1EA]" /><span>Sales Pipeline & Inbound Leads</span></div>
                  <CornerDownLeft className="h-3.5 w-3.5 text-[#94A3B8]" />
                </Command.Item>

                <Command.Item
                  onSelect={() => handleSelectRoute("/admin/quotations?tab=quotations")}
                  className="flex cursor-pointer items-center justify-between rounded-lg px-3 py-2.5 text-xs font-bold text-slate-300 transition hover:bg-slate-800/60 aria-selected:bg-slate-800/90"
                >
                  <div className="flex items-center gap-2"><ClipboardList className="h-4 w-4 text-[#B7D1EA]" /><span>Quotation Manager & Proposals CRM</span></div>
                  <CornerDownLeft className="h-3.5 w-3.5 text-[#94A3B8]" />
                </Command.Item>

                <Command.Item
                  onSelect={() => handleSelectRoute("/admin/projects")}
                  className="flex cursor-pointer items-center justify-between rounded-lg px-3 py-2.5 text-xs font-bold text-slate-300 transition hover:bg-slate-800/60 aria-selected:bg-slate-800/90"
                >
                  <div className="flex items-center gap-2"><FolderKanban className="h-4 w-4 text-[#B7D1EA]" /><span>Field Projects & Site Installations</span></div>
                  <CornerDownLeft className="h-3.5 w-3.5 text-[#94A3B8]" />
                </Command.Item>

                <Command.Item
                  onSelect={() => handleSelectRoute("/admin/job-tickets")}
                  className="flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold text-slate-300 hover:bg-slate-800/60 aria-selected:bg-slate-800/90 transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-[#B7D1EA]" />
                    <span>Job Tickets & Service Dispatch</span>
                  </div>
                  <CornerDownLeft className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 group-aria-selected:opacity-100 text-[#94A3B8]" />
                </Command.Item>

                <Command.Item
                  onSelect={() => handleSelectRoute("/admin/build/config")}
                  className="flex cursor-pointer items-center justify-between rounded-lg px-3 py-2.5 text-xs font-bold text-slate-300 transition hover:bg-slate-800/60 aria-selected:bg-slate-800/90"
                >
                  <div className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4 text-[#B7D1EA]" /><span>Solar Build Configurator Settings</span></div>
                  <CornerDownLeft className="h-3.5 w-3.5 text-[#94A3B8]" />
                </Command.Item>

                <Command.Item
                  onSelect={() => handleSelectRoute("/admin/services")}
                  className="flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold text-slate-300 hover:bg-slate-800/60 aria-selected:bg-slate-800/90 transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#B7D1EA]" />
                    <span>Service Commerce & Hardware Catalog</span>
                  </div>
                  <CornerDownLeft className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 group-aria-selected:opacity-100 text-[#94A3B8]" />
                </Command.Item>

                <Command.Item
                  onSelect={() => handleSelectRoute("/admin/settings/quotation")}
                  className="flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold text-slate-300 hover:bg-slate-800/60 aria-selected:bg-slate-800/90 transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-[#B7D1EA]" />
                    <span>ERPNext Integration & System Settings</span>
                  </div>
                  <CornerDownLeft className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 group-aria-selected:opacity-100 text-[#94A3B8]" />
                </Command.Item>

                <Command.Item
                  onSelect={() => handleSelectRoute("/admin/settings/analytics")}
                  className="flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold text-slate-300 hover:bg-slate-800/60 aria-selected:bg-slate-800/90 transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-[#94A3B8]" />
                    <span>Analytics & Conversion Tracking</span>
                  </div>
                  <CornerDownLeft className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 group-aria-selected:opacity-100 text-[#94A3B8]" />
                </Command.Item>

                <Command.Item
                  onSelect={() => handleSelectRoute("/admin/settings/api-logs")}
                  className="flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold text-slate-300 hover:bg-slate-800/60 aria-selected:bg-slate-800/90 transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-[#94A3B8]" />
                    <span>API Synchronization Logs</span>
                  </div>
                  <CornerDownLeft className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 group-aria-selected:opacity-100 text-[#94A3B8]" />
                </Command.Item>
              </div>
            </Command.Group>

            {/* Fallback Recent Proposals */}
            {query === "" && results.recent.length > 0 && (
              <Command.Group
                heading="Recent Proposals"
                className="space-y-1 text-[11px] font-semibold text-[#8b949e]"
              >
                <div className="mt-1.5 space-y-1">
                  {results.recent.map((prop) => (
                    <Command.Item
                      key={prop.id}
                      onSelect={() => handleSelectRoute(`/admin/crm/${prop.id}`)}
                      className="flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold text-slate-300 hover:bg-slate-800/60 aria-selected:bg-slate-800/90 transition-all cursor-pointer group"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="w-4 h-4 text-[#94A3B8] shrink-0" />
                        <span className="truncate">{prop.userName || prop.userEmail}</span>
                        <span className="font-mono text-[10px] text-slate-400 bg-slate-800 border border-slate-700/60 px-1.5 py-0.5 rounded-md shrink-0">
                          #{prop.id.slice(0, 8).toUpperCase()}
                        </span>
                      </div>
                      <span className="text-[10px] text-[#B7D1EA] bg-[#B7D1EA]/10 border border-[#B7D1EA]/20 px-2 py-0.5 rounded-full font-bold uppercase shrink-0">
                        {prop.status}
                      </span>
                    </Command.Item>
                  ))}
                </div>
              </Command.Group>
            )}
          </Command.List>

          {/* Footer Navigation Hints */}
          <div className="flex shrink-0 items-center justify-between gap-4 border-t border-[#30363d] bg-[#0d1117] px-4 py-3 text-xs font-medium text-[#8b949e]">
            <div className="flex gap-4">
              <span>↑↓ to navigate</span>
              <span>↵ to select</span>
            </div>
            <span>Press Cmd+K or click Back to close</span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
