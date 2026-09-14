"use client";

import { useState, useTransition } from "react";
import { useDropzone } from "react-dropzone";
import {
  BadgeCheck,
  FileUp,
  LoaderCircle,
  RefreshCcw,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "@/components/ui/icons";

import { verifyDocument } from "@/app/actions/verifyDocument";
import type { DocumentVerificationResult } from "@/types/documentSigning";

const MAX_VERIFICATION_PDF_BYTES = 10 * 1024 * 1024;

function fileSizeLabel(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(bytes < 1024 * 1024 ? 1 : 0)} MB`;
}

export function DocumentVerificationDropzone() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<DocumentVerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { getInputProps, getRootProps, isDragActive } = useDropzone({
    accept: { "application/pdf": [".pdf"] },
    maxFiles: 1,
    maxSize: MAX_VERIFICATION_PDF_BYTES,
    multiple: false,
    onDropAccepted: ([acceptedFile]) => {
      if (!acceptedFile) return;
      setFile(acceptedFile);
      setResult(null);
      setError(null);
    },
    onDropRejected: ([rejection]) => {
      const code = rejection?.errors[0]?.code;
      setFile(null);
      setResult(null);
      setError(code === "file-too-large" ? "Choose a PDF smaller than 10 MB." : "Choose one PDF document.");
    },
  });

  function submit(): void {
    if (!file) return;
    setError(null);
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("document", file);
        setResult(await verifyDocument(formData));
      } catch (verificationError: unknown) {
        setResult(null);
        setError(verificationError instanceof Error ? verificationError.message : "Unable to verify this document.");
      }
    });
  }

  const integrityPassed = result?.integrity === true;

  return (
    <section className="rounded-[28px] border border-[#8E8B83]/20 bg-[#E6E3DC] p-6 sm:p-8">
      <div
        {...getRootProps()}
        className={`cursor-pointer rounded-[24px] border-2 border-dashed p-8 text-center transition-all duration-300 ${
          isDragActive
            ? "border-[#7CA8D0] bg-[#DCE8F5]/40"
            : "border-[#8E8B83]/30 bg-[#F0EEE9] hover:border-[#7CA8D0]"
        }`}
      >
        <input {...getInputProps()} />
        <FileUp className="mx-auto h-8 w-8 text-[#4F7FA8]" aria-hidden="true" />
        <p className="mt-4 text-sm font-bold text-[#1C1C1A]">Drop a signed PDF here, or choose a file</p>
        <p className="mt-2 text-xs leading-5 text-[#4E4B44]">PDF only · up to 10 MB · examined in memory and never saved</p>
      </div>

      {file ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#8E8B83]/20 bg-[#F0EEE9] p-4 shadow-sm">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-[#1C1C1A]">{file.name}</p>
            <p className="mt-1 text-xs text-[#4E4B44]">{fileSizeLabel(file.size)}</p>
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={isPending}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#B7D1EA] px-6 text-xs font-medium text-white transition-all duration-300 hover:bg-[#A5C2DE]/90 active:scale-95 shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Verify document
          </button>
        </div>
      ) : null}

      {error ? (
        <div role="alert" className="mt-4 flex gap-3 rounded-2xl border border-red-200 bg-red-50/80 p-4 text-sm font-medium text-red-800">
          <XCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <p>{error}</p>
        </div>
      ) : null}

      {result ? (
        <div className={`mt-4 rounded-2xl border p-5 ${integrityPassed ? "border-[#7CA8D0]/40 bg-[#F0EEE9] shadow-sm" : "border-red-200 bg-red-50/80"}`}>
          <div className="flex items-start gap-3">
            {integrityPassed ? (
              <BadgeCheck className="mt-0.5 h-6 w-6 shrink-0 text-[#4F7FA8]" aria-hidden="true" />
            ) : (
              <ShieldAlert className="mt-0.5 h-6 w-6 shrink-0 text-red-700" aria-hidden="true" />
            )}
            <div>
              <h2 className="text-base font-bold text-[#1C1C1A]">
                {integrityPassed ? "Document integrity intact" : "Document integrity could not be confirmed"}
              </h2>
              <p className="mt-1 text-sm leading-6 text-[#4E4B44]">
                {integrityPassed
                  ? "The content covered by the document signature has not changed."
                  : result.message || "The file is unsigned, malformed, or changed after signing."}
              </p>
            </div>
          </div>

          <dl className="mt-5 grid gap-3 sm:grid-cols-3">
            <StatusItem label="Integrity" value={result.integrity} />
            <StatusItem label="Certificate trust" value={result.authenticity} falseLabel="Self-signed or untrusted" />
            <StatusItem label="Overall verification" value={result.verified} />
          </dl>
          <p className="mt-4 text-xs leading-5 text-[#4E4B44]">
            {result.signatureCount} signature{result.signatureCount === 1 ? "" : "s"} found{result.expired ? ". At least one certificate is expired." : "."}
          </p>
        </div>
      ) : null}

      {file || result ? (
        <button
          type="button"
          onClick={() => {
            setFile(null);
            setResult(null);
            setError(null);
          }}
          className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-xs font-medium text-[#4E4B44] transition-all duration-300 hover:bg-[#A5C2DE]/10 active:scale-95"
        >
          <RefreshCcw className="h-4 w-4" aria-hidden="true" />
          Check another PDF
        </button>
      ) : null}
    </section>
  );
}

function StatusItem({
  label,
  value,
  falseLabel = "Failed",
}: {
  label: string;
  value: boolean;
  falseLabel?: string;
}) {
  return (
    <div className="rounded-xl bg-[#DCE8F5]/40 p-3">
      <dt className="text-[10px] font-bold tracking-[0.08em] text-[#4E4B44] uppercase">{label}</dt>
      <dd className={`mt-1 text-sm font-bold ${value ? "text-[#1C1C1A]" : "text-red-700"}`}>{value ? "Passed" : falseLabel}</dd>
    </div>
  );
}
