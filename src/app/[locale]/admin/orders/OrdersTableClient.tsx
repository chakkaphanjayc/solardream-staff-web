"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Copy, Eye, FileText, Trash2, ExternalLink, Link2, Building2 } from "@/components/ui/icons";
import { toast } from "sonner";

import { AdminBulkActionBar } from "@/components/admin/AdminBulkActionBar";
import { AdminSelectionCheckbox } from "@/components/admin/AdminSelectionCheckbox";
import { useAdminSelection } from "@/hooks/useAdminSelection";
import { formatPrice } from "@/lib/utils";
import { deleteProposalAndLinkedRecords } from "@/app/actions/proposals";

export type AdminOrderProposal = {
  id: string;
  user: {
    name: string | null;
    email: string;
  };
  systemSizeKwp: number;
  panelCount: number;
  totalPrice: number;
  monthlySavings: number;
  status: string;
  createdAt: Date | string;
  pdfUrl: string | null;
  signedDocumentDriveUrl: string | null;
  configurationData: unknown;
  wizardLeadId?: string | null;
  erpnextQuotationId?: string | null;
  erpnextCustomerId?: string | null;
};

type UploadedVersion = {
  url: string;
  version: string | number;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getUploadedVersions(value: unknown): UploadedVersion[] {
  const versions = asRecord(value).uploadedVersions;
  if (!Array.isArray(versions)) return [];

  return versions.filter((item): item is UploadedVersion => {
    const record = asRecord(item);
    return (
      typeof record.url === "string" &&
      (typeof record.version === "string" || typeof record.version === "number")
    );
  });
}

function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

export default function OrdersTableClient({
  locale,
  proposals: initialProposals,
  isAdmin = false,
}: {
  locale: string;
  proposals: AdminOrderProposal[];
  isAdmin?: boolean;
}) {
  const [proposals, setProposals] = useState<AdminOrderProposal[]>(initialProposals);
  const [isPending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const selection = useAdminSelection(proposals.map((proposal) => proposal.id));

  const handleCopySelected = async () => {
    const selected = proposals.filter((proposal) => selection.selectedIds.includes(proposal.id));
    if (selected.length === 0) return;
    await navigator.clipboard.writeText(
      selected
        .map((proposal) => `${proposal.user.name || "Unnamed User"}\t${proposal.id}\t${proposal.status}`)
        .join("\n"),
    );
    toast.success(`Copied ${selected.length} selected proposal${selected.length === 1 ? "" : "s"}.`);
  };

  const handleDeleteProposal = async (proposalId: string) => {
    if (!isAdmin) {
      toast.error("Administrator permission required to delete records.");
      return;
    }
    if (
      !window.confirm(
        `Are you sure you want to permanently delete proposal #${proposalId.slice(0, 8)}? All linked milestones and workflows will be removed. Audit history is retained.`
      )
    ) {
      return;
    }

    setDeletingId(proposalId);
    startTransition(async () => {
      try {
        const result = await deleteProposalAndLinkedRecords(proposalId);
        if (!result.success) {
          toast.error(result.error || "Failed to delete proposal.");
          return;
        }
        setProposals((current) => current.filter((p) => p.id !== proposalId));
        selection.remove([proposalId]);
        toast.success(`Proposal #${proposalId.slice(0, 8)} and linked records deleted.`);
      } catch (err) {
        console.error("Delete error:", err);
        toast.error("Failed to delete proposal.");
      } finally {
        setDeletingId(null);
      }
    });
  };

  const handleBulkDelete = async () => {
    if (!isAdmin) {
      toast.error("Administrator permission required to delete records.");
      return;
    }
    if (selection.selectedCount === 0) return;

    if (
      !window.confirm(
        `Are you sure you want to permanently delete ${selection.selectedCount} selected proposal(s)? All linked records and workflows will be cleaned up. Audit history is retained.`
      )
    ) {
      return;
    }

    startTransition(async () => {
      try {
        let deletedCount = 0;
        for (const id of selection.selectedIds) {
          const result = await deleteProposalAndLinkedRecords(id);
          if (result.success) {
            deletedCount++;
          }
        }
        setProposals((current) => current.filter((p) => !selection.selectedIds.includes(p.id)));
        selection.clear();
        toast.success(`Successfully deleted ${deletedCount} proposal(s) and linked records.`);
      } catch (err) {
        console.error("Bulk delete error:", err);
        toast.error("Error occurred during bulk deletion.");
      }
    });
  };

  const bulkActions = [
    { id: "copy", label: "Copy selected", icon: Copy, onClick: handleCopySelected },
    ...(isAdmin
      ? [
          {
            id: "delete",
            label: "Delete selected",
            icon: Trash2,
            onClick: handleBulkDelete,
          },
        ]
      : []),
  ];

  return (
    <div className="overflow-hidden rounded-[2rem] border border-[#1E293B] bg-[#0F172A] shadow-none">
      <AdminBulkActionBar
        selectedCount={selection.selectedCount}
        visibleCount={proposals.length}
        allVisibleSelected={selection.allVisibleSelected}
        someVisibleSelected={selection.someVisibleSelected}
        onToggleVisible={selection.toggleVisible}
        onClear={selection.clear}
        actions={bulkActions}
      />
      <div className="overflow-x-auto">
        <table className="min-w-[1000px] w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-[#1E293B] bg-[#0B1121] text-[9px] font-black uppercase tracking-widest text-gray-300">
              <th className="px-6 py-4">
                <AdminSelectionCheckbox
                  checked={selection.allVisibleSelected}
                  indeterminate={selection.someVisibleSelected}
                  onChange={selection.toggleVisible}
                  label="Select all proposals"
                />
              </th>
              <th className="px-6 py-4">Customer</th>
              <th className="px-6 py-4">Linked Lead & Quotation</th>
              <th className="px-6 py-4">System Details</th>
              <th className="px-6 py-4">Total Value</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Date</th>
              <th className="px-6 py-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {proposals.map((proposal) => {
              const configuration = asRecord(proposal.configurationData);
              const driveFolderId =
                typeof configuration.driveFolderId === "string"
                  ? configuration.driveFolderId
                  : null;
              const uploadedVersions = getUploadedVersions(proposal.configurationData);

              // Determine linked lead ID
              const linkedLeadId =
                proposal.wizardLeadId ||
                (typeof configuration.sourceLeadId === "string"
                  ? configuration.sourceLeadId
                  : null) ||
                (typeof configuration.inboundRequestId === "string"
                  ? configuration.inboundRequestId
                  : null) ||
                (typeof configuration.leadId === "string" ? configuration.leadId : null);

              const erpnextQuotId =
                proposal.erpnextQuotationId ||
                (typeof configuration.erpnextQuotationId === "string"
                  ? configuration.erpnextQuotationId
                  : null);

              return (
                <tr key={proposal.id} className="group transition-colors hover:bg-[#0B1121]">
                  <td className="px-6 py-4">
                    <AdminSelectionCheckbox
                      checked={selection.isSelected(proposal.id)}
                      onChange={() => selection.toggle(proposal.id)}
                      label={`Select proposal for ${proposal.user.name || proposal.user.email}`}
                    />
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#1E293B] bg-[#0B1121] text-xs font-black uppercase text-[#B7D1EA]">
                        {proposal.user.name?.charAt(0) || proposal.user.email.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-gray-100">{proposal.user.name || "Unnamed User"}</p>
                        <p className="font-mono text-[10px] font-bold uppercase text-gray-400">{proposal.user.email}</p>
                      </div>
                    </div>
                  </td>

                  {/* Linked Lead & Quotation Column */}
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1.5">
                      {linkedLeadId ? (
                        <Link
                          href={`/${locale}/admin/quotations?view=leads&lead=${encodeURIComponent(linkedLeadId)}`}
                          className="inline-flex max-w-max items-center gap-1 rounded-md border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[10px] font-mono font-bold text-purple-300 hover:border-purple-400 hover:text-white transition-colors"
                          title="Open Linked Lead in Pipeline"
                        >
                          <Link2 className="h-3 w-3 text-purple-400 shrink-0" />
                          <span>Lead #{linkedLeadId.slice(0, 8)}</span>
                          <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                        </Link>
                      ) : (
                        <span className="text-[10px] text-gray-500 italic">Direct Order</span>
                      )}

                      <div className="flex flex-wrap items-center gap-1">
                        <Link
                          href={`/${locale}/admin/crm/${proposal.id}`}
                          className="inline-flex max-w-max items-center gap-1 rounded-md border border-[#58a6ff]/30 bg-[#58a6ff]/10 px-2 py-0.5 text-[10px] font-mono font-bold text-[#58a6ff] hover:border-[#58a6ff] hover:text-white transition-colors"
                          title="Open Quotation Workbench"
                        >
                          <span>Quotation #{proposal.id.slice(0, 8)}</span>
                          <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                        </Link>

                        {erpnextQuotId && (
                          <span className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-mono text-emerald-400">
                            <Building2 className="h-2.5 w-2.5" />
                            {erpnextQuotId}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>

                  <td className="px-6 py-4">
                    <div className="space-y-0.5">
                      <p className="text-sm font-black text-gray-100">{proposal.systemSizeKwp.toFixed(2)} kWp</p>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{proposal.panelCount} Panels</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="space-y-0.5">
                      <p className="font-mono text-sm font-black text-[#D8A87B]">{formatPrice(proposal.totalPrice)}</p>
                      <p className="text-[10px] font-bold uppercase text-emerald-600">Saves ~{formatPrice(proposal.monthlySavings)}/mo</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`rounded-lg border px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${
                      proposal.status === "ACCEPTED"
                        ? "border-emerald-500/10 bg-emerald-500/5 text-emerald-600"
                        : proposal.status === "SENT"
                          ? "border-blue-500/10 bg-blue-500/5 text-blue-600"
                          : proposal.status === "SIGNED_WAITING_VERIFY"
                            ? "border-amber-500/10 bg-amber-500/5 text-amber-600"
                            : proposal.status === "CONFIRMED"
                              ? "border-indigo-500/10 bg-indigo-500/5 text-indigo-600"
                              : "border-slate-500/10 bg-slate-500/5 text-gray-400"
                    }`}>
                      {proposal.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-mono text-xs font-bold text-gray-400">{formatDate(proposal.createdAt)}</td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-1.5">
                        <Link
                          href={`/${locale}/admin/orders/${proposal.id}`}
                          className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-900 bg-slate-900 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:border-[#B7D1EA] hover:bg-[#B7D1EA]"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View Details
                        </Link>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => handleDeleteProposal(proposal.id)}
                            disabled={isPending && deletingId === proposal.id}
                            className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-rose-400 hover:bg-rose-500/20 hover:text-rose-300 transition-colors disabled:opacity-50"
                            title="Delete Proposal & Linked Records (Admin Only)"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>

                      {proposal.pdfUrl ? (
                        <a
                          href={proposal.pdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex max-w-max cursor-pointer items-center gap-1.5 rounded-xl border border-[#B7D1EA]/20 bg-[#B7D1EA]/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-[#B7D1EA] transition-all hover:bg-[#B7D1EA] hover:text-white"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          View PDF
                        </a>
                      ) : (
                        <span className="text-[10px] italic font-semibold text-gray-500">No PDF File</span>
                      )}

                      {proposal.signedDocumentDriveUrl ? (
                        <div className="flex flex-col gap-1 border-t border-[#1E293B] pt-1.5">
                          {driveFolderId ? (
                            <a
                              href={`https://drive.google.com/drive/folders/${driveFolderId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-[9px] font-bold text-gray-400 hover:text-[#B7D1EA] hover:underline"
                            >
                              <span>📂 Google Drive Folder</span>
                            </a>
                          ) : null}
                          <a
                            href={proposal.signedDocumentDriveUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] font-black text-indigo-400 hover:text-indigo-300 hover:underline"
                          >
                            <span>✍️ Signed File (v{uploadedVersions.at(-1)?.version || 1})</span>
                          </a>
                        </div>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
            {proposals.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-20 text-center font-semibold italic text-gray-400">
                  No proposals have been generated yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
