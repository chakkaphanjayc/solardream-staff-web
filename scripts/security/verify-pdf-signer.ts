import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";

import { findAnchorCoordinates, stampQuotationPdf } from "../../src/lib/pdf-signer";

const SIGNATURE_ANCHOR = "{{customer:signature}}";
const NAME_ANCHOR = "{{customer:name}}";
const DATE_ANCHOR = "{{customer:date}}";
const SIGNER_NAME = "Ada Lovelace";
const SIGN_DATE = "2026-07-26";

type TextItem = {
  str: string;
  transform: number[];
};

function isTextItem(value: unknown): value is TextItem {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { str?: unknown; transform?: unknown };
  return typeof candidate.str === "string"
    && Array.isArray(candidate.transform)
    && candidate.transform.every((coordinate) => typeof coordinate === "number");
}

async function createPdfWithAnchors() {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([600, 800]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const invisible = rgb(1, 1, 1);

  page.drawText(SIGNATURE_ANCHOR, { x: 320, y: 300, size: 9, font, color: invisible });
  page.drawText(NAME_ANCHOR, { x: 120, y: 240, size: 9, font, color: invisible });
  page.drawText(DATE_ANCHOR, { x: 380, y: 240, size: 9, font, color: invisible });

  return pdf.save();
}

async function createLegacyPdf() {
  const pdf = await PDFDocument.create();
  pdf.addPage([600, 800]);
  pdf.addPage([600, 800]);
  return pdf.save();
}

async function getTextItems(pdfBytes: Uint8Array): Promise<TextItem[][]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(pdfBytes), useSystemFonts: true });

  try {
    const document = await loadingTask.promise;
    try {
      const pages = await Promise.all(
        Array.from({ length: document.numPages }, async (_, index) => {
          const content = await (await document.getPage(index + 1)).getTextContent();
          return content.items.filter(isTextItem) as TextItem[];
        }),
      );
      return pages;
    } finally {
      document.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }
}

async function main() {
  const sourcePdf = await createPdfWithAnchors();
  const sourceHash = createHash("sha256").update(sourcePdf).digest("hex");
  const [signatureAnchor, nameAnchor, dateAnchor] = await Promise.all([
    findAnchorCoordinates(sourcePdf, SIGNATURE_ANCHOR),
    findAnchorCoordinates(sourcePdf, NAME_ANCHOR),
    findAnchorCoordinates(sourcePdf, DATE_ANCHOR),
  ]);

  assert.deepEqual(signatureAnchor, { pageIndex: 0, x: 320, y: 300 });
  assert.deepEqual(nameAnchor, { pageIndex: 0, x: 120, y: 240 });
  assert.deepEqual(dateAnchor, { pageIndex: 0, x: 380, y: 240 });
  assert.equal(await findAnchorCoordinates(sourcePdf, "{{customer:missing}}"), null);

  const signatureDataUrl = await QRCode.toDataURL("signature-test", { width: 120, margin: 0 });
  const signed = await stampQuotationPdf({
    pdfBytes: sourcePdf,
    signatureDataUrl,
    signedAt: new Date(`${SIGN_DATE}T00:00:00.000Z`),
    signerIpAddress: "203.0.113.7",
    signerUserAgent: "SolarDream PDF signer test",
    verificationUrl: "https://example.test/verify/QTN-TEST-1",
    signerName: SIGNER_NAME,
  });

  assert.equal(createHash("sha256").update(sourcePdf).digest("hex"), sourceHash, "source PDF must remain immutable");
  assert.equal(
    signed.sha256Hash,
    createHash("sha256").update(signed.pdfBytes).digest("hex"),
    "returned hash must attest to finalized PDF bytes",
  );
  assert.ok(signed.pdfBytes.length > sourcePdf.length, "signature and QR audit data must be embedded");

  const signedText = await getTextItems(signed.pdfBytes);
  const signedPageText = signedText[0];
  const stampedName = signedPageText.find((item) => item.str === SIGNER_NAME);
  const stampedDate = signedPageText.find((item) => item.str === SIGN_DATE);
  assert.ok(stampedName, "customer name must be stamped");
  assert.ok(stampedDate, "signature date must be stamped");
  assert.equal(Math.round(stampedName.transform[4]), 120, "name must use its anchor X coordinate");
  assert.equal(Math.round(stampedName.transform[5]), 238, "name must use its anchor Y coordinate");
  assert.equal(Math.round(stampedDate.transform[4]), 380, "date must use its anchor X coordinate");
  assert.equal(Math.round(stampedDate.transform[5]), 238, "date must use its anchor Y coordinate");
  assert.ok(
    signedText.flat().some((item) => item.str === "E-SIGNATURE AUDIT TRAIL"),
    "security audit trail must be embedded",
  );

  const legacyPdf = await createLegacyPdf();
  const legacySigned = await stampQuotationPdf({
    pdfBytes: legacyPdf,
    signatureDataUrl,
    signedAt: new Date(`${SIGN_DATE}T00:00:00.000Z`),
    signerIpAddress: "203.0.113.7",
    signerUserAgent: "SolarDream PDF signer test",
    verificationUrl: "https://example.test/verify/QTN-LEGACY-1",
  });
  assert.equal((await PDFDocument.load(legacySigned.pdfBytes)).getPageCount(), 2, "legacy fallback must preserve all pages");
  assert.match(legacySigned.sha256Hash, /^[a-f0-9]{64}$/, "legacy fallback must still produce a SHA-256 hash");

  await assert.rejects(
    stampQuotationPdf({
      pdfBytes: sourcePdf,
      signatureDataUrl: "data:image/jpeg;base64,aGVsbG8=",
      signedAt: new Date(),
      signerIpAddress: "203.0.113.7",
      signerUserAgent: "security-test",
      verificationUrl: "https://example.test/verify/invalid",
    }),
    /must be a PNG data URL/,
    "non-PNG signatures must be rejected",
  );

  const oversizedSignature = `data:image/png;base64,${Buffer.alloc((2 * 1024 * 1024) + 1).toString("base64")}`;
  await assert.rejects(
    stampQuotationPdf({
      pdfBytes: sourcePdf,
      signatureDataUrl: oversizedSignature,
      signedAt: new Date(),
      signerIpAddress: "203.0.113.7",
      signerUserAgent: "security-test",
      verificationUrl: "https://example.test/verify/oversized",
    }),
    /exceeds 2 MB/,
    "oversized signature payloads must be rejected",
  );

  console.log("PDF signer verification passed: anchors, legacy fallback, QR audit trail, hash integrity, and signature validation.");
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
