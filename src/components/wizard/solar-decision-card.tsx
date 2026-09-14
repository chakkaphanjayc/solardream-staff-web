import type { ReactNode } from "react";

import {
  ArrowRight,
  CheckCircle2,
  ShieldCheck,
  SlidersHorizontal,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";

export type SolarDecisionMetric = {
  label: string;
  value: ReactNode;
  detail?: string;
  tone?: "accent" | "warm" | "plain";
};

type SolarDecisionCardProps = {
  eyebrow: string;
  title: string;
  description: string;
  statusLabel: string;
  priceLabel: string;
  price: ReactNode;
  metrics: SolarDecisionMetric[];
  includedLabel: string;
  includedItems: string[];
  primaryLabel: string;
  secondaryLabel: string;
  note: string;
  onPrimary: () => void;
  onSecondary: () => void;
};

/**
 * BagUI-inspired decision surface for the first summary-page decision.
 * It keeps the recommendation, proof points, and next action together so a
 * customer does not need to understand the simulator before they can act.
 */
export function SolarDecisionCard({
  eyebrow,
  title,
  description,
  statusLabel,
  priceLabel,
  price,
  metrics,
  includedLabel,
  includedItems,
  primaryLabel,
  secondaryLabel,
  note,
  onPrimary,
  onSecondary,
}: SolarDecisionCardProps) {
  return (
    <section
      data-bagui="pricing-card"
      data-solar-decision
      aria-labelledby="solar-decision-title"
      className="solar-decision-card overflow-hidden rounded-[28px] border border-[#F7F6F3] bg-[#F0EEE9] shadow-sm"
    >
      <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(13rem,18rem)] lg:gap-8 lg:p-7">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#DCE8F5] px-3.5 py-1 text-[0.68rem] font-black uppercase tracking-[0.12em] text-[#2E2C27]">
              <CheckCircle2 className="size-3.5 text-[#4F7FA8]" aria-hidden="true" />
              {eyebrow}
            </span>
            <span className="inline-flex items-center gap-1.5 text-[0.68rem] font-bold text-[#4E4B44]">
              <ShieldCheck
                className="size-3.5 text-[#4F7FA8]"
                aria-hidden="true"
              />
              {statusLabel}
            </span>
          </div>

          <h2
            id="solar-decision-title"
            className="mt-4 max-w-[22ch] text-2xl font-black leading-[1.05] tracking-[-0.04em] text-[#2E2C27] sm:text-3xl"
          >
            {title}
          </h2>
          <p className="mt-3 max-w-[62ch] text-sm font-medium leading-6 text-[#4E4B44] sm:text-[0.95rem]">
            {description}
          </p>

          <div className="mt-5 flex flex-wrap items-start gap-x-8 gap-y-2">
            <div>
              <p className="text-[0.68rem] font-black uppercase tracking-[0.12em] text-[#4F7FA8]">
                {priceLabel}
              </p>
              <p className="mt-1 text-2xl font-black leading-none tracking-[-0.035em] text-[#2E2C27] sm:text-3xl">
                {price}
              </p>
            </div>
            <div className="max-w-[28rem] border-l border-[#F7F6F3] pl-4 text-xs font-semibold leading-5 text-[#4E4B44]">
              <p className="font-bold text-[#2E2C27]">{includedLabel}</p>
              <ul className="mt-1.5 grid gap-x-4 gap-y-1 sm:grid-cols-2">
                {includedItems.map((item) => (
                  <li key={item} className="flex items-start gap-1.5">
                    <CheckCircle2
                      className="mt-0.5 size-3.5 shrink-0 text-[#4F7FA8]"
                      aria-hidden="true"
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-col justify-between gap-4 rounded-[20px] bg-[#E6E3DC] p-4 sm:p-5">
          <div className="grid gap-2" aria-live="polite" aria-atomic="true">
            {metrics.slice(0, 3).map((metric) => (
              <div
                key={metric.label}
                className={cn(
                  "rounded-[16px] px-3 py-2.5",
                  metric.tone === "accent"
                    ? "bg-[#DCE8F5] text-[#2E2C27]"
                    : metric.tone === "warm"
                      ? "bg-[#D5DFD7] text-[#31111D]"
                      : "bg-[#F0EEE9] text-[#2E2C27] border border-[#F7F6F3]",
                )}
              >
                <p className="text-[0.65rem] font-black uppercase tracking-[0.1em] text-[#4E4B44]">
                  {metric.label}
                </p>
                <p className="mt-1 text-xl font-black leading-none tracking-[-0.025em] text-[#2E2C27]">
                  {metric.value}
                </p>
                {metric.detail ? (
                  <p className="mt-1 text-[0.68rem] font-semibold leading-4 text-[#4E4B44]">
                    {metric.detail}
                  </p>
                ) : null}
              </div>
            ))}
          </div>

          <div className="grid gap-2">
            <button
              type="button"
              onClick={onPrimary}
              className="wizard-ui-primary min-h-12 w-full px-4 py-3 text-sm rounded-full bg-[#B7D1EA] hover:bg-[#A5C2DE] text-white font-bold flex items-center justify-center gap-2 active:scale-95 shadow-md"
            >
              <span>{primaryLabel}</span>
              <ArrowRight className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onSecondary}
              className="wizard-ui-secondary min-h-11 w-full px-4 py-2.5 text-xs rounded-full border border-[#CBC7BE] bg-[#F0EEE9] hover:bg-[#DCE8F5] text-[#2E2C27] font-bold flex items-center justify-center gap-2 active:scale-95"
            >
              <SlidersHorizontal className="size-4 text-[#4F7FA8]" aria-hidden="true" />
              <span>{secondaryLabel}</span>
            </button>
          </div>
        </div>
      </div>

      <p className="border-t border-[#F7F6F3] bg-[#E6E3DC] px-5 py-3 text-xs font-semibold leading-5 text-[#4E4B44] sm:px-7">
        {note}
      </p>
    </section>
  );
}
