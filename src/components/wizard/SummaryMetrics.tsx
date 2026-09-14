import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function CompactMetric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="solar-metric-card solar-summary-metric flex items-center justify-between gap-4 rounded-xl px-4 py-3">
      <p className="text-xs font-bold uppercase tracking-wider text-slate-700">{label}</p>
      <p className="text-xl font-black text-[#000000]">{value}</p>
    </div>
  );
}

export function BentoMetric({ label, value, compact = false }: { label: string; value: ReactNode; compact?: boolean }) {
  return (
    <div className={cn("solar-metric-card solar-summary-metric w-full min-w-0 rounded-xl", compact ? "p-2.5 sm:p-3" : "p-3 sm:p-4")}>
      <p className={cn("font-bold text-slate-700 uppercase tracking-wider truncate", compact ? "text-[9px] sm:text-[10px]" : "text-[10px] sm:text-xs")}>{label}</p>
      <p className={cn("font-black tracking-tight text-[#000000] truncate", compact ? "mt-0.5 text-sm sm:text-lg" : "mt-1 text-xl sm:text-2xl lg:text-3xl")}>{value}</p>
    </div>
  );
}

export function EnergyMetricCard({
  label,
  value,
  accent = false,
  warning = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
  warning?: boolean;
}) {
  return (
    <div
      className={cn(
        "solar-metric-card solar-summary-metric w-full min-w-0 rounded-xl p-3 sm:p-4 transition-[background-color,box-shadow,transform] duration-200 ease-expo",
        accent
          ? "solar-summary-metric--accent text-[#000000]"
          : warning
          ? "solar-summary-metric--warning text-[#000000]"
          : "solar-summary-metric--neutral text-[#000000]"
      )}
    >
      <p className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-700 truncate">{label}</p>
      <p className="mt-0.5 sm:mt-1 text-lg sm:text-2xl lg:text-3xl font-black tracking-tight text-[#000000] truncate">{value}</p>
    </div>
  );
}
