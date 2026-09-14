"use client";

import { useRef, useState, useTransition } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  CreditCard,
  ExternalLink,
  FileText,
  PencilLine,
  UploadCloud,
} from "@/components/ui/icons";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { formatPrice } from "@/lib/utils";
import { GsapSpinner } from "@/components/ui/GsapMotion";
import { buildPromptPayPayload, getConfiguredPromptPayId } from "@/lib/promptpay";
import StatusBadge, { type StatusBadgeTone } from "@/components/ui/StatusBadge";
import PaymentInvoiceModal from "@/components/payments/PaymentInvoiceModal";
import PaymentReceiptModal from "@/components/payments/PaymentReceiptModal";
import PaymentMilestoneProgress from "@/components/payments/PaymentMilestoneProgress";
import type {
  ClientPaymentRequest,
  ClientPaymentInstructions,
  ClientProposal,
} from "@/types/proposals";
import { readJsonResponse } from "@/lib/readJsonResponse";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type PortalRevisionAndBillingProps = {
  proposal: ClientProposal;
  magicTokenSlug?: string | null;
  initialPaymentRequests: ClientPaymentRequest[];
  paymentInstructions?: ClientPaymentInstructions;
  onRevisionRequested: (status: string, dispatchStatus?: string | null, updatedAt?: string) => void;
  onPaymentRequestsChange?: (requests: ClientPaymentRequest[]) => void;
  section?: "all" | "revision" | "billing";
};

type RevisionResponse = {
  success: boolean;
  error?: string;
  proposal?: {
    status: string;
    dispatchStatus?: string | null;
    updatedAt?: string;
  };
};

type SlipUploadResponse = {
  success: boolean;
  error?: string;
  paymentRequest?: ClientPaymentRequest;
};

