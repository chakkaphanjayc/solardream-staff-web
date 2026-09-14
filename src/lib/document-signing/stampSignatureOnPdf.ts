import "server-only";

import { PDFDocument, type PDFImage } from "pdf-lib";

const MAX_PDF_BYTES = 25 * 1024 * 1024;
const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024;
const DEFAULT_SIGNATURE_WIDTH = 150;
const DEFAULT_MAX_SIGNATURE_HEIGHT = 60;

type PdfTextItem = {
  str: string;
  transform: readonly number[];
  width?: number;
  height?: number;
};

export type PdfAnchorPlacement = {
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type StampSignatureOnPdfOptions = {
  /** Width in PDF points. A point is 1/72 inch. */
  signatureWidth?: number;
  /** Maximum image height in PDF points. */
  maxSignatureHeight?: number;
  /** Horizontal adjustment from the anchor's left edge, in PDF points. */
  offsetX?: number;
  /** Vertical adjustment from the anchor's baseline, in PDF points. */
  offsetY?: number;
};

export type StampedSignaturePdf = {
  pdfBuffer: Buffer;
  anchor: PdfAnchorPlacement;
  signature: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

export class PdfAnchorNotFoundError extends Error {
  constructor(anchorText: string) {
    super(`The PDF does not contain the signature anchor: ${anchorText}`);
    this.name = "PdfAnchorNotFoundError";
  }
}

function toPdfBytes(pdfBuffer: ArrayBuffer | Uint8Array): Uint8Array {
  const bytes = pdfBuffer instanceof Uint8Array
    ? new Uint8Array(pdfBuffer)
    : new Uint8Array(pdfBuffer);
  if (bytes.length === 0 || bytes.length > MAX_PDF_BYTES) {
    throw new Error("The PDF is empty or exceeds the 25 MB signing limit.");
  }
  if (String.fromCharCode(...bytes.subarray(0, 4)) !== "%PDF") {
    throw new Error("The supplied file is not a valid PDF.");
  }
  return bytes;
}

function isPdfTextItem(value: unknown): value is PdfTextItem {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { str?: unknown; transform?: unknown; width?: unknown; height?: unknown };
  return typeof candidate.str === "string"
    && Array.isArray(candidate.transform)
    && candidate.transform.length >= 6
    && candidate.transform.every((coordinate) => typeof coordinate === "number")
    && (candidate.width === undefined || typeof candidate.width === "number")
    && (candidate.height === undefined || typeof candidate.height === "number");
}

function toAnchorPlacement(pageNumber: number, item: PdfTextItem): PdfAnchorPlacement {
  const [, , c, d, x, y] = item.transform;
  const estimatedHeight = Math.hypot(c ?? 0, d ?? 0) || item.height || 0;
  return {
    pageNumber,
    x: x ?? 0,
    y: y ?? 0,
    width: item.width || 0,
    height: estimatedHeight,
  };
}

function parseSignatureImage(signatureBase64: string): { bytes: Buffer; format: "png" | "jpeg" } {
  const match = /^data:image\/(png|jpe?g);base64,([a-zA-Z0-9+/=]+)$/i.exec(signatureBase64.trim());
  if (!match) throw new Error("The signature must be a PNG or JPEG base64 data URL.");

  const bytes = Buffer.from(match[2], "base64");
  const isPng = bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg = bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  const format = match[1].toLowerCase() === "png" ? "png" : "jpeg";

  if (bytes.length === 0 || bytes.length > MAX_SIGNATURE_BYTES || (format === "png" ? !isPng : !isJpeg)) {
    throw new Error("The signature image is invalid or exceeds the 2 MB limit.");
  }
  return { bytes, format };
}

async function embedSignatureImage(
  document: PDFDocument,
  signatureBase64: string,
): Promise<PDFImage> {
  const image = parseSignatureImage(signatureBase64);
  return image.format === "png"
    ? document.embedPng(image.bytes)
    : document.embedJpg(image.bytes);
}

/**
 * Finds an exact invisible or visible text anchor using PDF.js text transforms.
 * These transform coordinates use the native PDF bottom-left coordinate space,
 * which is also the coordinate space accepted by pdf-lib's drawImage method.
 */
export async function findPdfAnchor(
  pdfBuffer: ArrayBuffer | Uint8Array,
  anchorText: string,
): Promise<PdfAnchorPlacement | null> {
  const normalizedAnchor = anchorText.trim();
  if (!normalizedAnchor) throw new Error("An anchor text value is required.");

  // PDF.js can transfer ownership of its input typed array. Clone it so the same
  // original bytes remain available to pdf-lib after text extraction.
  const pdfjsBytes = toPdfBytes(pdfBuffer);
  const { ensureDomMatrixPolyfill } = await import("@/lib/pdfjsPolyfill");
  ensureDomMatrixPolyfill();

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({ data: pdfjsBytes, useSystemFonts: true });

  try {
    const document = await loadingTask.promise;
    try {
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        const textContent = await page.getTextContent();
        const item = textContent.items.find((candidate) => (
          isPdfTextItem(candidate) && candidate.str.trim() === normalizedAnchor
        ));
        if (item && isPdfTextItem(item)) return toAnchorPlacement(pageNumber, item);
      }
      return null;
    } finally {
      document.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }
}

/**
 * Locates an anchor with PDF.js and stamps a base64 PNG/JPEG using pdf-lib.
 * Call this from a Node-runtime Server Action after reading the source PDF.
 */
export async function stampSignatureOnPdf(
  pdfBuffer: ArrayBuffer | Uint8Array,
  signatureBase64: string,
  anchorText: string,
  options: StampSignatureOnPdfOptions = {},
): Promise<StampedSignaturePdf> {
  const pdfBytes = toPdfBytes(pdfBuffer);
  const anchor = await findPdfAnchor(pdfBytes, anchorText);
  if (!anchor) throw new PdfAnchorNotFoundError(anchorText);

  const signatureWidth = options.signatureWidth ?? DEFAULT_SIGNATURE_WIDTH;
  const maxSignatureHeight = options.maxSignatureHeight ?? DEFAULT_MAX_SIGNATURE_HEIGHT;
  const offsetX = options.offsetX ?? 0;
  const offsetY = options.offsetY ?? -2;
  if (signatureWidth <= 0 || maxSignatureHeight <= 0) {
    throw new Error("Signature dimensions must be positive.");
  }

  const document = await PDFDocument.load(pdfBytes, { ignoreEncryption: false });
  const page = document.getPages()[anchor.pageNumber - 1];
  if (!page) throw new Error("The signature anchor points to a page that does not exist.");

  const image = await embedSignatureImage(document, signatureBase64);
  const scaled = image.scale(Math.min(
    signatureWidth / image.width,
    maxSignatureHeight / image.height,
  ));
  const { width: pageWidth, height: pageHeight } = page.getSize();
  const x = Math.max(0, Math.min(anchor.x + offsetX, pageWidth - scaled.width));
  // The anchor is located on the text baseline. Position the image directly over
  // that line, then allow a small configurable correction for each PDF template.
  const y = Math.max(
    0,
    Math.min(anchor.y + anchor.height - scaled.height + offsetY, pageHeight - scaled.height),
  );

  page.drawImage(image, { x, y, width: scaled.width, height: scaled.height });
  return {
    pdfBuffer: Buffer.from(await document.save()),
    anchor,
    signature: { x, y, width: scaled.width, height: scaled.height },
  };
}
