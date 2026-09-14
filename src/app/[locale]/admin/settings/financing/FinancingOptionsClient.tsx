"use client";

import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { BadgePercent, PencilLine, Plus, Power, Trash2 } from "@/components/ui/icons";
import ConfirmDeleteModal from "@/components/layout/ConfirmDeleteModal";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { AdminBulkActionBar } from "@/components/admin/AdminBulkActionBar";
import { AdminSelectionCheckbox } from "@/components/admin/AdminSelectionCheckbox";
import { useAdminSelection } from "@/hooks/useAdminSelection";
import {
  createFinancingOption,
  deleteFinancingOption,
  updateFinancingOption,
} from "@/app/actions/financingOptions";
import type { FinanceType, FinancingOptionSource } from "@/lib/financialPlan";

type FinanceTypeOption = {
  value: FinanceType;
  label: string;
  description: string;
};

const FINANCE_TYPE_OPTIONS: FinanceTypeOption[] = [
  {
    value: "CASH",
    label: "Cash Purchase",
    description: "Upfront purchase with no financing term.",
  },
  {
    value: "BANK_LOAN",
    label: "Bank Loan",
    description: "Standard amortized bank financing.",
  },
  {
    value: "PPA",
    label: "PPA",
    description: "Third-party ownership / power purchase agreement.",
  },
  {
    value: "LEASING",
    label: "Leasing",
    description: "Operating lease or rent-to-own promotion.",
  },
];

export interface FinancingOptionRecord extends Omit<FinancingOptionSource, "createdAt"> {
  createdAt: string | Date;
}

interface Props {
  initialFinancingOptions: FinancingOptionRecord[];
}

type FormState = {
  providerName: string;
  financeType: FinanceType;
  interestRate: string;
  maxTermMonths: string;
  minSystemCost: string;
  marketingTag: string;
  eligibilityRulesJson: string;
  isActive: boolean;
};

const emptyForm: FormState = {
  providerName: "",
  financeType: "BANK_LOAN",
  interestRate: "",
  maxTermMonths: "",
  minSystemCost: "",
  marketingTag: "",
  eligibilityRulesJson: "{\n  \"propertyTypes\": [\"home\", \"factory\"]\n}",
  isActive: true,
};

function formatMoney(value: number | null) {
  if (value === null || Number.isNaN(value)) return "—";
  return `THB ${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value)}`;
}

function formatNumberInput(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  return String(value);
}

