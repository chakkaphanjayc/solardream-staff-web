"use client";

import { useEffect, useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, LoaderCircle } from "@/components/ui/icons";

import { getDrivePdf, processAndSignPdf } from "@/app/actions/drivePdf";
import { DrivePdfViewer } from "@/components/document-signing/DrivePdfViewer";
import type { DrivePdfPayload, ProcessAndSignPdfResult, SignaturePlacement } from "@/types/documentSigning";

type DrivePdfSigningFlowProps = {
  fileId: string;
  onSigned?: (result: ProcessAndSignPdfResult) => void;
};

export function DrivePdfSigningFlow({ fileId, onSigned }: DrivePdfSigningFlowProps) {
  return <DrivePdfSigningFlowInstance key={fileId} fileId={fileId} onSigned={onSigned} />;
}

function DrivePdfSigningFlowInstance({ fileId, onSigned }: DrivePdfSigningFlowProps) {
  const [pdf, setPdf] = useState<DrivePdfPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signedDocument, setSignedDocument] = useState<ProcessAndSignPdfResult | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let active = true;

    void getDrivePdf(fileId)
      .then((loadedPdf) => {
        if (active) setPdf(loadedPdf);
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load this document.");
      });

    return () => {
      active = false;
    };
  }, [fileId]);

  function confirmSignature(placement: SignaturePlacement): void {
    setError(null);
    startTransition(async () => {
      try {
        const result = await processAndSignPdf({ fileId, ...placement });
        setSignedDocument(result);
        onSigned?.(result);
      } catch (signError: unknown) {
        setError(signError instanceof Error ? signError.message : "Unable to sign this document.");
      }
    });
  }

  if (error) {
    return (
      <div role="alert" className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <p>{error}</p>
      </div>
    );
  }

  if (!pdf) {
    return (
      <div className="flex min-h-80 items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-[#F5F2EB] p-6 text-sm text-slate-600">
        <LoaderCircle className="h-5 w-5 animate-spin text-[#0F172A]" aria-hidden="true" />
        Loading secure document…
      </div>
    );
  }

  if (signedDocument) {
    return (
      <div className="rounded-2xl border border-[#B7D1EA] bg-[#F5F2EB] p-6 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-[#0F172A]" aria-hidden="true" />
        <h2 className="mt-3 text-lg font-semibold text-[#0F172A]">Document signed securely</h2>
        <p className="mt-2 text-sm text-slate-600">Your signed copy has been saved to Google Drive.</p>
        <p className="mt-3 text-xs font-medium text-slate-500">{signedDocument.fileName}</p>
      </div>
    );
  }

  return <DrivePdfViewer pdf={pdf} signing={isPending} onConfirmSignature={confirmSignature} />;
}
