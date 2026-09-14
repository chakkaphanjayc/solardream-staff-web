"use client";

import Link from "next/link";
import { useState } from "react";
import { ExternalLink, PenTool, ShieldCheck } from "@/components/ui/icons";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import type { ClientProposal } from "@/types/proposals";
import SignaturePad from "@/components/CustomerPortal/SignaturePad";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trackProductEvent } from "@/lib/productAnalytics";

interface ProposalSignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  proposal: ClientProposal;
  customerName: string;
  onSignComplete: (payload?: { status?: string; signed_pdf_url?: string }) => void;
}

export function ProposalSignatureModal({
  isOpen,
  onClose,
  proposal,
  customerName,
  onSignComplete,
}: ProposalSignatureModalProps) {
  const t = useTranslations("ProposalSignatureModal");
  const locale = useLocale();
  const [signerName, setSignerName] = useState(customerName);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const requestClose = () => {
    if (!isSubmitting) onClose();
  };

  const handleSubmitSignature = async (signatureDataUrl: string) => {
    if (!signerName.trim()) {
      toast.error(t("enterName"));
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/quotations/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quotation_id: proposal.erpnextQuotationId || proposal.id,
          signer_name: signerName,
          signature: signatureDataUrl,
        }),
      });

      const data = await res.json() as { error?: string; status?: string; signed_pdf_url?: string };
      if (!res.ok) {
        throw new Error(data.error || t("submitFailed"));
      }

      void trackProductEvent("proposal_signed", {
        proposal_type: proposal.requestType || "installation",
        signature_method: "digital_pad",
        proposal_status: data.status || "signed",
      });
      toast.success(t("success"));
      onSignComplete({ status: data.status, signed_pdf_url: data.signed_pdf_url });
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("signFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={requestClose}
      size="md"
      tone="light"
      ariaLabel={t("title")}
      closeLabel={t("close")}
      className="max-w-2xl"
    >
      <DialogContent className="overflow-hidden rounded-[28px] border border-[#8E8B83]/20 bg-[#F0EEE9] shadow-xl">
        <DialogHeader
          showClose={!isSubmitting}
          className="border-b border-[#8E8B83]/15 bg-[#F0EEE9] px-6 py-5"
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[#DCE8F5] text-[#4F7FA8]">
              <PenTool aria-hidden="true" className="size-5" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-lg font-bold text-[#1C1C1A]">{t("title")}</DialogTitle>
              <DialogDescription className="mt-1 text-xs font-medium text-[#4E4B44]">
                Ref: {proposal.erpnextQuotationId || `SD-QT-${proposal.id.slice(0, 8).toUpperCase()}`}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <DialogBody className="bg-[#F0EEE9] px-6 py-5">
          <div className="space-y-5">
          <div>
            <label htmlFor="proposal-signer-name" className="mb-1 block text-xs font-medium text-[#1C1C1A]">
              {t("signerName")}
            </label>
            <input
              id="proposal-signer-name"
              type="text"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder={t("namePlaceholder")}
              className="w-full rounded-t-xl rounded-b-none border-b-2 border-[#8E8B83] bg-[#F7F6F3] px-4 py-3 text-sm font-medium text-[#1C1C1A] outline-none transition placeholder:text-[#4E4B44]/50 focus:border-[#7CA8D0] focus:bg-[#F0EEE9] focus:ring-0"
              required
            />
          </div>

          <div>
            <div className="mb-1">
              <label className="block text-xs font-medium text-[#1C1C1A]">
                {t("digitalSignature")}
              </label>
            </div>
            <SignaturePad onConfirm={handleSubmitSignature} disabled={isSubmitting} isSubmitting={isSubmitting} />
          </div>

          <div className="flex items-start gap-2 rounded-2xl border border-amber-200/80 bg-amber-50/70 p-3.5 text-xs font-medium leading-5 text-amber-950">
            <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <span>
              {t("notice")}
            </span>
          </div>

          <div className="border-t border-[#8E8B83]/15 pt-4">
            <p className="text-xs leading-5 text-[#4E4B44]">{t("legalIntro")}</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
              <Link href={`/${locale}/verify-document`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-[#4F7FA8] underline underline-offset-4 hover:text-[#1C1C1A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA] focus-visible:ring-offset-2">
                {t("signatureSecurity")} <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
              <Link href={`/${locale}/legal/privacy-policy`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-[#4F7FA8] underline underline-offset-4 hover:text-[#1C1C1A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA] focus-visible:ring-offset-2">
                {t("privacyPolicy")} <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
              <Link href={`/${locale}/legal/terms-of-service`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-[#4F7FA8] underline underline-offset-4 hover:text-[#1C1C1A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA] focus-visible:ring-offset-2">
                {t("termsOfService")} <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
          </div>

          </div>
        </DialogBody>

        <DialogFooter className="border-t border-[#8E8B83]/15 bg-[#E6E3DC] px-6 py-4">
          <button
            type="button"
            onClick={requestClose}
            disabled={isSubmitting}
            className="inline-flex min-h-11 items-center justify-center rounded-full px-5 py-2.5 text-xs font-medium text-[#4E4B44] transition-all duration-300 hover:bg-[#A5C2DE]/10 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA] focus-visible:ring-offset-2"
          >
            {t("cancel")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
