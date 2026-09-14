"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle } from "@/components/ui/icons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ConfirmDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message?: string;
  isDeleting?: boolean;
}

export default function ConfirmDeleteModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  isDeleting = false,
}: ConfirmDeleteModalProps) {
  const t = useTranslations("ConfirmDelete");
  const dialogTitle = title ?? t("title");
  const dialogMessage = message ?? t("message");

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      tone="light"
      ariaLabel={dialogTitle}
      closeLabel={t("cancel")}
    >
      <DialogContent>
        <DialogHeader
          closeLabel={t("cancel")}
          className="border-b border-slate-200 bg-white px-6 py-6"
        >
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-700">
              <AlertTriangle aria-hidden="true" className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="break-words text-lg font-bold text-slate-950 [text-wrap:pretty]">
                {dialogTitle}
              </DialogTitle>
              <DialogDescription className="mt-2 break-words text-sm leading-6 text-slate-600 [text-wrap:pretty]">
                {dialogMessage}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <DialogFooter className="flex-col-reverse gap-3 bg-[#F0EEE9] px-6 py-5 sm:flex-row sm:items-center sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F7FA8] disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none sm:w-auto"
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-rose-600 px-5 text-sm font-bold text-white transition-colors duration-150 hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-700 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none sm:w-auto"
          >
            {isDeleting ? t("deleting") : t("confirm")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
