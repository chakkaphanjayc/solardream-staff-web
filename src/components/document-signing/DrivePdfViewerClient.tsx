"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Minus,
  Plus,
} from "@/components/ui/icons";

import { SignaturePlacementOverlay } from "@/components/document-signing/SignaturePlacementOverlay";
import type { DrivePdfPayload, SignaturePlacement } from "@/types/documentSigning";

if (typeof window !== "undefined" && pdfjs?.GlobalWorkerOptions) {
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version || "5.4.296"}/legacy/build/pdf.worker.min.mjs`;
}

type DrivePdfViewerClientProps = {
  pdf: DrivePdfPayload;
  signing?: boolean;
  onConfirmSignature: (placement: SignaturePlacement) => void | Promise<void>;
};

type PageSize = {
  width: number;
  height: number;
};

const MIN_ZOOM = 0.7;
const MAX_ZOOM = 1.8;
const ZOOM_INCREMENT = 0.1;

function formatZoom(zoom: number): string {
  return `${Math.round(zoom * 100)}%`;
}

export default function DrivePdfViewerClient({
  pdf,
  signing,
  onConfirmSignature,
}: DrivePdfViewerClientProps) {
  return (
    <DrivePdfViewerClientContent
      key={pdf.fileId}
      pdf={pdf}
      signing={signing}
      onConfirmSignature={onConfirmSignature}
    />
  );
}

function DrivePdfViewerClientContent({
  pdf,
  signing = false,
  onConfirmSignature,
}: DrivePdfViewerClientProps) {
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const pageSurfaceRef = useRef<HTMLDivElement | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [pageWidth, setPageWidth] = useState(320);
  const [pageSize, setPageSize] = useState<PageSize | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const pdfFile = useMemo(
    () => ({
      data: Uint8Array.from(atob(pdf.base64), (character) => character.charCodeAt(0)),
    }),
    [pdf.base64],
  );

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const resizeObserver = new ResizeObserver(([entry]) => {
      const availableWidth = entry?.contentRect.width ?? 320;
      setPageWidth(Math.max(280, Math.min(860, availableWidth - 32)));
    });
    resizeObserver.observe(viewer);
    return () => resizeObserver.disconnect();
  }, []);

  const updateRenderedPageSize = useCallback(() => {
    const surface = pageSurfaceRef.current;
    if (!surface) return;
    const rect = surface.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setPageSize({ width: rect.width, height: rect.height });
    }
  }, []);

  useEffect(() => {
    updateRenderedPageSize();
  }, [pageNumber, pageWidth, updateRenderedPageSize, zoom]);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-[#F5F2EB] text-[#0F172A]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-[#F0EEE9] p-4 sm:px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 shrink-0 text-slate-600" aria-hidden="true" />
            <h2 className="truncate text-sm font-semibold">{pdf.fileName}</h2>
          </div>
          <p className="mt-1 text-xs text-slate-600">Draw and position your signature directly on the page.</p>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-white p-1" aria-label="Zoom controls">
          <button
            type="button"
            onClick={() => setZoom((value) => Math.max(MIN_ZOOM, value - ZOOM_INCREMENT))}
            disabled={zoom <= MIN_ZOOM}
            className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-full text-slate-600 transition hover:bg-[#F0EEE9] disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Zoom out"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="min-w-12 text-center text-xs font-semibold tabular-nums">{formatZoom(zoom)}</span>
          <button
            type="button"
            onClick={() => setZoom((value) => Math.min(MAX_ZOOM, value + ZOOM_INCREMENT))}
            disabled={zoom >= MAX_ZOOM}
            className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-full text-slate-600 transition hover:bg-[#F0EEE9] disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Zoom in"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div ref={viewerRef} className="overflow-auto bg-slate-200 p-4 sm:p-6">
        <div className="mx-auto w-max max-w-none">
          <Document
            file={pdfFile}
            loading={<div className="flex min-h-80 items-center justify-center text-sm text-slate-600">Loading PDF…</div>}
            error={
              <div className="flex min-h-80 w-full flex-col items-center justify-center gap-3">
                <iframe
                  src={`data:application/pdf;base64,${pdf.base64}`}
                  title={pdf.fileName}
                  className="h-96 w-full rounded-xl border border-slate-300 bg-white"
                />
              </div>
            }
            onLoadSuccess={({ numPages: loadedPages }) => {
              setNumPages(loadedPages);
              setPageNumber((current) => Math.min(Math.max(1, current), loadedPages));
            }}
            onLoadError={(error: Error) => setLoadError(error.message)}
          >
            <div ref={pageSurfaceRef} className="relative w-max bg-white shadow-[0_4px_8px_rgba(15,23,42,0.16)]">
              <Page
                pageNumber={pageNumber}
                width={Math.round(pageWidth * zoom)}
                renderAnnotationLayer={false}
                renderTextLayer={false}
                onRenderSuccess={updateRenderedPageSize}
              />
              {pageSize ? (
                <SignaturePlacementOverlay
                  key={`${pdf.fileId}:${pageNumber}`}
                  pageNumber={pageNumber}
                  pageSize={pageSize}
                  disabled={signing}
                  onConfirm={onConfirmSignature}
                />
              ) : null}
            </div>
          </Document>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-[#F0EEE9] p-4 sm:px-5">
        <p className="text-xs text-slate-600">
          {numPages > 0 ? `Page ${pageNumber} of ${numPages}` : "Loading pages…"}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPageNumber((current) => Math.max(1, current - 1))}
            disabled={pageNumber <= 1 || numPages === 0 || signing}
            className="inline-flex min-h-11 items-center gap-1 rounded-full bg-white px-4 text-xs font-semibold transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Previous
          </button>
          <button
            type="button"
            onClick={() => setPageNumber((current) => Math.min(numPages, current + 1))}
            disabled={pageNumber >= numPages || numPages === 0 || signing}
            className="inline-flex min-h-11 items-center gap-1 rounded-full bg-[#B7D1EA] px-4 text-xs font-semibold transition hover:bg-[#a5c2de] disabled:cursor-not-allowed disabled:opacity-45"
          >
            Next
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="sr-only" aria-live="polite">
        {signing ? "Signing document" : ""}
      </div>
    </section>
  );
}
