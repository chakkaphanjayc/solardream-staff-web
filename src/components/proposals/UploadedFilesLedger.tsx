"use client";

import { ExternalLink, FileCheck2, FileText, ReceiptText, ShieldCheck } from "@/components/ui/icons";

import { cn } from "@/lib/utils";
import StatusBadge, { type StatusBadgeTone } from "@/components/ui/StatusBadge";
import type {
  ClientDocumentRequest,
  ClientInvoice,
  ClientPaymentRequest,
} from "@/types/proposals";

type UploadedFileItem = {
  id: string;
  label: string;
  description: string;
  status: string;
  url: string;
  fallbackUrl?: string | null;
  storageFileId?: string | null;
  tone: "document" | "payment" | "invoice";
  meta?: string | null;
  warning?: string | null;
};

type UploadedFilesLedgerProps = {
  documentRequests: ClientDocumentRequest[];
  paymentRequests: ClientPaymentRequest[];
  invoices: ClientInvoice[];
};

function getItems({
  documentRequests,
  paymentRequests,
  invoices,
}: UploadedFilesLedgerProps): UploadedFileItem[] {
  return [
    ...documentRequests
      .filter((request) => Boolean(request.fileUrl))
      .map((request) => ({
        id: `document-${request.id}`,
        label: request.documentName,
        description: request.isRequired ? "Required customer document" : "Optional customer document",
        status: request.status,
        url: request.fileUrl || "",
        fallbackUrl: request.fallbackUrl,
        storageFileId: request.storageFileId,
        tone: "document" as const,
        meta: request.storageProvider === "GOOGLE_DRIVE"
          ? "Mirrored to Google Drive"
          : request.storageProvider === "SUPABASE_STORAGE"
            ? "Stored in SolarDream secure storage"
            : null,
      })),
    ...paymentRequests
      .filter((request) => Boolean(request.slipUrl))
      .map((request) => ({
        id: `payment-${request.id}`,
        label: `Payment slip: ${request.title}`,
        description: `Proof for ${request.amountRequested} THB`,
        status: request.status,
        url: request.slipUrl || "",
        fallbackUrl: request.fallbackUrl,
        storageFileId: request.storageFileId,
        tone: "payment" as const,
        meta: request.storageProvider === "GOOGLE_DRIVE"
          ? "Mirrored to Google Drive"
          : request.storageProvider === "SUPABASE_STORAGE"
            ? "Stored in SolarDream secure storage"
            : null,
        warning: request.verificationError || null,
      })),
    ...invoices
      .filter((invoice) => Boolean(invoice.slipUrl || invoice.pdfUrl))
      .map((invoice) => ({
        id: `invoice-${invoice.id}`,
        label: invoice.erpnextInvoiceId,
        description: invoice.slipUrl ? "Invoice payment slip" : "ERPNext invoice PDF",
        status: invoice.status,
        url: invoice.slipUrl || invoice.pdfUrl || "",
        tone: "invoice" as const,
      })),
  ];
}

function getIcon(tone: UploadedFileItem["tone"]) {
  if (tone === "payment") return ReceiptText;
  if (tone === "invoice") return ShieldCheck;
  return FileText;
}

function getStatusTone(status: string): StatusBadgeTone {
  const normalized = status.toUpperCase();
  if (["APPROVED", "PAID", "COMPLETE", "COMPLETED"].includes(normalized)) {
    return "success";
  }
  if (["UPLOADED", "AWAITING_VERIFICATION", "PARTIALLY_PAID"].includes(normalized)) {
    return "info";
  }
  if (["FAILED", "REJECTED"].includes(normalized)) {
    return "danger";
  }
  return "warning";
}

function getStorageMeta(url: string, explicitMeta?: string | null) {
  if (explicitMeta) return explicitMeta;
  if (/drive\.google\.com|drive\.usercontent\.google\.com/i.test(url)) {
    return "Mirrored to Google Drive";
  }
  return "Stored in SolarDream secure storage";
}

