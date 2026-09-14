"use client";

import { useEffect, useState, type ReactNode } from "react";
import { X, Zap } from "@/components/ui/icons";

interface WizardSummarySidebarProps {
  title: string;
  description: string;
  liveLabel: string;
  detailsLabel: string;
  closeDetailsLabel: string;
  systemSizeLabel: string;
  totalInvestmentLabel: string;
  monthlySavingsLabel: string;
  systemSize: ReactNode;
  totalPrice: ReactNode;
  monthlySavings: ReactNode;
  requestQuoteLabel: string;
  onRequestQuote: () => void;
  children: ReactNode;
}

export function WizardSummarySidebar({
  title,
  description,
  liveLabel,
  detailsLabel,
  closeDetailsLabel,
  systemSizeLabel,
  totalInvestmentLabel,
  monthlySavingsLabel,
  systemSize,
  totalPrice,
  monthlySavings,
  requestQuoteLabel,
  onRequestQuote,
  children,
}: WizardSummarySidebarProps) {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const syncViewport = () => setIsDesktop(mediaQuery.matches);

    syncViewport();
    mediaQuery.addEventListener("change", syncViewport);
    return () => mediaQuery.removeEventListener("change", syncViewport);
  }, []);

  useEffect(() => {
    if (!isMobileOpen || isDesktop) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsMobileOpen(false);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isDesktop, isMobileOpen]);

  const isPanelInteractive = isDesktop || isMobileOpen;
  const handleRequestQuote = () => {
    setIsMobileOpen(false);
    onRequestQuote();
  };

  const summaryMetrics = (
    <>
      <div className="solar-summary-sidebar-metric min-w-0 rounded-[18px] px-3 py-2 bg-[#E6E3DC] border border-[#F7F6F3]">
        <p className="truncate text-[8.5px] sm:text-[9px] font-bold uppercase leading-tight tracking-[0.06em] text-[#4E4B44]">
          {systemSizeLabel}
        </p>
        <p className="mt-0.5 sm:mt-1 truncate text-xs font-bold leading-tight text-[#2E2C27] sm:text-sm md:text-base">
          {systemSize}
        </p>
      </div>
      <div className="solar-summary-sidebar-metric min-w-0 rounded-[18px] px-3 py-2 bg-[#DCE8F5] border border-[#A5C2DE]/40">
        <p className="truncate text-[8.5px] sm:text-[9px] font-bold uppercase leading-tight tracking-[0.06em] text-[#4F7FA8]">
          {totalInvestmentLabel}
        </p>
        <p className="mt-0.5 sm:mt-1 truncate text-xs font-black leading-tight text-[#2E2C27] sm:text-sm md:text-base">
          {totalPrice}
        </p>
      </div>
      <div className="solar-summary-sidebar-metric min-w-0 rounded-[18px] px-3 py-2 bg-[#E6E3DC] border border-[#F7F6F3]">
        <p className="truncate text-[8.5px] sm:text-[9px] font-bold uppercase leading-tight tracking-[0.06em] text-[#4E4B44]">
          {monthlySavingsLabel}
        </p>
        <p className="mt-0.5 sm:mt-1 truncate text-xs font-bold leading-tight text-[#2E2C27] sm:text-sm md:text-base">
          {monthlySavings}
        </p>
      </div>
    </>
  );

  return (
    <>
      {isMobileOpen && !isDesktop ? (
        <button
          type="button"
          aria-label={closeDetailsLabel}
          onClick={() => setIsMobileOpen(false)}
          className="solar-summary-sidebar-backdrop fixed inset-0 z-[55] lg:hidden"
        />
      ) : null}

      <aside
        id="wizard-summary-details"
        data-bagui="sidebar"
        aria-label={title}
        aria-hidden={!isPanelInteractive}
        inert={!isPanelInteractive}
        className={`solar-summary-sidebar order-first fixed inset-x-0 bottom-0 z-[60] flex h-[min(88dvh,780px)] max-h-[88dvh] w-full min-w-0 flex-col overflow-hidden rounded-t-[28px] border-t border-[#F7F6F3] bg-[#F0EEE9] transition-transform duration-300 ease-[cubic-bezier(0.19,1,0.22,1)] shadow-2xl ${
          isMobileOpen
            ? "translate-y-0 pointer-events-auto"
            : "translate-y-full pointer-events-none"
        } lg:order-last lg:z-auto lg:sticky lg:top-[72px] lg:h-[calc(100dvh-72px)] lg:max-h-[calc(100dvh-72px)] lg:w-full lg:max-w-none lg:translate-y-0 lg:pointer-events-auto`}
      >
        <header className="solar-summary-sidebar-header sticky top-0 z-10 flex shrink-0 items-start justify-between gap-3 border-b border-[#F7F6F3] bg-[#F0EEE9] px-4 py-3.5 sm:px-6 sm:py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#4F7FA8]">
              {liveLabel}
            </p>
            <h2 className="font-serif mt-1 text-lg font-bold leading-tight text-[#2E2C27] sm:text-xl">
              {title}
            </h2>
            <p className="mt-1 text-sm font-medium leading-5 text-[#4E4B44]">
              {description}
            </p>
          </div>
          <div className="flex shrink-0 items-start gap-2">
            <span className="solar-summary-sidebar-live px-3 py-1 rounded-full bg-[#DCE8F5] text-[#2E2C27] text-[9px] font-bold uppercase tracking-wide">
              Live
            </span>
            <button
              type="button"
              onClick={() => setIsMobileOpen(false)}
              aria-label={closeDetailsLabel}
              className="solar-summary-sidebar-close inline-flex size-10 items-center justify-center rounded-full text-[#4E4B44] hover:bg-[#E6E3DC] hover:text-[#2E2C27] transition-colors sm:size-11 lg:hidden active:scale-95"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          {children}
        </div>

        <footer className="solar-summary-sidebar-footer sd-safe-pb-3-max sticky bottom-0 z-10 shrink-0 border-t border-[#F7F6F3] bg-[#F0EEE9] px-4 py-3 sm:px-6 sm:py-4">
          <div className="grid grid-cols-3 gap-2">
            {summaryMetrics}
          </div>
          <div className="mt-2.5 sm:mt-3">
            <button
              type="button"
              onClick={handleRequestQuote}
              className="wizard-ui-primary min-h-11 sm:min-h-12 w-full rounded-full bg-[#B7D1EA] hover:bg-[#A5C2DE] text-white px-4 py-3 text-xs font-bold uppercase tracking-wider sm:text-sm cursor-pointer active:scale-95 shadow-md flex items-center justify-center gap-2"
            >
              <Zap className="size-4 shrink-0 fill-current text-white" aria-hidden="true" />
              <span>{requestQuoteLabel}</span>
            </button>
          </div>
        </footer>
      </aside>

      <div className="solar-summary-mobile-bar sd-safe-pb-2-max fixed inset-x-0 bottom-0 z-50 border-t border-[#F7F6F3] bg-[#F0EEE9]/95 backdrop-blur-md px-3 pt-2 lg:hidden shadow-lg">
        <div className="mx-auto w-full max-w-7xl">
          <div className="grid grid-cols-3 gap-1.5">
            {summaryMetrics}
          </div>
          <div className="mt-2 grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-2">
            <button
              type="button"
              onClick={() => setIsMobileOpen(true)}
              aria-controls="wizard-summary-details"
              aria-expanded={isMobileOpen}
              className="solar-summary-mobile-details min-h-11 rounded-full px-3 py-2 text-xs font-bold leading-tight text-[#2E2C27] border border-[#CBC7BE] bg-[#F0EEE9] transition-all hover:bg-[#E6E3DC] active:scale-95 truncate"
            >
              {detailsLabel}
            </button>
            <button
              type="button"
              onClick={handleRequestQuote}
              className="wizard-ui-primary min-h-11 rounded-full bg-[#B7D1EA] hover:bg-[#A5C2DE] text-white px-3 py-2 text-xs font-bold leading-tight flex items-center justify-center gap-1.5 truncate cursor-pointer active:scale-95 shadow-md"
            >
              <Zap className="size-3.5 shrink-0 fill-current text-white" aria-hidden="true" />
              <span className="truncate">{requestQuoteLabel}</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
