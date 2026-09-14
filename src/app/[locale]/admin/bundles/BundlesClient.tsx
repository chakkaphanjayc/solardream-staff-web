"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Check,
  Power,
  AlertCircle,
  Search,
  X,
  CalendarDays,
  Tag,
  Copy,
} from "@/components/ui/icons";
import {
  createBundle,
  deleteBundle,
  toggleBundleStatus,
  importBundles,
} from "@/app/actions/bundles";
import { DataImportExport } from "@/components/ui/data-import-export";
import ProgressiveImage from "@/components/ui/progressive-image";
import { cn } from "@/lib/utils";
import { useLocale, useTranslations } from "next-intl";
import { GsapReveal } from "@/components/ui/GsapMotion";
import { AdminBulkActionBar } from "@/components/admin/AdminBulkActionBar";
import { AdminSelectionCheckbox } from "@/components/admin/AdminSelectionCheckbox";
import { useAdminSelection } from "@/hooks/useAdminSelection";

interface Product {
  id: string;
  name: string;
  price: number;
  imageUrl?: string | null;
  stock?: number;
  category: {
    id: string;
    name: string;
  };
}

interface BundleItem {
  id: string;
  productId: string;
  quantity: number;
  product: {
    id: string;
    name: string;
    price: number;
  };
}

interface Bundle {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  price: number;
  isActive: boolean;
  discountType: string;
  discountValue: number;
  promoText?: string | null;
  labels?: string[];
  validFrom?: Date | string | null;
  validUntil?: Date | string | null;
  items: BundleItem[];
}

interface BundlesClientProps {
  products: Product[];
  initialBundles: Bundle[];
}

const MARKETING_BADGES = ["🔥 RECOMMENDED", "🏷️ SALE", "✨ NEW"];

function formatDateLabel(value: string, locale: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "th-TH", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  }).format(new Date(`${value}T00:00:00`));
}

function mergeBundles(current: Bundle[], incoming: Bundle[]) {
  const incomingIds = new Set(incoming.map((bundle) => bundle.id));
  return [
    ...incoming,
    ...current.filter((bundle) => !incomingIds.has(bundle.id)),
  ];
}

