"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  CheckCircle2,
  ExternalLink,
  FileText,
  ReceiptText,
  Search,
  X,
  XCircle,
} from "@/components/ui/icons";
import { toast } from "sonner";

import { verifyClientPaymentSlipAction } from "@/app/actions/paymentRequests";
import { verifyQuotationDocumentRequestAction } from "@/app/actions/quotationDocumentRequests";
import { cn, formatPrice } from "@/lib/utils";
import { GsapSpinner } from "@/components/ui/GsapMotion";
import { AdminBulkActionBar } from "@/components/admin/AdminBulkActionBar";
import { AdminSelectionCheckbox } from "@/components/admin/AdminSelectionCheckbox";
import { useAdminSelection } from "@/hooks/useAdminSelection";

export type UploadedDocumentReviewRow = {
  id: string;
  proposalId: string;
  quotationLabel: string;
  customerName: string;
  customerEmail: string;
  title: string;
  type: "CUSTOMER_DOCUMENT" | "PAYMENT_SLIP";
  status: string;
  url: string | null;
  amount: number | null;
  isRequired: boolean;
  verificationStatus?: string | null;
  storageProvider?: string | null;
  storageFileId?: string | null;
  fallbackUrl?: string | null;
  verificationError?: string | null;
  updatedAt: string;
  portalPath: string;
  adminPath: string;
};

type ReviewDecision = "APPROVE" | "REJECT";

function getStatusClass(status: string) {
  const normalized = status.toUpperCase();
  if (["APPROVED", "PAID"].includes(normalized)) {
    return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
  }
  if (["UPLOADED", "AWAITING_VERIFICATION"].includes(normalized)) {
    return "border-sky-500/20 bg-sky-500/10 text-sky-300";
  }
  if (["FAILED", "REJECTED"].includes(normalized)) {
    return "border-rose-500/20 bg-rose-500/10 text-rose-300";
  }
  return "border-amber-500/20 bg-amber-500/10 text-amber-300";
}

function isImageUrl(url: string) {
  return /\.(png|jpe?g|webp|gif|heic|heif)(\?.*)?$/i.test(url);
}

function isPdfUrl(url: string) {
  return /\.pdf(\?.*)?$/i.test(url);
}

function isGoogleDriveUrl(url: string): boolean {
  return /drive\.google\.com|docs\.google\.com/i.test(url);
}

