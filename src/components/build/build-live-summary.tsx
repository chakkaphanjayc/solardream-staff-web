"use client";

import type { ReactNode } from "react";

import {
  ArrowRight,
  CheckCircle2,
  Layers,
  Sparkles,
  Sun,
  Zap,
} from "@/components/ui/icons";
import { Button } from "@/components/ui/button";

type BuildLiveSummaryProps = Readonly<{
  locale: string;
  title: string;
  description: string;
  systemSizeLabel: string;
  systemSize: ReactNode;
  priceLabel: string;
  price: ReactNode;
  savingsLabel: string;
  savings: ReactNode;
  profileLabel: string;
  profile: ReactNode;
  architectureLabel: string;
  architecture: ReactNode;
  addOnsLabel: string;
  addOns: ReactNode;
  addOnsTotalLabel: string;
  addOnsTotal: ReactNode;
  progressLabel: string;
  completedSteps: number;
  totalSteps: number;
  actionLabel: string;
  onAction: () => void;
  actionDisabled?: boolean;
}>;

/**
 * A compact live plan surface for the builder. It intentionally mirrors the
 * summary sidebar without owning any pricing or configuration state.
 */
export function BuildLiveSummary({
  locale,
  title,
  description,
  systemSizeLabel,
  systemSize,
  priceLabel,
  price,
  savingsLabel,
  savings,
  profileLabel,
  profile,
  architectureLabel,
  architecture,
  addOnsLabel,
  addOns,
  addOnsTotalLabel,
  addOnsTotal,
  progressLabel,
  completedSteps,
  totalSteps,
  actionLabel,
  onAction,
  actionDisabled = false,
}: BuildLiveSummaryProps) {
  const isThai = locale.toLowerCase().startsWith("th");
  const progress = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  return (
    <aside
      data-bagui="sidebar"
      aria-label={title}
      className="solar-build-live-sidebar flex min-h-0 flex-col overflow-hidden rounded-[24px] bg-[#E6E3DC] p-6 shadow-sm border border-transparent"
    >
      <header className="solar-build-live-header shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="solar-build-live-icon grid size-10 shrink-0 place-items-center rounded-[20px]">
              <Sun className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="solar-route-kicker">
                {isThai ? "แผนแบบสด" : "Live plan"}
              </p>
              <h2 className="mt-1 text-lg font-black leading-tight tracking-[-0.025em] text-[#1C1C1A]">
                {title}
              </h2>
            </div>
          </div>
          <span className="solar-build-live-badge shrink-0">
            <span className="size-1.5 rounded-full bg-[#388E3C]" aria-hidden="true" />
            {isThai ? "อัปเดตสด" : "Live"}
          </span>
        </div>
        <p className="mt-3 text-sm font-medium leading-6 text-[#4E4B44]">
          {description}
        </p>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
        <section className="solar-build-live-hero lg-panel" aria-label={priceLabel}>
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="solar-build-live-label">{systemSizeLabel}</p>
              <p className="mt-1 truncate text-3xl font-black tracking-[-0.045em] text-[#1C1C1A]">
                {systemSize}
              </p>
            </div>
            <div className="solar-build-live-sun-mark grid size-11 shrink-0 place-items-center rounded-full">
              <Layers className="size-5" aria-hidden="true" />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="solar-build-live-stat lg-metric-tile">
              <p className="solar-build-live-label">{priceLabel}</p>
              <p className="mt-1 truncate text-base font-black text-[#1C1C1A]">{price}</p>
            </div>
            <div className="solar-build-live-stat solar-build-live-stat--warm lg-metric-tile">
              <p className="solar-build-live-label">{savingsLabel}</p>
              <p className="mt-1 truncate text-base font-black text-[#1C1C1A]">{savings}</p>
            </div>
          </div>
        </section>

        <section className="solar-build-live-section lg-panel" aria-labelledby="build-live-profile">
          <div className="flex items-center justify-between gap-3">
            <h3 id="build-live-profile" className="solar-build-live-section-title">
              {profileLabel}
            </h3>
            <Sparkles className="size-4 text-[#4F7FA8]" aria-hidden="true" />
          </div>
          <dl className="mt-3 divide-y divide-[#D9E3E5]">
            <div className="flex items-center justify-between gap-3 py-2 first:pt-0">
              <dt className="solar-build-live-label">Solution</dt>
              <dd className="max-w-[62%] truncate text-right text-sm font-black text-[#1C1C1A]">{profile}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 py-2">
              <dt className="solar-build-live-label">{architectureLabel}</dt>
              <dd className="max-w-[62%] truncate text-right text-sm font-black text-[#1C1C1A]">{architecture}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 py-2 last:pb-0">
              <dt className="solar-build-live-label">{addOnsLabel}</dt>
              <dd className="text-right text-sm font-black text-[#1C1C1A]">{addOns}</dd>
            </div>
          </dl>
        </section>

        <section className="solar-build-live-section lg-panel" aria-label={addOnsTotalLabel}>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-[#388E3C]" aria-hidden="true" />
            <p className="solar-build-live-section-title">{addOnsTotalLabel}</p>
          </div>
          <p className="mt-2 text-xl font-black text-[#1C1C1A]">{addOnsTotal}</p>
          <p className="mt-1 text-xs font-medium leading-5 text-[#64748B]">
            {isThai
              ? "อุปกรณ์เสริมจะถูกรวมในการตรวจสอบแบบและใบเสนอราคาขั้นสุดท้าย"
              : "Selected additions are included for engineering review and the final quote."}
          </p>
        </section>

        <section className="solar-build-live-progress lg-panel" aria-label={progressLabel}>
          <div className="flex items-center justify-between gap-3">
            <p className="solar-build-live-label">{progressLabel}</p>
            <p className="text-xs font-black text-[#4F7FA8]">{progress}%</p>
          </div>
          <div
            className="mt-2 h-2 overflow-hidden rounded-full bg-[#D9E3E5]"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <span
              className="block h-full origin-left rounded-full bg-[#B7D1EA] transition-transform duration-500 ease-out"
              style={{ transform: `scaleX(${progress / 100})` }}
            />
          </div>
          <p className="mt-2 text-xs font-semibold text-[#64748B]">
            {completedSteps} / {totalSteps} {isThai ? "ขั้นตอนพร้อมแล้ว" : "steps ready"}
          </p>
        </section>
      </div>

      <footer className="solar-build-live-footer shrink-0">
        <Button
          type="button"
          data-bagui="button"
          size="lg"
          disabled={actionDisabled}
          onClick={onAction}
          className="wizard-ui-primary w-full justify-between rounded-full px-5 py-3.5 text-sm font-black"
        >
          <span className="inline-flex items-center gap-2">
            <Zap className="size-4" aria-hidden="true" />
            {actionLabel}
          </span>
          <ArrowRight className="size-4" aria-hidden="true" />
        </Button>
      </footer>
    </aside>
  );
}
