"use client";

import { useMemo } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Layers,
  MapPin,
  ShieldCheck,
  Sparkles,
  Sun,
  TrendingUp,
} from "@/components/ui/icons";
import AnimatedNumber from "@/components/ui/AnimatedNumber";
import { cn, formatPrice } from "@/lib/utils";
import type { ServiceLocation } from "@/components/services/ServiceLocationPicker";
import type { PricingTier, SupportedPhase } from "@/lib/pricing";

interface ContactDetailsExpandedProps {
  systemKwp: number;
  capacityLabel: string;
  pricingTier: PricingTier;
  electricalPhase: SupportedPhase;
  architectureId: "on-grid" | "hybrid";
  architectureTitle: string;
  selectedAddOnsCount: number;
  addOnTitles: string[];
  estimatedMonthlySavings: number;
  estimate: number | null;
  displayPrice: string;
  isContactPrice: boolean;
  roughPanelMin: number;
  roughPanelMax: number;
  siteLocation: ServiceLocation | null;
  locale: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

export default function ContactDetailsExpanded({
  systemKwp,
  capacityLabel,
  pricingTier,
  electricalPhase,
  architectureId,
  architectureTitle,
  selectedAddOnsCount,
  addOnTitles,
  estimatedMonthlySavings,
  estimate,
  displayPrice,
  isContactPrice,
  roughPanelMin,
  roughPanelMax,
  siteLocation,
  locale,
  isExpanded,
  onToggleExpand,
}: ContactDetailsExpandedProps) {
  const isTh = locale === "th";

  const annualEnergyYieldKwh = useMemo(
    () => Math.round(systemKwp * 1400),
    [systemKwp],
  );
  const annualSavings = useMemo(
    () => estimatedMonthlySavings * 12,
    [estimatedMonthlySavings],
  );
  const estimatedPaybackYears = useMemo(() => {
    if (!estimate || estimate <= 0 || annualSavings <= 0) return null;
    return (estimate / annualSavings).toFixed(1);
  }, [annualSavings, estimate]);
  const co2OffsetTons = useMemo(
    () => ((annualEnergyYieldKwh * 0.5) / 1000).toFixed(1),
    [annualEnergyYieldKwh],
  );
  const architectureMode =
    architectureId === "hybrid"
      ? isTh
        ? "ไฮบริด"
        : "Hybrid"
      : isTh
        ? "ออนกริด"
        : "On-grid";

  const metricCards = [
    {
      label: isTh ? "ผลิตไฟต่อปี" : "Annual Yield",
      value: annualEnergyYieldKwh.toLocaleString(),
      unit: "kWh",
      icon: <Sun className="h-4 w-4" />,
      tone: "solar-build-detail-metric--warm",
    },
    {
      label: isTh ? "ประหยัดต่อปี" : "Annual Savings",
      value: formatPrice(Math.round(annualSavings)),
      unit: "",
      icon: <TrendingUp className="h-4 w-4" />,
      tone: "solar-build-detail-metric--accent",
    },
    {
      label: isTh ? "คืนทุนโดยประมาณ" : "Payback Period",
      value: estimatedPaybackYears ? `~${estimatedPaybackYears}` : "Review",
      unit: estimatedPaybackYears ? (isTh ? "ปี" : "yrs") : "",
      icon: <ShieldCheck className="h-4 w-4" />,
      tone: "solar-build-detail-metric--neutral",
    },
  ];

  return (
    <section
      data-bagui="card"
      className="solar-build-breakdown solar-build-detail-card mt-4 overflow-hidden rounded-[20px] border border-[#8E8B83]/20 bg-[#E6E3DC]"
      aria-label={isTh ? "รายละเอียดระบบ" : "System breakdown"}
    >
      <button
        type="button"
        onClick={onToggleExpand}
        className="solar-build-detail-trigger flex min-h-16 w-full cursor-pointer items-center justify-between gap-3 p-3 text-left transition-[background-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA] sm:p-4"
        aria-expanded={isExpanded}
        aria-controls="build-system-breakdown"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="solar-build-detail-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#DCE8F5] text-[#2E2C27]">
            <Sparkles className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-xs font-bold uppercase tracking-[0.08em] text-[#1C1C1A]">
              {isTh ? "รายละเอียดระบบ" : "System Breakdown"}
            </span>
            <span className="mt-1 block truncate text-[11px] font-medium text-[#4E4B44]">
              {isTh
                ? `${capacityLabel} · ${pricingTier.toUpperCase()} · ${electricalPhase}-Phase`
                : `${capacityLabel} · ${pricingTier.toUpperCase()} tier · ${electricalPhase}-phase`}
            </span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-xs font-bold text-[#4F7FA8]">
          <span className="hidden sm:inline">
            {isExpanded ? (isTh ? "ย่อ" : "Hide") : isTh ? "ดูเพิ่ม" : "View"}
          </span>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </span>
      </button>

      {isExpanded ? (
        <div
          id="build-system-breakdown"
          className="solar-build-detail-body space-y-3 p-3 animate-in fade-in-50 duration-200 sm:p-4"
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {metricCards.map((metric) => (
              <div
                key={metric.label}
                className="solar-build-detail-metric min-w-0 rounded-2xl p-2.5 bg-[#DCE8F5]/40 border border-[#8E8B83]/10"
              >
                <div className="flex items-center gap-1.5 text-[#1C1C1A]">
                  {metric.icon}
                  <span className="truncate text-[9px] font-bold uppercase leading-3 tracking-[0.06em]">
                    {metric.label}
                  </span>
                </div>
                <p className="mt-2 truncate text-base font-bold leading-none text-[#1C1C1A] sm:text-lg">
                  {metric.value}{" "}
                  <span className="text-[10px] font-medium">{metric.unit}</span>
                </p>
              </div>
            ))}
          </div>

          <div className="solar-build-detail-panel rounded-2xl p-3 bg-[#F7F6F3]/40 border border-[#8E8B83]/10">
            <h3 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[#1C1C1A]">
              <Layers className="h-4 w-4 text-[#4F7FA8]" />
              {isTh ? "สรุปรายการอุปกรณ์" : "Equipment Summary"}
            </h3>
            <dl className="mt-2 grid grid-cols-1 gap-x-4 sm:grid-cols-2">
              <SummaryItem
                label={isTh ? "ขนาดระบบ" : "System capacity"}
                value={`${capacityLabel} (${systemKwp} kWp)`}
              />
              <SummaryItem
                label={isTh ? "ระดับแพ็กเกจ" : "Solution level"}
                value={`${pricingTier} profile`}
              />
              <SummaryItem
                label={isTh ? "ระบบไฟฟ้า" : "Electrical system"}
                value={`${electricalPhase}-phase`}
              />
              <SummaryItem
                label={isTh ? "อินเวอร์เตอร์" : "Inverter system"}
                value={`${architectureTitle} · ${architectureMode}`}
              />
              <SummaryItem
                label={isTh ? "จำนวนแผง" : "Estimated panels"}
                value={`${roughPanelMin}–${roughPanelMax}`}
              />
              <SummaryItem
                label="CO₂"
                value={`~${co2OffsetTons} ${isTh ? "ตัน/ปี" : "tons / yr"}`}
                valueClassName="text-[#4F7FA8]"
              />
            </dl>
          </div>

          <div className="solar-build-detail-savings flex items-center justify-between gap-3 rounded-full bg-[#DCE8F5]/40 border border-[#8E8B83]/10 px-4 py-2.5">
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#4E4B44]">
              {isTh ? "ประหยัดต่อเดือน" : "Monthly savings"}
            </span>
            <span className="text-sm font-bold text-[#1C1C1A]">
              <AnimatedNumber
                value={estimatedMonthlySavings}
                formatter={(amount) => formatPrice(Math.round(amount))}
              />
            </span>
          </div>

          {addOnTitles.length > 0 ? (
            <div className="solar-build-detail-panel rounded-2xl p-3 bg-[#F7F6F3]/40 border border-[#8E8B83]/10">
              <h3 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[#1C1C1A]">
                <CheckCircle2 className="h-4 w-4 text-[#4F7FA8]" />
                {isTh
                  ? `ออปชันเสริมที่เลือก (${selectedAddOnsCount})`
                  : `Selected add-ons (${selectedAddOnsCount})`}
              </h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {addOnTitles.map((title, index) => (
                  <span
                    key={`${title}-${index}`}
                    className="solar-build-detail-addon inline-flex max-w-full items-center rounded-full bg-[#DCE8F5] text-[#2E2C27] px-2.5 py-1 text-[10px] font-bold leading-4"
                  >
                    {title}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <div className="solar-build-detail-total flex items-center justify-between gap-3 pt-3 text-xs">
            <span className="font-bold text-[#4E4B44]">
              {isTh ? "งบประมาณเริ่มต้น" : "Starting budget"}
            </span>
            <span
              className={
                isContactPrice
                  ? "font-bold text-[#4F7FA8]"
                  : "font-bold text-[#1C1C1A]"
              }
            >
              {estimate !== null && !isContactPrice ? (
                <AnimatedNumber
                  value={estimate}
                  formatter={(amount) => formatPrice(Math.round(amount))}
                />
              ) : (
                displayPrice
              )}
            </span>
          </div>

          {siteLocation ? (
            <div className="solar-build-detail-location flex items-start gap-2.5 rounded-2xl p-3 text-xs bg-[#DCE8F5]/30 border border-[#8E8B83]/10">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#4F7FA8]" />
              <span className="min-w-0">
                <span className="block font-bold text-[#1C1C1A]">
                  {isTh
                    ? "ตำแหน่งติดตั้งที่ปักหมุด"
                    : "Pinned installation location"}
                </span>
                <span className="mt-0.5 block line-clamp-2 text-[11px] font-medium text-[#4E4B44]">
                  {siteLocation.displayName}
                </span>
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function SummaryItem({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="solar-build-detail-row flex min-w-0 items-start justify-between gap-3 py-2 last:border-b-0">
      <dt className="min-w-0 text-[10px] font-medium leading-4 text-[#4E4B44]">
        {label}
      </dt>
      <dd
        className={cn(
          "max-w-[58%] text-right text-[11px] font-bold leading-4 text-[#1C1C1A]",
          valueClassName,
        )}
      >
        {value}
      </dd>
    </div>
  );
}
