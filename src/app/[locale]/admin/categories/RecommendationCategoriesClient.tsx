"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { gsap } from "gsap";
import { Check, Edit3, Plus, Trash2, X } from "@/components/ui/icons";
import { toast } from "sonner";
import {
  createRecommendationCategory,
  deleteRecommendationCategory,
  deleteRecommendationCategories,
  updateRecommendationCategory,
} from "@/app/actions/recommendationCategories";
import { cn } from "@/lib/utils";
import { GsapSpinner } from "@/components/ui/GsapMotion";
import { AdminBulkActionBar } from "@/components/admin/AdminBulkActionBar";
import { AdminSelectionCheckbox } from "@/components/admin/AdminSelectionCheckbox";
import { useAdminSelection } from "@/hooks/useAdminSelection";

type ComponentType = "PANEL" | "INVERTER" | "ADD_ON" | "STRUCTURE";

type RecommendationCategoryRecord = {
  id: string;
  nameTh: string;
  nameEn: string;
  componentType: ComponentType;
  applicableSizes: string[];
  descriptionTh: string;
  descriptionEn: string;
  isDefault: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type FormState = {
  nameTh: string;
  nameEn: string;
  descriptionTh: string;
  descriptionEn: string;
  componentType: ComponentType;
  applicableSizes: string[];
  isDefault: boolean;
};

const SYSTEM_SIZES = ["3kW", "5kW", "10kW", "15kW+"];

const COMPONENT_TYPE_LABELS: Record<ComponentType, string> = {
  PANEL: "Panel",
  INVERTER: "Inverter",
  ADD_ON: "Add-on",
  STRUCTURE: "Structure",
};

const EMPTY_FORM: FormState = {
  nameTh: "",
  nameEn: "",
  descriptionTh: "",
  descriptionEn: "",
  componentType: "PANEL",
  applicableSizes: ["3kW", "5kW"],
  isDefault: false,
};

interface RecommendationCategoriesClientProps {
  initialCategories: RecommendationCategoryRecord[];
  initialError?: string;
}

export default function RecommendationCategoriesClient({
  initialCategories,
  initialError = "",
}: RecommendationCategoriesClientProps) {
  const [categories, setCategories] = useState(initialCategories);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<RecommendationCategoryRecord | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const selection = useAdminSelection(categories.map((category) => category.id));

  const groupedCounts = useMemo(() => {
    return categories.reduce<Record<ComponentType, number>>(
      (acc, category) => {
        acc[category.componentType] += 1;
        return acc;
      },
      { PANEL: 0, INVERTER: 0, ADD_ON: 0, STRUCTURE: 0 },
    );
  }, [categories]);

  const openCreateModal = () => {
    setEditingCategory(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEditModal = (category: RecommendationCategoryRecord) => {
    setEditingCategory(category);
    setForm({
      nameTh: category.nameTh,
      nameEn: category.nameEn,
      descriptionTh: category.descriptionTh,
      descriptionEn: category.descriptionEn,
      componentType: category.componentType,
      applicableSizes: category.applicableSizes,
      isDefault: category.isDefault,
    });
    setModalOpen(true);
  };

  const updateForm = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const toggleSize = (size: string) => {
    setForm((current) => {
      const hasSize = current.applicableSizes.includes(size);
      return {
        ...current,
        applicableSizes: hasSize
          ? current.applicableSizes.filter((item) => item !== size)
          : [...current.applicableSizes, size],
      };
    });
  };

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    try {
      const result = editingCategory
        ? await updateRecommendationCategory(editingCategory.id, form)
        : await createRecommendationCategory(form);

      if (!result.success || !result.recommendationCategory) {
        toast.error(result.error || "ไม่สามารถบันทึกหมวดหมู่ได้");
        return;
      }

      setCategories((current) =>
        editingCategory
          ? current.map((category) =>
              category.id === editingCategory.id
                ? result.recommendationCategory
                : category,
            )
          : [result.recommendationCategory, ...current],
      );
      toast.success(editingCategory ? "อัปเดตหมวดหมู่แล้ว" : "เพิ่มหมวดหมู่ใหม่แล้ว");
      setModalOpen(false);
      setEditingCategory(null);
      setForm(EMPTY_FORM);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการบันทึก");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (category: RecommendationCategoryRecord) => {
    if (!confirm(`ลบ "${category.nameTh}"?`)) return;

    setDeletingId(category.id);
    try {
      const result = await deleteRecommendationCategory(category.id);
      if (!result.success) {
        toast.error(result.error || "ไม่สามารถลบหมวดหมู่ได้");
        return;
      }
      setCategories((current) => current.filter((item) => item.id !== category.id));
      selection.remove([category.id]);
      toast.success("ลบหมวดหมู่แล้ว");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการลบ");
    } finally {
      setDeletingId(null);
    }
  };

  const handleBulkDelete = async () => {
    const ids = selection.selectedIds;
    if (ids.length === 0) return;
    if (!confirm(`ลบหมวดหมู่ที่เลือก ${ids.length} รายการหรือไม่?`)) return;

    setBusy(true);
    try {
      const result = await deleteRecommendationCategories(ids);
      if (!result.success) {
        toast.error(result.error || "ไม่สามารถลบหมวดหมู่ได้");
        return;
      }
      setCategories((current) => current.filter((category) => !ids.includes(category.id)));
      selection.clear();
      toast.success(`ลบหมวดหมู่แล้ว ${result.count ?? ids.length} รายการ`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการลบ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh bg-[#0F172A] px-4 py-8 text-gray-100 md:px-8">
      <div className="mx-auto max-w-7xl space-y-7">
        <header className="flex flex-col gap-5 rounded-[2rem] bg-[#0F172A] p-6 md:flex-row md:items-center md:justify-between md:p-8">
          <div>
            <h1 className="text-2xl font-black tracking-[-0.02em] text-gray-100 md:text-4xl">
              จัดการหมวดหมู่สินค้าแนะนำ
            </h1>
            <p className="mt-2 max-w-2xl text-sm font-medium leading-7 text-gray-400">
              Manage Recommendation Categories for generic wizard and builder outputs.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#0369a1] px-5 py-2.5 text-sm font-black text-white transition-transform hover:scale-105"
          >
            <Plus className="h-4 w-4" />
            เพิ่มหมวดหมู่ใหม่
          </button>
        </header>

        {initialError ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-500/10 px-4 py-3 text-sm font-bold text-rose-700">
            {initialError}
          </div>
        ) : null}

        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {(Object.keys(groupedCounts) as ComponentType[]).map((type) => (
            <div key={type} className="rounded-2xl bg-[#0F172A] p-4">
              <p className="text-xs font-black text-gray-400">{COMPONENT_TYPE_LABELS[type]}</p>
              <p className="mt-2 text-3xl font-black text-gray-100">{groupedCounts[type]}</p>
            </div>
          ))}
        </section>

        <section className="overflow-hidden rounded-[2rem] bg-[#0F172A]">
          <AdminBulkActionBar
            selectedCount={selection.selectedCount}
            visibleCount={categories.length}
            allVisibleSelected={selection.allVisibleSelected}
            someVisibleSelected={selection.someVisibleSelected}
            onToggleVisible={selection.toggleVisible}
            onClear={selection.clear}
            isPending={busy}
            actions={[
              { id: "delete", label: "Delete selected", icon: Trash2, tone: "danger", onClick: handleBulkDelete },
            ]}
          />
          <div className="hidden grid-cols-[32px_1.4fr_0.75fr_1fr_0.7fr_0.6fr] gap-4 border-b border-[#1E293B] px-6 py-4 text-xs font-black text-gray-400 lg:grid">
            <AdminSelectionCheckbox
              checked={selection.allVisibleSelected}
              indeterminate={selection.someVisibleSelected}
              onChange={selection.toggleVisible}
              label="Select all recommendation categories"
            />
            <span>หมวดหมู่ (Name)</span>
            <span>ประเภทอุปกรณ์</span>
            <span>ขนาดระบบที่รองรับ</span>
            <span>สถานะเริ่มต้น</span>
            <span className="text-right">Actions</span>
          </div>

          <div className="divide-y divide-slate-100">
            {categories.length > 0 ? (
              categories.map((category) => (
                <article
                  key={category.id}
                  className="grid gap-4 px-5 py-5 lg:grid-cols-[32px_1.4fr_0.75fr_1fr_0.7fr_0.6fr] lg:items-center lg:px-6"
                >
                  <AdminSelectionCheckbox
                    checked={selection.isSelected(category.id)}
                    onChange={() => selection.toggle(category.id)}
                    label={`Select ${category.nameEn}`}
                  />
                  <div>
                    <p className="text-sm font-black text-gray-100">{category.nameTh}</p>
                    <p className="mt-1 text-sm font-semibold text-gray-400">{category.nameEn}</p>
                    <p className="mt-2 line-clamp-2 text-xs font-medium leading-5 text-gray-400 lg:hidden">
                      {category.descriptionTh}
                    </p>
                  </div>

                  <div>
                    <span className="inline-flex rounded-full bg-[#B7D1EA]/25 px-3 py-1 text-xs font-black text-[#075985]">
                      {COMPONENT_TYPE_LABELS[category.componentType]}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {category.applicableSizes.length > 0 ? (
                      category.applicableSizes.map((size) => (
                        <span
                          key={size}
                          className="rounded-full bg-[#0F172A] px-3 py-1 text-xs font-bold text-gray-300"
                        >
                          {size}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs font-semibold text-gray-500">All sizes</span>
                    )}
                  </div>

                  <div>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black",
                        category.isDefault
                          ? "bg-emerald-500/10 text-emerald-700"
                          : "bg-[#0B1121] text-gray-400",
                      )}
                    >
                      {category.isDefault ? <Check className="h-3.5 w-3.5" /> : null}
                      {category.isDefault ? "Default" : "Optional"}
                    </span>
                  </div>

                  <div className="flex justify-start gap-2 lg:justify-end">
                    <button
                      type="button"
                      onClick={() => openEditModal(category)}
                      className="inline-flex items-center gap-2 rounded-full bg-[#0B1121] px-3 py-2 text-xs font-black text-gray-300 transition hover:bg-[#B7D1EA]/30"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(category)}
                      disabled={deletingId === category.id}
                      className="inline-flex items-center gap-2 rounded-full bg-rose-500/10/60 px-3 py-2 text-xs font-black text-rose-500 transition hover:bg-rose-100 hover:text-rose-700 disabled:opacity-60"
                    >
	                      {deletingId === category.id ? (
	                        <GsapSpinner className="h-3.5 w-3.5" />
	                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      Delete
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <div className="px-6 py-20 text-center">
                <p className="text-sm font-bold text-gray-400">ยังไม่มีหมวดหมู่สินค้าแนะนำ</p>
              </div>
            )}
          </div>
        </section>
      </div>

      {modalOpen ? (
          <RecommendationCategoryModal
            form={form}
            editing={Boolean(editingCategory)}
            busy={busy}
            onClose={() => {
              if (!busy) setModalOpen(false);
            }}
            onSubmit={handleSave}
            onUpdate={updateForm}
            onToggleSize={toggleSize}
          />
        ) : null}
    </div>
  );
}

function RecommendationCategoryModal({
  form,
  editing,
  busy,
  onClose,
  onSubmit,
  onUpdate,
  onToggleSize,
}: {
  form: FormState;
  editing: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onUpdate: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  onToggleSize: (size: string) => void;
}) {
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    const backdrop = backdropRef.current;
    const formElement = formRef.current;
    if (!backdrop || !formElement) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      gsap.set([backdrop, formElement], { autoAlpha: 1, scale: 1, y: 0 });
      return;
    }

    const context = gsap.context(() => {
      gsap.fromTo(backdrop, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.18, ease: "power2.out" });
      gsap.fromTo(
        formElement,
        { autoAlpha: 0, scale: 0.96, y: 12 },
        { autoAlpha: 1, scale: 1, y: 0, duration: 0.22, ease: "power3.out" },
      );
    }, backdrop);

    return () => context.revert();
  }, []);

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <form
        ref={formRef}
        onSubmit={onSubmit}
        onMouseDown={(event) => event.stopPropagation()}
        className="max-h-[90dvh] w-full max-w-3xl overflow-y-auto rounded-[2rem] bg-[#0F172A] p-5 shadow-none md:p-8"
      >
        <div className="mb-7 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black text-gray-100">
              {editing ? "แก้ไขหมวดหมู่" : "เพิ่มหมวดหมู่ใหม่"}
            </h2>
            <p className="mt-1 text-sm font-medium text-gray-400">
              Configure generic recommendation categories for builder and wizard outputs.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-full bg-[#0F172A] p-2 text-gray-400 transition hover:text-gray-100 disabled:opacity-60"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField label="Name (TH)">
            <input
              value={form.nameTh}
              onChange={(event) => onUpdate("nameTh", event.target.value)}
              required
              className="w-full rounded-2xl border border-transparent bg-[#0F172A] px-4 py-3 text-sm font-semibold text-gray-100 outline-none transition focus:bg-[#0F172A] focus:ring-2 focus:ring-[#B7D1EA]"
            />
          </FormField>
          <FormField label="Name (EN)">
            <input
              value={form.nameEn}
              onChange={(event) => onUpdate("nameEn", event.target.value)}
              required
              className="w-full rounded-2xl border border-transparent bg-[#0F172A] px-4 py-3 text-sm font-semibold text-gray-100 outline-none transition focus:bg-[#0F172A] focus:ring-2 focus:ring-[#B7D1EA]"
            />
          </FormField>
          <FormField label="Description (TH)">
            <textarea
              value={form.descriptionTh}
              onChange={(event) => onUpdate("descriptionTh", event.target.value)}
              required
              rows={4}
              className="w-full resize-none rounded-2xl border border-transparent bg-[#0F172A] px-4 py-3 text-sm font-semibold leading-7 text-gray-100 outline-none transition focus:bg-[#0F172A] focus:ring-2 focus:ring-[#B7D1EA]"
            />
          </FormField>
          <FormField label="Description (EN)">
            <textarea
              value={form.descriptionEn}
              onChange={(event) => onUpdate("descriptionEn", event.target.value)}
              required
              rows={4}
              className="w-full resize-none rounded-2xl border border-transparent bg-[#0F172A] px-4 py-3 text-sm font-semibold leading-7 text-gray-100 outline-none transition focus:bg-[#0F172A] focus:ring-2 focus:ring-[#B7D1EA]"
            />
          </FormField>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
          <FormField label="Component Type">
            <select
              value={form.componentType}
              onChange={(event) => onUpdate("componentType", event.target.value as ComponentType)}
              className="w-full rounded-2xl border border-transparent bg-[#0F172A] px-4 py-3 text-sm font-black text-gray-100 outline-none transition focus:bg-[#0F172A] focus:ring-2 focus:ring-[#B7D1EA]"
            >
              {(Object.keys(COMPONENT_TYPE_LABELS) as ComponentType[]).map((type) => (
                <option key={type} value={type}>
                  {COMPONENT_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </FormField>

          <div className="rounded-2xl bg-[#0F172A] p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-black text-gray-100">เป็นตัวเลือกเริ่มต้น</p>
                <p className="mt-1 text-xs font-semibold text-gray-400">Pre-selected Option</p>
              </div>
              <button
                type="button"
                onClick={() => onUpdate("isDefault", !form.isDefault)}
                className={cn(
                  "relative h-7 w-12 rounded-full transition",
                  form.isDefault ? "bg-[#0369a1]" : "bg-slate-300",
                )}
                aria-pressed={form.isDefault}
              >
                <span
                  className={cn(
                    "absolute top-1 h-5 w-5 rounded-full bg-[#0F172A] transition",
                    form.isDefault ? "left-6" : "left-1",
                  )}
                />
              </button>
            </div>
          </div>
        </div>

        <div className="mt-5">
          <p className="mb-3 text-xs font-black text-gray-300">Applicable System Sizes</p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {SYSTEM_SIZES.map((size) => {
              const active = form.applicableSizes.includes(size);
              return (
                <button
                  key={size}
                  type="button"
                  onClick={() => onToggleSize(size)}
                  className={cn(
                    "rounded-2xl border px-4 py-3 text-sm font-black transition",
                    active
                      ? "border-[#B7D1EA] bg-[#B7D1EA]/25 text-[#075985]"
                      : "border-transparent bg-[#0F172A] text-gray-400 hover:border-[#B7D1EA]",
                  )}
                >
                  {size}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-full bg-[#0F172A] px-5 py-3 text-sm font-black text-gray-300 transition hover:bg-[#1E293B] disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#0369a1] px-6 py-3 text-sm font-black text-white transition hover:bg-[#075985] disabled:opacity-60"
          >
	            {busy ? <GsapSpinner className="h-4 w-4" /> : null}
            Save Category
          </button>
        </div>
      </form>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-xs font-black text-gray-300">{label}</span>
      {children}
    </label>
  );
}
