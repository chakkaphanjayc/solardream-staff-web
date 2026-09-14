"use client";

import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarClock,
  Clock3,
  Eye,
  EyeOff,
  Info,
  Languages,
  Link as LinkIcon,
  Megaphone,
  Pencil,
  Plus,
  Save,
  Tag,
  Trash2,
  X,
  Zap,
} from "@/components/ui/icons";

import { createBanner, deleteBanner, deleteBanners, toggleBannerStatus, toggleBannersStatus, updateBanner } from "@/app/actions/banner";
import { AdminBulkActionBar } from "@/components/admin/AdminBulkActionBar";
import { AdminSelectionCheckbox } from "@/components/admin/AdminSelectionCheckbox";
import ConfirmDeleteModal from "@/components/layout/ConfirmDeleteModal";
import { useAdminSelection } from "@/hooks/useAdminSelection";
import type { GlobalBannerInput, GlobalBannerRecord, GlobalBannerTranslations } from "@/types/globalBanner";

type BannerFormState = {
  fallbackMessage: string;
  fallbackLinkUrl: string;
  enMessage: string;
  enLinkUrl: string;
  thMessage: string;
  thLinkUrl: string;
  type: string;
  startsAt: string;
  endsAt: string;
  sortOrder: string;
  isActive: boolean;
};

const EMPTY_FORM: BannerFormState = {
  fallbackMessage: "",
  fallbackLinkUrl: "",
  enMessage: "",
  enLinkUrl: "",
  thMessage: "",
  thLinkUrl: "",
  type: "INFO",
  startsAt: "",
  endsAt: "",
  sortOrder: "0",
  isActive: true,
};

