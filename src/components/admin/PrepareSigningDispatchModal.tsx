"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  FileCheck,
  FileText,
  Globe,
  LoaderCircle,
  Lock,
  MessageSquare,
  Send,
  ShieldCheck,
  User,
  X,
} from "@/components/ui/icons";

export type DispatchConfig = {
  expiresInDays: number;
  locale: "th" | "en";
  requireIdUpload: boolean;
  requireDeposit: boolean;
  customNote: string;
};

type PrepareSigningDispatchModalProps = {
  isOpen: boolean;
  onClose: () => void;
  quotationNumber: string;
  version?: number;
  customerName: string;
  customerEmail?: string;
  totalPrice?: number;
  initialConfig?: Partial<DispatchConfig>;
  onConfirmDispatch: (config: DispatchConfig) => Promise<void>;
  isSubmitting?: boolean;
};

const EXPIRATION_OPTIONS = [
  { days: 7, label: "7 Days", hint: "Short urgency window" },
  { days: 14, label: "14 Days", hint: "Recommended default", isDefault: true },
  { days: 30, label: "30 Days", hint: "Standard business timeline" },
  { days: 60, label: "60 Days", hint: "Extended evaluation period" },
];

function formatCurrency(amount?: number) {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return "฿ 0.00";
  return new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB" }).format(amount);
}