function toNumber(value: string | number | null | undefined) {
  const parsed = typeof value === "number" ? value : Number(String(value || "0").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function getPaymentStatusLabel(status: ClientPaymentRequest["status"]) {
  if (status === "AWAITING_VERIFICATION") return "Awaiting review";
  if (status === "PAID") return "Paid";
  if (status === "FAILED") return "Rejected";
  return "Unpaid";
}

function getVerificationLabel(request: ClientPaymentRequest, t: (key: string) => string) {
  if (request.status === "PAID") return t("verification.paid");
  if (request.status === "AWAITING_VERIFICATION") return t("verification.awaiting");
  if (request.status === "FAILED") return t("verification.failed");
  return t("verification.unpaid");
}

function getStorageLabel(provider: string | null | undefined, t: (key: string) => string) {
  if (provider === "GOOGLE_DRIVE") return t("storage.drive");
  if (provider === "SUPABASE_STORAGE") return t("storage.supabase");
  return null;
}

function getPaymentStatusTone(status: ClientPaymentRequest["status"]): StatusBadgeTone {
  if (status === "PAID") return "success";
  if (status === "AWAITING_VERIFICATION") return "info";
  if (status === "FAILED") return "danger";
  return "warning";
}

export function PortalRevisionAndBilling({
  proposal,
  magicTokenSlug,
  initialPaymentRequests,
  paymentInstructions,
  onRevisionRequested,
  onPaymentRequestsChange,
  section = "all",
}: PortalRevisionAndBillingProps) {
  const t = useTranslations("PortalRevisionAndBilling");
  const [isRevisionOpen, setRevisionOpen] = useState(false);
  const [revisionMessage, setRevisionMessage] = useState("");
  const [activePaymentRequest, setActivePaymentRequest] = useState<ClientPaymentRequest | null>(null);
  const [invoiceModalPr, setInvoiceModalPr] = useState<ClientPaymentRequest | null>(null);
  const [receiptModalPr, setReceiptModalPr] = useState<ClientPaymentRequest | null>(null);
  const [paymentRequests, setPaymentRequests] = useState(initialPaymentRequests);
  const [isPending, startTransition] = useTransition();
  const slipInputRef = useRef<HTMLInputElement | null>(null);
  const promptpayId = getConfiguredPromptPayId();

  const activeUnpaidPaymentRequests = paymentRequests.filter((request) => request.status === "PENDING");
  const qrPayload = activePaymentRequest
    ? buildPromptPayPayload(toNumber(activePaymentRequest.amountRequested))
    : null;
  const isBankTransfer = activePaymentRequest?.paymentMethod === "BANK_TRANSFER";
  const canUploadProof = isBankTransfer
    ? Boolean(paymentInstructions?.bankAccountNumber)
    : Boolean(qrPayload);

  const submitRevision = () => {
    const message = revisionMessage.trim();
    if (message.length < 3) {
      toast.error("กรุณาระบุรายละเอียดที่ต้องการแก้ไข");
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch("/api/proposals/portal-revision-request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            proposalId: proposal.id,
            magicTokenSlug: magicTokenSlug || undefined,
            message,
          }),
        });
        const payload = await readJsonResponse<RevisionResponse>(response);
        if (!response.ok || !payload?.success || !payload.proposal) {
          throw new Error(payload?.error || "Failed to submit revision request.");
        }

        onRevisionRequested(
          payload.proposal.status,
          payload.proposal.dispatchStatus,
          payload.proposal.updatedAt,
        );
        setRevisionOpen(false);
        setRevisionMessage("");
        toast.success("ส่งคำขอแก้ไขให้ทีม SolarDream แล้ว");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "ส่งคำขอแก้ไขไม่สำเร็จ");
      }
    });
  };

  const uploadSlip = (file: File) => {
    if (!activePaymentRequest) return;

    startTransition(async () => {
      const formData = new FormData();
      formData.set("proposal_id", proposal.id);
      formData.set("payment_request_id", activePaymentRequest.id);
      if (magicTokenSlug) formData.set("magic_token_slug", magicTokenSlug);
      formData.set("file", file);

      try {
        const response = await fetch("/api/proposals/portal-payment-slip", {
          method: "POST",
          body: formData,
        });
        const payload = await readJsonResponse<SlipUploadResponse>(response);
        if (!response.ok || !payload?.success || !payload.paymentRequest) {
          throw new Error(payload?.error || "Failed to upload payment proof.");
        }

        setPaymentRequests((current) => {
          const next = current.map((request) => (
            request.id === payload.paymentRequest?.id ? payload.paymentRequest : request
          ));
          onPaymentRequestsChange?.(next);
          return next;
        });
        setActivePaymentRequest(null);
        toast.success("แนบหลักฐานการโอนเรียบร้อยแล้ว");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "อัปโหลดสลิปไม่สำเร็จ");
      } finally {
        if (slipInputRef.current) slipInputRef.current.value = "";
      }
    });
  };

  return (
    <section className="space-y-6">
      {section !== "billing" ? (
        <div className="rounded-[28px] border border-[#F7F6F3] bg-[#F0EEE9] p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#4F7FA8]">
                {t("revision.eyebrow")}
              </p>
              <h2 className="mt-2 text-xl font-bold tracking-[-0.02em] text-[#2E2C27] sm:text-2xl">
                {t("revision.title")}
              </h2>
              <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-[#4E4B44]">
                {t("revision.description")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setRevisionOpen(true)}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#CBC7BE] bg-[#F0EEE9] px-5 py-2.5 text-xs font-bold text-[#2E2C27] shadow-sm transition hover:bg-[#DCE8F5] active:scale-95"
            >
              <PencilLine className="h-4 w-4 text-[#4F7FA8]" />
              {t("revision.requestAction")}
            </button>
          </div>
        </div>
      ) : null}

      {section !== "revision" ? (
        <div className="rounded-[28px] border border-[#F7F6F3] bg-[#F0EEE9] p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#4F7FA8]">
                {t("billing.eyebrow")}
              </p>
              <h2 className="mt-2 text-xl font-bold tracking-[-0.02em] text-[#2E2C27] sm:text-2xl">
                {t("billing.title")}
              </h2>
              <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-[#4E4B44]">
                {t("billing.description")}
              </p>
            </div>
            <StatusBadge tone={activeUnpaidPaymentRequests.length > 0 ? "warning" : "success"} className="py-2 text-xs">
              {t("billing.activeUnpaid", { count: activeUnpaidPaymentRequests.length })}
            </StatusBadge>
          </div>

          {/* Milestone Schedule Component */}
          <div className="mt-5">
            <PaymentMilestoneProgress
              totalProjectPrice={proposal.totalPrice || 0}
              paymentRequests={paymentRequests}
              onSelectMilestone={(req) => {
                if (req.status === "PAID") setReceiptModalPr(req);
                else setInvoiceModalPr(req);
              }}
            />
          </div>

          <div className="mt-6 space-y-4">
            {paymentRequests.length > 0 ? paymentRequests.map((request) => (
              <div key={request.id} className="rounded-[20px] border border-[#F7F6F3] bg-[#E6E3DC] p-4 sm:p-5 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#DCE8F5] text-[#4F7FA8]">
                      <CreditCard className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-[#2E2C27]">{request.title}</p>
                      <p className="mt-1 text-xs font-medium text-[#4E4B44]">{t("billing.paymentRequest")}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <StatusBadge tone={getPaymentStatusTone(request.status)} className="text-xs">
                      {getPaymentStatusLabel(request.status)}
                    </StatusBadge>
                    <span className="text-sm font-bold text-[#2E2C27]">
                      {formatPrice(toNumber(request.amountRequested))}
                    </span>

                    <button
                      type="button"
                      onClick={() => setInvoiceModalPr(request)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[#CBC7BE] bg-[#F0EEE9] px-4 py-2 text-xs font-bold text-[#2E2C27] shadow-sm transition hover:bg-[#DCE8F5] cursor-pointer"
                    >
                      <FileText className="h-3.5 w-3.5 text-[#4F7FA8]" />
                      <span>ใบแจ้งชำระเงิน</span>
                    </button>

                    {request.status === "PAID" && (
                      <button
                        type="button"
                        onClick={() => setReceiptModalPr(request)}
                        className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-4 py-2 text-xs font-bold text-emerald-900 shadow-sm transition hover:bg-emerald-200 cursor-pointer"
                      >
                        <FileText className="h-3.5 w-3.5 text-emerald-700" />
                        <span>ใบเสร็จรับเงิน</span>
                      </button>
                    )}

                    {request.status === "PENDING" || request.status === "FAILED" ? (
                      <button
                        type="button"
                        onClick={() => setActivePaymentRequest(request)}
                        className="inline-flex items-center gap-2 rounded-full bg-[#B7D1EA] px-5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#A5C2DE] active:scale-95 cursor-pointer"
                      >
                        <CreditCard className="h-4 w-4" />
                        {t("billing.payNowUploadSlip")}
                      </button>
                    ) : request.slipUrl ? (
                      <a
                        href={request.slipUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-full border border-[#CBC7BE] bg-[#F0EEE9] px-4 py-2 text-xs font-bold text-[#2E2C27] shadow-sm transition hover:bg-[#DCE8F5]"
                      >
                        {t("billing.openProof")}
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ) : null}
                  </div>
                </div>
                {request.slipUrl || request.verificationError ? (
                  <div className="mt-3 rounded-[16px] border border-[#F7F6F3] bg-[#F0EEE9] p-4 text-xs font-medium leading-5 text-[#4E4B44] shadow-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone={getPaymentStatusTone(request.status)}>
                        {getVerificationLabel(request, t)}
                      </StatusBadge>
                      {getStorageLabel(request.storageProvider, t) ? (
                        <StatusBadge tone="neutral">
                          {getStorageLabel(request.storageProvider, t)}
                        </StatusBadge>
                      ) : null}
                    </div>
                    {request.verificationError && request.status !== "PAID" ? (
                      <p className="mt-2 text-amber-700">
                        {t("billing.note", { detail: request.verificationError })}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )) : (
              <div className="rounded-[20px] border border-dashed border-[#CBC7BE] bg-[#E6E3DC] p-5 text-sm font-medium leading-7 text-[#4E4B44]">
                {t("billing.empty")}
              </div>
            )}
          </div>

        </div>
      ) : null}

      <Dialog
        isOpen={isRevisionOpen}
        onClose={() => setRevisionOpen(false)}
        size="md"
        tone="light"
        ariaLabel="แจ้งขอแก้ไขข้อมูลใบเสนอราคา"
        closeLabel="ปิดหน้าต่าง"
        className="max-w-lg rounded-[28px] border border-[#F7F6F3] bg-[#F0EEE9] shadow-2xl overflow-hidden"
      >
        <DialogContent>
          <DialogHeader className="border-b border-[#F7F6F3] bg-[#E6E3DC] px-6 py-4">
            <DialogTitle className="text-base font-bold text-[#2E2C27]">แจ้งขอแก้ไขข้อมูลใบเสนอราคา</DialogTitle>
            <DialogDescription className="text-xs text-[#4E4B44]">
              หลังส่งคำขอ ระบบจะหยุดการลงนามไว้ก่อนและแจ้งทีมงานทันที
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="bg-[#F0EEE9] p-6">
            <label htmlFor="portal-revision-message" className="sr-only">
              รายละเอียดที่ต้องการแก้ไข
            </label>
            <textarea
              id="portal-revision-message"
              value={revisionMessage}
              onChange={(event) => setRevisionMessage(event.target.value)}
              rows={6}
              className="w-full resize-none rounded-t-xl rounded-b-none border-b-2 border-[#8E8B83] bg-[#F7F6F3] p-4 text-sm font-semibold leading-relaxed text-[#2E2C27] outline-none transition-colors placeholder:text-[#4E4B44] focus:border-[#7CA8D0] focus:bg-[#F0EEE9]"
              placeholder="เช่น ขอแก้ไขชื่อผู้รับเอกสาร เปลี่ยนที่อยู่ติดตั้ง หรืออยากปรับรายการอุปกรณ์..."
            />
          </DialogBody>
          <DialogFooter className="border-t border-[#F7F6F3] bg-[#E6E3DC] p-4">
            <button
              type="button"
              onClick={submitRevision}
              disabled={isPending}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#B7D1EA] px-5 py-3 text-sm font-bold text-white shadow-sm transition-all hover:bg-[#A5C2DE] active:scale-95 disabled:opacity-50"
            >
              {isPending ? <GsapSpinner className="h-4 w-4 text-white" /> : <PencilLine className="h-4 w-4" />}
              ส่งคำขอแก้ไขให้ทีมงาน
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {activePaymentRequest ? (
        <Dialog
          isOpen
          onClose={() => setActivePaymentRequest(null)}
          size="md"
          tone="light"
          ariaLabel="ชำระเงิน / แนบหลักฐานการโอน"
          closeLabel="ปิดหน้าต่าง"
          className="max-w-lg rounded-[28px] border border-[#F7F6F3] bg-[#F0EEE9] shadow-2xl overflow-hidden"
        >
          <DialogContent>
            <DialogHeader className="border-b border-[#F7F6F3] bg-[#E6E3DC] px-6 py-4">
              <DialogTitle className="text-base font-bold text-[#2E2C27]">ชำระเงิน / แนบหลักฐานการโอน</DialogTitle>
              <DialogDescription className="text-xs text-[#4E4B44]">
                {isBankTransfer
                  ? "โอนเงินตามรายละเอียดบัญชี แล้วอัปโหลดสลิปเพื่อบันทึกเข้าระบบ"
                  : "สแกน PromptPay แล้วอัปโหลดสลิปเพื่อบันทึกเข้าระบบ"}
              </DialogDescription>
            </DialogHeader>
            <DialogBody className="bg-[#F0EEE9] p-6">
              <div className="rounded-[24px] border border-[#F7F6F3] bg-[#E6E3DC] p-5 text-center shadow-sm">
                {isBankTransfer ? (
                  paymentInstructions?.bankAccountNumber ? (
                    <div className="rounded-[20px] border border-[#F7F6F3] bg-[#F0EEE9] p-5 text-left shadow-sm">
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#4F7FA8]">Direct bank transfer</p>
                      <p className="mt-3 text-sm font-bold text-[#2E2C27]">{paymentInstructions.bankName}</p>
                      <p className="mt-1 text-sm font-medium text-[#4E4B44]">{paymentInstructions.bankAccountName}</p>
                      <p className="mt-3 break-all font-mono text-2xl font-black tracking-wide text-[#2E2C27]">{paymentInstructions.bankAccountNumber}</p>
                    </div>
                  ) : (
                    <div className="mx-auto rounded-[16px] border border-amber-200 bg-amber-50 p-5 text-sm font-medium leading-6 text-amber-800">
                      ระบบยังไม่ได้ตั้งค่าบัญชีรับโอน กรุณาติดต่อทีมงานเพื่อรับช่องทางชำระเงิน
                    </div>
                  )
                ) : qrPayload ? (
                  <div className="mx-auto grid w-fit place-items-center rounded-[20px] border border-[#F7F6F3] bg-[#F0EEE9] p-4 shadow-sm">
                    <QRCodeSVG value={qrPayload} size={180} includeMargin className="rounded-xl bg-white p-2" />
                  </div>
                ) : (
                  <div className="mx-auto rounded-[16px] border border-amber-200 bg-amber-50 p-5 text-sm font-medium leading-6 text-amber-800">
                    ระบบชำระเงินยังไม่ได้ตั้งค่า PromptPay กรุณาติดต่อทีมงานเพื่อรับช่องทางชำระเงิน
                  </div>
                )}
                <p className="mt-4 text-xs font-bold uppercase tracking-[0.16em] text-[#4E4B44]">Amount</p>
                <p className="mt-1 text-3xl font-black tracking-[-0.03em] text-[#2E2C27]">
                  {formatPrice(toNumber(activePaymentRequest.amountRequested))}
                </p>
                <p className="mt-2 text-xs font-medium text-[#4E4B44]">
                  {isBankTransfer
                    ? "Transfer only to the account shown above"
                    : `PromptPay ID: ${promptpayId || "Not configured"}`}
                </p>
              </div>
              <input
                ref={slipInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.pdf"
                className="hidden"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) uploadSlip(file);
                }}
              />
            </DialogBody>
            <DialogFooter className="block border-t border-[#F7F6F3] bg-[#E6E3DC] p-4">
              <button
                type="button"
                onClick={() => slipInputRef.current?.click()}
                disabled={isPending || !canUploadProof}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#B7D1EA] px-5 py-3 text-sm font-bold text-white shadow-sm transition-all hover:bg-[#A5C2DE] active:scale-95 disabled:opacity-50"
              >
                {isPending ? <GsapSpinner className="h-4 w-4 text-white" /> : <UploadCloud className="h-4 w-4" />}
                อัปโหลดหลักฐานการโอนเงิน
              </button>
              <p className="mt-3 flex items-center justify-center gap-2 text-center text-xs font-medium text-[#4E4B44]">
                <FileText className="h-3.5 w-3.5 text-[#4F7FA8]" />
                รองรับไฟล์รูปภาพหรือ PDF ขนาดไม่เกิน 12MB
              </p>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      <PaymentInvoiceModal
        isOpen={Boolean(invoiceModalPr)}
        onClose={() => setInvoiceModalPr(null)}
        paymentRequest={invoiceModalPr}
        customerInfo={{
          name: proposal.user?.fullName || proposal.user?.name || "Client",
          email: proposal.user?.email,
          phone: proposal.user?.phoneNumber,
          proposalCode: proposal.erpnextQuotationId || proposal.id.slice(0, 8).toUpperCase(),
          systemKwp: proposal.systemSizeKwp,
        }}
        onUploadSlip={(prId, file) => {
          const targetPr = paymentRequests.find((p) => p.id === prId);
          if (targetPr) {
            setActivePaymentRequest(targetPr);
            uploadSlip(file);
          }
        }}
        isUploading={isPending}
      />

      <PaymentReceiptModal
        isOpen={Boolean(receiptModalPr)}
        onClose={() => setReceiptModalPr(null)}
        paymentRequest={receiptModalPr}
        customerInfo={{
          name: proposal.user?.fullName || proposal.user?.name || "Client",
          email: proposal.user?.email,
          phone: proposal.user?.phoneNumber,
          proposalCode: proposal.erpnextQuotationId || proposal.id.slice(0, 8).toUpperCase(),
          systemKwp: proposal.systemSizeKwp,
        }}
      />
    </section>
  );
}
