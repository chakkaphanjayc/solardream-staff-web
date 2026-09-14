"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  BatteryCharging,
  Check,
  ChevronRight,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Zap,
  ShieldCheck,
  Activity,
  Cpu,
  Smartphone,
  Sparkles,
  Eye,
  EyeOff,
} from "@/components/ui/icons";
import { updateAddonsCatalogAction, resetAddonsCatalogAction } from "@/app/actions/addons";
import type { SolarAddonConfig, SolarAddonOption } from "@/lib/solarAddonConfig";
import { AdminBulkActionBar } from "@/components/admin/AdminBulkActionBar";
import { AdminSelectionCheckbox } from "@/components/admin/AdminSelectionCheckbox";
import { useAdminSelection } from "@/hooks/useAdminSelection";

interface AddonsConfigClientProps {
  initialAddons: SolarAddonConfig[];
}

function formatThbPrice(price?: number): string {
  if (typeof price !== "number" || isNaN(price)) return "฿0";
  return `฿${price.toLocaleString("en-US")}`;
}

/**
 * Flexible price input field that permits backspace/deletion without locking at "0"
 */
function PriceInputField({
  label,
  value,
  onChange,
  className = "",
}: {
  label: string;
  value: number;
  onChange: (val: number) => void;
  className?: string;
}) {
  const [strVal, setStrVal] = useState<string>(value === 0 ? "" : String(value));

  useEffect(() => {
    setStrVal(value === 0 ? "" : String(value));
  }, [value]);

  return (
    <div className={className}>
      <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">{label}</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">฿</span>
        <input
          type="number"
          placeholder="0"
          value={strVal}
          onChange={(e) => {
            const raw = e.target.value;
            setStrVal(raw);
            if (raw === "" || raw === "-") {
              onChange(0);
            } else {
              const parsed = Number(raw);
              onChange(isNaN(parsed) ? 0 : parsed);
            }
          }}
          className="w-full rounded-xl border border-slate-700 bg-[#0B1121] py-2.5 pl-7 pr-3 text-xs font-mono font-bold text-white focus:border-[#B7D1EA] focus:outline-none transition"
        />
      </div>
    </div>
  );
}

