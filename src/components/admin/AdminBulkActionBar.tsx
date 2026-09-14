"use client";

import type { IconType } from "@/components/ui/icons";
import { X } from "@/components/ui/icons";
import { AdminSelectionCheckbox } from "@/components/admin/AdminSelectionCheckbox";

export type AdminBulkActionTone = "default" | "success" | "danger" | "warning";

export interface AdminBulkAction {
  id: string;
  label: string;
  icon?: IconType;
  tone?: AdminBulkActionTone;
  onClick: () => void;
  disabled?: boolean;
}

interface AdminBulkActionBarProps {
  selectedCount: number;
  visibleCount: number;
  allVisibleSelected: boolean;
  someVisibleSelected: boolean;
  onToggleVisible: (checked: boolean) => void;
  onClear: () => void;
  actions?: AdminBulkAction[];
  isPending?: boolean;
  className?: string;
}

const actionClasses: Record<AdminBulkActionTone, string> = {
  default: "border-[#334155] bg-[#0B1121] text-gray-300 hover:border-[#B7D1EA]/50 hover:text-[#B7D1EA]",
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20",
  danger: "border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20",
};

export function AdminBulkActionBar({
  selectedCount,
  visibleCount,
  allVisibleSelected,
  someVisibleSelected,
  onToggleVisible,
  onClear,
  actions = [],
  isPending = false,
  className = "",
}: AdminBulkActionBarProps) {
  return (
    <div
      role="toolbar"
      aria-label="Bulk list actions"
      className={`flex flex-col gap-3 rounded-xl border border-[#1E293B] bg-[#0F172A] px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${className}`}
    >
      <div className="flex items-center gap-3">
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-3 text-xs font-bold text-gray-300">
          <AdminSelectionCheckbox
            checked={allVisibleSelected}
            indeterminate={someVisibleSelected}
            disabled={visibleCount === 0 || isPending}
            label={allVisibleSelected ? "Deselect all visible rows" : "Select all visible rows"}
            onChange={onToggleVisible}
          />
          <span>
            {selectedCount > 0 ? `${selectedCount} selected` : "Select visible"}
            <span className="ml-1 text-gray-500">({visibleCount})</span>
          </span>
        </label>

        {selectedCount > 0 && (
          <button
            type="button"
            onClick={onClear}
            disabled={isPending}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs font-bold text-gray-500 transition hover:text-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </button>
        )}
      </div>

      {selectedCount > 0 && actions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {actions.map((action) => {
            const Icon = action.icon;
            const tone = action.tone ?? "default";
            return (
              <button
                key={action.id}
                type="button"
                onClick={action.onClick}
                disabled={isPending || action.disabled}
                className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-[11px] font-black uppercase tracking-wide transition disabled:cursor-not-allowed disabled:opacity-40 ${actionClasses[tone]}`}
              >
                {Icon && <Icon className="h-3.5 w-3.5" />}
                {action.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
