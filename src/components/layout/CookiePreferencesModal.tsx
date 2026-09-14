"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ShieldCheck } from "@/components/ui/icons";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface CookiePreferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (preferences: {
    essential: boolean;
    analytics: boolean;
    marketing: boolean;
  }) => Promise<void>;
  initialPreferences?: {
    essential: boolean;
    analytics: boolean;
    marketing: boolean;
  };
  isSaving?: boolean;
}

export default function CookiePreferencesModal({
  isOpen,
  onClose,
  onSave,
  initialPreferences,
  isSaving = false,
}: CookiePreferencesModalProps) {
  const t = useTranslations("CookiePreferences");
  const [analytics, setAnalytics] = useState(
    initialPreferences?.analytics ?? false,
  );
  const [marketing, setMarketing] = useState(
    initialPreferences?.marketing ?? false,
  );

  const requestClose = () => {
    if (!isSaving) onClose();
  };

  const handleSave = async () => {
    await onSave({
      essential: true,
      analytics,
      marketing,
    });
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={requestClose}
      size="md"
      tone="light"
      ariaLabel={t("title")}
      closeLabel={t("close")}
    >
      <DialogContent className="bg-[#F0EEE9] rounded-[28px] border border-[#F7F6F3] shadow-2xl">
        <DialogHeader
          showClose={!isSaving}
          closeLabel={t("close")}
          className="items-center border-b border-[#F7F6F3] px-5 py-4 sm:px-6 sm:py-5"
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-[#CBC7BE] bg-[#DCE8F5] text-[#4F7FA8]">
              <ShieldCheck aria-hidden="true" className="size-5" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-sm font-bold text-[#2E2C27]">
                {t("title")}
              </DialogTitle>
              <DialogDescription className="mt-1 text-xs leading-5 text-[#4E4B44]">
                {t("subtitle")}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <DialogBody className="max-h-[52dvh] space-y-3.5 bg-[#F0EEE9] p-5 sm:max-h-[50dvh] sm:space-y-4 sm:p-6">
          <div className="flex min-h-20 items-start justify-between gap-4 rounded-[20px] border border-[#F7F6F3] bg-[#E6E3DC] p-4">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-[#2E2C27]">
                  {t("essentialTitle")}
                </span>
                <span className="rounded-full bg-[#DCE8F5] px-2 py-0.5 text-[10px] font-bold text-[#2E2C27]">
                  {t("required")}
                </span>
              </div>
              <p className="text-xs leading-relaxed text-[#4E4B44]">
                {t("essentialDescription")}
              </p>
            </div>
            <ConsentSwitch checked disabled label={t("essentialTitle")} />
          </div>

          <div className="flex min-h-20 items-start justify-between gap-4 rounded-[20px] border border-[#F7F6F3] bg-[#E6E3DC] p-4">
            <div className="min-w-0 space-y-1">
              <span className="text-xs font-bold text-[#2E2C27]">
                {t("analyticsTitle")}
              </span>
              <p className="text-xs leading-relaxed text-[#4E4B44]">
                {t("analyticsDescription")}
              </p>
            </div>
            <ConsentSwitch
              checked={analytics}
              disabled={isSaving}
              label={t("analyticsTitle")}
              onToggle={() => setAnalytics((current) => !current)}
            />
          </div>

          <div className="flex min-h-20 items-start justify-between gap-4 rounded-[20px] border border-[#F7F6F3] bg-[#E6E3DC] p-4">
            <div className="min-w-0 space-y-1">
              <span className="text-xs font-bold text-[#2E2C27]">
                {t("marketingTitle")}
              </span>
              <p className="text-xs leading-relaxed text-[#4E4B44]">
                {t("marketingDescription")}
              </p>
            </div>
            <ConsentSwitch
              checked={marketing}
              disabled={isSaving}
              label={t("marketingTitle")}
              onToggle={() => setMarketing((current) => !current)}
            />
          </div>
        </DialogBody>

        <DialogFooter className="flex-wrap justify-between gap-3 border-t border-[#F7F6F3] bg-[#E6E3DC] px-5 py-4 sm:px-6">
          <button
            type="button"
            onClick={() => {
              setAnalytics(false);
              setMarketing(false);
            }}
            disabled={isSaving}
            className="inline-flex min-h-11 items-center justify-center rounded-full px-4 text-xs font-bold text-[#4E4B44] transition-colors duration-150 hover:bg-[#DCE8F5] hover:text-[#2E2C27] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA] disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none active:scale-95"
          >
            {t("declineAll")}
          </button>

          <div className="flex flex-1 flex-wrap items-center justify-end gap-2 sm:flex-none">
            <button
              type="button"
              onClick={() => {
                setAnalytics(true);
                setMarketing(true);
                void onSave({
                  essential: true,
                  analytics: true,
                  marketing: true,
                });
              }}
              disabled={isSaving}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#CBC7BE] bg-[#F0EEE9] px-4 text-xs font-bold text-[#2E2C27] transition-colors duration-150 hover:bg-[#DCE8F5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA] disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none active:scale-95"
            >
              {t("acceptAll")}
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={isSaving}
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#B7D1EA] px-5 text-xs font-bold text-white shadow-sm transition-colors duration-150 hover:bg-[#A5C2DE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none active:scale-95"
            >
              {t("saveChoices")}
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConsentSwitch({
  checked,
  disabled,
  label,
  onToggle,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  onToggle?: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA] focus-visible:ring-offset-2 disabled:cursor-not-allowed motion-reduce:transition-none ${checked ? "bg-[#B7D1EA]" : "bg-[#F7F6F3] border-2 border-[#8E8B83]"}`}
    >
      <span
        aria-hidden="true"
        className={`size-5 rounded-full shadow-sm transition-transform duration-200 motion-reduce:transition-none ${checked ? "translate-x-7 bg-white" : "translate-x-1 bg-[#8E8B83]"}`}
      />
    </button>
  );
}