export default function AddonsConfigClient({ initialAddons }: AddonsConfigClientProps) {
  const [addons, setAddons] = useState<SolarAddonConfig[]>(initialAddons);
  const [activeCategory, setActiveCategory] = useState<string>("ALL");
  const [visibilityFilter, setVisibilityFilter] = useState<"ALL" | "VISIBLE" | "HIDDEN">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [isPending, startTransition] = useTransition();
  const [expandedAddonId, setExpandedAddonId] = useState<string | null>(null);

  // Summary counts
  const totalCount = addons.length;
  const visibleCount = addons.filter((a) => a.isVisible !== false).length;
  const hiddenCount = addons.filter((a) => a.isVisible === false).length;

  // Filtered addons list
  const filteredAddons = addons.filter((a) => {
    if (activeCategory !== "ALL" && a.category !== activeCategory) return false;
    if (visibilityFilter === "VISIBLE" && a.isVisible === false) return false;
    if (visibilityFilter === "HIDDEN" && a.isVisible !== false) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        a.name.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q) ||
        a.shortLabel.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q)
      );
    }
    return true;
  });
  const addonSelection = useAdminSelection(filteredAddons.map((addon) => addon.id));

  const handleSaveCatalog = () => {
    startTransition(async () => {
      try {
        const res = await updateAddonsCatalogAction(addons);
        if (res.success) {
          toast.success(res.message);
        } else {
          toast.error(res.error || "Failed to save Add-ons catalog.");
        }
      } catch (error) {
        console.error("Add-ons catalog save error:", error);
        toast.error("Failed to save Add-ons catalog. Please try again.");
      }
    });
  };

  const handleResetCatalog = () => {
    if (!confirm("Are you sure you want to reset the Add-ons Catalog to default values?")) return;
    startTransition(async () => {
      try {
        const res = await resetAddonsCatalogAction();
        if (res.success) {
          toast.success(res.message);
          window.location.reload();
        } else {
          toast.error(res.error || "Failed to reset Add-ons catalog.");
        }
      } catch (error) {
        console.error("Add-ons catalog reset error:", error);
        toast.error("Failed to reset Add-ons catalog. Please try again.");
      }
    });
  };

  const handleUpdateAddon = (id: string, updater: (item: SolarAddonConfig) => SolarAddonConfig) => {
    setAddons((prev) => prev.map((item) => (item.id === id ? updater(item) : item)));
  };

  const handleAddAddon = () => {
    const newId = `addon-${Date.now().toString().slice(-4)}`;
    const newAddon: SolarAddonConfig = {
      id: newId,
      name: "New Solar Add-on",
      shortLabel: "New Add-on",
      description: "Custom add-on option for system configuration.",
      category: "SAFETY",
      inputType: "TOGGLE",
      price: 10000,
      isRecommended: false,
      isVisible: true,
    };
    setAddons((prev) => [...prev, newAddon]);
    setExpandedAddonId(newId);
  };

  const handleRemoveAddon = (id: string) => {
    setAddons((prev) => prev.filter((item) => item.id !== id));
    addonSelection.remove([id]);
  };

  const handleBulkVisibility = (isVisible: boolean) => {
    const ids = new Set(addonSelection.selectedIds);
    if (ids.size === 0) return;
    setAddons((current) => current.map((item) => (ids.has(item.id) ? { ...item, isVisible } : item)));
    addonSelection.clear();
    toast.success(`${isVisible ? "Shown" : "Hidden"} ${ids.size} selected add-on${ids.size === 1 ? "" : "s"}. Save the catalog to publish the change.`);
  };

  return (
    <div className="space-y-6 font-urbanist pb-16 text-slate-100">
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-800 bg-[#0F172A] p-6 text-white shadow-2xl">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#B7D1EA]/30 bg-[#B7D1EA]/10 px-3.5 py-1 text-xs font-extrabold text-[#B7D1EA]">
            <BatteryCharging className="h-4 w-4" />
            Central Catalog System
          </div>
          <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl text-white">
            Solar Add-ons & Choice Catalog
          </h1>
          <p className="mt-1 text-xs font-medium text-slate-400 sm:text-sm">
            Unified add-on packages, sub-option pricing, and choices shared across Build (/build) and Wizard (/wizard).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleResetCatalog}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-[#1E293B] px-4 py-2.5 text-xs font-bold text-slate-300 hover:bg-slate-700 cursor-pointer disabled:opacity-50 transition"
          >
            <RotateCcw className="h-4 w-4" />
            Reset Defaults
          </button>

          <button
            type="button"
            onClick={handleSaveCatalog}
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-xl bg-[#B7D1EA] px-5 py-2.5 text-xs font-black text-[#0F172A] shadow-md transition hover:bg-[#99BFE3] active:scale-95 cursor-pointer disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
            {isPending ? "Saving..." : "Save Catalog Changes"}
          </button>
        </div>
      </div>

      {/* Summary Metrics & Controls Bar */}
      <div className="space-y-4 rounded-2xl border border-slate-800 bg-[#0F172A] p-4 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-3">
          {/* Category Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            {(["ALL", "SAFETY", "GRID_COMPLIANCE", "PROTECTION", "EV_READY", "CABLING", "BATTERY"] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={`rounded-xl px-3 py-1.5 text-xs font-extrabold transition-all cursor-pointer ${
                  activeCategory === cat
                    ? "bg-[#B7D1EA] text-[#0F172A] shadow-xs font-black"
                    : "bg-[#1E293B] text-slate-300 hover:bg-slate-700 border border-slate-800"
                }`}
              >
                {cat === "ALL" ? "All Categories" : cat.replace(/_/g, " ")}
              </button>
            ))}
          </div>

          {/* Visibility Status Filter Pills */}
          <div className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-[#0B1121] p-1">
            <button
              type="button"
              onClick={() => setVisibilityFilter("ALL")}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-extrabold transition cursor-pointer ${
                visibilityFilter === "ALL"
                  ? "bg-[#1E293B] text-white shadow-xs"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              All ({totalCount})
            </button>
            <button
              type="button"
              onClick={() => setVisibilityFilter("VISIBLE")}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-extrabold transition cursor-pointer ${
                visibilityFilter === "VISIBLE"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  : "text-slate-400 hover:text-emerald-400"
              }`}
            >
              <Eye className="h-3 w-3" /> Visible ({visibleCount})
            </button>
            <button
              type="button"
              onClick={() => setVisibilityFilter("HIDDEN")}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-extrabold transition cursor-pointer ${
                visibilityFilter === "HIDDEN"
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                  : "text-slate-400 hover:text-amber-400"
              }`}
            >
              <EyeOff className="h-3 w-3" /> Hidden ({hiddenCount})
            </button>
          </div>
        </div>

        {/* Search & Add Add-on Action */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search catalog by name or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-[#0B1121] py-2 pl-9 pr-3 text-xs font-bold text-white focus:border-[#B7D1EA] focus:outline-none transition"
            />
          </div>

          <button
            type="button"
            onClick={handleAddAddon}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#B7D1EA] px-4 py-2 text-xs font-black text-[#0F172A] shadow-xs hover:bg-[#99BFE3] cursor-pointer transition"
          >
            <Plus className="h-4 w-4" /> Add Add-on
          </button>
        </div>
      </div>

      {/* Add-ons Catalog List */}
      <div className="space-y-4">
        <AdminBulkActionBar
          selectedCount={addonSelection.selectedCount}
          visibleCount={filteredAddons.length}
          allVisibleSelected={addonSelection.allVisibleSelected}
          someVisibleSelected={addonSelection.someVisibleSelected}
          onToggleVisible={addonSelection.toggleVisible}
          onClear={addonSelection.clear}
          isPending={isPending}
          actions={[
            { id: "show", label: "Show selected", icon: Eye, tone: "success", onClick: () => handleBulkVisibility(true) },
            { id: "hide", label: "Hide selected", icon: EyeOff, tone: "warning", onClick: () => handleBulkVisibility(false) },
          ]}
        />
        {filteredAddons.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-[#0F172A] p-12 text-center text-slate-400 font-bold">
            No add-ons found matching the selected category or search filter.
          </div>
        ) : (
          filteredAddons.map((addon) => {
            const isExpanded = expandedAddonId === addon.id;
            const isVisible = addon.isVisible !== false;

            return (
              <div
                key={addon.id}
                className={`overflow-hidden rounded-2xl border transition-all ${
                  isVisible
                    ? "border-slate-800 bg-[#0F172A] shadow-md hover:border-slate-700"
                    : "border-slate-800/60 bg-[#0B1121]/80 opacity-85 shadow-xs hover:border-slate-700/80"
                }`}
              >
                {/* Header Card Bar */}
                <div
                  onClick={() => setExpandedAddonId(isExpanded ? null : addon.id)}
                  className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 bg-[#162032] p-4 sm:p-5 cursor-pointer hover:bg-[#1E293B]/80 transition"
                >
                  <div className="flex min-w-0 items-center gap-3.5">
                    <div onClick={(event) => event.stopPropagation()}>
                      <AdminSelectionCheckbox
                        checked={addonSelection.isSelected(addon.id)}
                        onChange={() => addonSelection.toggle(addon.id)}
                        label={`Select ${addon.name}`}
                      />
                    </div>
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-[#0B1121] text-[#B7D1EA] shadow-xs">
                      {addon.category === "SAFETY" && <ShieldCheck className="h-5 w-5" />}
                      {addon.category === "GRID_COMPLIANCE" && <Smartphone className="h-5 w-5" />}
                      {addon.category === "PROTECTION" && <Cpu className="h-5 w-5" />}
                      {addon.category === "EV_READY" && <Zap className="h-5 w-5" />}
                      {addon.category === "CABLING" && <Activity className="h-5 w-5" />}
                      {addon.category === "BATTERY" && <BatteryCharging className="h-5 w-5" />}
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-black text-[#B7D1EA]">{addon.id}</span>
                        <span className="rounded-full bg-[#0B1121] border border-slate-700 px-2.5 py-0.5 text-[10px] font-extrabold text-slate-300">
                          {addon.category}
                        </span>
                        {isVisible ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-black text-emerald-400">
                            <Eye className="h-3 w-3" /> Visible
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 text-[10px] font-black text-amber-400">
                            <EyeOff className="h-3 w-3" /> Hidden
                          </span>
                        )}
                        {addon.isRecommended && (
                          <span className="rounded-full bg-sky-500/10 border border-sky-500/30 px-2 py-0.5 text-[10px] font-black text-sky-400">
                            Recommended
                          </span>
                        )}
                      </div>
                      <h3 className="mt-1 text-base font-black text-white">{addon.name}</h3>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-black text-[#B7D1EA] mr-1">
                      {addon.inputType === "SELECT" && addon.optionsList && addon.optionsList.length > 0
                        ? `${addon.optionsList.length} Choices`
                        : formatThbPrice(addon.price ?? 0)}
                    </span>

                    {/* Quick Visibility Toggle Button */}
                    <button
                      type="button"
                      title={isVisible ? "Hide from customer catalog" : "Show in customer catalog"}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleUpdateAddon(addon.id, (item) => ({ ...item, isVisible: !isVisible }));
                      }}
                      className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-bold cursor-pointer transition ${
                        isVisible
                          ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/20"
                          : "bg-amber-500/10 text-amber-300 border border-amber-500/30 hover:bg-amber-500/20"
                      }`}
                    >
                      {isVisible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                      <span className="hidden sm:inline">{isVisible ? "Visible" : "Hidden"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveAddon(addon.id);
                      }}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-500/10 hover:text-rose-400 cursor-pointer transition"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>

                    <ChevronRight
                      className={`h-5 w-5 text-slate-400 transition-transform ${isExpanded ? "rotate-90 text-[#B7D1EA]" : ""}`}
                    />
                  </div>
                </div>

                {/* Expanded Details Form */}
                {isExpanded && (
                  <div className="p-6 space-y-6 bg-[#0F172A]">
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      <div>
                        <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Addon ID</label>
                        <input
                          type="text"
                          value={addon.id}
                          onChange={(e) =>
                            handleUpdateAddon(addon.id, (item) => ({ ...item, id: e.target.value }))
                          }
                          className="w-full rounded-xl border border-slate-700 bg-[#0B1121] p-2.5 text-xs font-mono font-bold text-white focus:border-[#B7D1EA] focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Addon Name</label>
                        <input
                          type="text"
                          value={addon.name}
                          onChange={(e) =>
                            handleUpdateAddon(addon.id, (item) => ({ ...item, name: e.target.value }))
                          }
                          className="w-full rounded-xl border border-slate-700 bg-[#0B1121] p-2.5 text-xs font-bold text-white focus:border-[#B7D1EA] focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Short Label</label>
                        <input
                          type="text"
                          value={addon.shortLabel}
                          onChange={(e) =>
                            handleUpdateAddon(addon.id, (item) => ({ ...item, shortLabel: e.target.value }))
                          }
                          className="w-full rounded-xl border border-slate-700 bg-[#0B1121] p-2.5 text-xs font-bold text-white focus:border-[#B7D1EA] focus:outline-none"
                        />
                      </div>

                      <PriceInputField
                        label="Base Price (THB)"
                        value={addon.price ?? 0}
                        onChange={(num) =>
                          handleUpdateAddon(addon.id, (item) => ({ ...item, price: num }))
                        }
                      />

                      <div>
                        <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Category</label>
                        <select
                          value={addon.category}
                          onChange={(e) =>
                            handleUpdateAddon(addon.id, (item) => ({
                              ...item,
                              category: e.target.value as SolarAddonConfig["category"],
                            }))
                          }
                          className="w-full rounded-xl border border-slate-700 bg-[#0B1121] p-2.5 text-xs font-bold text-white focus:border-[#B7D1EA] focus:outline-none"
                        >
                          <option value="SAFETY">SAFETY</option>
                          <option value="GRID_COMPLIANCE">GRID COMPLIANCE</option>
                          <option value="PROTECTION">PROTECTION</option>
                          <option value="EV_READY">EV READY</option>
                          <option value="CABLING">CABLING</option>
                          <option value="BATTERY">BATTERY</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Input Type</label>
                        <select
                          value={addon.inputType}
                          onChange={(e) =>
                            handleUpdateAddon(addon.id, (item) => ({
                              ...item,
                              inputType: e.target.value as SolarAddonConfig["inputType"],
                            }))
                          }
                          className="w-full rounded-xl border border-slate-700 bg-[#0B1121] p-2.5 text-xs font-bold text-white focus:border-[#B7D1EA] focus:outline-none"
                        >
                          <option value="TOGGLE">TOGGLE (On / Off Checkbox)</option>
                          <option value="SELECT">SELECT (Choice Option Dropdown)</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-12 items-center">
                      <div className="sm:col-span-6">
                        <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Description</label>
                        <textarea
                          rows={2}
                          value={addon.description}
                          onChange={(e) =>
                            handleUpdateAddon(addon.id, (item) => ({ ...item, description: e.target.value }))
                          }
                          className="w-full rounded-xl border border-slate-700 bg-[#0B1121] p-2.5 text-xs font-medium text-slate-200 focus:border-[#B7D1EA] focus:outline-none"
                        />
                      </div>

                      <div className="sm:col-span-3 pt-2">
                        <label className="flex items-center gap-2.5 text-xs font-extrabold text-white cursor-pointer rounded-xl border border-slate-800 bg-[#162032] p-3.5 hover:border-slate-700">
                          <input
                            type="checkbox"
                            checked={isVisible}
                            onChange={(e) =>
                              handleUpdateAddon(addon.id, (item) => ({ ...item, isVisible: e.target.checked }))
                            }
                            className="h-4 w-4 rounded border-slate-700 bg-[#0B1121] text-[#B7D1EA] focus:ring-slate-900"
                          />
                          <div className="flex items-center gap-1.5">
                            {isVisible ? <Eye className="h-4 w-4 text-emerald-400" /> : <EyeOff className="h-4 w-4 text-amber-400" />}
                            <span>Catalog Visibility</span>
                          </div>
                        </label>
                      </div>

                      <div className="sm:col-span-3 pt-2">
                        <label className="flex items-center gap-2.5 text-xs font-extrabold text-white cursor-pointer rounded-xl border border-slate-800 bg-[#162032] p-3.5 hover:border-slate-700">
                          <input
                            type="checkbox"
                            checked={addon.isRecommended}
                            onChange={(e) =>
                              handleUpdateAddon(addon.id, (item) => ({ ...item, isRecommended: e.target.checked }))
                            }
                            className="h-4 w-4 rounded border-slate-700 bg-[#0B1121] text-[#B7D1EA] focus:ring-slate-900"
                          />
                          <span>Mark Recommended</span>
                        </label>
                      </div>
                    </div>

                    {/* Sub-Option Choices Manager for SELECT items */}
                    {addon.inputType === "SELECT" && (
                      <div className="rounded-2xl border border-slate-800 bg-[#0B1121] p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-black uppercase text-[#B7D1EA] tracking-wider">
                            Sub-Option Choices & Sub-Pricing ({addon.optionsList?.length || 0})
                          </h4>
                          <button
                            type="button"
                            onClick={() => {
                              const currentList = addon.optionsList || [];
                              const newOptId = `opt-${Date.now().toString().slice(-4)}`;
                              handleUpdateAddon(addon.id, (item) => ({
                                ...item,
                                optionsList: [
                                  ...currentList,
                                  { id: newOptId, label: "New Choice", price: 15000, description: "Option choice description" },
                                ],
                              }));
                            }}
                            className="inline-flex items-center gap-1 text-xs font-bold text-[#B7D1EA] hover:underline cursor-pointer"
                          >
                            <Plus className="h-3.5 w-3.5" /> Add Choice Option
                          </button>
                        </div>

                        <div className="space-y-2">
                          {(addon.optionsList || []).map((opt, optIdx) => (
                            <div key={opt.id || optIdx} className="grid gap-3 sm:grid-cols-12 items-center bg-[#162032] p-3 rounded-xl border border-slate-800">
                              <div className="sm:col-span-2">
                                <span className="block text-[9px] font-black text-slate-400 mb-1">OPTION ID</span>
                                <input
                                  type="text"
                                  value={opt.id}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    handleUpdateAddon(addon.id, (item) => ({
                                      ...item,
                                      optionsList: (item.optionsList || []).map((o, idx) => (idx === optIdx ? { ...o, id: val } : o)),
                                    }));
                                  }}
                                  className="w-full rounded-lg border border-slate-700 bg-[#0B1121] px-2.5 py-1.5 text-xs font-mono font-bold text-white focus:outline-none"
                                />
                              </div>

                              <div className="sm:col-span-3">
                                <span className="block text-[9px] font-black text-slate-400 mb-1">OPTION LABEL</span>
                                <input
                                  type="text"
                                  value={opt.label}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    handleUpdateAddon(addon.id, (item) => ({
                                      ...item,
                                      optionsList: (item.optionsList || []).map((o, idx) => (idx === optIdx ? { ...o, label: val } : o)),
                                    }));
                                  }}
                                  className="w-full rounded-lg border border-slate-700 bg-[#0B1121] px-2.5 py-1.5 text-xs font-bold text-white focus:outline-none"
                                />
                              </div>

                              <div className="sm:col-span-2">
                                <span className="block text-[9px] font-black text-slate-400 mb-1">TYPE</span>
                                <select
                                  value={opt.type || "TOGGLE"}
                                  onChange={(e) => {
                                    const val = e.target.value as "TOGGLE" | "SELECT";
                                    handleUpdateAddon(addon.id, (item) => ({
                                      ...item,
                                      optionsList: (item.optionsList || []).map((o, idx) => (idx === optIdx ? { ...o, type: val } : o)),
                                    }));
                                  }}
                                  className="w-full rounded-lg border border-slate-700 bg-[#0B1121] px-2 py-1.5 text-xs font-bold text-white focus:outline-none"
                                >
                                  <option value="TOGGLE">TOGGLE</option>
                                  <option value="SELECT">SELECT</option>
                                </select>
                              </div>

                              <div className="sm:col-span-4">
                                <PriceInputField
                                  label="SUB-PRICE (THB)"
                                  value={opt.price}
                                  onChange={(num) => {
                                    handleUpdateAddon(addon.id, (item) => ({
                                      ...item,
                                      optionsList: (item.optionsList || []).map((o, idx) => (idx === optIdx ? { ...o, price: num } : o)),
                                    }));
                                  }}
                                />
                              </div>

                              <div className="sm:col-span-1 text-right pt-3 sm:pt-4">
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleUpdateAddon(addon.id, (item) => ({
                                      ...item,
                                      optionsList: (item.optionsList || []).filter((_, idx) => idx !== optIdx),
                                    }));
                                  }}
                                  className="text-rose-400 hover:text-rose-300 p-1.5 cursor-pointer"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
