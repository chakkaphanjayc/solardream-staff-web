"use client";

import { useState, useTransition } from "react";
import { LockKeyhole, PencilLine } from "@/components/ui/icons";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { readJsonResponse } from "@/lib/readJsonResponse";
import { trackProductEvent } from "@/lib/productAnalytics";

type RevisionResponse = {
  success: boolean;
  error?: string;
  proposal?: {
    status: string;
    dispatchStatus?: string | null;
    updatedAt?: string;
  };
};

type ProposalRevisionRequestCardProps = {
  proposalId: string;
  magicTokenSlug?: string | null;
  paymentHasStarted: boolean;
  onRevisionRequested: (input: {
    status: string;
    dispatchStatus?: string | null;
    updatedAt?: string;
  }) => void;
};

export function ProposalRevisionRequestCard({
  proposalId,
  magicTokenSlug,
  paymentHasStarted,
  onRevisionRequested,
}: ProposalRevisionRequestCardProps) {
  const t = useTranslations("ProposalRevisionRequest");
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const requestClose = () => {
    if (!isPending) setIsOpen(false);
  };

  const submit = () => {
    const trimmedMessage = message.trim();
    if (trimmedMessage.length < 3) {
      toast.error(t("messageRequired"));
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch("/api/proposals/portal-revision-request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            proposalId,
            magicTokenSlug: magicTokenSlug || undefined,
            message: trimmedMessage,
          }),
        });
        const payload = await readJsonResponse<RevisionResponse>(response);
        if (!response.ok || !payload?.success || !payload.proposal) {
          throw new Error(payload?.error || t("submitFailed"));
        }

        void trackProductEvent("proposal_revision_requested", {
          surface: "proposal_portal",
          proposal_status: payload.proposal.status,
        });
        onRevisionRequested(payload.proposal);
        setIsOpen(false);
        setMessage("");
        toast.success(t("success"));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t("submitFailed"));
      }
    });
  };

  return (
    <section className="rounded-[28px] border border-[#8E8B83]/20 bg-[#E6E3DC] p-5 sm:p-6 shadow-sm transition-all duration-300">
      <div className="flex items-start gap-3">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
            paymentHasStarted
              ? "bg-[#F7F6F3] text-[#4E4B44]"
              : "bg-[#DCE8F5] text-[#2E2C27]"
          }`}
        >
          {paymentHasStarted ? (
            <LockKeyhole className="h-5 w-5" aria-hidden="true" />
          ) : (
            <PencilLine className="h-5 w-5 text-[#4F7FA8]" aria-hidden="true" />
          )}
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-[#1C1C1A]">{t("title")}</h2>
          <p className="mt-1 text-sm leading-6 text-[#4E4B44]">
            {paymentHasStarted ? t("paymentLockedDescription") : t("description")}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setIsOpen(true)}
        disabled={paymentHasStarted}
        className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-[#8E8B83]/30 bg-[#F0EEE9] px-5 text-sm font-medium text-[#4F7FA8] shadow-sm transition-all duration-300 hover:bg-[#A5C2DE]/10 hover:shadow-md active:scale-95 disabled:cursor-not-allowed disabled:border-transparent disabled:bg-[#F7F6F3] disabled:text-[#4E4B44]/50 disabled:shadow-none"
      >
        {paymentHasStarted ? (
          <LockKeyhole className="h-4 w-4" aria-hidden="true" />
        ) : (
          <PencilLine className="h-4 w-4" aria-hidden="true" />
        )}
        {paymentHasStarted ? t("paymentLockedAction") : t("action")}
      </button>

      <Dialog
        isOpen={isOpen}
        onClose={requestClose}
        size="md"
        tone="light"
        ariaLabel={t("modalTitle")}
        closeLabel={t("close")}
        className="max-w-xl"
      >
        <DialogContent className="overflow-hidden rounded-[28px] border border-[#8E8B83]/20 bg-[#F0EEE9] shadow-xl">
          <DialogHeader
            showClose={!isPending}
            className="border-b border-[#8E8B83]/15 bg-[#F0EEE9] px-6 py-5"
          >
            <div>
              <DialogTitle className="text-lg font-bold text-[#1C1C1A]">
                {t("modalTitle")}
              </DialogTitle>
              <DialogDescription className="mt-1 text-sm text-[#4E4B44]">
                {t("modalDescription")}
              </DialogDescription>
            </div>
          </DialogHeader>

          <DialogBody className="bg-[#F0EEE9] px-6 py-5">
            <label
              htmlFor="revision-message"
              className="block text-sm font-medium text-[#1C1C1A]"
            >
              {t("messageLabel")}
            </label>
            <textarea
              id="revision-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={6}
              maxLength={4_000}
              placeholder={t("messagePlaceholder")}
              className="mt-2 w-full resize-y rounded-t-xl rounded-b-none border-b-2 border-[#8E8B83] bg-[#F7F6F3] p-3 text-sm leading-6 text-[#1C1C1A] outline-none transition placeholder:text-[#4E4B44]/50 focus:border-[#7CA8D0] focus:bg-[#F0EEE9] focus:ring-0"
            />
          </DialogBody>

          <DialogFooter className="flex-col-reverse gap-2 border-t border-[#8E8B83]/15 bg-[#E6E3DC] px-6 py-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={requestClose}
              disabled={isPending}
              className="inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-medium text-[#4E4B44] transition-all duration-300 hover:bg-[#A5C2DE]/10 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA]"
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={isPending}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#B7D1EA] px-6 text-sm font-medium text-white shadow-sm transition-all duration-300 hover:bg-[#A5C2DE]/90 hover:shadow-md active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA]"
            >
              <PencilLine className="h-4 w-4" aria-hidden="true" />
              {isPending ? t("submitting") : t("submit")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