export default function FinancingOptionsClient({ initialFinancingOptions }: Props) {
  const [financingOptions, setFinancingOptions] = useState(initialFinancingOptions);
  const [formOpen, setFormOpen] = useState(false);
  const [editingOption, setEditingOption] = useState<FinancingOptionRecord | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<FinancingOptionRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const selection = useAdminSelection(financingOptions.map((option) => option.id));

  const activeCount = useMemo(
    () => financingOptions.filter((option) => option.isActive).length,
    [financingOptions],
  );

  const openCreate = () => {
    setEditingOption(null);
    setForm(emptyForm);
    setFormOpen(true);
  };

  const openEdit = (option: FinancingOptionRecord) => {
    setEditingOption(option);
    setForm({
      providerName: option.providerName,
      financeType: option.financeType,
      interestRate: option.interestRate ?? "",
      maxTermMonths: option.maxTermMonths !== null ? String(option.maxTermMonths) : "",
      minSystemCost: option.minSystemCost ?? "",
      marketingTag: option.marketingTag ?? "",
      eligibilityRulesJson: JSON.stringify(option.eligibilityRules ?? {}, null, 2),
      isActive: option.isActive,
    });
    setFormOpen(true);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const providerName = form.providerName.trim();
    if (!providerName) {
      toast.error("Provider name is required.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        providerName,
        financeType: form.financeType,
        interestRate: form.interestRate === "" ? null : Number(form.interestRate),
        maxTermMonths: form.maxTermMonths === "" ? null : Number(form.maxTermMonths),
        minSystemCost: form.minSystemCost === "" ? null : Number(form.minSystemCost),
        marketingTag: form.marketingTag.trim() || null,
        eligibilityRules: form.eligibilityRulesJson,
        isActive: form.isActive,
      };

      const result = editingOption
        ? await updateFinancingOption(editingOption.id, payload)
        : await createFinancingOption(payload);

      if (!result.success) {
        toast.error(result.error || "Failed to save financing option.");
        return;
      }

      if (editingOption && "financingOption" in result && result.financingOption) {
        setFinancingOptions((current) =>
          current.map((option) =>
            option.id === editingOption.id
              ? { ...option, ...result.financingOption, createdAt: option.createdAt }
              : option,
          ),
        );
        toast.success("Financing option updated.");
      } else if (!editingOption && "financingOption" in result && result.financingOption) {
        setFinancingOptions((current) => [
          result.financingOption as FinancingOptionRecord,
          ...current,
        ]);
        toast.success("Financing option created.");
      }

      setFormOpen(false);
      setEditingOption(null);
      setForm(emptyForm);
    } catch (error) {
      console.error(error);
      toast.error("Failed to save financing option.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    try {
      const result = await deleteFinancingOption(deleteTarget.id);
      if (!result.success) {
        toast.error(result.error || "Failed to delete financing option.");
        return;
      }

      setFinancingOptions((current) =>
        current.filter((option) => option.id !== deleteTarget.id),
      );
      toast.success("Financing option deleted.");
      setDeleteTarget(null);
    } catch (error) {
      console.error(error);
      toast.error("Failed to delete financing option.");
    } finally {
      setDeleting(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selection.selectedCount === 0) return;
    if (!window.confirm(`Delete ${selection.selectedCount} selected financing option(s)?`)) return;

    setBulkDeleting(true);
    try {
      const ids = selection.selectedIds.slice(0, 100);
      const settled = await Promise.allSettled(ids.map((id) => deleteFinancingOption(id)));
      const succeededIds = ids.filter((id, index) => {
        const result = settled[index];
        return result?.status === "fulfilled" && result.value.success;
      });
      const failedCount = ids.length - succeededIds.length;
      if (succeededIds.length > 0) {
        setFinancingOptions((current) => current.filter((option) => !succeededIds.includes(option.id)));
        selection.remove(succeededIds);
        toast.success(`${succeededIds.length} financing option(s) deleted.`);
      }
      if (failedCount > 0) {
        toast.error(`${failedCount} financing option(s) could not be deleted.`);
      }
    } catch (error) {
      console.error("Bulk financing option delete error:", error);
      toast.error("Failed to delete selected financing options.");
    } finally {
      setBulkDeleting(false);
    }
  };

  return (
    <>
      <section className="space-y-6 rounded-2xl border border-[#1E293B] bg-[#0F172A] p-6 shadow-none">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-gray-400">
              Financing Plan Config
            </p>
            <h2 className="mt-2 text-2xl font-black text-gray-100">
              Your Financial Plan catalog
            </h2>
            <p className="mt-2 text-sm font-medium leading-6 text-gray-400">
              Configure each bank, promotion, or zero-upfront program that appears in the wizard summary.
            </p>
          </div>

          <div className="inline-flex items-center gap-2 rounded-2xl border border-[#B7D1EA]/40 bg-[#B7D1EA]/15 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-gray-300">
            <BadgePercent className="h-4 w-4 text-[#B7D1EA]" />
            <span>
              {activeCount} active / {financingOptions.length} total
            </span>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-2xl bg-[#B7D1EA] px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white transition hover:bg-[#99BFE3]"
          >
            <Plus className="h-4 w-4" />
            Add Financing Option
          </button>
        </div>

        <AdminBulkActionBar
          selectedCount={selection.selectedCount}
          visibleCount={financingOptions.length}
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
                    disabled={financingOptions.length === 0 || bulkDeleting}
                    label="Select all financing options"
                    onChange={selection.toggleVisible}
                  />
                </th>
                <th className="px-4 py-3">Provider</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Rate</th>
                <th className="px-4 py-3">Term</th>
                <th className="px-4 py-3">Min System</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-[#0F172A]">
              {financingOptions.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-12 text-center text-xs font-bold uppercase tracking-widest text-gray-500"
                  >
                    No financing options configured yet.
                  </td>
                </tr>
              ) : (
                financingOptions.map((option) => (
                  <tr key={option.id} className="transition-colors hover:bg-[#0B1121]/70">
                    <td className="px-4 py-4">
                      <AdminSelectionCheckbox
                        checked={selection.isSelected(option.id)}
                        disabled={bulkDeleting}
                        label={`Select financing option ${option.providerName}`}
                        onChange={() => selection.toggle(option.id)}
                      />
                    </td>
                    <td className="px-4 py-4">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-100">
                          {option.providerName}
                        </p>
                        <p className="mt-1 text-[11px] text-gray-500">
                          {option.marketingTag || "No marketing tag"}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="inline-flex rounded-full bg-[#B7D1EA]/25 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-[#2c4e6e]">
                        {option.financeType}
                      </span>
                    </td>
                    <td className="px-4 py-4 font-mono text-xs font-semibold text-gray-400">
                      {option.interestRate ?? "—"}%
                    </td>
                    <td className="px-4 py-4 font-mono text-xs font-semibold text-gray-400">
                      {option.maxTermMonths ? `${option.maxTermMonths} months` : "—"}
                    </td>
                    <td className="px-4 py-4 font-mono text-xs font-semibold text-gray-400">
                      {formatMoney(
                        typeof option.minSystemCost === "string"
                          ? Number(option.minSystemCost)
                          : option.minSystemCost,
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${
                          option.isActive ? "bg-emerald-500/10 text-emerald-900" : "bg-[#0B1121] text-gray-300"
                        }`}
                      >
                        <Power className="mr-1 h-3 w-3" />
                        {option.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(option)}
                          className="inline-flex items-center gap-2 rounded-xl border border-[#1E293B] bg-[#0F172A] px-3 py-2 text-[10px] font-black uppercase tracking-wider text-gray-400 transition hover:border-[#B7D1EA] hover:text-[#B7D1EA]"
                        >
                          <PencilLine className="h-4 w-4" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(option)}
                          className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-rose-600 transition hover:bg-rose-100"
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Dialog
        isOpen={formOpen}
        onClose={() => {
          if (submitting) return;
          setFormOpen(false);
          setEditingOption(null);
          setForm(emptyForm);
        }}
        size="md"
      >
        <DialogContent className="bg-[#0F172A]">
          <form className="space-y-4" onSubmit={handleSubmit}>
            <DialogHeader>
              <div className="space-y-1">
                <h3 className="text-lg font-black text-gray-100">
                  {editingOption ? "Edit Financing Option" : "Add Financing Option"}
                </h3>
                <p className="text-sm text-gray-400">
                  Manage provider, rate, term, and promotion rules shown in the summary flow.
                </p>
              </div>
            </DialogHeader>
            <DialogBody>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-xs font-black uppercase tracking-wider text-gray-400">Provider Name</span>
                  <input
                    value={form.providerName}
                    onChange={(event) => setForm((current) => ({ ...current, providerName: event.target.value }))}
                    className="w-full rounded-xl border border-[#1E293B] bg-[#0F172A] px-3 py-2.5 text-sm outline-none focus:border-[#B7D1EA] focus:ring-2 focus:ring-[#B7D1EA]/20"
                    placeholder="SCB Solar Loan"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-black uppercase tracking-wider text-gray-400">Finance Type</span>
                  <select
                    value={form.financeType}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        financeType: event.target.value as FinanceType,
                      }))
                    }
                    className="w-full rounded-xl border border-[#1E293B] bg-[#0F172A] px-3 py-2.5 text-sm outline-none focus:border-[#B7D1EA] focus:ring-2 focus:ring-[#B7D1EA]/20"
                  >
                    {FINANCE_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-black uppercase tracking-wider text-gray-400">Interest Rate (%)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={formatNumberInput(form.interestRate)}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, interestRate: event.target.value }))
                    }
                    className="w-full rounded-xl border border-[#1E293B] bg-[#0F172A] px-3 py-2.5 text-sm outline-none focus:border-[#B7D1EA] focus:ring-2 focus:ring-[#B7D1EA]/20"
                    placeholder="3.25"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-black uppercase tracking-wider text-gray-400">Max Term (Months)</span>
                  <input
                    type="number"
                    step="1"
                    value={formatNumberInput(form.maxTermMonths)}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, maxTermMonths: event.target.value }))
                    }
                    className="w-full rounded-xl border border-[#1E293B] bg-[#0F172A] px-3 py-2.5 text-sm outline-none focus:border-[#B7D1EA] focus:ring-2 focus:ring-[#B7D1EA]/20"
                    placeholder="120"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-black uppercase tracking-wider text-gray-400">Minimum System Cost</span>
                  <input
                    type="number"
                    step="1"
                    value={formatNumberInput(form.minSystemCost)}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, minSystemCost: event.target.value }))
                    }
                    className="w-full rounded-xl border border-[#1E293B] bg-[#0F172A] px-3 py-2.5 text-sm outline-none focus:border-[#B7D1EA] focus:ring-2 focus:ring-[#B7D1EA]/20"
                    placeholder="200000"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-black uppercase tracking-wider text-gray-400">Marketing Tag</span>
                  <input
                    value={form.marketingTag}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, marketingTag: event.target.value }))
                    }
                    className="w-full rounded-xl border border-[#1E293B] bg-[#0F172A] px-3 py-2.5 text-sm outline-none focus:border-[#B7D1EA] focus:ring-2 focus:ring-[#B7D1EA]/20"
                    placeholder="0% down this month"
                  />
                </label>

                <label className="flex items-center gap-3 rounded-xl border border-[#1E293B] bg-[#0F172A] px-4 py-3">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, isActive: event.target.checked }))
                    }
                    className="h-4 w-4 rounded border-[#1E293B] text-[#B7D1EA] focus:ring-[#B7D1EA]"
                  />
                  <span className="text-sm font-semibold text-gray-300">Active</span>
                  </label>
              </div>

              <label className="space-y-2 block">
                <span className="text-xs font-black uppercase tracking-wider text-gray-400">
                  Eligibility Rules JSON
                </span>
                <textarea
                  value={form.eligibilityRulesJson}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      eligibilityRulesJson: event.target.value,
                    }))
                  }
                  rows={7}
                  className="w-full rounded-2xl border border-[#1E293B] bg-[#0F172A] px-3 py-3 text-sm font-mono outline-none focus:border-[#B7D1EA] focus:ring-2 focus:ring-[#B7D1EA]/20"
                  placeholder='{"propertyTypes":["home","factory"]}'
                />
              </label>
            </DialogBody>
            <DialogFooter>
              <div className="flex w-full items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (submitting) return;
                    setFormOpen(false);
                    setEditingOption(null);
                    setForm(emptyForm);
                  }}
                  className="rounded-xl border border-[#1E293B] bg-[#0F172A] px-4 py-2.5 text-xs font-black uppercase tracking-wider text-gray-400 transition hover:bg-[#0B1121]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-[#B7D1EA] px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white transition hover:bg-[#99BFE3] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={submitting}
                >
                  {submitting ? "Saving..." : "Save Financing Option"}
                </button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteModal
        isOpen={Boolean(deleteTarget)}
        title="Delete Financing Option"
        message={`Are you sure you want to delete ${deleteTarget?.providerName || "this financing option"}? This action cannot be undone.`}
        onClose={() => {
          if (deleting) return;
          setDeleteTarget(null);
        }}
        onConfirm={handleDelete}
        isDeleting={deleting}
      />
    </>
  );
}
