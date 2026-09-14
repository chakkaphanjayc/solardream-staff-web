"use client";

import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Plus, PencilLine, Trash2, BadgeInfo, Power } from "@/components/ui/icons";
import ConfirmDeleteModal from "@/components/layout/ConfirmDeleteModal";
import {
  createServiceFeeConfig,
  deleteServiceFeeConfig,
  updateServiceFeeConfig,
} from "@/app/actions/serviceFees";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { AdminBulkActionBar } from "@/components/admin/AdminBulkActionBar";
import { AdminSelectionCheckbox } from "@/components/admin/AdminSelectionCheckbox";
import { useAdminSelection } from "@/hooks/useAdminSelection";
import { useTranslations } from "next-intl";

export interface ServiceFeeConfigRecord {
  id: string;
  name: string;
  erpItemCode: string;
  basePrice: number;
  isActive: boolean;
  createdAt: string | Date;
}

interface ServiceFeesClientProps {
  initialServiceFees: ServiceFeeConfigRecord[];
}

type FormState = {
  name: string;
  erpItemCode: string;
  basePrice: string;
  isActive: boolean;
};

const emptyForm: FormState = {
  name: "",
  erpItemCode: "",
  basePrice: "0",
  isActive: true,
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export default function ServiceFeesClient({ initialServiceFees }: ServiceFeesClientProps) {
  const t = useTranslations("AdminServiceFees");
  const [serviceFees, setServiceFees] = useState(initialServiceFees);
  const [formOpen, setFormOpen] = useState(false);
  const [editingFee, setEditingFee] = useState<ServiceFeeConfigRecord | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ServiceFeeConfigRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const selection = useAdminSelection(serviceFees.map((fee) => fee.id));

  const activeCount = useMemo(() => serviceFees.filter((fee) => fee.isActive).length, [serviceFees]);

  const openCreate = () => {
    setEditingFee(null);
    setForm(emptyForm);
    setFormOpen(true);
  };

  const openEdit = (fee: ServiceFeeConfigRecord) => {
    setEditingFee(fee);
    setForm({
      name: fee.name,
      erpItemCode: fee.erpItemCode,
      basePrice: String(fee.basePrice),
      isActive: fee.isActive,
    });
    setFormOpen(true);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = form.name.trim();
    const erpItemCode = form.erpItemCode.trim();
    const basePrice = Number(form.basePrice);

    if (!name || !erpItemCode) {
      toast.error("Name and ERPNext Item Code are required.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name,
        erpItemCode,
        basePrice: Number.isFinite(basePrice) ? basePrice : 0,
        isActive: form.isActive,
      };

      const result = editingFee
        ? await updateServiceFeeConfig(editingFee.id, payload)
        : await createServiceFeeConfig(payload);

      if (!result.success) {
        toast.error(result.error || "Failed to save service fee.");
        return;
      }

      if (editingFee && "serviceFee" in result && result.serviceFee) {
        setServiceFees((current) =>
          current.map((fee) =>
            fee.id === editingFee.id
              ? { ...fee, ...result.serviceFee, createdAt: fee.createdAt }
              : fee
          )
        );
        toast.success("Service fee updated.");
      } else if (!editingFee && "serviceFee" in result && result.serviceFee) {
        setServiceFees((current) => [result.serviceFee as ServiceFeeConfigRecord, ...current]);
        toast.success("Service fee created.");
      }

      setFormOpen(false);
      setEditingFee(null);
      setForm(emptyForm);
    } catch (error) {
      console.error(error);
      toast.error("Failed to save service fee.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const result = await deleteServiceFeeConfig(deleteTarget.id);
      if (!result.success) {
        toast.error(result.error || "Failed to delete service fee.");
        return;
      }

      setServiceFees((current) => current.filter((fee) => fee.id !== deleteTarget.id));
      toast.success("Service fee deleted.");
      setDeleteTarget(null);
    } catch (error) {
      console.error(error);
      toast.error("Failed to delete service fee.");
    } finally {
      setDeleting(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selection.selectedCount === 0) return;
    if (!window.confirm(`Delete ${selection.selectedCount} selected service fee(s)?`)) return;

    setBulkDeleting(true);
    try {
      const ids = selection.selectedIds.slice(0, 100);
      const settled = await Promise.allSettled(ids.map((id) => deleteServiceFeeConfig(id)));
      const succeededIds = ids.filter((id, index) => {
        const result = settled[index];
        return result?.status === "fulfilled" && result.value.success;
      });
      const failedCount = ids.length - succeededIds.length;
      if (succeededIds.length > 0) {
        setServiceFees((current) => current.filter((fee) => !succeededIds.includes(fee.id)));
        selection.remove(succeededIds);
        toast.success(`${succeededIds.length} service fee(s) deleted.`);
      }
      if (failedCount > 0) {
        toast.error(`${failedCount} service fee(s) could not be deleted.`);
      }
    } catch (error) {
      console.error("Bulk service fee delete error:", error);
      toast.error("Failed to delete selected service fees.");
    } finally {
      setBulkDeleting(false);
    }
  };

  return (
    <>
      <section className="space-y-6 rounded-2xl border border-[#1E293B] bg-[#0F172A] p-6 shadow-none">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-gray-400">Service Fees & Add-ons</p>
            <h2 className="mt-2 text-2xl font-black text-gray-100">Quotation fee catalog</h2>
            <p className="mt-2 text-sm font-medium leading-6 text-gray-400">
              Maintain installation, delivery, documentation, and other add-on charges used by the CRM quotation builder.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-2xl border border-[#B7D1EA]/40 bg-[#B7D1EA]/15 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-gray-300">
            <BadgeInfo className="h-4 w-4 text-[#B7D1EA]" />
            <span>{activeCount} active / {serviceFees.length} total</span>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-2xl bg-[#B7D1EA] px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white transition hover:bg-[#99BFE3]"
          >
            <Plus className="h-4 w-4" />
            Add Service Fee
          </button>
        </div>

        <AdminBulkActionBar
          selectedCount={selection.selectedCount}
          visibleCount={serviceFees.length}
          allVisibleSelected={selection.allVisibleSelected}
          someVisibleSelected={selection.someVisibleSelected}
          onToggleVisible={selection.toggleVisible}
          onClear={selection.clear}
          isPending={bulkDeleting}
          actions={[{
            id: "delete",
            label: "Delete",
            icon: Trash2,
            tone: "danger",
            onClick: () => void handleBulkDelete(),
          }]}
        />
        <div className="overflow-hidden rounded-xl border border-[#1E293B]/70">
          <table className="min-w-full divide-y divide-slate-200/70 text-left">
            <thead className="bg-[#0B1121]">
              <tr className="text-[10px] font-black uppercase tracking-[0.28em] text-gray-500">
                <th className="w-14 px-4 py-3">
                  <AdminSelectionCheckbox
                    checked={selection.allVisibleSelected}
                    indeterminate={selection.someVisibleSelected}
                    disabled={serviceFees.length === 0 || bulkDeleting}
                    label="Select all service fees"
                    onChange={selection.toggleVisible}
                  />
                </th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">ERPNext Item Code</th>
                <th className="px-4 py-3 text-right">Default Price</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-[#0F172A]">
              {serviceFees.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-xs font-bold uppercase tracking-widest text-gray-500">
                    No service fees configured yet.
                  </td>
                </tr>
              ) : serviceFees.map((fee) => (
                <tr key={fee.id} className="transition-colors hover:bg-[#0B1121]/70">
                  <td className="px-4 py-4">
                    <AdminSelectionCheckbox
                      checked={selection.isSelected(fee.id)}
                      disabled={bulkDeleting}
                      label={`Select service fee ${fee.name}`}
                      onChange={() => selection.toggle(fee.id)}
                    />
                  </td>
                  <td className="px-4 py-4">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-100">{fee.name}</p>
                      <p className="mt-1 text-[11px] text-gray-500">
                        Created {new Date(fee.createdAt).toLocaleDateString("th-TH")}
                      </p>
                    </div>
                  </td>
                  <td className="px-4 py-4 font-mono text-xs font-semibold text-gray-400">{fee.erpItemCode}</td>
                  <td className="px-4 py-4 text-right font-mono text-sm font-semibold text-gray-100">{formatMoney(fee.basePrice)}</td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${
                      fee.isActive ? "bg-emerald-500/10" : "bg-[#0B1121]"
                    } ${
                      fee.isActive ? "text-emerald-900" : "text-gray-300"
                    }`}>
                      <Power className="mr-1 h-3 w-3" />
                      {fee.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(fee)}
                        className="inline-flex items-center gap-2 rounded-xl border border-[#1E293B] bg-[#0F172A] px-3 py-2 text-[10px] font-black uppercase tracking-wider text-gray-400 transition hover:border-[#B7D1EA] hover:text-[#B7D1EA]"
                      >
                        <PencilLine className="h-4 w-4" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(fee)}
                        className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-rose-600 transition hover:bg-rose-100"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Dialog
        isOpen={formOpen}
        onClose={() => {
          if (submitting) return;
          setFormOpen(false);
          setEditingFee(null);
          setForm(emptyForm);
        }}
        size="sm"
      >
        <DialogContent className="bg-[#0F172A]">
          <DialogHeader className="border-b border-[#1E293B]/50 pb-4">
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#B7D1EA]">
                {editingFee ? "Edit Service Fee" : "Create Service Fee"}
              </p>
              <h2 className="text-xl font-black tracking-tight text-gray-100">
                {editingFee ? "Update add-on pricing" : "Add a new service or fee"}
              </h2>
            </div>
          </DialogHeader>

          <form onSubmit={handleSubmit}>
            <DialogBody className="space-y-4 py-6">
              <label className="block space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Name</span>
                <input
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  className="w-full rounded-2xl border border-[#1E293B] bg-[#0B1121] px-4 py-3 text-sm font-medium text-gray-100 outline-none focus:border-[#B7D1EA] focus:ring-4 focus:ring-[#B7D1EA]/10"
                  placeholder={t("form.namePlaceholder")}
                />
              </label>

              <label className="block space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-400">ERPNext Item Code</span>
                <input
                  value={form.erpItemCode}
                  onChange={(event) => setForm((current) => ({ ...current, erpItemCode: event.target.value }))}
                  className="w-full rounded-2xl border border-[#1E293B] bg-[#0B1121] px-4 py-3 text-sm font-medium text-gray-100 outline-none focus:border-[#B7D1EA] focus:ring-4 focus:ring-[#B7D1EA]/10"
                  placeholder="INSTALLATION_FEE"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Default Price</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.basePrice}
                  onChange={(event) => setForm((current) => ({ ...current, basePrice: event.target.value }))}
                  className="w-full rounded-2xl border border-[#1E293B] bg-[#0B1121] px-4 py-3 text-sm font-medium text-gray-100 outline-none focus:border-[#B7D1EA] focus:ring-4 focus:ring-[#B7D1EA]/10"
                />
              </label>

              <label className="flex items-center gap-3 rounded-2xl border border-[#1E293B] bg-[#0B1121] px-4 py-3">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
                  className="h-4 w-4 rounded border-[#1E293B] text-[#B7D1EA] focus:ring-[#B7D1EA]"
                />
                <span className="text-sm font-semibold text-gray-300">Active</span>
              </label>
            </DialogBody>

            <DialogFooter className="border-t border-[#1E293B]/50 bg-[#0F172A]">
              <button
                type="button"
                onClick={() => {
                  if (submitting) return;
                  setFormOpen(false);
                  setEditingFee(null);
                  setForm(emptyForm);
                }}
                className="rounded-2xl border border-[#1E293B] bg-[#0F172A] px-4 py-2.5 text-xs font-black uppercase tracking-wider text-gray-400 transition hover:text-gray-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-2xl bg-[#B7D1EA] px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white transition hover:bg-[#99BFE3] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Plus className="h-4 w-4" />
                {submitting ? "Saving..." : "Save Service Fee"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteModal
        isOpen={deleteTarget !== null}
        onClose={() => {
          if (deleting) return;
          setDeleteTarget(null);
        }}
        onConfirm={() => void handleDelete()}
        title="Delete Service Fee"
        message={`Are you sure you want to delete ${deleteTarget?.name || "this service fee"}? This action cannot be undone.`}
        isDeleting={deleting}
      />
    </>
  );
}
