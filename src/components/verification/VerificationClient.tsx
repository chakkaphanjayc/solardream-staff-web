"use client";

import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileUp, LoaderCircle, ShieldCheck } from "@/components/ui/icons";
import { useLocale, useTranslations } from "next-intl";

type VerificationAudit = {
  quotationId: string;
  sha256Hash: string | null;
  signedAt: string | null;
  signerIpAddress: string | null;
  signerUserAgent: string | null;
  verificationUrl: string | null;
};

type VerificationClientProps = {
  quotationId: string;
  audit: VerificationAudit | null;
};

type VerificationStatus = "idle" | "hashing" | "match" | "mismatch" | "error";

function bytesToHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function formattedDate(value: string | null, locale: string, unavailable: string) {
  if (!value) return unavailable;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString(locale, { timeZone: "UTC", timeZoneName: "short" });
}

export default function VerificationClient({ quotationId, audit }: VerificationClientProps) {
  const locale = useLocale();
  const t = useTranslations("VerificationClient");
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<VerificationStatus>("idle");
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const verifyFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setStatus("error");
      setError(t("choosePdf"));
      return;
    }
    if (!audit?.sha256Hash) {
      setStatus("error");
      setError(t("noSignatureAudit"));
      return;
    }

    setStatus("hashing");
    setError(null);
    setFileName(file.name);
    try {
      const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      setStatus(bytesToHex(hash) === audit.sha256Hash.toLowerCase() ? "match" : "mismatch");
    } catch {
      setStatus("error");
      setError(t("documentUnreadable"));
    }
  };

  const onDrop = (event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    void verifyFile(event.dataTransfer.files.item(0) || undefined);
  };

  const resultPanel = status === "match"
    ? {
      icon: <CheckCircle2 className="h-6 w-6" />,
      title: t("authenticTitle"),
      copy: t("authenticDescription"),
      className: "border-emerald-300 bg-emerald-50 text-emerald-950",
    }
    : status === "mismatch"
      ? {
        icon: <AlertTriangle className="h-6 w-6" />,
        title: t("mismatchTitle"),
        copy: t("mismatchDescription"),
        className: "border-rose-300 bg-rose-50 text-rose-950",
      }
      : null;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center px-5 py-10 sm:px-8">
      <section className="grid w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.12)] lg:grid-cols-[0.86fr_1.14fr]">
        <div className="bg-[#0F172A] p-7 text-white sm:p-10">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#B7D1EA] text-[#0F172A]">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <p className="mt-8 text-xs font-bold uppercase tracking-[0.16em] text-[#B7D1EA]">{t("eyebrow")}</p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">{t("title")}</h1>
          <p className="mt-4 max-w-sm text-sm leading-6 text-slate-300">
            {t("description")}
          </p>
          <dl className="mt-10 space-y-5 border-t border-white/15 pt-6 text-sm">
            <div>
              <dt className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">{t("quotation")}</dt>
              <dd className="mt-1 break-all font-semibold text-white">{quotationId || t("unavailable")}</dd>
            </div>
            <div>
              <dt className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">{t("signedAt")}</dt>
              <dd className="mt-1 text-slate-100">{formattedDate(audit?.signedAt || null, locale, t("unavailable"))}</dd>
            </div>
            <div>
              <dt className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">{t("signerIp")}</dt>
              <dd className="mt-1 font-mono text-xs text-slate-100">{audit?.signerIpAddress || t("unavailable")}</dd>
            </div>
          </dl>
        </div>

        <div className="p-7 sm:p-10">
          <p className="text-sm font-bold text-slate-900">{t("verifyLocalPdf")}</p>
          <p className="mt-2 max-w-lg text-sm leading-6 text-slate-600">
            {t("localHashDescription")}
          </p>

          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            onChange={(event) => void verifyFile(event.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={onDrop}
            disabled={status === "hashing" || !audit?.sha256Hash}
            className="mt-8 flex min-h-52 w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 text-center transition-all duration-300 ease-expo-out hover:border-[#B7D1EA] hover:bg-[#B7D1EA]/15 disabled:cursor-not-allowed disabled:opacity-55"
          >
            {status === "hashing" ? <LoaderCircle className="h-8 w-8 animate-spin text-slate-700" /> : <FileUp className="h-8 w-8 text-slate-700" />}
            <span className="mt-4 text-sm font-bold text-slate-900">{status === "hashing" ? t("checkingHash") : t("dropPdf")}</span>
            <span className="mt-1 text-xs text-slate-500">{t("choosePdfFromDevice")}</span>
          </button>
          {fileName && <p className="mt-3 truncate text-xs text-slate-500">{t("selected", { fileName })}</p>}

          {resultPanel && (
            <div className={`mt-6 flex gap-3 rounded-xl border p-5 ${resultPanel.className}`} role="status">
              <div className="shrink-0">{resultPanel.icon}</div>
              <div>
                <p className="font-extrabold">{resultPanel.title}</p>
                <p className="mt-1 text-sm">{resultPanel.copy}</p>
              </div>
            </div>
          )}
          {status === "error" && (
            <div className="mt-6 flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-5 text-amber-950" role="alert">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <p className="text-sm font-semibold">{error}</p>
            </div>
          )}
          {!audit?.sha256Hash && !error && (
            <p className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              {t("noPublishedAudit")}
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
