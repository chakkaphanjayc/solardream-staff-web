"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { saveConfiguration } from "@/app/actions/configurations";
import { GsapSpinner } from "@/components/ui/GsapMotion";
import {
  CheckCircle2,
  Save,
  ShoppingBag,
  Trash2,
} from "@/components/ui/icons";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn, formatPrice } from "@/lib/utils";
import { useUser } from "@/hooks/useUser";
import { useConfiguratorStore } from "@/store/useConfiguratorStore";

// The lead flow contains the interactive MapLibre installation picker. Keep
// that roughly 1 MB map dependency out of the shared shell until a customer
// explicitly opens the quote flow.
const LeadCaptureModal = dynamic(
  () => import("@/components/configurator/LeadCaptureModal"),
  { ssr: false },
);

export default function GlobalSummaryDrawer() {
  const t = useTranslations("ConfiguratorSidebar");
  const { user } = useUser();
  const {
    selectedComponents,
    totalPrice,
    removeComponent,
    reset,
    isMobileSummaryOpen,
    setMobileSummaryOpen,
  } = useConfiguratorStore();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);

  const selectedList = Object.entries(selectedComponents).filter(
    (entry) => entry[1] !== null,
  );
  const selectedCount = selectedList.length;

  const handleSave = async () => {
    if (!user) {
      toast.error(t("feedback.signIn"));
      return;
    }

    setSaving(true);
    const delay = setTimeout(() => {
      setSaved(true);
      setSaving(false);
      toast.success(t("feedback.saving"));
    }, 400);

    const componentIds = selectedList.map((entry) => entry[1]!.id);
    const result = await saveConfiguration(componentIds, totalPrice);
    clearTimeout(delay);

    if (result.success) {
      setSaved(true);
      toast.success(t("feedback.saved"));
      setTimeout(() => setSaved(false), 3000);
    } else {
      toast.error(result.error || t("feedback.saveFailed"));
      setSaved(false);
    }
    setSaving(false);
  };

  return (
    <>
      <Sheet
        isOpen={isMobileSummaryOpen}
        onClose={() => setMobileSummaryOpen(false)}
        tone="light"
        ariaLabel={t("summarySpec")}
        closeLabel={t("close")}
        className={cn(
          "sd-safe-pb-inset inset-x-0 inset-y-auto bottom-0 h-[92dvh] max-h-[92dvh] w-full max-w-none translate-x-0 translate-y-full rounded-t-[28px] border-t border-[#F7F6F3] bg-[#F0EEE9] shadow-2xl sm:max-w-none",
          "data-[state=open]:translate-x-0 data-[state=open]:translate-y-0",
          "data-[state=closed]:translate-x-0 data-[state=closed]:translate-y-full",
          "starting:data-[state=open]:translate-x-0 starting:data-[state=open]:translate-y-full",
          "md:h-[85dvh] md:max-h-[85dvh]",
        )}
      >
        <SheetContent>
          <div
            aria-hidden="true"
            className="solar-summary-drawer-grabber flex shrink-0 justify-center bg-[#F0EEE9] py-3"
          >
            <div className="h-1.5 w-12 rounded-full bg-[#8E8B83]/40" />
          </div>

          <SheetHeader className="border-b border-[#F7F6F3] bg-[#F0EEE9] px-4 pb-4 pt-1 sm:px-6">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <SheetTitle className="flex items-center gap-2 text-base font-black uppercase tracking-wider text-[#2E2C27]">
                  <ShoppingBag className="size-4 text-[#4F7FA8]" />
                  {t("summarySpec")}
                </SheetTitle>
                <SheetDescription className="sr-only">
                  {t("totalPrice")}: {formatPrice(totalPrice)}
                </SheetDescription>
              </div>
              <button
                type="button"
                onClick={() => {
                  reset();
                  setMobileSummaryOpen(false);
                }}
                aria-label={t("resetConfigurator")}
                title={t("resetConfigurator")}
                className="solar-summary-drawer-reset inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-[#CBC7BE] bg-[#F0EEE9] text-[#4E4B44] transition-all duration-150 hover:bg-[#E6E3DC] hover:text-[#2E2C27] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA] focus-visible:ring-offset-2 active:scale-95 shadow-sm"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          </SheetHeader>

          <SheetBody className="space-y-3 overscroll-contain bg-[#F0EEE9] px-4 py-5 sm:px-6">
            {selectedCount > 0 ? (
              selectedList.map(([categoryName, selected]) => {
                if (!selected) return null;
                return (
                  <div
                    key={categoryName}
                    className="solar-summary-drawer-item flex items-center justify-between gap-3 rounded-[20px] border border-[#F7F6F3] bg-[#E6E3DC] p-3 shadow-none sm:gap-4 sm:p-4"
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="text-[10px] font-black uppercase tracking-wider text-[#4F7FA8]">
                        {categoryName}
                      </p>
                      <p className="max-w-[170px] truncate text-xs font-bold uppercase text-[#2E2C27]">
                        {selected.name}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="whitespace-nowrap font-mono text-xs font-black text-[#2E2C27]">
                        {formatPrice(selected.price)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeComponent(categoryName)}
                        className="solar-summary-drawer-remove inline-flex size-9 items-center justify-center rounded-full border border-[#CBC7BE] bg-[#F0EEE9] text-[#8E8B83] transition-all duration-150 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 active:scale-95"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="rounded-[20px] border-2 border-dashed border-[#CBC7BE] bg-[#E6E3DC] py-16 text-center">
                <p className="text-xs font-semibold text-[#4E4B44]">
                  {t("emptySummary")}
                </p>
              </div>
            )}
          </SheetBody>

          <SheetFooter className="block space-y-4 border-t border-[#F7F6F3] bg-[#F0EEE9] px-4 py-4 sm:px-6 sm:py-6">
            <div className="flex items-end justify-between gap-3">
              <span className="text-xs font-bold uppercase tracking-wider text-[#4E4B44]">
                {t("totalPrice")}
              </span>
              <span className="text-xl font-black tracking-tight text-[#2E2C27] sm:text-2xl">
                {formatPrice(totalPrice)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => setMobileSummaryOpen(false)}
                className="solar-summary-drawer-secondary min-h-12 w-full rounded-full border border-[#CBC7BE] bg-[#E6E3DC] px-4 py-3 text-center text-xs font-black uppercase tracking-[0.12em] text-[#2E2C27] transition-all duration-150 hover:bg-[#DCE8F5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA] focus-visible:ring-offset-2 active:scale-95"
              >
                {t("close")}
              </button>
              <button
                type="button"
                onClick={() => setIsLeadModalOpen(true)}
                disabled={selectedCount === 0}
                className="solar-summary-drawer-primary min-h-12 w-full rounded-full bg-[#B7D1EA] px-4 py-3 text-center text-xs font-black uppercase tracking-[0.12em] text-white shadow-md transition-all duration-150 hover:bg-[#A5C2DE] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t("quote")}
              </button>
            </div>

            {user ? (
              <button
                type="button"
                onClick={handleSave}
                disabled={selectedCount === 0 || saving}
                className={cn(
                  "solar-summary-drawer-save flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-[#CBC7BE] px-4 py-3 text-xs font-black uppercase tracking-[0.12em] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 active:scale-95",
                  saved
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "bg-[#F0EEE9] text-[#2E2C27] hover:bg-[#E6E3DC]",
                )}
              >
                {saving ? (
                  <GsapSpinner className="size-4" />
                ) : saved ? (
                  <CheckCircle2 className="size-4" />
                ) : (
                  <Save className="size-4" />
                )}
                {saved ? t("savedConfiguration") : t("saveBuild")}
              </button>
            ) : null}
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {isLeadModalOpen ? (
        <LeadCaptureModal
          isOpen
          onClose={() => setIsLeadModalOpen(false)}
        />
      ) : null}
    </>
  );
}
