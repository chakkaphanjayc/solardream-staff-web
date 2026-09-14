"use client";

import { ArrowRight, FileEdit, LockKeyhole, ShieldCheck } from "@/components/ui/icons";
import { useTranslations } from "next-intl";

interface ProposalSignatureCtaCardProps {
  isSigned: boolean;
  signatureLocked: boolean;
  revisionRequested: boolean;
  isSignableStatus?: boolean;
  notSignableReason?: "AWAITING_STAFF" | "INVALID_STATUS" | null;
  hasReviewedDocument: boolean;
  onOpenSignModal: () => void;
}

export function ProposalSignatureCtaCard({
  isSigned,
  signatureLocked,
  revisionRequested,
  isSignableStatus = true,
  notSignableReason = null,
  hasReviewedDocument,
  onOpenSignModal,
}: ProposalSignatureCtaCardProps) {
  const t = useTranslations("ProposalSignatureCta");
  const reviewRequired = !isSigned && !hasReviewedDocument;
  const isBlocked = !isSigned && (!isSignableStatus || signatureLocked || reviewRequired);

  return (
    <section className="rounded-[28px] border border-[#8E8B83]/20 bg-[#E6E3DC] p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#DCE8F5] text-[#2E2C27] shadow-xs">
            {isSigned ? (
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
            ) : isBlocked ? (
              <LockKeyhole className="h-5 w-5 text-[#4E4B44]" />
            ) : (
              <FileEdit className="h-5 w-5 text-[#4F7FA8]" />
            )}
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-[#1C1C1A]">
                {isSigned
                  ? t("signedTitle")
                  : reviewRequired
                    ? t("reviewRequiredTitle")
                  : !isSignableStatus
                    ? notSignableReason === "AWAITING_STAFF"
                      ? t("awaitingStaffTitle")
                      : t("notReadyTitle")
                    : signatureLocked
                      ? t("lockedTitle")
                      : t("readyTitle")}
              </h2>
              {isSigned && (
                <span className="rounded-full bg-emerald-100 border border-emerald-300 px-3 py-0.5 text-[11px] font-bold text-emerald-800">
                  {t("completed")}
                </span>
              )}
            </div>

            <p className="max-w-2xl text-sm leading-6 text-[#4E4B44] font-medium">
              {isSigned
                ? t("signedDescription")
                : reviewRequired
                  ? t("reviewRequiredDescription")
                : !isSignableStatus
                  ? notSignableReason === "AWAITING_STAFF"
                    ? t("awaitingStaffDescription")
                    : t("notReadyDescription")
                  : signatureLocked
                    ? revisionRequested
                      ? t("revisionDescription")
                      : t("lockedDescription")
                    : t("readyDescription")}
            </p>
          </div>
        </div>

        <div className="shrink-0">
          {!isSigned && isSignableStatus && !signatureLocked && (
            <button
              type="button"
              onClick={onOpenSignModal}
              disabled={reviewRequired}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#B7D1EA] px-8 py-3 text-sm font-bold text-white shadow-md transition-all hover:bg-[#A5C2DE] active:scale-95 disabled:cursor-not-allowed disabled:bg-[#F7F6F3] disabled:text-[#4E4B44] disabled:shadow-none sm:w-auto"
            >
              <span>{reviewRequired ? t("reviewRequiredAction") : t("signDocument")}</span>
              <ArrowRight className="h-4 w-4 text-white" />
            </button>
          )}

          {!isSigned && (!isSignableStatus || signatureLocked) && (
            <button
              type="button"
              disabled
              className="inline-flex min-h-12 w-full cursor-not-allowed items-center justify-center gap-2 rounded-full bg-[#F7F6F3] px-8 py-3 text-sm font-bold text-[#4E4B44] sm:w-auto"
            >
              <LockKeyhole className="h-4 w-4" />
              <span>{signatureLocked ? t("lockedAction") : t("notReadyAction")}</span>
            </button>
          )}

          {isSigned && (
            <button
              type="button"
              disabled
              className="inline-flex min-h-12 w-full cursor-default items-center justify-center gap-2 rounded-full border border-emerald-300 bg-emerald-50 px-8 py-3 text-xs font-bold text-emerald-800 sm:w-auto"
            >
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              {t("documentSigned")}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
