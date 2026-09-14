"use client";

import React, { useState, useEffect } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Layers,
  RefreshCw,
  Search,
  ShieldAlert,
  Sliders,
  Sparkles,
  Wrench,
} from "@/components/ui/icons";
import type { FeatureFlagItem } from "@/app/actions/featureFlags";
import { useFeatureFlagStore } from "@/store/useFeatureFlagStore";
import { cn } from "@/lib/utils";
import { AdminBulkActionBar } from "@/components/admin/AdminBulkActionBar";
import { AdminSelectionCheckbox } from "@/components/admin/AdminSelectionCheckbox";
import { useAdminSelection } from "@/hooks/useAdminSelection";
import { toast } from "sonner";

type Props = {
  initialFlags: FeatureFlagItem[];
};

export default function FeatureTogglesClient({ initialFlags }: Props) {
  const { setInitialFlags, flags, setFlag, fetchFlags } = useFeatureFlagStore();
  const [items, setItems] = useState<FeatureFlagItem[]>(initialFlags);
  const [searchQuery, setSearchQuery] = useState("");
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    setInitialFlags(initialFlags);
  }, [initialFlags, setInitialFlags]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await fetchFlags();
      const res = await fetch("/api/system/feature-flags", { cache: "no-store" });
      if (res.ok) {
        const data: unknown = await res.json();
        if (data && typeof data === "object" && "items" in data && Array.isArray(data.items)) {
          setItems(data.items);
        }
      }
    } catch (err) {
      console.error("Failed to refresh feature flags:", err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleToggle = async (key: string, currentActive: boolean) => {
    const nextState = !currentActive;
    setUpdatingKey(key);

    // Update local state state
    setItems((prev) =>
      prev.map((item) =>
        item.key === key ? { ...item, isActive: nextState, updatedAt: new Date() } : item
      )
    );

    // Sync to store and database
    try {
      await setFlag(key, nextState);
    } catch (err) {
      console.error(`Failed to update feature flag ${key}:`, err);
      // Revert on error
      setItems((prev) =>
        prev.map((item) => (item.key === key ? { ...item, isActive: currentActive } : item))
      );
    } finally {
      setUpdatingKey(null);
    }
  };

  // Filter items
  const filteredItems = items.filter(
    (item) =>
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );
  const selection = useAdminSelection(filteredItems.map((item) => item.key));

  const handleBulkToggle = (nextState: boolean) => {
    const selectedItems = filteredItems.filter((item) => selection.isSelected(item.key));
    if (selectedItems.length === 0) return;

    const selectedKeys = new Set(selectedItems.map((item) => item.key));
    const previousItems = new Map(selectedItems.map((item) => [item.key, item]));
    setItems((current) => current.map((item) => (
      selectedKeys.has(item.key) ? { ...item, isActive: nextState, updatedAt: new Date() } : item
    )));
    setUpdatingKey("bulk");
    void Promise.allSettled(selectedItems.map((item) => setFlag(item.key, nextState)))
      .then((results) => {
        const failedKeys = new Set(
          results.flatMap((result, index) => result.status === "rejected" ? [selectedItems[index]?.key] : []),
        );

        if (failedKeys.size > 0) {
          setItems((current) => current.map((item) => {
            const previous = previousItems.get(item.key);
            return failedKeys.has(item.key) && previous ? previous : item;
          }));
          toast.error(`${failedKeys.size} feature flag update(s) failed. No failed change was kept locally.`);
        } else {
          toast.success(`${selectedItems.length} feature flag(s) updated.`);
        }
        selection.clear();
      })
      .finally(() => setUpdatingKey(null));
  };

  const totalCount = items.length;
  const activeCount = items.filter((i) => flags[i.key] ?? i.isActive).length;
  const maintenanceCount = totalCount - activeCount;

  return (
    <div className="min-h-screen bg-[#0B1121] text-slate-100 p-6 md:p-10 font-sans space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#B7D1EA]/10 border border-[#B7D1EA]/30 rounded-xl text-[#B7D1EA]">
              <Sliders className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
                Feature Toggles & <span className="text-[#B7D1EA]">Maintenance Mode</span>
              </h1>
              <p className="text-xs uppercase tracking-widest font-mono text-slate-400 mt-1">
                Solar-Ops System Control Panel • Real-time Feature Flag Manager
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition-all disabled:opacity-50"
          >
            <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
            <span>Refresh State</span>
          </button>

          <div className="flex items-center gap-2 px-3 py-1.5 bg-[#0F172A] border border-slate-800 rounded-xl text-xs font-mono text-slate-400">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Live DB Syncing</span>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-[#0F172A] border border-slate-800/80 rounded-2xl p-5 flex items-center justify-between shadow-xl">
          <div className="space-y-1">
            <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">
              Total Modules
            </span>
            <div className="text-3xl font-black text-white">{totalCount}</div>
            <p className="text-[11px] text-slate-500">Registered feature keys</p>
          </div>
          <div className="p-3 bg-slate-800/50 rounded-xl text-slate-300">
            <Layers className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-[#0F172A] border border-emerald-950/60 rounded-2xl p-5 flex items-center justify-between shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-xl pointer-events-none" />
          <div className="space-y-1">
            <span className="text-xs font-mono text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Operational (Active)
            </span>
            <div className="text-3xl font-black text-emerald-400">{activeCount}</div>
            <p className="text-[11px] text-slate-500">Normal user access enabled</p>
          </div>
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
            <Activity className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-[#0F172A] border border-amber-950/60 rounded-2xl p-5 flex items-center justify-between shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-xl pointer-events-none" />
          <div className="space-y-1">
            <span className="text-xs font-mono text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
              <Wrench className="w-3.5 h-3.5" />
              Maintenance Mode
            </span>
            <div className="text-3xl font-black text-amber-400">{maintenanceCount}</div>
            <p className="text-[11px] text-slate-500">Rendering MaintenanceView UI</p>
          </div>
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Control Panel Toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-[#0F172A] border border-slate-800 rounded-2xl p-4 shadow-md">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search feature key, name, or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#0B1121] border border-slate-700/80 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#B7D1EA] transition-colors"
          />
        </div>

        <div className="text-xs text-slate-400 font-mono">
          Showing {filteredItems.length} of {totalCount} features
        </div>
      </div>

      {/* Feature Flag List */}
      <div className="space-y-4">
        <AdminBulkActionBar
          selectedCount={selection.selectedCount}
          visibleCount={filteredItems.length}
          allVisibleSelected={selection.allVisibleSelected}
          someVisibleSelected={selection.someVisibleSelected}
          onToggleVisible={selection.toggleVisible}
          onClear={selection.clear}
          isPending={updatingKey !== null}
          actions={[
            { id: "enable", label: "Enable selected", icon: CheckCircle2, tone: "success", onClick: () => handleBulkToggle(true) },
            { id: "disable", label: "Maintenance selected", icon: Wrench, tone: "warning", onClick: () => handleBulkToggle(false) },
          ]}
        />
        {filteredItems.length === 0 ? (
          <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-12 text-center space-y-3">
            <ShieldAlert className="w-10 h-10 text-slate-600 mx-auto" />
            <h3 className="text-lg font-bold text-slate-300">No feature flags found</h3>
            <p className="text-xs text-slate-500">Try adjusting your search filter.</p>
          </div>
        ) : (
          filteredItems.map((item) => {
            const isActive = flags[item.key] ?? item.isActive;
            const isUpdating = updatingKey === item.key;

            return (
              <div
                key={item.key}
                className={cn(
                  "bg-[#0F172A] border rounded-2xl p-6 transition-all duration-200 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-6",
                  isActive
                    ? "border-slate-800/80 hover:border-slate-700"
                    : "border-amber-900/40 bg-slate-900/40 hover:border-amber-700/60"
                )}
              >
                {/* Feature Info */}
                <div className="space-y-2 max-w-2xl">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <AdminSelectionCheckbox
                      checked={selection.isSelected(item.key)}
                      onChange={() => selection.toggle(item.key)}
                      label={`Select feature ${item.name}`}
                    />
                    <span className="font-mono text-xs font-bold text-[#B7D1EA] bg-[#B7D1EA]/10 border border-[#B7D1EA]/20 px-2.5 py-1 rounded-md">
                      {item.key}
                    </span>
                    <h3 className="text-lg font-bold text-white font-sans">{item.name}</h3>

                    {/* Status Pill */}
                    {isActive ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/50 px-2.5 py-0.5 rounded-full">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        ACTIVE
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold font-mono text-amber-400 bg-amber-950/60 border border-amber-800/50 px-2.5 py-0.5 rounded-full">
                        <Wrench className="w-3 h-3" />
                        MAINTENANCE
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-400 font-sans leading-relaxed">
                    {item.description || "No description provided."}
                  </p>

                  <div className="flex items-center gap-4 text-[11px] text-slate-500 font-mono pt-1">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Updated: {new Date(item.updatedAt).toLocaleString("th-TH")}
                    </span>
                  </div>
                </div>

                {/* Switch & Action */}
                <div className="flex items-center gap-4 self-end md:self-center shrink-0">
                  <div className="text-right hidden sm:block">
                    <span
                      className={cn(
                        "text-xs font-bold font-mono block",
                        isActive ? "text-emerald-400" : "text-amber-400"
                      )}
                    >
                      {isActive ? "ENABLED" : "DISABLED"}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {isActive ? "User access active" : "Shows MaintenanceView"}
                    </span>
                  </div>

                  {/* Toggle Switch */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isActive}
                    disabled={isUpdating}
                    onClick={() => handleToggle(item.key, isActive)}
                    className={cn(
                      "relative inline-flex h-8 w-16 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#B7D1EA] focus:ring-offset-2 focus:ring-offset-[#0B1121] disabled:opacity-50",
                      isActive ? "bg-emerald-500" : "bg-slate-700"
                    )}
                  >
                    <span className="sr-only">Toggle {item.name}</span>
                    <span
                      className={cn(
                        "pointer-events-none inline-block h-7 w-7 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out flex items-center justify-center text-slate-900 text-[10px] font-black",
                        isActive ? "translate-x-8" : "translate-x-0"
                      )}
                    >
                      {isUpdating ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-700" />
                      ) : isActive ? (
                        "ON"
                      ) : (
                        "OFF"
                      )}
                    </span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer / Instructions */}
      <div className="bg-[#0F172A]/60 border border-slate-800 rounded-2xl p-5 flex items-start gap-4 text-xs text-slate-400">
        <Sparkles className="w-5 h-5 text-[#B7D1EA] shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-slate-200">How Feature Flags work in SolarDream:</p>
          <p>
            When a flag is toggled to <strong className="text-amber-400 font-mono">DISABLED</strong>, any user page or component wrapped in <code className="text-[#B7D1EA] bg-slate-800 px-1.5 py-0.5 rounded">&lt;FeatureGuard featureKey=&quot;...&quot;&gt;</code> automatically replaces its UI with the standardized Construction Solia Maintenance Mode page. Toggle back to <strong className="text-emerald-400 font-mono">ENABLED</strong> to restore feature access instantly without redeploying.
          </p>
        </div>
      </div>
    </div>
  );
}
