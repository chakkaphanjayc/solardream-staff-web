"use client";

import dynamic from "next/dynamic";

export type ProposalEmbeddedPdfViewerProps = {
  pdfUrl: string | null;
  title?: string;
  version?: number;
  isSigned?: boolean;
  onReviewComplete?: () => void;
};

const ProposalEmbeddedPdfViewerClient = dynamic(
  () => import("@/components/proposals/detail/ProposalEmbeddedPdfViewerClient"),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-96 items-center justify-center rounded-2xl border-[3px] border-[#000000] bg-[#F0EEE9] p-6 text-sm font-semibold text-slate-600 shadow-[4px_4px_0_#000000]">
        Preparing your quotation…
      </div>
    ),
  },
);

export function ProposalEmbeddedPdfViewer(props: ProposalEmbeddedPdfViewerProps) {
  return <ProposalEmbeddedPdfViewerClient {...props} />;
}