function calculateExpiryDate(days: number): string {
  const target = new Date();
  target.setDate(target.getDate() + days);
  return target.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function PrepareSigningDispatchModal({
  isOpen,
  onClose,
  quotationNumber,
  version = 1,
  customerName,
  customerEmail,
  totalPrice,
  initialConfig,
  onConfirmDispatch,
  isSubmitting = false,
}: PrepareSigningDispatchModalProps) {
  const [expiresInDays, setExpiresInDays] = useState(initialConfig?.expiresInDays ?? 14);
  const [locale, setLocale] = useState<"th" | "en">(initialConfig?.locale ?? "th");
  const [requireIdUpload, setRequireIdUpload] = useState(initialConfig?.requireIdUpload ?? false);
  const [requireDeposit, setRequireDeposit] = useState(initialConfig?.requireDeposit ?? false);
  const [customNote, setCustomNote] = useState(initialConfig?.customNote ?? "");

  useEffect(() => {
    if (isOpen) {
      setExpiresInDays(initialConfig?.expiresInDays ?? 14);
      setLocale(initialConfig?.locale ?? "th");
      setRequireIdUpload(initialConfig?.requireIdUpload ?? false);
      setRequireDeposit(initialConfig?.requireDeposit ?? false);
      setCustomNote(initialConfig?.customNote ?? "");
    }
  }, [isOpen, initialConfig]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onConfirmDispatch({
      expiresInDays,
      locale,
      requireIdUpload,
      requireDeposit,
      customNote: customNote.trim(),
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-700 bg-[#0F172A] text-white shadow-2xl animate-in zoom-in-95 duration-200">
        {/* Top Header */}
        <div className="flex items-start justify-between border-b border-slate-800 bg-[#0B1121] px-6 py-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#B7D1EA]/20 text-[#B7D1EA]">
                <Send className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-black text-white">Prepare & Configure Signing Dispatch</h2>
                <p className="text-xs font-semibold text-slate-400">
                  Set portal link rules and parameters before dispatching to customer
                </p>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Quotation & Customer Badge Banner */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 bg-slate-900/60 px-6 py-3 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 font-mono font-bold text-sky-400">
              <FileText className="h-3.5 w-3.5" />
              {quotationNumber || "Quotation"}
            </span>
            <span className="inline-flex items-center rounded-full bg-[#B7D1EA]/20 px-2.5 py-0.5 font-black text-[#B7D1EA]">
              Version {version}
            </span>
            <span className="inline-flex items-center gap-1 font-semibold text-slate-300">
              <User className="h-3.5 w-3.5 text-slate-400" />
              {customerName}
            </span>
          </div>
          {totalPrice ? (
            <span className="font-mono text-sm font-black text-emerald-400">
              {formatCurrency(totalPrice)}
            </span>
          ) : null}
        </div>

        {/* Form Body */}
        <form onSubmit={(e) => void handleSubmit(e)} className="max-h-[70dvh] overflow-y-auto p-6 space-y-6">
          {/* Section 1: Link Validity & Duration */}
          <div className="space-y-3">
            <label className="flex items-center justify-between text-xs font-bold text-slate-300">
              <span className="flex items-center gap-1.5 text-white font-extrabold">
                <Clock className="h-4 w-4 text-sky-400" />
                Portal Link Expiration Period
              </span>
              <span className="text-slate-400 font-normal">
                Valid until <strong className="text-emerald-400 font-bold">{calculateExpiryDate(expiresInDays)}</strong>
              </span>
            </label>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {EXPIRATION_OPTIONS.map((opt) => {
                const isSelected = expiresInDays === opt.days;
                return (
                  <button
                    key={opt.days}
                    type="button"
                    onClick={() => setExpiresInDays(opt.days)}
                    className={`flex flex-col items-center justify-center rounded-xl border p-3 text-center transition ${
                      isSelected
                        ? "border-[#B7D1EA] bg-[#B7D1EA]/20 text-white shadow-sm"
                        : "border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                    }`}
                  >
                    <span className="text-sm font-black">{opt.label}</span>
                    <span className="mt-0.5 text-[10px] opacity-80">{opt.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 2: Portal Preferred Language */}
          <div className="space-y-2.5">
            <label className="flex items-center gap-1.5 text-xs font-extrabold text-white">
              <Globe className="h-4 w-4 text-sky-400" />
              Customer Portal Interface Language
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setLocale("th")}
                className={`flex items-center justify-between rounded-xl border p-3.5 text-left transition ${
                  locale === "th"
                    ? "border-[#B7D1EA] bg-[#B7D1EA]/20 text-white"
                    : "border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-700"
                }`}
              >
                <div className="space-y-0.5">
                  <p className="text-sm font-black">Thai (ภาษาไทย)</p>
                  <p className="text-xs text-slate-400">Default for TH customers</p>
                </div>
                {locale === "th" ? <CheckCircle2 className="h-5 w-5 text-sky-400" /> : null}
              </button>
              <button
                type="button"
                onClick={() => setLocale("en")}
                className={`flex items-center justify-between rounded-xl border p-3.5 text-left transition ${
                  locale === "en"
                    ? "border-[#B7D1EA] bg-[#B7D1EA]/20 text-white"
                    : "border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-700"
                }`}
              >
                <div className="space-y-0.5">
                  <p className="text-sm font-black">English (EN)</p>
                  <p className="text-xs text-slate-400">For international clients</p>
                </div>
                {locale === "en" ? <CheckCircle2 className="h-5 w-5 text-sky-400" /> : null}
              </button>
            </div>
          </div>

          {/* Section 3: Customer Requirements & Verification Switches */}
          <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <p className="text-xs font-extrabold text-white flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              Customer Signing Requirements & Toggles
            </p>

            <label className="flex items-center justify-between gap-3 cursor-pointer rounded-lg p-2 hover:bg-slate-800/50 transition">
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-slate-200 block">Require Customer Identification Uploads</span>
                <span className="text-[11px] text-slate-400 block">
                  Mandates customer upload of National ID / House Registration before signing unlock
                </span>
              </div>
              <input
                type="checkbox"
                checked={requireIdUpload}
                onChange={(e) => setRequireIdUpload(e.target.checked)}
                className="h-5 w-5 rounded border-slate-700 bg-slate-950 text-sky-500 focus:ring-sky-500 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between gap-3 cursor-pointer rounded-lg p-2 hover:bg-slate-800/50 transition">
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-slate-200 block">Require Deposit Payment Confirmation</span>
                <span className="text-[11px] text-slate-400 block">
                  Prompts customer to submit deposit payment receipt upon document approval
                </span>
              </div>
              <input
                type="checkbox"
                checked={requireDeposit}
                onChange={(e) => setRequireDeposit(e.target.checked)}
                className="h-5 w-5 rounded border-slate-700 bg-slate-950 text-sky-500 focus:ring-sky-500 cursor-pointer"
              />
            </label>
          </div>

          {/* Section 4: Special Instructions / Note */}
          <div className="space-y-2">
            <label className="flex items-center gap-1.5 text-xs font-extrabold text-white">
              <MessageSquare className="h-4 w-4 text-sky-400" />
              Staff Instructions / Message to Customer (Optional)
            </label>
            <textarea
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
              rows={3}
              placeholder="e.g. Includes 10-year Tier-1 inverter warranty and complimentary site installation inspection."
              className="w-full rounded-xl border border-slate-700 bg-[#0B1121] p-3 text-xs text-white placeholder-slate-500 focus:border-[#B7D1EA] focus:outline-none"
            />
          </div>

          {/* Summary Preview */}
          <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs">
            <div className="flex items-center gap-2 text-emerald-300">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>
                Ready to generate customer magic link valid for <strong>{expiresInDays} days</strong>.
              </span>
            </div>
            <span className="font-mono font-bold text-emerald-400 uppercase tracking-wider text-[10px]">
              Ready
            </span>
          </div>

          {/* Modal Footer */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 px-5 text-xs font-bold text-slate-300 transition hover:bg-slate-800 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-100 px-6 text-xs font-black text-slate-950 transition hover:bg-white shadow-lg disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <LoaderCircle className="h-4 w-4 animate-spin text-slate-950" />
                  Generating Link & Dispatching…
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 text-slate-950" />
                  Confirm & Dispatch to Customer
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
