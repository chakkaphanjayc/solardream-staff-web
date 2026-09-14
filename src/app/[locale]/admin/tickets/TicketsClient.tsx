"use client";

import { useState } from "react";
import { generateJobTicketFromProposal } from "@/app/actions/tickets";
import { toast } from "sonner";
import { 
  FileText, 
  User, 
  Phone, 
  MapPin, 
  ExternalLink, 
  Wrench, 
  CheckCircle, 
  Map, 
  Calendar 
} from "@/components/ui/icons";
import { useLocale, useTranslations } from "next-intl";
import { GsapSpinner } from "@/components/ui/GsapMotion";
import { AdminBulkActionBar } from "@/components/admin/AdminBulkActionBar";
import { AdminSelectionCheckbox } from "@/components/admin/AdminSelectionCheckbox";
import { useAdminSelection } from "@/hooks/useAdminSelection";

interface PendingProposal {
  id: string;
  userId: string;
  systemSizeKwp: number;
  panelCount: number;
  totalPrice: number;
  monthlySavings: number;
  paybackPeriod: string;
  pdfUrl: string | null;
  status: string;
  signedDocumentDriveUrl: string | null;
  configurationData: any;
  createdAt: string;
  updatedAt: string;
  user: {
    name: string | null;
    email: string;
  };
}

interface JobTicket {
  id: string;
  proposalId: string;
  customerPhone: string | null;
  customerAddress: string | null;
  coordinates: any | null;
  signedDocumentDriveUrl: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  proposal: {
    systemSizeKwp: number;
    totalPrice: number;
    configurationData: any;
    user: {
      name: string | null;
      email: string;
    };
  };
}

interface TicketsClientProps {
  initialPendingProposals: PendingProposal[];
  initialJobTickets: JobTicket[];
}

