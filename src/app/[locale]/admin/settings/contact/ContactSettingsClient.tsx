"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { 
  Plus, 
  Trash2, 
  Edit2, 
  Eye, 
  EyeOff, 
  ChevronUp, 
  ChevronDown, 
  Link2,
  Phone, 
  Mail, 
  MessageCircle, 
  Globe,
  Settings
} from "@/components/ui/icons";
import type { IconType } from "@/components/ui/icons";
import { 
  createContactLink, 
  updateContactLink, 
  toggleContactLinkStatus, 
  deleteContactLink 
} from "@/app/actions/contact";
import ConfirmDeleteModal from "@/components/layout/ConfirmDeleteModal";
import { GsapReveal } from "@/components/ui/GsapMotion";
import { AdminBulkActionBar } from "@/components/admin/AdminBulkActionBar";
import { AdminSelectionCheckbox } from "@/components/admin/AdminSelectionCheckbox";
import { useAdminSelection } from "@/hooks/useAdminSelection";

interface ContactLink {
  id: string;
  platform: string;
  value: string;
  label: string | null;
  icon: string | null;
  displayOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PLATFORM_DEFAULTS: Record<string, { icon: string; label: string; placeholder: string }> = {
  LINE: { icon: "MessageCircle", label: "Line Official", placeholder: "e.g. @solartech or https://line.me/R/ti/p/..." },
  EMAIL: { icon: "Mail", label: "Email Address", placeholder: "e.g. sales@solartech.com" },
  PHONE: { icon: "Phone", label: "Phone Number", placeholder: "e.g. +66 2 123 4567" },
  FACEBOOK: { icon: "Globe", label: "Facebook Page", placeholder: "e.g. https://facebook.com/solartech" },
  INSTAGRAM: { icon: "Globe", label: "Instagram Profile", placeholder: "e.g. https://instagram.com/solartech" },
  TWITTER: { icon: "Globe", label: "Twitter / X Profile", placeholder: "e.g. https://x.com/solartech" },
  LINKEDIN: { icon: "Globe", label: "LinkedIn Company", placeholder: "e.g. https://linkedin.com/company/solartech" },
  YOUTUBE: { icon: "Globe", label: "YouTube Channel", placeholder: "e.g. https://youtube.com/@solartech" },
  WEBSITE: { icon: "Link2", label: "Official Website", placeholder: "e.g. https://solartech.com" },
};

const ICON_COMPONENTS: Record<string, IconType> = {
  Phone,
  Mail,
  MessageCircle,
  Globe,
  Link2
};

export default function ContactSettingsClient({ initialLinks }: { initialLinks: ContactLink[] }) {
  const [links, setLinks] = useState<ContactLink[]>(initialLinks);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<ContactLink | null>(null);
  const [isPending, startTransition] = useTransition();

  // Delete modal states
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const selection = useAdminSelection(links.map((link) => link.id));

  // Form states
  const [platform, setPlatform] = useState("LINE");
  const [value, setValue] = useState("");
  const [label, setLabel] = useState("");
  const [icon, setIcon] = useState("MessageCircle");
  const [isActive, setIsActive] = useState(true);

  // Auto-set helper values on platform change
  const handlePlatformChange = (p: string) => {
    setPlatform(p);
    const defaults = PLATFORM_DEFAULTS[p];
    if (defaults) {
      setIcon(defaults.icon);
      setLabel(defaults.label);
    }
  };

  const handleOpenAdd = () => {
    setEditingLink(null);
    setPlatform("LINE");
    setValue("");
    setLabel("Line Official");
    setIcon("MessageCircle");
    setIsActive(true);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (link: ContactLink) => {
    setEditingLink(link);
    setPlatform(link.platform);
    setValue(link.value);
    setLabel(link.label || "");
    setIcon(link.icon || "Globe");
    setIsActive(link.isActive);
    setIsFormOpen(true);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return toast.error("Link value is required");

    startTransition(async () => {
      try {
        const payload = {
          platform,
          value: value.trim(),
          label: label.trim() || undefined,
          icon: icon || undefined,
          isActive
        };

        const res = editingLink
          ? await updateContactLink(editingLink.id, payload)
          : await createContactLink({ ...payload, displayOrder: links.length });

        if (res.success && res.link) {
          toast.success(editingLink ? "Link updated successfully" : "Link created successfully");
          setIsFormOpen(false);
          if (editingLink) {
            setLinks(prev => prev.map(l => l.id === editingLink.id ? res.link as ContactLink : l));
          } else {
            setLinks(prev => [...prev, res.link as ContactLink]);
          }
        } else {
          toast.error(res.error || "Failed to save contact link");
        }
      } catch (error) {
        console.error("Failed to save contact link:", error);
        toast.error("Failed to save contact link");
      }
    });
  };

  const handleToggleActive = (link: ContactLink) => {
    startTransition(async () => {
      try {
        const res = await toggleContactLinkStatus(link.id, !link.isActive);
        if (res.success) {
          toast.success(link.isActive ? "Link set to draft" : "Link set to active");
          setLinks(prev => prev.map(l => l.id === link.id ? { ...l, isActive: !l.isActive } : l));
        } else {
          toast.error(res.error || "Failed to update link status");
        }
      } catch (error) {
        console.error("Failed to update contact link status:", error);
        toast.error("Failed to update link status");
      }
    });
  };

  const handleMove = (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= links.length) return;

    const updated = [...links];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;

    // Update locally first for snappiness
    setLinks(updated);

    // Save changes to db in background
    startTransition(async () => {
      try {
        const first = await updateContactLink(updated[index].id, { displayOrder: index });
        const second = await updateContactLink(updated[targetIndex].id, { displayOrder: targetIndex });
        if (!first.success || !second.success) throw new Error("Order update failed.");
        toast.success("Order updated");
      } catch (error) {
        console.error("Failed to update contact link order:", error);
        setLinks(links);
        toast.error("Failed to update link order");
      }
    });
  };

  const handleDeleteConfirm = () => {
    if (!deleteTargetId) return;
    setIsDeleting(true);
    startTransition(async () => {
      try {
        const res = await deleteContactLink(deleteTargetId);
        if (res.success) {
          toast.success("Link deleted successfully");
          setLinks(prev => prev.filter(l => l.id !== deleteTargetId));
          setDeleteTargetId(null);
        } else {
          toast.error(res.error || "Failed to delete link");
        }
      } catch (error) {
        console.error("Failed to delete contact link:", error);
        toast.error("Failed to delete link");
      } finally {
        setIsDeleting(false);
      }
    });
  };

  const handleBulkDelete = () => {
    if (selection.selectedCount === 0) return;
    if (!window.confirm(`Delete ${selection.selectedCount} selected contact link(s)?`)) return;
    setIsBulkDeleting(true);
    startTransition(async () => {
    const ids = selection.selectedIds;
      try {
        const results = await Promise.allSettled(ids.map((id) => deleteContactLink(id)));
        const failedCount = results.filter((result) =>
          result.status === "rejected" || (result.status === "fulfilled" && !result.value.success),
        ).length;
        const deletedIds = ids.filter((_id, index) => {
          const result = results[index];
          return result?.status === "fulfilled" && result.value.success;
        });
        setLinks((current) => current.filter((link) => !deletedIds.includes(link.id)));
        selection.clear();
        if (failedCount > 0) toast.error(`${failedCount} contact link(s) could not be deleted.`);
        else toast.success(`${deletedIds.length} contact link(s) deleted.`);
      } catch (error) {
        console.error("Failed to delete contact links:", error);
        toast.error("Failed to delete selected contact links.");
      } finally {
        setIsBulkDeleting(false);
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Action Toolbar */}
      <div className="flex justify-between items-center bg-[#0F172A] border border-[#1E293B] rounded-xl p-6 shadow-none">
        <div>
          <h3 className="text-sm font-black uppercase tracking-wider text-gray-100">Dynamic Links Configuration</h3>
          <p className="text-[10px] text-gray-400 font-semibold mt-1">Configure handles, custom labels, and rearrange display order.</p>
        </div>

        <button
          type="button"
          onClick={handleOpenAdd}
          className="px-5 py-3 bg-[#B7D1EA] hover:bg-[#99BFE3] text-white font-black rounded-xl text-[10px] flex items-center justify-center gap-1.5 transition-all shadow-none shadow-[#B7D1EA]/10 cursor-pointer uppercase tracking-widest"
        >
          <Plus className="w-4 h-4" />
          Add Link
        </button>
      </div>

      {/* Add / Edit Form Drawer */}
      {isFormOpen && (
        <GsapReveal
          as="form"
          onSubmit={handleFormSubmit} 
          className="space-y-5 rounded-xl border border-[#1E293B] bg-[#0F172A] p-6 shadow-none"
        >
          <div className="flex items-center justify-between pb-3 border-b border-[#1E293B]">
            <h4 className="text-xs font-black uppercase tracking-widest text-gray-100 flex items-center gap-2">
              <Settings className="w-4.5 h-4.5 text-[#B7D1EA]" />
              {editingLink ? "Edit Contact Link" : "Create Contact Link"}
            </h4>
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="text-gray-500 hover:text-gray-300 text-xs font-bold transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Platform Selection */}
            <div className="space-y-1.5">
              <label className="text-[9px] uppercase tracking-widest text-gray-300 font-black">Platform</label>
              <select
                value={platform}
                onChange={e => handlePlatformChange(e.target.value)}
                className="w-full bg-[#0B1121] border border-[#1E293B] rounded-xl p-3 text-xs text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]/20 focus:border-[#B7D1EA] transition-all font-semibold cursor-pointer"
              >
                {Object.keys(PLATFORM_DEFAULTS).map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            {/* Custom Label */}
            <div className="space-y-1.5">
              <label className="text-[9px] uppercase tracking-widest text-gray-300 font-black">Visual Label (Optional)</label>
              <input
                type="text"
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="e.g. Chat on Line, Call Sales"
                className="w-full bg-[#0B1121] border border-[#1E293B] rounded-xl p-3 text-xs text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]/20 focus:border-[#B7D1EA] transition-all font-semibold"
              />
            </div>

            {/* Icon Picker */}
            <div className="space-y-1.5">
              <label className="text-[9px] uppercase tracking-widest text-gray-300 font-black">Icon Symbol</label>
              <select
                value={icon}
                onChange={e => setIcon(e.target.value)}
                className="w-full bg-[#0B1121] border border-[#1E293B] rounded-xl p-3 text-xs text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]/20 focus:border-[#B7D1EA] transition-all font-semibold cursor-pointer"
              >
                {Object.keys(ICON_COMPONENTS).map(iconName => (
                  <option key={iconName} value={iconName}>{iconName}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Value / Link URL */}
          <div className="space-y-1.5">
            <label className="text-[9px] uppercase tracking-widest text-gray-300 font-black">Link Handle / URL / Value</label>
            <input
              type="text"
              required
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder={PLATFORM_DEFAULTS[platform]?.placeholder || "e.g. Link details"}
              className="w-full bg-[#0B1121] border border-[#1E293B] rounded-xl p-3 text-xs text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#B7D1EA]/20 focus:border-[#B7D1EA] transition-all font-mono font-semibold"
            />
          </div>

          {/* Status Switch */}
          <div className="flex items-center gap-3 pt-2">
            <input
              type="checkbox"
              id="isActive"
              checked={isActive}
              onChange={e => setIsActive(e.target.checked)}
              className="w-4.5 h-4.5 text-[#B7D1EA] rounded border-slate-350 focus:ring-[#B7D1EA] cursor-pointer"
            />
            <label htmlFor="isActive" className="text-xs font-bold text-gray-300 uppercase tracking-wider cursor-pointer select-none">
              Publish Link Immediately (Active Status)
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-[#1E293B]">
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="px-5 py-3 border border-[#1E293B] hover:bg-[#0B1121] text-gray-300 hover:text-gray-100 rounded-xl text-xs font-black transition-all cursor-pointer uppercase tracking-widest"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-5 py-3 bg-[#B7D1EA] hover:bg-[#99BFE3] text-white rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer uppercase tracking-widest disabled:opacity-40 shadow-none shadow-[#B7D1EA]/10"
            >
              {isPending ? "Saving..." : (editingLink ? "Save Changes" : "Add Link")}
            </button>
          </div>
        </GsapReveal>
      )}

      {/* Contact Links Data Table */}
      <AdminBulkActionBar
        selectedCount={selection.selectedCount}
        visibleCount={links.length}
        allVisibleSelected={selection.allVisibleSelected}
        someVisibleSelected={selection.someVisibleSelected}
        onToggleVisible={selection.toggleVisible}
        onClear={selection.clear}
        isPending={isBulkDeleting}
        actions={[{
          id: "delete",
          label: "Delete",
          icon: Trash2,
          tone: "danger",
          onClick: handleBulkDelete,
        }]}
      />
      <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl overflow-hidden shadow-none">
        <div className="overflow-x-auto">
          <table className="min-w-[780px] w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#1E293B] bg-[#0B1121] text-[9px] uppercase tracking-widest text-gray-300 font-black">
                <th className="w-14 py-4 px-6">
                  <AdminSelectionCheckbox
                    checked={selection.allVisibleSelected}
                    indeterminate={selection.someVisibleSelected}
                    disabled={links.length === 0 || isBulkDeleting}
                    label="Select all contact links"
                    onChange={selection.toggleVisible}
                  />
                </th>
                <th className="py-4 px-6 w-16 text-center">Order</th>
                <th className="py-4 px-6">Platform & Label</th>
                <th className="py-4 px-6">Value / Destination</th>
                <th className="py-4 px-6 text-center">Status</th>
                <th className="py-4 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E293B]">
              {links.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-xs text-gray-400 font-semibold space-y-2">
                    <Link2 className="w-8 h-8 text-gray-400 mx-auto" />
                    <div>No contact links defined. Use Add Link to get started.</div>
                  </td>
                </tr>
              ) : (
                links
                  .sort((a, b) => a.displayOrder - b.displayOrder)
                  .map((link, index) => {
                    const IconComp = ICON_COMPONENTS[link.icon || "Globe"] || Globe;
                    return (
                      <tr key={link.id} className="hover:bg-[#0B1121] transition-colors group">
                        <td className="py-4 px-6">
                          <AdminSelectionCheckbox
                            checked={selection.isSelected(link.id)}
                            disabled={isBulkDeleting}
                            label={`Select contact link ${link.platform}`}
                            onChange={() => selection.toggle(link.id)}
                          />
                        </td>
                        {/* displayOrder reordering arrows */}
                        <td className="py-4 px-6 text-center">
                          <div className="flex flex-col items-center justify-center gap-0.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleMove(index, "up");
                              }}
                              disabled={index === 0}
                              className="p-1 hover:bg-[#0B1121] disabled:opacity-30 rounded transition-colors text-gray-400 cursor-pointer"
                            >
                              <ChevronUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleMove(index, "down");
                              }}
                              disabled={index === links.length - 1}
                              className="p-1 hover:bg-[#0B1121] disabled:opacity-30 rounded transition-colors text-gray-400 cursor-pointer"
                            >
                              <ChevronDown className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>

                        {/* Platform & Label */}
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-[#B7D1EA]/10 border border-[#B7D1EA]/20 flex items-center justify-center text-[#B7D1EA] shrink-0">
                              <IconComp className="w-4.5 h-4.5" />
                            </div>
                            <div>
                              <div className="font-bold text-gray-100 text-xs uppercase tracking-wider">{link.platform}</div>
                              <div className="text-[10px] text-gray-400 mt-0.5 font-semibold">{link.label || "No custom label"}</div>
                            </div>
                          </div>
                        </td>

                        {/* Value */}
                        <td className="py-4 px-6">
                          <span className="font-mono text-xs text-gray-300 break-all select-all font-semibold">
                            {link.value}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="py-4 px-6 text-center">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleToggleActive(link);
                            }}
                            className={`mx-auto px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                              link.isActive
                                ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20 hover:bg-emerald-500/15"
                                : "bg-amber-500/10 text-amber-300 border-amber-500/20 hover:bg-amber-500/15"
                            }`}
                            title="Toggle active status"
                          >
                            {link.isActive ? (
                              <>
                                <Eye className="w-3 h-3" />
                                <span>Active</span>
                              </>
                            ) : (
                              <>
                                <EyeOff className="w-3 h-3" />
                                <span>Draft</span>
                              </>
                            )}
                          </button>
                        </td>

                        {/* CRUD Actions */}
                        <td className="py-4 px-6 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleOpenEdit(link);
                              }}
                              className="p-2.5 bg-[#0B1121] border border-[#1E293B] hover:bg-[#0B1121] text-gray-300 hover:text-gray-100 rounded-xl transition-all cursor-pointer"
                              title="Edit Link"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setDeleteTargetId(link.id);
                              }}
                              className="p-2.5 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500 hover:text-white text-rose-500 rounded-xl transition-all cursor-pointer"
                              title="Delete Link"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirmation Modal rendered cleanly outside mapping loops */}
      <ConfirmDeleteModal
        isOpen={deleteTargetId !== null}
        onClose={() => setDeleteTargetId(null)}
        onConfirm={handleDeleteConfirm}
        isDeleting={isDeleting}
        title="Delete Contact Link"
        message="Are you sure you want to permanently delete this contact link? Dynamic updates in footer and navigation drawers will reflect this deletion instantly."
      />
    </div>
  );
}