function toLocalDateTimeValue(value: Date | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIsoDate(value: string, label: string) {
  if (!value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} must be a valid date.`);
  return date.toISOString();
}

function formatDate(value: Date | null | undefined) {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid date";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function getLocalizedValue(banner: GlobalBannerRecord, locale: "en" | "th") {
  const translation = banner.translations?.[locale];
  return {
    message: translation?.message?.trim() || (locale === "en" ? banner.message : ""),
    linkUrl: translation?.linkUrl ?? banner.linkUrl ?? "",
  };
}

function formFromBanner(banner: GlobalBannerRecord): BannerFormState {
  const english = getLocalizedValue(banner, "en");
  const thai = getLocalizedValue(banner, "th");

  return {
    fallbackMessage: banner.message,
    fallbackLinkUrl: banner.linkUrl ?? "",
    enMessage: english.message,
    enLinkUrl: english.linkUrl,
    thMessage: thai.message,
    thLinkUrl: thai.linkUrl,
    type: banner.type,
    startsAt: toLocalDateTimeValue(banner.startsAt),
    endsAt: toLocalDateTimeValue(banner.endsAt),
    sortOrder: String(banner.sortOrder),
    isActive: banner.isActive,
  };
}

function sortBanners(banners: GlobalBannerRecord[]) {
  return [...banners].sort((left, right) => {
    const orderDifference = left.sortOrder - right.sortOrder;
    if (orderDifference !== 0) return orderDifference;
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });
}

function getBannerIcon(type: string) {
  switch (type) {
    case "PROMO":
      return Tag;
    case "NEW":
      return Zap;
    case "WARNING":
    case "ALERT":
      return AlertTriangle;
    case "INFO":
    default:
      return Info;
  }
}

function getScheduleState(banner: GlobalBannerRecord) {
  if (!banner.isActive) {
    return { label: "Disabled", className: "border-slate-700 bg-slate-900 text-slate-400" };
  }

  const now = Date.now();
  if (banner.startsAt && new Date(banner.startsAt).getTime() > now) {
    return { label: "Scheduled", className: "border-[#B7D1EA]/30 bg-[#B7D1EA]/10 text-[#B7D1EA]" };
  }
  if (banner.endsAt && new Date(banner.endsAt).getTime() <= now) {
    return { label: "Expired", className: "border-amber-500/30 bg-amber-500/10 text-amber-300" };
  }

  return { label: "Live", className: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

export default function NotificationsClient({ initialBanners }: { initialBanners: GlobalBannerRecord[] }) {
  const [banners, setBanners] = useState(() => sortBanners(initialBanners));
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<BannerFormState>(EMPTY_FORM);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isBulkActionPending, setIsBulkActionPending] = useState(false);

  const activeCount = useMemo(() => banners.filter((banner) => banner.isActive).length, [banners]);
  const selection = useAdminSelection(banners.map((banner) => banner.id));

  const updateForm = <K extends keyof BannerFormState>(key: K, value: BannerFormState[K]) => {
    setFormData((current) => ({ ...current, [key]: value }));
  };

  const openCreate = () => {
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setIsEditorOpen(true);
  };

  const openEdit = (banner: GlobalBannerRecord) => {
    setEditingId(banner.id);
    setFormData(formFromBanner(banner));
    setIsEditorOpen(true);
  };

  const closeEditor = () => {
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setIsEditorOpen(false);
  };

  const buildPayload = (): GlobalBannerInput => {
    const fallbackMessage = formData.fallbackMessage.trim();
    const enMessage = formData.enMessage.trim();
    const thMessage = formData.thMessage.trim();
    const enLinkUrl = formData.enLinkUrl.trim();
    const thLinkUrl = formData.thLinkUrl.trim();
    const translations: GlobalBannerTranslations = {};

    if (enMessage || enLinkUrl) {
      translations.en = {
        ...(enMessage ? { message: enMessage } : {}),
        ...(enLinkUrl ? { linkUrl: enLinkUrl } : {}),
      };
    }
    if (thMessage || thLinkUrl) {
      translations.th = {
        ...(thMessage ? { message: thMessage } : {}),
        ...(thLinkUrl ? { linkUrl: thLinkUrl } : {}),
      };
    }

    const message = fallbackMessage || enMessage || thMessage;
    if (!message) throw new Error("Add a fallback, English, or Thai message.");

    return {
      message,
      type: formData.type,
      linkUrl: formData.fallbackLinkUrl.trim() || null,
      translations,
      isActive: formData.isActive,
      startsAt: toIsoDate(formData.startsAt, "Start time"),
      endsAt: toIsoDate(formData.endsAt, "End time"),
      sortOrder: Number.isFinite(Number(formData.sortOrder)) ? Math.trunc(Number(formData.sortOrder)) : 0,
    };
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      const payload = buildPayload();
      const result = editingId
        ? await updateBanner(editingId, payload)
        : await createBanner(payload);

      if (!result.success || !result.banner) throw new Error("Banner could not be saved.");

      setBanners((current) => sortBanners(
        editingId
          ? current.map((banner) => banner.id === editingId ? result.banner : banner)
          : [result.banner, ...current],
      ));
      toast.success(editingId ? "Banner updated" : "Banner created");
      closeEditor();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggle = async (banner: GlobalBannerRecord) => {
    try {
      const result = await toggleBannerStatus(banner.id, !banner.isActive);
      if (!result.success || !result.banner) throw new Error("Banner status could not be updated.");
      setBanners((current) => sortBanners(current.map((item) => item.id === banner.id ? result.banner : item)));
      toast.success(result.banner.isActive ? "Banner enabled" : "Banner disabled");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleBulkToggle = async (isActive: boolean) => {
    if (selection.selectedCount === 0) return;
    setIsBulkActionPending(true);
    try {
      const result = await toggleBannersStatus(selection.selectedIds, isActive);
      setBanners((current) => sortBanners(current.map((banner) => {
        const updated = result.banners.find((item) => item.id === banner.id);
        return updated ?? banner;
      })));
      selection.clear();
      toast.success(`${result.banners.length} banner(s) ${isActive ? "enabled" : "disabled"}`);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsBulkActionPending(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selection.selectedCount === 0) return;
    if (!window.confirm(`Delete ${selection.selectedCount} selected banner(s)? This cannot be undone.`)) return;

    setIsBulkActionPending(true);
    try {
      const ids = selection.selectedIds;
      const result = await deleteBanners(ids);
      setBanners((current) => current.filter((banner) => !ids.includes(banner.id)));
      selection.clear();
      toast.success(`${result.count} banner(s) deleted`);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsBulkActionPending(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTargetId) return;
    setIsDeleting(true);

    try {
      await deleteBanner(deleteTargetId);
      setBanners((current) => current.filter((banner) => banner.id !== deleteTargetId));
      if (editingId === deleteTargetId) closeEditor();
      setDeleteTargetId(null);
      toast.success("Banner deleted");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-[#1E293B] bg-[#0F172A] p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-bold text-gray-100">Banner rotation</p>
            <span className="rounded-full border border-[#B7D1EA]/25 bg-[#B7D1EA]/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#B7D1EA]">
              {activeCount} enabled
            </span>
          </div>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-gray-400">
            Enabled banners rotate in the public header. Schedule windows control when each item enters the loop.
          </p>
        </div>
        <button
          type="button"
          onClick={isEditorOpen ? closeEditor : openCreate}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#B7D1EA] px-4 text-xs font-black text-slate-950 transition-colors hover:bg-[#99BFE3]"
        >
          {isEditorOpen ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {isEditorOpen ? "Close editor" : "New banner"}
        </button>
      </div>

      {isEditorOpen && (
        <form
          onSubmit={handleSubmit}
          className="space-y-6 rounded-2xl border border-[#1E293B] bg-[#0F172A] p-5 sm:p-6"
        >
          <div className="flex flex-col gap-2 border-b border-[#1E293B] pb-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[#B7D1EA]">
                <Megaphone className="h-4 w-4" />
                <span className="text-[10px] font-black uppercase tracking-[0.18em]">Global notification editor</span>
              </div>
              <h2 className="mt-2 text-lg font-black text-gray-100">{editingId ? "Edit banner" : "Create banner"}</h2>
              <p className="mt-1 text-xs leading-5 text-gray-400">Write localized content once, then schedule and order it for the public header.</p>
            </div>
            {editingId && <span className="rounded-full border border-[#B7D1EA]/20 px-3 py-1 text-[10px] font-bold text-[#B7D1EA]">Editing existing item</span>}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-xs font-bold text-gray-300">Fallback message</span>
              <textarea
                value={formData.fallbackMessage}
                onChange={(event) => updateForm("fallbackMessage", event.target.value)}
                rows={3}
                className="w-full resize-y rounded-xl border border-[#1E293B] bg-[#0B1121] px-4 py-3 text-sm text-white outline-none transition focus:border-[#B7D1EA] focus:ring-2 focus:ring-[#B7D1EA]/20"
                placeholder="Used when a visitor's language has no translation"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-bold text-gray-300">Fallback link URL</span>
              <span className="relative block">
                <LinkIcon className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-gray-500" />
                <input
                  value={formData.fallbackLinkUrl}
                  onChange={(event) => updateForm("fallbackLinkUrl", event.target.value)}
                  className="w-full rounded-xl border border-[#1E293B] bg-[#0B1121] py-3 pl-10 pr-4 text-sm text-white outline-none transition focus:border-[#B7D1EA] focus:ring-2 focus:ring-[#B7D1EA]/20"
                  placeholder="/build or https://..."
                />
              </span>
              <span className="mt-2 block text-[11px] leading-5 text-gray-500">Leave blank if the banner should be informational only.</span>
            </label>
          </div>

          <section className="rounded-xl border border-[#1E293B] bg-[#0B1121] p-4" aria-labelledby="localized-banner-copy">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#B7D1EA]/15 text-[#B7D1EA]"><Languages className="h-4 w-4" /></span>
              <div>
                <h3 id="localized-banner-copy" className="text-sm font-bold text-gray-100">Localized content</h3>
                <p className="mt-1 text-xs leading-5 text-gray-500">The public site uses the visitor locale, then English, then the fallback copy.</p>
              </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-[#1E293B] bg-[#0F172A] p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span className="text-xs font-black text-gray-100">English</span>
                  <span className="rounded-full bg-white/5 px-2 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-gray-500">en</span>
                </div>
                <textarea
                  value={formData.enMessage}
                  onChange={(event) => updateForm("enMessage", event.target.value)}
                  rows={3}
                  className="w-full resize-y rounded-lg border border-[#1E293B] bg-[#0B1121] px-3 py-2.5 text-sm text-white outline-none transition focus:border-[#B7D1EA] focus:ring-2 focus:ring-[#B7D1EA]/20"
                  placeholder="English announcement"
                />
                <input
                  value={formData.enLinkUrl}
                  onChange={(event) => updateForm("enLinkUrl", event.target.value)}
                  className="mt-3 w-full rounded-lg border border-[#1E293B] bg-[#0B1121] px-3 py-2.5 text-xs text-white outline-none transition focus:border-[#B7D1EA] focus:ring-2 focus:ring-[#B7D1EA]/20"
                  placeholder="English link URL (optional)"
                />
              </div>

              <div className="rounded-xl border border-[#1E293B] bg-[#0F172A] p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span className="text-xs font-black text-gray-100">ไทย</span>
                  <span className="rounded-full bg-white/5 px-2 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-gray-500">th</span>
                </div>
                <textarea
                  value={formData.thMessage}
                  onChange={(event) => updateForm("thMessage", event.target.value)}
                  rows={3}
                  className="w-full resize-y rounded-lg border border-[#1E293B] bg-[#0B1121] px-3 py-2.5 text-sm text-white outline-none transition focus:border-[#B7D1EA] focus:ring-2 focus:ring-[#B7D1EA]/20"
                  placeholder="ข้อความประกาศภาษาไทย"
                />
                <input
                  value={formData.thLinkUrl}
                  onChange={(event) => updateForm("thLinkUrl", event.target.value)}
                  className="mt-3 w-full rounded-lg border border-[#1E293B] bg-[#0B1121] px-3 py-2.5 text-xs text-white outline-none transition focus:border-[#B7D1EA] focus:ring-2 focus:ring-[#B7D1EA]/20"
                  placeholder="ลิงก์ภาษาไทย (ถ้ามี)"
                />
              </div>
            </div>
          </section>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className="mb-2 block text-xs font-bold text-gray-300">Type</span>
              <select
                value={formData.type}
                onChange={(event) => updateForm("type", event.target.value)}
                className="w-full rounded-xl border border-[#1E293B] bg-[#0B1121] px-3 py-3 text-sm font-semibold text-gray-200 outline-none focus:border-[#B7D1EA] focus:ring-2 focus:ring-[#B7D1EA]/20"
              >
                <option value="INFO">Info</option>
                <option value="PROMO">Promo</option>
                <option value="NEW">New</option>
                <option value="WARNING">Warning</option>
                <option value="ALERT">Alert</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-bold text-gray-300">Display order</span>
              <input
                type="number"
                value={formData.sortOrder}
                onChange={(event) => updateForm("sortOrder", event.target.value)}
                className="w-full rounded-xl border border-[#1E293B] bg-[#0B1121] px-3 py-3 text-sm text-white outline-none focus:border-[#B7D1EA] focus:ring-2 focus:ring-[#B7D1EA]/20"
                min={-9999}
                max={9999}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-2 block text-xs font-bold text-gray-300">Start showing</span>
              <span className="relative block">
                <CalendarClock className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-gray-500" />
                <input
                  type="datetime-local"
                  value={formData.startsAt}
                  onChange={(event) => updateForm("startsAt", event.target.value)}
                  className="w-full rounded-xl border border-[#1E293B] bg-[#0B1121] py-3 pl-10 pr-3 text-sm text-white outline-none focus:border-[#B7D1EA] focus:ring-2 focus:ring-[#B7D1EA]/20"
                />
              </span>
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-2 block text-xs font-bold text-gray-300">Stop showing</span>
              <span className="relative block">
                <Clock3 className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-gray-500" />
                <input
                  type="datetime-local"
                  value={formData.endsAt}
                  onChange={(event) => updateForm("endsAt", event.target.value)}
                  className="w-full rounded-xl border border-[#1E293B] bg-[#0B1121] py-3 pl-10 pr-3 text-sm text-white outline-none focus:border-[#B7D1EA] focus:ring-2 focus:ring-[#B7D1EA]/20"
                />
              </span>
            </label>
          </div>

          <div className="flex flex-col gap-4 border-t border-[#1E293B] pt-5 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold text-gray-300">
              <input
                type="checkbox"
                checked={formData.isActive}
                onChange={(event) => updateForm("isActive", event.target.checked)}
                className="h-4 w-4 rounded border-[#1E293B] bg-[#0B1121] text-[#B7D1EA] focus:ring-[#B7D1EA]"
              />
              Enable this banner for its schedule window
            </label>
            <div className="flex flex-col-reverse gap-3 sm:flex-row">
              <button type="button" onClick={closeEditor} disabled={isSubmitting} className="min-h-11 rounded-xl border border-[#1E293B] px-5 text-xs font-bold text-gray-300 transition hover:bg-white/5 disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={isSubmitting} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#B7D1EA] px-5 text-xs font-black text-slate-950 transition hover:bg-[#99BFE3] disabled:cursor-wait disabled:opacity-50">
                <Save className="h-4 w-4" />
                {isSubmitting ? "Saving…" : editingId ? "Save changes" : "Create banner"}
              </button>
            </div>
          </div>
        </form>
      )}

      <div className="space-y-3">
        <AdminBulkActionBar
          selectedCount={selection.selectedCount}
          visibleCount={banners.length}
          allVisibleSelected={selection.allVisibleSelected}
          someVisibleSelected={selection.someVisibleSelected}
          onToggleVisible={selection.toggleVisible}
          onClear={selection.clear}
          isPending={isBulkActionPending}
          actions={[
            {
              id: "enable",
              label: "Enable",
              icon: Eye,
              tone: "success",
              onClick: () => void handleBulkToggle(true),
            },
            {
              id: "disable",
              label: "Disable",
              icon: EyeOff,
              tone: "warning",
              onClick: () => void handleBulkToggle(false),
            },
            {
              id: "delete",
              label: "Delete",
              icon: Trash2,
              tone: "danger",
              onClick: () => void handleBulkDelete(),
            },
          ]}
        />

        {banners.map((banner) => {
          const Icon = getBannerIcon(banner.type);
          const schedule = getScheduleState(banner);
          const english = getLocalizedValue(banner, "en");
          const thai = getLocalizedValue(banner, "th");

          return (
            <article key={banner.id} className="rounded-2xl border border-[#1E293B] bg-[#0F172A] p-4 sm:p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="pt-1">
                    <AdminSelectionCheckbox
                      checked={selection.isSelected(banner.id)}
                      label={`Select banner ${banner.message}`}
                      onChange={() => selection.toggle(banner.id)}
                      disabled={isBulkActionPending}
                    />
                  </div>
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#B7D1EA]/20 bg-[#B7D1EA]/10 text-[#B7D1EA]">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-sm font-bold text-gray-100">{banner.message}</h3>
                      <span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-[0.14em] ${schedule.className}`}>{schedule.label}</span>
                      <span className="rounded-full border border-[#1E293B] px-2 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-gray-500">{banner.type}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-500">
                      <span>Order {banner.sortOrder}</span>
                      <span>Starts: {formatDate(banner.startsAt)}</span>
                      <span>Ends: {formatDate(banner.endsAt)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap gap-2 border-t border-[#1E293B] pt-3 lg:border-t-0 lg:pt-0">
                  <button type="button" onClick={() => openEdit(banner)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#1E293B] px-3 text-xs font-bold text-gray-300 transition hover:bg-white/5 hover:text-white"><Pencil className="h-3.5 w-3.5" />Edit</button>
                  <button type="button" onClick={() => void handleToggle(banner)} className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-xs font-bold transition ${banner.isActive ? "border-amber-400/30 text-amber-300 hover:bg-amber-400/10" : "border-emerald-400/30 text-emerald-300 hover:bg-emerald-400/10"}`}>
                    {banner.isActive ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    {banner.isActive ? "Disable" : "Enable"}
                  </button>
                  <button type="button" onClick={() => setDeleteTargetId(banner.id)} aria-label={`Delete ${banner.message}`} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl border border-[#1E293B] text-gray-500 transition hover:border-red-400/30 hover:bg-red-400/10 hover:text-red-300"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-[#1E293B] bg-[#0B1121] p-3">
                  <div className="flex items-center justify-between gap-2"><span className="text-[9px] font-black uppercase tracking-[0.16em] text-gray-500">English</span><span className="text-[9px] font-bold text-gray-600">en</span></div>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-gray-300">{english.message || "Uses fallback message"}</p>
                  {english.linkUrl && <p className="mt-2 truncate text-[10px] text-[#B7D1EA]">{english.linkUrl}</p>}
                </div>
                <div className="rounded-xl border border-[#1E293B] bg-[#0B1121] p-3">
                  <div className="flex items-center justify-between gap-2"><span className="text-[9px] font-black uppercase tracking-[0.16em] text-gray-500">ไทย</span><span className="text-[9px] font-bold text-gray-600">th</span></div>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-gray-300">{thai.message || "Uses fallback message"}</p>
                  {thai.linkUrl && <p className="mt-2 truncate text-[10px] text-[#B7D1EA]">{thai.linkUrl}</p>}
                </div>
              </div>
            </article>
          );
        })}

        {banners.length === 0 && (
          <div className="rounded-2xl border border-dashed border-[#1E293B] bg-[#0B1121] px-6 py-14 text-center">
            <Megaphone className="mx-auto h-8 w-8 text-[#B7D1EA]" />
            <h3 className="mt-3 text-sm font-bold text-gray-200">No custom banners yet</h3>
            <p className="mt-1 text-xs text-gray-500">Create your first localized announcement to start the public rotation.</p>
            <button type="button" onClick={openCreate} className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#B7D1EA] px-4 text-xs font-black text-slate-950 hover:bg-[#99BFE3]"><Plus className="h-4 w-4" />Create banner</button>
          </div>
        )}
      </div>

      <ConfirmDeleteModal
        isOpen={deleteTargetId !== null}
        onClose={() => setDeleteTargetId(null)}
        onConfirm={() => void confirmDelete()}
        isDeleting={isDeleting}
        title="Delete banner"
        message="Delete this global notification? It will disappear from the public header immediately."
      />
    </div>
  );
}