function DatePickerWithRange({
  validFrom,
  validUntil,
  onValidFromChange,
  onValidUntilChange,
  locale,
  t,
}: {
  validFrom: string;
  validUntil: string;
  onValidFromChange: (value: string) => void;
  onValidUntilChange: (value: string) => void;
  locale: string;
  t: ReturnType<typeof useTranslations>;
}) {
  const rangeLabel =
    validFrom || validUntil
      ? `${validFrom ? formatDateLabel(validFrom, locale) : t("dateRange.startImmediately")} - ${
          validUntil ? formatDateLabel(validUntil, locale) : t("dateRange.noEndDate")
        }`
      : t("dateRange.alwaysActive");

  return (
    <div className="rounded-2xl bg-[#0F172A]/70 p-4 shadow-none ring-1 ring-white/80">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#B7D1EA]/25 text-gray-100">
            <CalendarDays className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">
              {t("dateRange.title")}
            </p>
            <p className="mt-0.5 truncate text-xs font-bold text-gray-100">
              {rangeLabel}
            </p>
          </div>
        </div>
        {(validFrom || validUntil) && (
          <button
            type="button"
            onClick={() => {
              onValidFromChange("");
              onValidUntilChange("");
            }}
            className="rounded-xl bg-[#0B1121] px-3 py-2 text-[10px] font-black uppercase tracking-wider text-gray-400 transition-colors hover:bg-[#1E293B]"
          >
            Clear
          </button>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-500">
            Start Date
          </span>
          <input
            type="date"
            value={validFrom}
            onChange={(event) => onValidFromChange(event.target.value)}
            className="w-full rounded-xl bg-[#0F172A] px-4 py-2.5 text-sm font-semibold text-gray-100 outline-none ring-1 ring-slate-200/70 transition-all focus:ring-2 focus:ring-[#B7D1EA]"
          />
        </label>
        <label className="space-y-1.5">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-500">
            End Date
          </span>
          <input
            type="date"
            min={validFrom || undefined}
            value={validUntil}
            onChange={(event) => onValidUntilChange(event.target.value)}
            className="w-full rounded-xl bg-[#0F172A] px-4 py-2.5 text-sm font-semibold text-gray-100 outline-none ring-1 ring-slate-200/70 transition-all focus:ring-2 focus:ring-[#B7D1EA]"
          />
        </label>
      </div>

      <p className="mt-3 text-[10px] font-semibold text-gray-500">
        {t("dateRange.hint")}
      </p>
    </div>
  );
}

export default function BundlesClient({
  products,
  initialBundles,
}: BundlesClientProps) {
  const t = useTranslations("AdminBundles");
  const locale = useLocale();
  const dateLocale = locale === "en" ? "en-US" : "th-TH";
  const currencyFormatter = new Intl.NumberFormat(dateLocale, {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  });
  const [bundles, setBundles] = useState<Bundle[]>(initialBundles);
  const [isCreating, setIsCreating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const bundleSelection = useAdminSelection(bundles.map((bundle) => bundle.id));

  // Form State
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [discountType, setDiscountType] = useState<"FIXED" | "PERCENT">(
    "FIXED",
  );
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [promoText, setPromoText] = useState("");
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [selectedItems, setSelectedItems] = useState<
    { productId: string; quantity: number }[]
  >([]);

  // Product Selector Modal States
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [sortBy, setSortBy] = useState("DEFAULT");

  const handleImport = async (data: Record<string, unknown>[]) => {
    try {
      const importPayload = data.map((row, idx) => {
        if (!row.name) {
          throw new Error(
            t("import.rowMissingName", { row: idx + 1 }),
          );
        }
        if (!row.items) {
          throw new Error(
            t("import.rowMissingItems", { row: idx + 1 }),
          );
        }

        const itemParts = String(row.items).split(";").filter(Boolean);
        const items = itemParts.map((part) => {
          const [productId, qtyStr] = part.split(":");
          const quantity = parseInt(qtyStr || "1", 10);

          const prodExists = products.some((p) => p.id === productId.trim());
          if (!prodExists) {
            throw new Error(
              t("import.productNotFound", { row: idx + 1, productId }),
            );
          }

          return {
            productId: productId.trim(),
            quantity: isNaN(quantity) ? 1 : quantity,
          };
        });

        if (items.length === 0) {
          throw new Error(
            t("import.rowNeedsItem", { row: idx + 1 }),
          );
        }

        return {
          name: String(row.name),
          description: row.description ? String(row.description) : undefined,
          imageUrl: row.imageUrl ? String(row.imageUrl) : undefined,
          price: parseFloat(String(row.price || "0")),
          discountType: row.discountType === "PERCENT" ? "PERCENT" : "FIXED",
          discountValue: parseFloat(String(row.discountValue || "0")),
          promoText: row.promoText ? String(row.promoText) : undefined,
          labels: row.labels
            ? String(row.labels)
                .split(";")
                .map((l) => l.trim())
                .filter(Boolean)
            : undefined,
          validFrom: row.validFrom
            ? new Date(String(row.validFrom)).toISOString()
            : undefined,
          validUntil: row.validUntil
            ? new Date(String(row.validUntil)).toISOString()
            : undefined,
          items,
        };
      });

      const loadingId = toast.loading(t("toast.importLoading"));
      const response = await importBundles(importPayload);
      toast.dismiss(loadingId);

      if (response.success) {
        toast.success(t("toast.importSuccess", { count: response.count ?? 0 }));
        if (response.bundles?.length) {
          setBundles((current) => mergeBundles(current, response.bundles));
        }
      } else {
        toast.error(response.error || t("toast.importFailed"));
      }
    } catch (err: unknown) {
      console.error(err);
      toast.error(
        t("toast.importException", {
          message: err instanceof Error ? err.message : t("toast.importUnknown"),
        }),
      );
    }
  };

  const preparedExportData = bundles.map((b) => ({
    name: b.name,
    description: b.description || "",
    imageUrl: b.imageUrl || "",
    price: b.price,
    discountType: b.discountType,
    discountValue: b.discountValue,
    promoText: b.promoText || "",
    labels: b.labels || [],
    validFrom: b.validFrom
      ? new Date(b.validFrom).toISOString().split("T")[0]
      : "",
    validUntil: b.validUntil
      ? new Date(b.validUntil).toISOString().split("T")[0]
      : "",
    items: b.items
      .map((item) => `${item.productId}:${item.quantity}`)
      .join(";"),
  }));

  const filteredAndSortedProducts = products
    .filter((p) => {
      const query = searchQuery.toLowerCase().trim();
      const matchesSearch =
        p.name.toLowerCase().includes(query) ||
        p.id.toLowerCase().includes(query);
      const matchesCategory =
        selectedCategory === "ALL" || p.category.name === selectedCategory;
      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => {
      if (sortBy === "PRICE_ASC") return a.price - b.price;
      if (sortBy === "PRICE_DESC") return b.price - a.price;
      if (sortBy === "STOCK_DESC") return (b.stock ?? 0) - (a.stock ?? 0);
      if (sortBy === "STOCK_ASC") return (a.stock ?? 0) - (b.stock ?? 0);
      return 0;
    });

  // Calculate sum of selected items
  const originalTotalPrice = selectedItems.reduce((sum, item) => {
    const p = products.find((prod) => prod.id === item.productId);
    return sum + (p ? p.price * item.quantity : 0);
  }, 0);

  // Calculate calculated promo price
  const promoPrice =
    discountType === "FIXED"
      ? Math.max(0, originalTotalPrice - discountValue)
      : Math.max(0, originalTotalPrice * (1 - discountValue / 100));

  const handleProductToggle = (productId: string) => {
    setSelectedItems((prev) => {
      const exists = prev.find((item) => item.productId === productId);
      if (exists) {
        return prev.filter((item) => item.productId !== productId);
      } else {
        return [...prev, { productId, quantity: 1 }];
      }
    });
  };

  const handleQuantityChange = (productId: string, qty: number) => {
    setSelectedItems((prev) =>
      prev.map((item) =>
        item.productId === productId
          ? { ...item, quantity: Math.max(1, qty) }
          : item,
      ),
    );
  };

  const handleCreateBundle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedItems.length === 0) {
      toast.error(t("toast.selectAtLeastOne"));
      return;
    }
    if (discountValue < 0) {
      toast.error(t("toast.invalidDiscount"));
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createBundle({
        name,
        description: description || undefined,
        imageUrl: imageUrl || undefined,
        price: promoPrice,
        discountType,
        discountValue,
        isActive: true,
        promoText: promoText || undefined,
        labels: selectedLabels.length > 0 ? selectedLabels : undefined,
        validFrom: validFrom || undefined,
        validUntil: validUntil || undefined,
        items: selectedItems,
      });

      if (result.success && result.bundle) {
        const createdBundle = result.bundle;
        toast.success(t("toast.createSuccess"));
        setBundles((prev) => mergeBundles(prev, [createdBundle]));
        setIsCreating(false);
        resetForm();
      } else {
        toast.error(result.error || t("toast.genericError"));
      }
    } catch (err) {
      console.error(err);
      toast.error(t("toast.systemRetry"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setName("");
    setDescription("");
    setImageUrl("");
    setDiscountType("FIXED");
    setDiscountValue(0);
    setPromoText("");
    setSelectedLabels([]);
    setValidFrom("");
    setValidUntil("");
    setSelectedItems([]);
  };

  const toggleMarketingLabel = (label: string) => {
    setSelectedLabels((current) =>
      current.includes(label)
        ? current.filter((item) => item !== label)
        : [...current, label],
    );
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t("confirm.deleteBundle"))) return;

    try {
      const result = await deleteBundle(id);
      if (result.success) {
        toast.success(t("toast.deleteSuccess"));
        setBundles((prev) => prev.filter((b) => b.id !== id));
        bundleSelection.remove([id]);
      } else {
        toast.error(result.error || t("toast.deleteFailed"));
      }
    } catch (err) {
      console.error(err);
      toast.error(t("toast.systemError"));
    }
  };

  const handleCopySelected = async () => {
    const selected = bundles.filter((bundle) => bundleSelection.selectedIds.includes(bundle.id));
    if (selected.length === 0) return;
    await navigator.clipboard.writeText(selected.map((bundle) => `${bundle.name}\t${bundle.id}`).join("\n"));
    toast.success(`Copied ${selected.length} selected bundle${selected.length === 1 ? "" : "s"}.`);
  };

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    try {
      const result = await toggleBundleStatus(id, !currentStatus);
      if (result.success) {
        toast.success(t("toast.statusUpdated"));
        setBundles((prev) =>
          prev.map((b) =>
            b.id === id ? { ...b, isActive: !currentStatus } : b,
          ),
        );
      } else {
        toast.error(result.error || t("toast.actionFailed"));
      }
    } catch (err) {
      console.error(err);
      toast.error(t("toast.systemError"));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <h2 className="text-xl font-bold text-gray-100">
          {t("header.title")}
        </h2>
        <div className="flex items-center gap-2">
          <DataImportExport
            moduleName="bundles"
            exportData={preparedExportData}
            onImport={handleImport}
          />
          <button
            onClick={() => setIsCreating(!isCreating)}
            className="px-4 py-2 bg-slate-900 text-white text-xs font-black uppercase tracking-wider rounded-xl hover:bg-slate-800 transition-all flex items-center gap-2 cursor-pointer shadow-none"
          >
            <Plus className="w-4 h-4" />
            {isCreating ? t("actions.closeForm") : t("actions.createNew")}
          </button>
        </div>
      </div>

      {/* Creation Form Panel - Premium Borderless Design */}
      {isCreating && (
        <GsapReveal
          as="form"
          onSubmit={handleCreateBundle}
          className="space-y-6 rounded-xl border border-slate-800 bg-[#0F172A] p-6 lg:p-8"
        >
          <h3 className="text-lg font-bold text-gray-100 flex items-center gap-2">
            <Plus className="w-5 h-5 text-[#B7D1EA]" />
            {t("form.title")}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-1">
                  {t("form.bundleName")} *
                </label>
                <input
                  type="text"
                  required
                  placeholder={t("form.bundleNamePlaceholder")}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="min-h-12 w-full rounded-lg border border-slate-700 bg-[#0B1121] px-4 text-sm text-[#F8FAFC] outline-none focus:border-transparent focus:ring-2 focus:ring-[#B7D1EA]"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-1">
                  {t("form.description")}
                </label>
                <textarea
                  placeholder={t("form.descriptionPlaceholder")}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-slate-700 bg-[#0B1121] px-4 py-2.5 text-sm text-[#F8FAFC] outline-none focus:border-transparent focus:ring-2 focus:ring-[#B7D1EA] resize-none"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-1">
                  {t("form.imageUrl")}
                </label>
                <input
                  type="text"
                  placeholder="https://example.com/image.jpg"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  className="min-h-12 w-full rounded-lg border border-slate-700 bg-[#0B1121] px-4 text-sm text-[#F8FAFC] outline-none focus:border-transparent focus:ring-2 focus:ring-[#B7D1EA]"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-1">
                  {t("form.promoText")}
                </label>
                <input
                  type="text"
                  maxLength={50}
                  placeholder={t("form.promoTextPlaceholder")}
                  value={promoText}
                  onChange={(e) => setPromoText(e.target.value)}
                  className="min-h-12 w-full rounded-lg border border-slate-700 bg-[#0B1121] px-4 text-sm text-[#F8FAFC] outline-none focus:border-transparent focus:ring-2 focus:ring-[#B7D1EA]"
                />
                <p className="mt-1 text-right text-[9px] font-bold text-gray-500">
                  {promoText.length}/50
                </p>
              </div>

              <div className="rounded-2xl bg-[#0F172A]/60 p-4 shadow-none ring-1 ring-white/70">
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4 text-gray-500" />
                  <label className="block text-[10px] uppercase tracking-wider font-bold text-gray-400">
                    {t("form.badges")}
                  </label>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {MARKETING_BADGES.map((label) => {
                    const active = selectedLabels.includes(label);
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => toggleMarketingLabel(label)}
                        className={cn(
                          "rounded-full px-3 py-2 text-[10px] font-black uppercase tracking-wider transition-colors",
                          active
                            ? "bg-slate-900 text-white"
                            : "bg-[#0B1121] text-gray-400 hover:bg-[#1E293B]",
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-3 text-[10px] font-semibold text-gray-500">
                  {t("form.badgesHint")}
                </p>
              </div>

              <DatePickerWithRange
                validFrom={validFrom}
                validUntil={validUntil}
                onValidFromChange={setValidFrom}
                onValidUntilChange={setValidUntil}
                locale={locale}
                t={t}
              />

              {/* Promotional Rules */}
              <div className="p-4 bg-[#0F172A]/60 rounded-2xl space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">
                  {t("form.promotionRules")}
                </h4>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setDiscountType("FIXED");
                      setDiscountValue(0);
                    }}
                    className={`py-2 px-3 text-xs font-bold rounded-xl transition-all ${discountType === "FIXED" ? "bg-slate-900 text-white" : "bg-[#0F172A]/80 text-gray-400"}`}
                  >
                    {t("discount.fixed")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDiscountType("PERCENT");
                      setDiscountValue(0);
                    }}
                    className={`py-2 px-3 text-xs font-bold rounded-xl transition-all ${discountType === "PERCENT" ? "bg-slate-900 text-white" : "bg-[#0F172A]/80 text-gray-400"}`}
                  >
                    {t("discount.percent")}
                  </button>
                </div>

                <div>
                  <label className="block text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-1">
                    {discountType === "FIXED"
                      ? t("discount.fixedAmount")
                      : t("discount.percentAmount")}
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={discountType === "PERCENT" ? 100 : undefined}
                    value={discountValue || ""}
                    onChange={(e) => setDiscountValue(Number(e.target.value))}
                    className="w-full px-4 py-2.5 bg-[#0F172A] border-0 rounded-xl text-gray-100 text-sm focus:ring-2 focus:ring-[#B7D1EA] focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Inventory Product Picker */}
            <div className="space-y-4 flex flex-col h-full">
              <div className="flex justify-between items-center">
                <label className="block text-[10px] uppercase tracking-wider font-bold text-gray-400">
                  {t("form.selectedItems")} *
                </label>
                <button
                  type="button"
                  onClick={() => setIsSelectorOpen(true)}
                  className="inline-flex min-h-11 items-center gap-1 rounded-lg border-2 border-dashed border-slate-700 px-3 text-[10px] font-black uppercase tracking-wider text-slate-400 transition-colors hover:border-[#B7D1EA] hover:bg-[#B7D1EA]/5 hover:text-[#B7D1EA]"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {t("actions.addProduct")}
                </button>
              </div>

              <div className="flex-1 bg-[#0F172A]/80 rounded-[20px] p-4 overflow-y-auto max-h-[350px] space-y-2 border border-[#1E293B]/50 shadow-none">
                {selectedItems.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-gray-500 py-10 text-center">
                    <AlertCircle className="w-6 h-6 text-slate-300 mb-2" />
                    <p className="text-xs font-bold uppercase tracking-wider">
                      {t("empty.noSelectedItems")}
                    </p>
                    <p className="text-[10px] text-gray-500 mt-1">
                      {t("empty.noSelectedItemsHint")}
                    </p>
                  </div>
                ) : (
                  selectedItems.map((item) => {
                    const p = products.find(
                      (prod) => prod.id === item.productId,
                    );
                    if (!p) return null;
                    return (
                      <GsapReveal
                        key={item.productId}
                        className="relative flex flex-row items-center gap-3 rounded-xl border border-slate-800 bg-[#0B1121] p-3 pr-12 transition-colors hover:bg-slate-800/30"
                      >
                        {/* Thumbnail */}
                        <div className="relative w-10 h-10 rounded-lg bg-[#0B1121] overflow-hidden flex items-center justify-center flex-shrink-0 border border-[#1E293B]">
                          {p.imageUrl ? (
                            <ProgressiveImage
                              src={p.imageUrl}
                              alt={p.name}
                              fill
                              sizes="40px"
                              className="object-cover"
                              unoptimized
                            />
                          ) : (
                            <div className="w-full h-full bg-[#0B1121] flex items-center justify-center text-[9px] font-bold text-gray-500">
                              No Image
                            </div>
                          )}
                        </div>

                        {/* Name and SKU */}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-gray-100 truncate">
                            {p.name}
                          </p>
                          <p className="text-[9px] text-gray-500 font-mono">
                            SKU: {p.id.slice(0, 8).toUpperCase()}
                          </p>
                        </div>

                        {/* Controls */}
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <div className="flex items-center gap-1 bg-[#0B1121] p-1 rounded-lg border border-[#1E293B]">
                            <button
                              type="button"
                              onClick={() =>
                                handleQuantityChange(
                                  item.productId,
                                  item.quantity - 1,
                                )
                              }
                              className="w-5 h-5 bg-[#0F172A] text-gray-400 rounded text-xs flex items-center justify-center cursor-pointer hover:bg-slate-150 transition-all font-bold"
                            >
                              -
                            </button>
                            <span className="w-5 text-center text-xs font-bold font-mono text-gray-300">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                handleQuantityChange(
                                  item.productId,
                                  item.quantity + 1,
                                )
                              }
                              className="w-5 h-5 bg-[#0F172A] text-gray-400 rounded text-xs flex items-center justify-center cursor-pointer hover:bg-slate-150 transition-all font-bold"
                            >
                              +
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleProductToggle(item.productId)}
                            className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-rose-500/10 hover:text-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA]"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </GsapReveal>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Pricing Preview Banner */}
          <div className="p-4 bg-slate-900 text-white rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                {t("summary.liveSummary")}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs line-through text-gray-500">
                  {currencyFormatter.format(originalTotalPrice)}
                </span>
                <span className="text-lg font-black text-[#B7D1EA]">
                  {currencyFormatter.format(promoPrice)}
                </span>
              </div>
            </div>
            <button
              type="submit"
              disabled={isSubmitting || selectedItems.length === 0}
              className="py-3 px-6 bg-[#B7D1EA] text-gray-100 font-black text-xs uppercase tracking-widest rounded-xl hover:scale-[1.01] transition-transform active:scale-[0.99] disabled:opacity-50 cursor-pointer text-center"
            >
              {isSubmitting ? t("actions.saving") : t("actions.saveBundle")}
            </button>
          </div>
        </GsapReveal>
      )}

      {/* Bundles List */}
      <div className="space-y-4 rounded-xl border border-slate-800 bg-[#0F172A] p-6 lg:p-8">
        <AdminBulkActionBar
          selectedCount={bundleSelection.selectedCount}
          visibleCount={bundles.length}
          allVisibleSelected={bundleSelection.allVisibleSelected}
          someVisibleSelected={bundleSelection.someVisibleSelected}
          onToggleVisible={bundleSelection.toggleVisible}
          onClear={bundleSelection.clear}
          isPending={isSubmitting}
          actions={[
            { id: "copy", label: "Copy selected", icon: Copy, onClick: handleCopySelected },
          ]}
        />
        {bundles.length === 0 ? (
          <div className="text-center py-10 text-gray-500 text-xs uppercase tracking-widest font-black flex flex-col items-center gap-2">
            <AlertCircle className="w-8 h-8 text-slate-350" />
            {t("empty.noBundles")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full border-collapse">
              <thead>
                <tr className="border-b border-[#1E293B] text-left">
                  <th className="pb-3 text-[10px] uppercase font-bold text-gray-400 tracking-wider">
                    <AdminSelectionCheckbox
                      checked={bundleSelection.allVisibleSelected}
                      indeterminate={bundleSelection.someVisibleSelected}
                      onChange={bundleSelection.toggleVisible}
                      label="Select all bundles"
                    />
                  </th>
                  <th className="pb-3 text-[10px] uppercase font-bold text-gray-400 tracking-wider">
                    {t("table.bundle")}
                  </th>
                  <th className="pb-3 text-[10px] uppercase font-bold text-gray-400 tracking-wider">
                    {t("table.components")}
                  </th>
                  <th className="pb-3 text-[10px] uppercase font-bold text-gray-400 tracking-wider">
                    {t("table.discount")}
                  </th>
                  <th className="pb-3 text-[10px] uppercase font-bold text-gray-400 tracking-wider text-right">
                    {t("table.promoPrice")}
                  </th>
                  <th className="pb-3 text-[10px] uppercase font-bold text-gray-400 tracking-wider text-center">
                    {t("table.status")}
                  </th>
                  <th className="pb-3 text-[10px] uppercase font-bold text-gray-400 tracking-wider text-right">
                    {t("table.manage")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {bundles.map((b) => {
                  const originalSum = b.items.reduce(
                    (sum, item) =>
                      sum + (item.product?.price || 0) * item.quantity,
                    0,
                  );
                  return (
                    <tr key={b.id} className="text-sm text-gray-100 transition-colors hover:bg-slate-800/30">
                      <td className="py-4 pr-3">
                        <AdminSelectionCheckbox
                          checked={bundleSelection.isSelected(b.id)}
                          onChange={() => bundleSelection.toggle(b.id)}
                          label={`Select ${b.name}`}
                        />
                      </td>
                      <td className="py-4 pr-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="font-bold text-gray-100">{b.name}</p>
                          {b.labels &&
                            b.labels.map((l) => (
                              <span
                                key={l}
                                className="px-1.5 py-0.5 bg-[#B7D1EA] text-gray-100 rounded text-[7px] font-black tracking-wider uppercase"
                              >
                                {l}
                              </span>
                            ))}
                        </div>
                        {b.description && (
                          <p className="text-xs text-gray-500 max-w-xs truncate mt-0.5">
                            {b.description}
                          </p>
                        )}
                        {b.promoText && (
                          <p className="text-[10px] text-gray-400 font-extrabold mt-0.5">
                            {b.promoText}
                          </p>
                        )}
                        {(b.validFrom || b.validUntil) && (
                          <p className="text-[9px] text-gray-500 mt-1 font-mono">
                            {b.validFrom
                              ? new Date(b.validFrom).toLocaleDateString(
                                  dateLocale,
                                )
                              : t("dateRange.startImmediately")}{" "}
                            -{" "}
                            {b.validUntil
                              ? new Date(b.validUntil).toLocaleDateString(
                                  dateLocale,
                                )
                              : t("dateRange.noEndDate")}
                          </p>
                        )}
                      </td>
                      <td className="py-4 pr-3">
                        <ul className="list-disc list-inside text-xs text-gray-400 space-y-0.5">
                          {b.items.map((item) => (
                            <li key={item.id}>
                              {item.product?.name || t("fallbacks.unknownProduct")} x{" "}
                              {item.quantity}
                            </li>
                          ))}
                        </ul>
                      </td>
                      <td className="py-4 pr-3 text-xs">
                        {b.discountType === "FIXED" ? (
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold font-mono">
                            -{currencyFormatter.format(b.discountValue)}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded font-bold font-mono">
                            -{b.discountValue}%
                          </span>
                        )}
                      </td>
                      <td className="py-4 pr-3 text-right">
                        <p className="font-black text-gray-100 font-mono">
                          {currencyFormatter.format(b.price)}
                        </p>
                        <p className="text-[10px] line-through text-gray-500 font-mono">
                          {currencyFormatter.format(originalSum)}
                        </p>
                      </td>
                      <td className="py-4 text-center">
                        <button
                          onClick={() => handleToggleActive(b.id, b.isActive)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                            b.isActive ? "bg-emerald-100" : "bg-[#1E293B]"
                          } ${
                            b.isActive ? "text-emerald-800" : "text-gray-300"
                          }`}
                        >
                          <Power className="w-3 h-3" />
                          {b.isActive ? t("status.active") : t("status.inactive")}
                        </button>
                      </td>
                      <td className="py-4 text-right">
                        <button
                          onClick={() => handleDelete(b.id)}
                          className="p-2 text-gray-500 hover:text-red-650 hover:bg-[#0B1121] rounded-lg transition-all cursor-pointer"
                          aria-label="Delete bundle"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Selector Modal */}
      {isSelectorOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <GsapReveal from="none" className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-[28px] bg-[#0F172A] shadow-none">
            {/* Modal Header */}
            <div className="p-6 border-b border-[#1E293B]/60 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-100">
                  {t("selector.title")}
                </h3>
                <p className="text-xs text-gray-400">
                  {t("selector.description")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsSelectorOpen(false)}
                className="w-8 h-8 rounded-full bg-[#0F172A] hover:bg-[#1E293B] flex items-center justify-center transition-colors cursor-pointer text-gray-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Filters */}
            <div className="p-6 pb-2 space-y-3 bg-[#0B1121]/60">
              <div className="flex flex-col sm:flex-row gap-3">
                {/* Search bar */}
                <div className="flex-1 relative">
                  <Search className="absolute left-3.5 top-3 w-4 h-4 text-gray-500" />
                  <input
                    type="text"
                    placeholder={t("selector.searchPlaceholder")}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-[#0F172A] border-0 rounded-xl text-gray-100 text-xs focus:ring-2 focus:ring-[#B7D1EA] focus:outline-none placeholder:text-gray-500 h-10 shadow-none"
                  />
                </div>
                {/* Category Filter */}
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="px-3 py-2 bg-[#0F172A] border-0 rounded-xl text-gray-300 text-xs focus:ring-2 focus:ring-[#B7D1EA] focus:outline-none h-10 min-w-[150px] shadow-none cursor-pointer"
                >
                  <option value="ALL">{t("selector.allCategories")}</option>
                  {Array.from(
                    new Set(
                      products.map((p) => p.category?.name).filter(Boolean),
                    ),
                  ).map((catName) => (
                    <option key={catName} value={catName}>
                      {catName}
                    </option>
                  ))}
                </select>
                {/* Sort Filter */}
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="px-3 py-2 bg-[#0F172A] border-0 rounded-xl text-gray-300 text-xs focus:ring-2 focus:ring-[#B7D1EA] focus:outline-none h-10 shadow-none cursor-pointer"
                >
                  <option value="DEFAULT">{t("selector.defaultSort")}</option>
                  <option value="PRICE_ASC">
                    {t("selector.priceLowHigh")}
                  </option>
                  <option value="PRICE_DESC">
                    {t("selector.priceHighLow")}
                  </option>
                  <option value="STOCK_DESC">
                    {t("selector.stockHighLow")}
                  </option>
                  <option value="STOCK_ASC">
                    {t("selector.stockLowHigh")}
                  </option>
                </select>
              </div>
            </div>

            {/* Modal Product List */}
            <div className="flex-1 overflow-y-auto p-6 space-y-2 max-h-[50vh]">
              {filteredAndSortedProducts.length === 0 ? (
                <div className="text-center py-12 text-gray-500 text-xs uppercase tracking-widest font-black">
                  {t("empty.noMatchingProducts")}
                </div>
              ) : (
                filteredAndSortedProducts.map((p) => {
                  const selected = selectedItems.find(
                    (item) => item.productId === p.id,
                  );
                  return (
                    <div
                      key={p.id}
                      onClick={() => handleProductToggle(p.id)}
                      className={`p-3 rounded-2xl flex items-center justify-between cursor-pointer transition-all border ${
                        selected
                          ? "bg-[#B7D1EA]/20 border-[#B7D1EA] text-gray-100"
                          : "bg-[#0F172A] border-transparent hover:border-[#1E293B] text-gray-400 hover:shadow-none"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="relative w-10 h-10 rounded-lg bg-[#0B1121] overflow-hidden flex items-center justify-center flex-shrink-0 border border-[#1E293B]">
                          {p.imageUrl ? (
                            <ProgressiveImage
                              src={p.imageUrl}
                              alt={p.name}
                              fill
                              sizes="40px"
                              className="object-cover"
                              unoptimized
                            />
                          ) : (
                            <div className="w-full h-full bg-[#0B1121] flex items-center justify-center text-[10px] font-bold text-gray-500">
                              No Img
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="text-xs font-bold leading-tight">
                            {p.name}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-gray-500 font-mono">
                              {currencyFormatter.format(p.price)}
                            </span>
                            <span className="text-[10px] bg-[#1E293B]/50 text-gray-400 px-1.5 py-0.5 rounded-md font-mono">
                              SKU: {p.id.slice(0, 8).toUpperCase()}
                            </span>
                            <span className="text-[10px] text-gray-500">
                              Stock: {p.stock ?? 0}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center border transition-all ${
                          selected
                            ? "border-[#B7D1EA] bg-[#B7D1EA] text-gray-100"
                            : "border-slate-350 bg-[#0F172A]"
                        }`}
                      >
                        {selected && (
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-6 bg-[#0B1121]/60 border-t border-[#1E293B]/60 flex justify-between items-center">
              <p className="text-xs font-bold text-gray-400">
                {t("selector.selectedPrefix")}{" "}
                <span className="text-gray-100 font-black">
                  {selectedItems.length}
                </span>{" "}
                {t("selector.selectedSuffix")}
              </p>
              <button
                type="button"
                onClick={() => setIsSelectorOpen(false)}
                className="px-5 py-2.5 bg-slate-900 text-white text-xs font-black uppercase tracking-wider rounded-xl hover:bg-slate-800 transition-all cursor-pointer shadow-none"
              >
                {t("actions.done")}
              </button>
            </div>
          </GsapReveal>
        </div>
      )}
    </div>
  );
}
