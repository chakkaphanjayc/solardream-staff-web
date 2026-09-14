"use client";

import { Download, ExternalLink, FileText } from "@/components/ui/icons";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ProposalPdfViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  pdfUrl: string | null;
  title?: string;
}

export function ProposalPdfViewerModal({
  isOpen,
  onClose,
  pdfUrl,
  title = "Official Quotation PDF",
}: ProposalPdfViewerModalProps) {
  if (!pdfUrl) return null;

  const embedUrl =
    pdfUrl.includes("drive.google.com/file/d/") &&
    !pdfUrl.includes("/preview")
      ? pdfUrl.replace(/\/view(\?.*)?$/, "/preview")
      : pdfUrl;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      size="full"
      tone="light"
      ariaLabel={title}
      closeLabel="Close PDF viewer"
      className="h-[92dvh] max-h-[92dvh] max-w-5xl"
    >
      <DialogContent className="overflow-hidden rounded-[28px] border border-[#8E8B83]/20 bg-[#F0EEE9] shadow-xl">
        <DialogHeader className="border-b border-[#8E8B83]/15 bg-[#F0EEE9] px-6 py-4">
          <div className="flex min-w-0 flex-1 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[#DCE8F5] text-[#4F7FA8]">
                <FileText aria-hidden="true" className="size-5" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="truncate text-base font-bold text-[#1C1C1A]">
                  {title}
                </DialogTitle>
                <DialogDescription className="mt-1 text-xs font-medium text-[#4E4B44]">
                  SolarDream client portal secure viewer
                </DialogDescription>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <a
                href={pdfUrl}
                download
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Download quotation PDF"
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#8E8B83]/30 bg-[#F0EEE9] px-5 text-xs font-medium text-[#1C1C1A] shadow-sm transition-all duration-300 hover:bg-[#A5C2DE]/10 hover:text-[#3E6685] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA] focus-visible:ring-offset-2"
              >
                <Download aria-hidden="true" className="size-4 text-[#4F7FA8]" />
                <span className="hidden sm:inline">Download</span>
              </a>
              <a
                href={pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open quotation PDF in a new window"
                className="inline-flex size-11 items-center justify-center rounded-full border border-[#8E8B83]/30 bg-[#F0EEE9] text-[#1C1C1A] shadow-sm transition-all duration-300 hover:bg-[#A5C2DE]/10 hover:text-[#3E6685] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA] focus-visible:ring-offset-2"
              >
                <ExternalLink aria-hidden="true" className="size-4" />
              </a>
            </div>
          </div>
        </DialogHeader>

        <DialogBody className="relative max-h-none flex-1 overflow-hidden bg-slate-950 p-0 sm:p-0">
          <iframe
            src={embedUrl}
            className="h-full w-full border-0"
            title={title}
            allow="autoplay"
          />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
