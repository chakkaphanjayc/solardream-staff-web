import "server-only";

import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { pdflibAddPlaceholder } from "@signpdf/placeholder-pdf-lib";
import signpdf from "@signpdf/signpdf";
import { P12Signer } from "@signpdf/signer-p12";
import { PDFDocument } from "pdf-lib";

import type { ProcessAndSignPdfInput } from "@/types/documentSigning";

const MAX_SIGNATURE_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_CERTIFICATE_BYTES = 5 * 1024 * 1024;
const PLACEHOLDER_SIGNATURE_LENGTH = 16_384;

function parseSignaturePng(signatureBase64: string): Buffer {
  const match = /^data:image\/png;base64,([a-zA-Z0-9+/=]+)$/.exec(signatureBase64.trim());
  if (!match) throw new Error("The signature must be a PNG data URL.");

  const bytes = Buffer.from(match[1], "base64");
  const pngMagicHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bytes.length === 0 || bytes.length > MAX_SIGNATURE_IMAGE_BYTES || !bytes.subarray(0, 8).equals(pngMagicHeader)) {
    throw new Error("The signature image is invalid or exceeds 2 MB.");
  }
  return bytes;
}

async function readSigningCertificate(): Promise<Buffer> {
  const configuredPath = process.env.PDF_SIGNING_P12_PATH?.trim();
  if (!configuredPath) {
    throw new Error("PDF_SIGNING_P12_PATH is not configured.");
  }

  const certificatePath = path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(process.cwd(), configuredPath);
  const certificateStats = await stat(certificatePath);
  if (!certificateStats.isFile() || certificateStats.size === 0 || certificateStats.size > MAX_CERTIFICATE_BYTES) {
    throw new Error("The PKCS#12 certificate is missing or exceeds 5 MB.");
  }

  return readFile(certificatePath);
}

function assertPlacementFitsPage(input: ProcessAndSignPdfInput): void {
  if (input.x + input.width > 1 || input.y + input.height > 1) {
    throw new Error("The signature placement extends beyond the PDF page.");
  }
}

export async function stampAndCryptographicallySignPdf(
  originalPdf: Buffer,
  input: ProcessAndSignPdfInput,
): Promise<Buffer> {
  assertPlacementFitsPage(input);
  const signatureBytes = parseSignaturePng(input.signatureBase64);
  const pdf = await PDFDocument.load(originalPdf, { ignoreEncryption: false });
  const pages = pdf.getPages();
  const page = pages[input.pageNumber - 1];
  if (!page) throw new Error("The requested signature page does not exist.");

  const embeddedSignature = await pdf.embedPng(signatureBytes);
  const { width: pageWidth, height: pageHeight } = page.getSize();
  const availableWidth = pageWidth * input.width;
  const availableHeight = pageHeight * input.height;
  const scale = Math.min(
    availableWidth / embeddedSignature.width,
    availableHeight / embeddedSignature.height,
  );
  const signatureWidth = embeddedSignature.width * scale;
  const signatureHeight = embeddedSignature.height * scale;
  const signatureX = pageWidth * input.x;
  const signatureY = pageHeight - (pageHeight * input.y) - signatureHeight;

  page.drawImage(embeddedSignature, {
    x: signatureX,
    y: signatureY,
    width: signatureWidth,
    height: signatureHeight,
  });

  pdflibAddPlaceholder({
    pdfDoc: pdf,
    reason: "Document approved with an electronic signature.",
    contactInfo: "SolarDream",
    name: "SolarDream",
    location: "Thailand",
    signatureLength: PLACEHOLDER_SIGNATURE_LENGTH,
    widgetRect: [0, 0, 0, 0],
  });

  const certificate = await readSigningCertificate();
  const signer = new P12Signer(certificate, {
    passphrase: process.env.PDF_SIGNING_P12_PASSPHRASE || "",
  });
  const preparedPdf = Buffer.from(await pdf.save());
  return signpdf.sign(preparedPdf, signer);
}