export default function TicketsClient({
  initialPendingProposals,
  initialJobTickets,
}: TicketsClientProps) {
  const t = useTranslations("AdminTickets");
  const locale = useLocale();
  const dateLocale = locale === "en" ? "en-US" : "th-TH";
  const currencyFormatter = new Intl.NumberFormat(dateLocale, {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  });
  const [pendingProposals, setPendingProposals] = useState<PendingProposal[]>(initialPendingProposals);
  const [jobTickets, setJobTickets] = useState<JobTicket[]>(initialJobTickets);
  const [processingMap, setProcessingMap] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<"pending" | "tickets">("pending");
  const pendingSelection = useAdminSelection(pendingProposals.map((proposal) => proposal.id));

  const handleGenerateTicket = async (proposalId: string) => {
    setProcessingMap((prev) => ({ ...prev, [proposalId]: true }));
    try {
      const res = await generateJobTicketFromProposal(proposalId);
      if (res.success && res.ticket) {
        toast.success(t("toast.jobTicketCreated"));
        
        // Remove from pending proposals
        setPendingProposals((prev) => prev.filter((p) => p.id !== proposalId));
        
        // Add or update to job tickets
        const newTicket: JobTicket = {
          ...(res.ticket as any),
          proposal: initialPendingProposals.find((p) => p.id === proposalId) as any
        };
        setJobTickets((prev) => [newTicket, ...prev]);
      } else {
        toast.error(res.error || t("toast.createJobTicketFailed"));
      }
    } catch (error: unknown) {
      console.error(error);
      toast.error(t("toast.serverError"));
    } finally {
      setProcessingMap((prev) => ({ ...prev, [proposalId]: false }));
    }
  };

  const handleBulkGenerateTickets = () => {
    const selectedIds = Array.from(pendingSelection.selectedIds);
    if (selectedIds.length === 0) return;
    pendingSelection.clear();
    for (const proposalId of selectedIds) {
      void handleGenerateTicket(proposalId);
    }
    toast.success(`${selectedIds.length} site survey ticket${selectedIds.length === 1 ? "" : "s"} queued.`);
  };

  return (
    <div className="space-y-6">
      {/* Navigation Tab Selector */}
      <div className="flex border-b border-[#1E293B]">
        <button
          onClick={() => setActiveTab("pending")}
          className={`py-4 px-6 text-xs font-black uppercase tracking-widest border-b-2 transition-all cursor-pointer ${
            activeTab === "pending"
              ? "border-[#B7D1EA] text-[#B7D1EA]"
              : "border-transparent text-slate-550 hover:text-gray-100"
          }`}
        >
          {t("tabs.pending", { count: pendingProposals.length })}
        </button>
        <button
          onClick={() => setActiveTab("tickets")}
          className={`py-4 px-6 text-xs font-black uppercase tracking-widest border-b-2 transition-all cursor-pointer ${
            activeTab === "tickets"
              ? "border-[#B7D1EA] text-[#B7D1EA]"
              : "border-transparent text-slate-550 hover:text-gray-100"
          }`}
        >
          Operational Job Tickets ({jobTickets.length})
        </button>
      </div>

      {activeTab === "pending" ? (
        <div className="space-y-4">
          <AdminBulkActionBar
            selectedCount={pendingSelection.selectedCount}
            visibleCount={pendingProposals.length}
            allVisibleSelected={pendingSelection.allVisibleSelected}
            someVisibleSelected={pendingSelection.someVisibleSelected}
            onToggleVisible={pendingSelection.toggleVisible}
            onClear={pendingSelection.clear}
            isPending={Object.values(processingMap).some(Boolean)}
            actions={[
              { id: "generate", label: "Create tickets", icon: Wrench, tone: "success", onClick: handleBulkGenerateTickets },
            ]}
          />
          {pendingProposals.length === 0 ? (
            <div className="bg-[#0F172A] border border-[#1E293B] rounded-[2rem] p-12 text-center shadow-none">
              <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
              <h3 className="text-base font-black text-gray-100 uppercase tracking-wider">
                {t("empty.pendingTitle")}
              </h3>
              <p className="text-xs text-gray-400 font-semibold mt-1">
                {t("empty.pendingDescription")}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6">
              {pendingProposals.map((proposal) => {
                const configData = proposal.configurationData || {};
                const phone = configData.phone || "N/A";
                const location = configData.location || "N/A";
                const lat = configData.latitude;
                const lng = configData.longitude;
                const hasCoords = lat !== undefined && lng !== undefined && lat !== null && lng !== null;
                const isProcessing = processingMap[proposal.id] || false;

                return (
                  <div 
                    key={proposal.id}
                    className="bg-[#0F172A] border border-[#1E293B] rounded-[2rem] p-6 md:p-8 shadow-none hover:shadow-none transition-all duration-300 grid grid-cols-1 lg:grid-cols-12 gap-6"
                  >
                    {/* Customer & Proposal Info */}
                    <div className="lg:col-span-8 space-y-4">
                      <div className="flex flex-wrap items-center gap-3">
                        <AdminSelectionCheckbox
                          checked={pendingSelection.isSelected(proposal.id)}
                          onChange={() => pendingSelection.toggle(proposal.id)}
                          label={`Select proposal ${proposal.id.substring(0, 8)}`}
                        />
                        <span className="bg-[#B7D1EA]/10 text-[#B7D1EA] text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-xl">
                          {t("proposal.code", { id: proposal.id.substring(0, 8).toUpperCase() })}
                        </span>
                        <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                          {t("proposal.updatedAt", { date: new Date(proposal.updatedAt).toLocaleString(dateLocale) })}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Column 1 */}
                        <div className="space-y-2 text-xs text-slate-650">
                          <div className="flex items-center gap-2 font-bold text-gray-100">
                            <User className="w-4 h-4 text-gray-500" />
                            <span>{proposal.user.name || "Customer Name"}</span>
                          </div>
                          <div className="pl-6 font-semibold">
                            {proposal.user.email}
                          </div>
                          <div className="flex items-center gap-2 font-semibold">
                            <Phone className="w-4 h-4 text-gray-500" />
                            <span>{t("proposal.phone", { phone })}</span>
                          </div>
                        </div>

                        {/* Column 2 */}
                        <div className="space-y-2 text-xs text-slate-650">
                          <div className="flex items-start gap-2 font-semibold">
                            <MapPin className="w-4 h-4 text-gray-500 shrink-0 mt-0.5" />
                            <div className="line-clamp-2" title={location}>
                              {t("proposal.installationAddress", { location })}
                            </div>
                          </div>
                          {hasCoords && (
                            <div className="flex items-center gap-2 pl-6 font-semibold text-[#B7D1EA] hover:underline">
                              <Map className="w-3.5 h-3.5" />
                              <a 
                                href={`https://www.google.com/maps?q=${lat},${lng}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1"
                              >
                                Coords: {lat.toFixed(6)}, {lng.toFixed(6)}
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Hardware details summary */}
                      <div className="bg-[#0B1121] rounded-2xl p-4 border border-slate-150 flex justify-between items-center text-xs">
                        <div>
                          <p className="font-black text-gray-100 uppercase text-[9px] tracking-wider text-gray-500">
                            System Configuration
                          </p>
                          <p className="font-bold text-gray-300 mt-1">
                            {t("proposal.systemSize", { kwp: proposal.systemSizeKwp.toFixed(2), count: proposal.panelCount })}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-black text-gray-100 uppercase text-[9px] tracking-wider text-gray-500">
                            Proposal Price
                          </p>
                          <p className="font-black text-[#D8A87B] font-mono mt-1">
                            {currencyFormatter.format(proposal.totalPrice)}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Quick Action Button Box */}
                    <div className="lg:col-span-4 flex flex-col justify-center items-stretch lg:items-end gap-3 border-t lg:border-t-0 lg:border-l border-[#1E293B] pt-6 lg:pt-0 lg:pl-6">
                      {/* View Folder Link */}
                      {configData.driveFolderId && (
                        <a
                          href={`https://drive.google.com/drive/folders/${configData.driveFolderId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-5 py-2.5 border border-[#1E293B] hover:bg-[#0B1121] text-slate-650 hover:text-slate-850 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all text-center w-full"
                          title={t("actions.openDriveFolderTitle")}
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-[#B7D1EA]" />
                          {t("actions.openDriveFolder")}
                        </a>
                      )}

                      {/* View Signed Drive Link */}
                      {proposal.signedDocumentDriveUrl && (
                        <div className="flex flex-col items-stretch gap-1 w-full">
                          <a
                            href={proposal.signedDocumentDriveUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-5 py-3 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-750 hover:text-indigo-800 rounded-2xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all text-center"
                          >
                            <FileText className="w-4 h-4 text-indigo-500" />
                            {t("actions.openLatestFile")}
                            <span className="ml-1 bg-indigo-200 text-indigo-800 text-[9px] font-bold px-1.5 py-0.5 rounded-md">
                              v{configData.uploadedVersions?.length || 1}
                            </span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                          
                          {/* Previous versions lists */}
                          {configData.uploadedVersions && configData.uploadedVersions.length > 1 && (
                            <div className="text-[10px] text-gray-500 font-semibold px-2 pt-1 text-left bg-[#0B1121]/70 rounded-xl p-2 border border-[#1E293B]">
                              <span className="block text-[8px] uppercase tracking-wider text-gray-500 font-black mb-1">{t("labels.submissionHistory")}</span>
                              <div className="space-y-1">
                                {configData.uploadedVersions.slice(0, -1).map((v: any, idx: number) => (
                                  <a
                                    key={idx}
                                    href={v.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="hover:underline flex items-center gap-1 text-slate-550 hover:text-[#B7D1EA] text-[10px]"
                                  >
                                    <span>• v{v.version} ({new Date(v.uploadedAt || proposal.updatedAt).toLocaleDateString(dateLocale)})</span>
                                    <ExternalLink className="w-2.5 h-2.5" />
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Generate Job Ticket Button */}
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => handleGenerateTicket(proposal.id)}
                        className="px-5 py-3.5 bg-[#B7D1EA] hover:bg-[#99BFE3] text-white font-black rounded-2xl text-xs flex items-center justify-center gap-2 transition-all shadow-none shadow-[#B7D1EA]/10 cursor-pointer uppercase tracking-widest disabled:opacity-50"
                      >
                        {isProcessing ? (
                          <>
                            <GsapSpinner className="h-4 w-4" />
                            <span>{t("actions.saving")}</span>
                          </>
                        ) : (
                          <>
                            <Wrench className="w-4 h-4" />
                            <span>{t("actions.openSiteSurveyTicket")}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {jobTickets.length === 0 ? (
            <div className="bg-[#0F172A] border border-[#1E293B] rounded-[2rem] p-12 text-center shadow-none">
              <Wrench className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-base font-black text-gray-100 uppercase tracking-wider">
                {t("empty.ticketsTitle")}
              </h3>
              <p className="text-xs text-slate-550 font-semibold mt-1">
                {t("empty.ticketsDescription")}
              </p>
            </div>
          ) : (
            <div className="bg-[#0F172A] border border-[#1E293B] rounded-[2.5rem] overflow-hidden shadow-none">
              <div className="overflow-x-auto">
                <table className="min-w-[900px] w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#1E293B] bg-[#0B1121] text-[9px] uppercase tracking-widest text-gray-300 font-black">
                      <th className="py-5 px-6">Ticket ID</th>
                      <th className="py-5 px-6">Customer</th>
                      <th className="py-5 px-6">Phone</th>
                      <th className="py-5 px-6">Address & Coordinates</th>
                      <th className="py-5 px-6 text-center">Ticket Status</th>
                      <th className="py-5 px-6 text-right">Signed File</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {jobTickets.map((ticket) => {
                      const lat = ticket.coordinates?.lat;
                      const lng = ticket.coordinates?.lng;
                      const hasCoords = lat !== undefined && lng !== undefined && lat !== null && lng !== null;

                      return (
                        <tr key={ticket.id} className="hover:bg-[#0B1121]/70 transition-colors">
                          <td className="py-5 px-6 font-mono font-bold text-xs text-gray-100">
                            {ticket.id.substring(0, 8).toUpperCase()}...
                          </td>
                          <td className="py-5 px-6">
                            <div className="font-bold text-gray-100 text-xs uppercase">
                              {ticket.proposal.user.name || "Customer"}
                            </div>
                            <div className="text-[10px] text-gray-500 font-semibold">
                              {ticket.proposal.user.email}
                            </div>
                          </td>
                          <td className="py-5 px-6 text-xs font-semibold text-slate-650">
                            {ticket.customerPhone || "N/A"}
                          </td>
                          <td className="py-5 px-6 max-w-xs">
                            <div className="text-xs text-gray-400 line-clamp-1 font-semibold" title={ticket.customerAddress || ""}>
                              {ticket.customerAddress || "N/A"}
                            </div>
                            {hasCoords && (
                              <div className="text-[10px] font-bold text-[#B7D1EA] hover:underline mt-0.5">
                                <a
                                  href={`https://www.google.com/maps?q=${lat},${lng}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-0.5"
                                >
                                  Map Link: {lat.toFixed(5)}, {lng.toFixed(5)}
                                  <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                              </div>
                            )}
                          </td>
                          <td className="py-5 px-6 text-center">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-orange-500/10 text-orange-600 border border-orange-500/20">
                              <Calendar className="w-3 h-3" />
                              {ticket.status}
                            </span>
                          </td>
                          <td className="py-5 px-6 text-right">
                            <div className="flex flex-col items-stretch sm:items-end gap-1.5">
                              {ticket.signedDocumentDriveUrl ? (
                                <div className="flex flex-col items-end gap-1">
                                  <a
                                    href={ticket.signedDocumentDriveUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-3 py-1.5 bg-indigo-50 border border-indigo-200 hover:bg-[#B7D1EA] hover:text-white hover:border-transparent text-indigo-650 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1 inline-flex transition-all"
                                  >
                                    <span>{t("actions.openLatestFile")}</span>
                                    <span className="bg-indigo-200 text-indigo-800 text-[8px] font-bold px-1 py-0.5 rounded-md ml-1">
                                      v{ticket.proposal?.configurationData?.uploadedVersions?.length || 1}
                                    </span>
                                    <ExternalLink className="w-2.5 h-2.5" />
                                  </a>
                                  {/* Previous Versions list */}
                                  {ticket.proposal?.configurationData?.uploadedVersions && ticket.proposal.configurationData.uploadedVersions.length > 1 && (
                                    <div className="text-[9px] text-gray-500 font-semibold text-right mt-1">
                                      <span className="block text-[7px] uppercase tracking-wider font-black text-gray-500">{t("labels.history")}</span>
                                      <div className="flex flex-col gap-0.5 mt-0.5 items-end">
                                        {ticket.proposal.configurationData.uploadedVersions.slice(0, -1).map((v: any, idx: number) => (
                                          <a
                                            key={idx}
                                            href={v.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="hover:underline flex items-center gap-0.5 text-gray-400 hover:text-[#B7D1EA]"
                                          >
                                            <span>v{v.version}</span>
                                            <ExternalLink className="w-1.5 h-1.5" />
                                          </a>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">No File</span>
                              )}
                              
                              {ticket.proposal?.configurationData?.driveFolderId && (
                                <a
                                  href={`https://drive.google.com/drive/folders/${ticket.proposal.configurationData.driveFolderId}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[9px] font-bold text-gray-500 hover:text-[#B7D1EA] flex items-center gap-0.5 justify-end hover:underline"
                                >
                                  <span>{t("actions.driveFolder")}</span>
                                  <ExternalLink className="w-2 h-2" />
                                </a>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