function getGoogleDriveEmbedUrl(url: string): string {
  if (!url) return url;
  if (url.includes("/preview")) return url;
  const fileIdMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (fileIdMatch && fileIdMatch[1]) {
    return `https://drive.google.com/file/d/${fileIdMatch[1]}/preview`;
  }
  return url;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getStorageLabel(provider?: string | null) {
  if (provider === "GOOGLE_DRIVE") return "Google Drive mirror";
  if (provider === "SUPABASE_STORAGE") return "SolarDream storage";
  return "Not recorded";
}

function getDriveFileUrl(storageFileId?: string | null) {
  return storageFileId
    ? `https://drive.google.com/file/d/${encodeURIComponent(storageFileId)}/view`
    : null;
}

function getMetadataText(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = (value as Record<string, unknown>)[key];
  return typeof item === "string" && item.trim() ? item.trim() : null;
}

export default function UploadedDocumentsClient({
  initialRows,
}: {
  initialRows: UploadedDocumentReviewRow[];
}) {
  const [rows, setRows] = useState(initialRows);
  const [selectedRow, setSelectedRow] = useState<UploadedDocumentReviewRow | null>(null);
  const [filter, setFilter] = useState<"ALL" | "REVIEW" | "PENDING" | "PAYMENT_SLIP" | "CUSTOMER_DOCUMENT">("REVIEW");
  const [search, setSearch] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      const needsReview = row.status === "UPLOADED" || row.status === "AWAITING_VERIFICATION";
      const matchesFilter =
        filter === "ALL" ||
        (filter === "REVIEW" && needsReview) ||
        (filter === "PENDING" && !row.url) ||
        row.type === filter;
      const matchesSearch = !query || [
        row.title,
        row.customerName,
        row.customerEmail,
        row.quotationLabel,
      ].some((value) => value.toLowerCase().includes(query));

      return matchesFilter && matchesSearch;
    });
  }, [filter, rows, search]);

  const reviewCount = rows.filter((row) => row.status === "UPLOADED" || row.status === "AWAITING_VERIFICATION").length;
  const uploadedCount = rows.filter((row) => Boolean(row.url)).length;
  const selectedDriveFileUrl = getDriveFileUrl(selectedRow?.storageFileId);
  const selection = useAdminSelection(filteredRows.map((row) => `${row.type}-${row.id}`));

  const getRowKey = (row: UploadedDocumentReviewRow) => `${row.type}-${row.id}`;

  const handleDecision = (row: UploadedDocumentReviewRow, decision: ReviewDecision) => {
    setBusyKey(`${row.type}-${row.id}-${decision}`);
    startTransition(async () => {
      try {
        if (row.type === "PAYMENT_SLIP") {
          const result = await verifyClientPaymentSlipAction(row.id, decision);
          if (!result.success || !result.paymentRequest) {
            throw new Error(result.error || "Failed to verify payment slip.");
          }
          const nextStatus = result.paymentRequest.status;
          const nextVerificationStatus = getMetadataText(result.paymentRequest.easySlipData, "verificationStatus");
          const nextStorageProvider = getMetadataText(result.paymentRequest.easySlipData, "storageProvider");
          const nextVerificationError = getMetadataText(result.paymentRequest.easySlipData, "verificationError");
          setRows((current) => current.map((item) => (
            item.id === row.id && item.type === row.type
              ? {
                ...item,
                status: nextStatus,
                url: result.paymentRequest.slipUrl,
                verificationStatus: nextVerificationStatus,
                storageProvider: nextStorageProvider,
                storageFileId: result.paymentRequest.storageFileId,
                fallbackUrl: result.paymentRequest.fallbackUrl,
                verificationError: nextVerificationError,
              }
              : item
          )));
          setSelectedRow((current) => current?.id === row.id && current.type === row.type
            ? {
              ...current,
              status: nextStatus,
              url: result.paymentRequest.slipUrl,
              verificationStatus: nextVerificationStatus,
              storageProvider: nextStorageProvider,
              storageFileId: result.paymentRequest.storageFileId,
              fallbackUrl: result.paymentRequest.fallbackUrl,
              verificationError: nextVerificationError,
            }
            : current);
        } else {
          const result = await verifyQuotationDocumentRequestAction(row.proposalId, row.id, decision);
          if (!result.success || !result.request) {
            throw new Error(result.error || "Failed to verify document.");
          }
          const nextStatus = result.request.status;
          setRows((current) => current.map((item) => (
            item.id === row.id && item.type === row.type
              ? {
                ...item,
                status: nextStatus,
                url: result.request.fileUrl,
                storageProvider: result.request.storageProvider,
                storageFileId: result.request.storageFileId,
                fallbackUrl: result.request.fallbackUrl,
              }
              : item
          )));
          setSelectedRow((current) => current?.id === row.id && current.type === row.type
            ? {
              ...current,
              status: nextStatus,
              url: result.request.fileUrl,
              storageProvider: result.request.storageProvider,
              storageFileId: result.request.storageFileId,
              fallbackUrl: result.request.fallbackUrl,
            }
            : current);
        }

        toast.success(decision === "APPROVE" ? "Document approved" : "Document returned for correction");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Verification failed");
      } finally {
        setBusyKey(null);
      }
    });
  };

  const handleBulkDecision = (decision: ReviewDecision) => {
    const selectedRows = filteredRows.filter((row) => selection.isSelected(getRowKey(row)));
    if (selectedRows.length === 0) return;

    setBusyKey(`bulk-${decision}`);
    startTransition(async () => {
      const results = await Promise.all(
        selectedRows.map(async (row) => {
          try {
            if (row.type === "PAYMENT_SLIP") {
              const result = await verifyClientPaymentSlipAction(row.id, decision);
              if (!result.success || !result.paymentRequest) {
                return { key: getRowKey(row), error: result.error || "Payment slip verification failed." };
              }
              return {
                key: getRowKey(row),
                update: {
                  status: result.paymentRequest.status,
                  url: result.paymentRequest.slipUrl,
                  verificationStatus: getMetadataText(result.paymentRequest.easySlipData, "verificationStatus"),
                  storageProvider: result.paymentRequest.storageProvider,
                  storageFileId: result.paymentRequest.storageFileId,
                  fallbackUrl: result.paymentRequest.fallbackUrl,
                  verificationError: getMetadataText(result.paymentRequest.easySlipData, "verificationError"),
                } satisfies Partial<UploadedDocumentReviewRow>,
              };
            }

            const result = await verifyQuotationDocumentRequestAction(row.proposalId, row.id, decision);
            if (!result.success || !result.request) {
              return { key: getRowKey(row), error: result.error || "Document verification failed." };
            }
            return {
              key: getRowKey(row),
              update: {
                status: result.request.status,
                url: result.request.fileUrl,
                storageProvider: result.request.storageProvider,
                storageFileId: result.request.storageFileId,
                fallbackUrl: result.request.fallbackUrl,
              } satisfies Partial<UploadedDocumentReviewRow>,
            };
          } catch (error) {
            return {
              key: getRowKey(row),
              error: error instanceof Error ? error.message : "Verification failed.",
            };
          }
        }),
      );

      const updates = new Map(
        results.flatMap((result) => result.update ? [[result.key, result.update] as const] : []),
      );
      const failures = results.filter((result) => result.error);
      if (updates.size > 0) {
        setRows((current) => current.map((row) => ({ ...row, ...(updates.get(getRowKey(row)) || {}) })));
        setSelectedRow((current) => current
          ? { ...current, ...(updates.get(getRowKey(current)) || {}) }
          : current);
        selection.clear();
        toast.success(`${updates.size} item${updates.size === 1 ? "" : "s"} ${decision === "APPROVE" ? "approved" : "returned"}.`);
      }
      if (failures.length > 0) {
        toast.error(`${failures.length} item${failures.length === 1 ? "" : "s"} could not be processed.`);
      }
      setBusyKey(null);
    });
  };

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <section className="rounded-xl border border-[#1E293B] bg-[#0F172A] p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-300">
              Document Control
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-gray-100">
              Customer uploads and payment slip review
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-400">
              Central queue for quotation documents, customer uploads, and payment proof submitted from proposal portals.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:min-w-[320px]">
            <Stat label="Needs review" value={reviewCount} tone="text-sky-300" />
            <Stat label="Uploaded files" value={uploadedCount} tone="text-emerald-300" />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-[#1E293B] bg-[#0B1121]">
        <div className="flex flex-col gap-3 border-b border-[#1E293B] p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {[
              ["REVIEW", "Needs review"],
              ["ALL", "All files"],
              ["PENDING", "Missing uploads"],
              ["PAYMENT_SLIP", "Payment slips"],
              ["CUSTOMER_DOCUMENT", "Customer docs"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key as typeof filter)}
                className={cn(
                  "rounded-lg px-3 py-2 text-xs font-semibold transition-colors",
                  filter === key
                    ? "bg-blue-600/20 text-blue-300"
                    : "text-gray-400 hover:bg-[#0B1121] hover:text-gray-100",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <label className="flex min-h-10 items-center gap-2 rounded-lg border border-[#1E293B] bg-[#0F172A] px-3 text-sm text-gray-300 lg:w-80">
            <Search className="h-4 w-4 text-gray-500" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search customer, quote, document..."
              className="w-full bg-transparent text-sm outline-none placeholder:text-gray-500"
            />
          </label>
        </div>

        <AdminBulkActionBar
          selectedCount={selection.selectedCount}
          visibleCount={filteredRows.length}
          allVisibleSelected={selection.allVisibleSelected}
          someVisibleSelected={selection.someVisibleSelected}
          onToggleVisible={selection.toggleVisible}
          onClear={selection.clear}
          isPending={busyKey !== null}
          actions={[
            { id: "approve", label: "Approve selected", icon: CheckCircle2, tone: "success", onClick: () => handleBulkDecision("APPROVE") },
            { id: "reject", label: "Return selected", icon: XCircle, tone: "danger", onClick: () => handleBulkDecision("REJECT") },
          ]}
        />

        <div className="divide-y divide-[#1E293B]">
          {filteredRows.length === 0 ? (
            <div className="p-10 text-center text-sm text-gray-400">
              No uploaded documents match this filter.
            </div>
          ) : filteredRows.map((row) => {
            const Icon = row.type === "PAYMENT_SLIP" ? ReceiptText : FileText;
            const canReview = Boolean(row.url) && (
              (row.type === "PAYMENT_SLIP" && row.status === "AWAITING_VERIFICATION") ||
              (row.type === "CUSTOMER_DOCUMENT" && row.status === "UPLOADED")
            );

            return (
              <div
                key={`${row.type}-${row.id}`}
                className="grid gap-3 px-4 py-4 transition hover:bg-[#0F172A]/70 lg:grid-cols-[40px_minmax(0,1.3fr)_180px_140px_260px] lg:items-center"
              >
                <div>
                  <AdminSelectionCheckbox
                    checked={selection.isSelected(getRowKey(row))}
                    onChange={() => selection.toggle(getRowKey(row))}
                    label={`Select ${row.title}`}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedRow(row)}
                  className="flex min-w-0 items-start gap-3 text-left"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-[#1E293B] bg-[#0F172A] text-blue-300">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-gray-100">{row.title}</span>
                    <span className="mt-1 block truncate text-xs text-gray-400">
                      {row.customerName} · {row.quotationLabel}
                    </span>
                  </span>
                </button>

                <div className="text-xs text-gray-400">
                  <p className="font-medium text-gray-200">{row.type === "PAYMENT_SLIP" ? "Payment slip" : "Customer document"}</p>
                  <p className="mt-1">{formatDate(row.updatedAt)}</p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("rounded-full border px-2 py-1 text-[10px] font-semibold uppercase", getStatusClass(row.status))}>
                    {row.status}
                  </span>
                  {row.amount !== null ? (
                    <span className="text-xs font-semibold text-gray-300">{formatPrice(row.amount)}</span>
                  ) : null}
                  {row.type === "PAYMENT_SLIP" && row.verificationStatus ? (
                    <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-2 py-1 text-[10px] font-semibold uppercase text-blue-300">
                      {row.verificationStatus}
                    </span>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  <Link
                    href={row.adminPath}
                    className="rounded-lg border border-[#1E293B] px-3 py-2 text-xs font-semibold text-gray-300 transition hover:bg-[#0F172A]"
                  >
                    Open QT
                  </Link>
                  {row.url ? (
                    <button
                      type="button"
                      onClick={() => setSelectedRow(row)}
                      className="rounded-lg bg-[#0B1121] px-3 py-2 text-xs font-semibold text-gray-100 transition hover:bg-[#1E293B]"
                    >
                      Preview
                    </button>
                  ) : null}
                  {canReview ? (
                    <>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleDecision(row, "APPROVE")}
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/25 disabled:cursor-wait disabled:opacity-60"
                      >
                        {busyKey === `${row.type}-${row.id}-APPROVE` ? <GsapSpinner className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleDecision(row, "REJECT")}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/15 px-3 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/25 disabled:cursor-wait disabled:opacity-60"
                      >
                        {busyKey === `${row.type}-${row.id}-REJECT` ? <GsapSpinner className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                        Reject
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {selectedRow ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/45 backdrop-blur-sm">
          <aside className="flex h-full w-full max-w-2xl flex-col border-l border-[#1E293B] bg-[#0B1121] shadow-none">
            <div className="flex items-start justify-between gap-4 border-b border-[#1E293B] p-5">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-300">
                  {selectedRow.type === "PAYMENT_SLIP" ? "Payment verification" : "Customer document"}
                </p>
                <h2 className="mt-2 truncate text-lg font-semibold text-gray-100">{selectedRow.title}</h2>
                <p className="mt-1 text-xs text-gray-400">{selectedRow.customerName} · {selectedRow.quotationLabel}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRow(null)}
                className="rounded-lg p-2 text-gray-400 transition hover:bg-[#0F172A] hover:text-gray-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="custom-scrollbar flex-1 overflow-y-auto p-5">
              {selectedRow.url ? (
                <div className="overflow-hidden rounded-xl border border-[#1E293B] bg-[#0F172A]">
                  {isImageUrl(selectedRow.url) ? (
                    <div className="relative min-h-[520px]">
                      <Image
                        src={selectedRow.url}
                        alt={selectedRow.title}
                        fill
                        unoptimized
                        className="object-contain"
                      />
                    </div>
                  ) : isGoogleDriveUrl(selectedRow.url) ? (
                    <iframe
                      src={getGoogleDriveEmbedUrl(selectedRow.url)}
                      title={selectedRow.title}
                      className="h-[70dvh] w-full border-0 bg-[#0F172A]"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allow="autoplay"
                      sandbox="allow-downloads allow-popups allow-popups-to-escape-sandbox allow-scripts allow-same-origin"
                    />
                  ) : isPdfUrl(selectedRow.url) ? (
                    <iframe
                      src={selectedRow.url}
                      title={selectedRow.title}
                      className="h-[70dvh] w-full border-0 bg-[#0F172A]"
                      referrerPolicy="strict-origin-when-cross-origin"
                      sandbox="allow-downloads allow-popups allow-popups-to-escape-sandbox allow-scripts allow-same-origin"
                    />
                  ) : (
                    <iframe
                      src={`https://docs.google.com/gview?url=${encodeURIComponent(selectedRow.url)}&embedded=true`}
                      title={selectedRow.title}
                      className="h-[70dvh] w-full border-0 bg-[#0F172A]"
                    />
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-[#1E293B] p-8 text-center text-sm text-gray-400">
                  No file has been uploaded yet.
                </div>
              )}

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Detail label="Customer" value={selectedRow.customerName} />
                <Detail label="Email" value={selectedRow.customerEmail || "Not provided"} />
                <Detail label="Status" value={selectedRow.status} />
                <Detail label="Updated" value={formatDate(selectedRow.updatedAt)} />
                {selectedRow.type === "PAYMENT_SLIP" ? (
                  <>
                    <Detail label="Verification" value={selectedRow.verificationStatus || "Not verified"} />
                    <Detail label="Storage" value={getStorageLabel(selectedRow.storageProvider)} />
                    <Detail label="Drive file ID" value={selectedRow.storageFileId || "Not mirrored"} />
                  </>
                ) : null}
                {selectedRow.type === "CUSTOMER_DOCUMENT" ? (
                  <>
                    <Detail label="Storage" value={getStorageLabel(selectedRow.storageProvider)} />
                    <Detail label="Drive file ID" value={selectedRow.storageFileId || "Not mirrored"} />
                  </>
                ) : null}
                {selectedRow.fallbackUrl ? (
                  <Detail label="Fallback URL" value={selectedRow.fallbackUrl} />
                ) : null}
              </div>
              {selectedRow.type === "PAYMENT_SLIP" && selectedRow.verificationError ? (
                <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/10 p-4 text-sm leading-6 text-amber-200">
                  <p className="font-semibold text-amber-100">Verification note</p>
                  <p className="mt-1 text-amber-200/90">{selectedRow.verificationError}</p>
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#1E293B] p-5">
              <div className="flex flex-wrap gap-2">
                <Link
                  href={selectedRow.portalPath}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-[#1E293B] px-3 py-2 text-xs font-semibold text-gray-300 transition hover:bg-[#0F172A]"
                >
                  Customer portal
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
                {selectedRow.url ? (
                  <a
                    href={selectedRow.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg border border-[#1E293B] px-3 py-2 text-xs font-semibold text-gray-300 transition hover:bg-[#0F172A]"
                  >
                    Open file
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : null}
                {selectedDriveFileUrl && selectedDriveFileUrl !== selectedRow.url ? (
                  <a
                    href={selectedDriveFileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg border border-[#1E293B] px-3 py-2 text-xs font-semibold text-gray-300 transition hover:bg-[#0F172A]"
                  >
                    Google Drive
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : null}
                {selectedRow.fallbackUrl && selectedRow.fallbackUrl !== selectedRow.url ? (
                  <a
                    href={selectedRow.fallbackUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg border border-[#1E293B] px-3 py-2 text-xs font-semibold text-gray-300 transition hover:bg-[#0F172A]"
                  >
                    SolarDream copy
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : null}
              </div>
              {selectedRow.url ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleDecision(selectedRow, "REJECT")}
                    className="rounded-lg border border-rose-500/30 bg-rose-500/15 px-4 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/25 disabled:cursor-wait disabled:opacity-60"
                  >
                    Return
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleDecision(selectedRow, "APPROVE")}
                    className="rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-4 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/25 disabled:cursor-wait disabled:opacity-60"
                  >
                    Approve
                  </button>
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-lg border border-[#1E293B] bg-[#0B1121] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-500">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold", tone)}>{value}</p>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#1E293B] bg-[#0F172A] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-500">{label}</p>
      <p className="mt-1 break-words text-sm font-medium text-gray-100">{value}</p>
    </div>
  );
}