function getDriveFileUrl(storageFileId?: string | null) {
  return storageFileId
    ? `https://drive.google.com/file/d/${encodeURIComponent(storageFileId)}/view`
    : null;
}

export function UploadedFilesLedger(props: UploadedFilesLedgerProps) {
  const items = getItems(props);

  return (
    <section className="rounded-[28px] border border-[#F7F6F3] bg-[#F0EEE9] p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#4F7FA8]">
            Uploaded files
          </p>
          <h2 className="mt-2 text-xl font-bold tracking-[-0.02em] text-[#2E2C27]">
            File center สำหรับใบเสนอราคานี้
          </h2>
          <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-[#4E4B44]">
            รวมไฟล์ที่คุณส่งให้ SolarDream ทั้งเอกสารประกอบ ใบแจ้งหนี้ และหลักฐานการชำระเงินในที่เดียว
          </p>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#CBC7BE] bg-[#DCE8F5] px-3.5 py-1.5 text-xs font-bold text-[#2E2C27]">
          <FileCheck2 className="h-4 w-4 text-[#4F7FA8]" />
          {items.length} files
        </span>
      </div>

      <div className="mt-5">
        {items.length === 0 ? (
          <div className="rounded-[20px] border border-dashed border-[#CBC7BE] bg-[#E6E3DC] p-5 text-sm font-medium leading-7 text-[#4E4B44]">
            ยังไม่มีไฟล์ที่อัปโหลดสำหรับใบเสนอราคานี้ เมื่อคุณแนบเอกสารหรือสลิป รายการจะปรากฏที่นี่
          </div>
        ) : (
          <div className="divide-y divide-[#F7F6F3] overflow-hidden rounded-[20px] border border-[#F7F6F3] bg-[#E6E3DC]">
            {items.map((item) => {
              const Icon = getIcon(item.tone);
              const driveFileUrl = getDriveFileUrl(item.storageFileId);

              return (
                <div
                  key={item.id}
                  className="flex flex-col gap-3 p-4 transition hover:bg-[#DCE8F5]/40 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="flex min-w-0 items-start gap-3">
                    <span
                      className={cn(
                        "grid h-10 w-10 shrink-0 place-items-center rounded-full",
                        item.tone === "payment"
                          ? "bg-emerald-100 text-emerald-800"
                          : item.tone === "invoice"
                            ? "bg-sky-100 text-sky-800"
                            : "bg-[#DCE8F5] text-[#4F7FA8]",
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-[#2E2C27]">
                        {item.label}
                      </span>
                      <span className="mt-1 block text-xs font-medium leading-5 text-[#4E4B44]">
                        {item.description}
                      </span>
                      {item.url || item.meta || item.warning ? (
                        <span className="mt-2 flex flex-wrap gap-2 text-[11px] font-bold">
                          {item.url ? (
                            <span className="rounded-full border border-[#CBC7BE] bg-[#F0EEE9] px-2.5 py-0.5 text-[#4E4B44]">
                              {getStorageMeta(item.url, item.meta)}
                            </span>
                          ) : null}
                          {item.warning ? (
                            <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-amber-700">
                              Staff review needed
                            </span>
                          ) : null}
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                    <StatusBadge tone={getStatusTone(item.status)}>{item.status}</StatusBadge>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-[#B7D1EA] px-4 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#A5C2DE] active:scale-95"
                    >
                      เปิดไฟล์
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    {driveFileUrl && driveFileUrl !== item.url ? (
                      <a
                        href={driveFileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[#CBC7BE] bg-[#F0EEE9] px-4 py-1.5 text-xs font-bold text-[#2E2C27] shadow-sm transition hover:bg-[#DCE8F5] active:scale-95"
                      >
                        Google Drive
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ) : null}
                    {item.fallbackUrl && item.fallbackUrl !== item.url ? (
                      <a
                        href={item.fallbackUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[#CBC7BE] bg-[#F0EEE9] px-4 py-1.5 text-xs font-bold text-[#2E2C27] shadow-sm transition hover:bg-[#DCE8F5] active:scale-95"
                      >
                        สำเนา SolarDream
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ) : null}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
