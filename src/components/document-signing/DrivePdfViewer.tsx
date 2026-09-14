"use client";

import dynamic from "next/dynamic";

import type { DrivePdfPayload, SignaturePlacement } from "@/types/documentSigning";

type DrivePdfViewerProps = {
  pdf: DrivePdfPayload;
  signing?: boolean;
  onConfirmSignature: (placement: SignaturePlacement) => void | Promise<void>;
};

const DrivePdfViewerClient = dynamic(
  () => import("@/components/document-signing/DrivePdfViewerClient"),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-80 items-center justify-center rounded-2xl border border-slate-200 bg-[#F5F2EB] p-6 text-sm text-slate-600">
        Preparing secure document viewer…
      </div>
    ),
  },
);

export function DrivePdfViewer(props: DrivePdfViewerProps) {
  return <DrivePdfViewerClient {...props} />;
}
