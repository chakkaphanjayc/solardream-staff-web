"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2 } from "@/components/ui/icons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface ConfirmActionModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  intent?: "primary" | "destructive";
  isConfirming?: boolean;
}

export default function ConfirmActionModal({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onClose,
  onConfirm,
  intent = "primary",
  isConfirming = false,
}: ConfirmActionModalProps) {
  const t = useTranslations("ConfirmAction");
  const isDestructive = intent === "destructive";

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      tone="light"
      ariaLabel={title}
      closeLabel={t("close")}
    >
      <DialogContent className="rounded-[28px] border border-[#F7F6F3] bg-[#F0EEE9] shadow-2xl overflow-hidden">
        <DialogHeader
          closeLabel={t("close")}
          className="border-b border-[#F7F6F3] bg-[#F0EEE9] px-6 py-6"
        >
          <div className="flex min-w-0 items-start gap-4">
            <div
              className={cn(
                "flex size-11 shrink-0 items-center justify-center rounded-full border",
                isDestructive
                  ? "border-rose-200 bg-rose-50 text-rose-700"
                  : "border-[#CBC7BE] bg-[#DCE8F5] text-[#4F7FA8]",
              )}
            >
              {isDestructive ? (
                <AlertTriangle aria-hidden="true" className="size-5" />
              ) : (
                <CheckCircle2 aria-hidden="true" className="size-5" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#8E8B83]">
                {t("eyebrow")}
              </p>
              <DialogTitle className="mt-1.5 break-words text-lg font-bold text-[#2E2C27] [text-wrap:pretty]">
                {title}
              </DialogTitle>
              <DialogDescription className="mt-2 break-words text-sm leading-6 text-[#4E4B44] [text-wrap:pretty]">
                {message}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <DialogFooter className="flex-col-reverse gap-3 border-t border-[#F7F6F3] bg-[#E6E3DC] px-6 py-5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={isConfirming}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[#CBC7BE] bg-[#F0EEE9] px-5 text-sm font-bold text-[#2E2C27] transition-colors duration-150 hover:bg-[#DCE8F5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA] disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none sm:w-auto active:scale-95"
          >
            {cancelLabel ?? t("cancel")}
          </button>
          <button
            type="button"
            onClick={() => void onConfirm()}
            disabled={isConfirming}
            className={cn(
              "inline-flex min-h-11 w-full items-center justify-center rounded-full px-5 text-sm font-bold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none sm:w-auto active:scale-95 shadow-sm",
              isDestructive
                ? "bg-[#B3261E] text-white hover:bg-[#8C1D18] focus-visible:ring-[#B3261E]"
                : "bg-[#B7D1EA] text-white hover:bg-[#A5C2DE] focus-visible:ring-[#B7D1EA]",
            )}
          >
            {isConfirming ? t("working") : confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
