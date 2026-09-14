"use client";

import { ArrowRight, Clock3, PackageCheck } from "@/components/ui/icons";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GsapSpinner } from "@/components/ui/GsapMotion";

interface PaymentDecisionModalProps {
  isOpen: boolean;
  onProceedToPayment: () => void | Promise<void>;
  onClose: () => void;
  isProcessing?: boolean;
}

export default function PaymentDecisionModal({
  isOpen,
  onProceedToPayment,
  onClose,
  isProcessing = false,
}: PaymentDecisionModalProps) {
  const t = useTranslations("PaymentDecisionModal");

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      tone="light"
      ariaLabel={t("title")}
      dismissible={!isProcessing}
    >
      <DialogContent className="bg-[#F8FAFC]">
        <DialogHeader className="border-b border-slate-200 px-6 pb-5 pt-6">
          <div className="flex items-start gap-3 pr-2">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
              <PackageCheck className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <DialogTitle className="text-lg font-black leading-snug">
                {t("title")}
              </DialogTitle>
              <DialogDescription className="font-semibold">
                {t("description")}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <DialogBody className="px-6 py-5">
          <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
            <Clock3 className="h-5 w-5 shrink-0" aria-hidden="true" />
            <p className="text-xs font-bold leading-5">
              {t("stockLockNotice")}
            </p>
          </div>
        </DialogBody>

        <DialogFooter className="flex-col-reverse items-stretch gap-2 border-t border-slate-200 px-6 py-5 sm:flex-col-reverse">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="min-h-11 w-full rounded-xl px-4 py-3 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("payLater")}
          </button>
          <button
            type="button"
            onClick={onProceedToPayment}
            disabled={isProcessing}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#2C486A] px-4 py-3 text-center text-sm font-black text-white transition-colors hover:bg-[#203852] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2C486A] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isProcessing && (
              <GsapSpinner className="h-4 w-4" aria-hidden="true" />
            )}
            <span>{t("payNow")}</span>
            {!isProcessing && (
              <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
            )}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
