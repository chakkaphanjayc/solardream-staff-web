"use client";

import type { ReactNode } from "react";

import {
  Activity,
  Battery,
  Check,
  Cpu,
  Gauge,
  ShieldCheck,
  Smartphone,
  Zap,
} from "@/components/ui/icons";
import type { SolarAddonConfig } from "@/lib/solarAddonConfig";
import {
  getSelectedSolarAddon,
  getSolarAddonsForDisplay,
  getSolarAddonPrice,
  getSolarAddonRelatedIds,
  selectSolarAddonOption,
  toggleSolarAddonSelection,
} from "@/lib/solarAddonSelection";
import { cn, formatPrice as formatSolarPrice } from "@/lib/utils";

type SolarAddonsSelectorProps = {
  catalog: readonly SolarAddonConfig[];
  selectedIds: readonly string[];
  onSelectedIdsChange: (ids: string[]) => void;
  locale: string;
  formatPrice?: (amount: number) => string;
  className?: string;
  heading?: string;
  description?: string;
  showHeader?: boolean;
};

function AddonIcon({ addon }: { addon: SolarAddonConfig }): ReactNode {
  const id = addon.id.toLowerCase();

  if (addon.category === "BATTERY" || id.includes("battery")) {
    return <Battery className="h-5 w-5" aria-hidden="true" />;
  }
  if (addon.category === "EV_READY" || id.includes("ev")) {
    return <Zap className="h-5 w-5" aria-hidden="true" />;
  }
  if (addon.category === "GRID_COMPLIANCE" || id.includes("meter") || id.includes("export")) {
    return <Smartphone className="h-5 w-5" aria-hidden="true" />;
  }
  if (addon.category === "PROTECTION" || id.includes("combiner")) {
    return <Cpu className="h-5 w-5" aria-hidden="true" />;
  }
  if (addon.category === "CABLING" || id.includes("cable")) {
    return <Activity className="h-5 w-5" aria-hidden="true" />;
  }
  if (addon.category === "SAFETY" || id.includes("shutdown") || id.includes("rapid")) {
    return <ShieldCheck className="h-5 w-5" aria-hidden="true" />;
  }
  return <Gauge className="h-5 w-5" aria-hidden="true" />;
}

export default function SolarAddonsSelector({
  catalog,
  selectedIds,
  onSelectedIdsChange,
  locale,
  formatPrice = (amount) => formatSolarPrice(amount),
  className,
  heading,
  description,
  showHeader = true,
}: SolarAddonsSelectorProps) {
  const isThai = locale.toLowerCase().startsWith("th");
  const addons = getSolarAddonsForDisplay(catalog);
  const title = heading ?? (isThai ? "อุปกรณ์เสริมสำหรับระบบ" : "System add-ons");
  const helper = description ?? (isThai
    ? "เลือกอุปกรณ์เสริมที่ต้องการรวมไว้ในการประเมินราคา คุณสามารถเปลี่ยนตัวเลือกได้ภายหลัง"
    : "Choose optional equipment to include in the estimate. You can change these selections later.");

  return (
    <div className={cn("space-y-4", className)}>
      {showHeader ? (
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
          <div>
            <h2 className="text-xl font-bold tracking-[-0.02em] text-[#2E2C27] sm:text-2xl">
              {title}
            </h2>
            <p className="mt-1 max-w-2xl text-sm font-medium leading-6 text-[#4E4B44]">
              {helper}
            </p>
          </div>
          <span className="shrink-0 self-start rounded-full border border-[#CBC7BE] bg-[#DCE8F5] px-3.5 py-1 text-xs font-bold text-[#2E2C27] sm:self-auto">
            {selectedIds.length > 0
              ? (isThai ? `เลือกแล้ว ${selectedIds.length} รายการ` : `${selectedIds.length} selected`)
              : (isThai ? "เลือกได้ตามต้องการ" : "Optional")}
          </span>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {addons.map((addon) => {
          const selected = getSelectedSolarAddon(addon, selectedIds);
          const isSelected = Boolean(selected);
          const hasOptions = Boolean(addon.optionsList && addon.optionsList.length > 0);
          const price = selected ? getSolarAddonPrice(selected) : (hasOptions ? addon.optionsList?.[0]?.price ?? 0 : addon.price ?? 0);
          const relatedIds = getSolarAddonRelatedIds(addon);

          return (
            <div
              key={addon.id}
              data-addon-card={addon.id}
              className={cn(
                "rounded-[24px] border p-5 transition-[background-color,border-color,box-shadow,transform] duration-200",
                isSelected
                  ? "border-[#7CA8D0] bg-[#DCE8F5]/40 shadow-sm"
                  : "border-[#F7F6F3] bg-[#F0EEE9] hover:-translate-y-0.5 hover:border-[#7CA8D0] hover:shadow-md",
              )}
            >
              <button
                type="button"
                aria-pressed={isSelected}
                onClick={() => onSelectedIdsChange(toggleSolarAddonSelection(selectedIds, addon))}
                className="group flex min-h-36 w-full cursor-pointer flex-col justify-between text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#B7D1EA]/35"
              >
                <span className="flex items-start justify-between gap-3">
                  <span className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] transition-colors",
                    isSelected ? "bg-[#B7D1EA] text-white" : "bg-[#E6E3DC] text-[#2E2C27] group-hover:bg-[#DCE8F5]",
                  )}>
                    <AddonIcon addon={addon} />
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="rounded-full bg-[#DCE8F5] px-3 py-1 text-[11px] font-bold text-[#4F7FA8]">
                      {price > 0 ? `+ ${formatPrice(price)}` : (isThai ? "รวมในแพ็กเกจ" : "Included")}
                    </span>
                    {isSelected ? (
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#B7D1EA] text-white" aria-label={isThai ? "เลือกแล้ว" : "Selected"}>
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
                    ) : null}
                  </span>
                </span>

                <span className="mt-4 block">
                  <span className="block text-sm font-bold leading-5 text-[#2E2C27]">
                    {addon.shortLabel || addon.name}
                  </span>
                  <span className="mt-1.5 block text-xs font-medium leading-5 text-[#4E4B44]">
                    {addon.description}
                  </span>
                </span>
              </button>

              {isSelected && hasOptions && addon.optionsList ? (
                <div
                  role="group"
                  aria-label={isThai ? `เลือกสเปก ${addon.shortLabel || addon.name}` : `Select ${addon.shortLabel || addon.name} option`}
                  className="mt-3 flex flex-wrap gap-1.5 rounded-[16px] border border-[#F7F6F3] bg-[#E6E3DC] p-1.5"
                >
                  {addon.optionsList.map((option) => {
                    const optionSelected = selected?.option?.id === option.id || selectedIds.includes(`${addon.id}_${option.id}`);
                    return (
                      <button
                        key={option.id}
                        type="button"
                        aria-pressed={optionSelected}
                        onClick={() => onSelectedIdsChange(selectSolarAddonOption(selectedIds, addon, option.id))}
                        className={cn(
                          "min-h-9 flex-1 rounded-full px-3 py-1.5 text-[11px] font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA]",
                          optionSelected
                            ? "bg-[#B7D1EA] text-white shadow-sm"
                            : "text-[#4E4B44] hover:bg-[#DCE8F5] hover:text-[#2E2C27]",
                        )}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {isSelected && selected && !hasOptions && relatedIds.size === 1 ? (
                <span className="mt-3 block text-[11px] font-bold text-[#4F7FA8]">
                  {isThai ? "รวมในแบบประเมินแล้ว" : "Included in this estimate"}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
