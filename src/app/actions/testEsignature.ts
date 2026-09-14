"use server";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { stampQuotationPdf } from "@/lib/pdf-signer";
import { requireStaff } from "@/lib/auth-guard";

export type TestSignatureInput = {
  signatureDataUrl: string;
  signerName: string;
  signerIpAddress?: string;
  signerUserAgent?: string;
  verificationUrl?: string;
  customPdfBase64?: string;
};

export async function generateTestStampedPdf(input: TestSignatureInput) {
  try {
    await requireStaff();

    if (!input.signatureDataUrl || !input.signatureDataUrl.startsWith("data:image/png;base64,")) {
      return { success: false, error: "Please draw or provide a valid PNG signature before testing." };
    }

    let targetPdfBytes: Uint8Array;

    if (input.customPdfBase64) {
      const cleanBase64 = input.customPdfBase64.replace(/^data:application\/pdf;base64,/, "");
      const buffer = Buffer.from(cleanBase64, "base64");
      const header = new TextDecoder().decode(buffer.subarray(0, 4));
      if (!header.startsWith("%PDF")) {
        return { success: false, error: "Uploaded file is not a valid PDF document." };
      }
      targetPdfBytes = new Uint8Array(buffer);
    } else {
      // 1. Create a clean 2-page sample PDF
      const doc = await PDFDocument.create();
      const page1 = doc.addPage([595.28, 841.89]); // A4
      const page2 = doc.addPage([595.28, 841.89]); // A4

      const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
      const fontRegular = await doc.embedFont(StandardFonts.Helvetica);

      // Page 1 Content
      page1.drawText("SolarDream Sample Quotation Document", {
        x: 50,
        y: 780,
        size: 18,
        font: fontBold,
        color: rgb(0.06, 0.09, 0.16),
      });
      page1.drawText("Quotation Reference: QTN-2026-SANDBOX-TEST", {
        x: 50,
        y: 755,
        size: 11,
        font: fontRegular,
        color: rgb(0.3, 0.35, 0.45),
      });
      page1.drawText("This is a developer sandbox preview document generated for E-Signature Audit Stamp testing.", {
        x: 50,
        y: 725,
        size: 9.5,
        font: fontRegular,
        color: rgb(0.4, 0.4, 0.4),
      });

      // Sample Table Box
      page1.drawRectangle({
        x: 50,
        y: 500,
        width: 495,
        height: 180,
        color: rgb(0.97, 0.98, 0.99),
        borderColor: rgb(0.8, 0.85, 0.9),
        borderWidth: 1,
      });
      page1.drawText("Item Description                                      Qty     Rate           Amount", {
        x: 65,
        y: 655,
        size: 10,
        font: fontBold,
        color: rgb(0.1, 0.15, 0.25),
      });
      page1.drawText("1. Solar Inverter Tier 1 Hybrid 10kW                     1     B 85,000       B 85,000", {
        x: 65,
        y: 625,
        size: 9,
        font: fontRegular,
        color: rgb(0.2, 0.2, 0.2),
      });
      page1.drawText("2. Tier 1 Mono PERC Solar Panels 580W                 18     B 4,500        B 81,000", {
        x: 65,
        y: 600,
        size: 9,
        font: fontRegular,
        color: rgb(0.2, 0.2, 0.2),
      });
      page1.drawText("3. Turnkey Engineering & PEA License Permitting        1     B 25,000       B 25,000", {
        x: 65,
        y: 575,
        size: 9,
        font: fontRegular,
        color: rgb(0.2, 0.2, 0.2),
      });

      // Page 2: Customer Acceptance & Signature Anchors
      page2.drawText("Terms & Customer Acceptance", {
        x: 50,
        y: 780,
        size: 16,
        font: fontBold,
        color: rgb(0.06, 0.09, 0.16),
      });

      page2.drawText("Accepted By:", {
        x: 50,
        y: 280,
        size: 10,
        font: fontBold,
        color: rgb(0.2, 0.2, 0.2),
      });

      page2.drawLine({
        start: { x: 50, y: 200 },
        end: { x: 260, y: 200 },
        thickness: 1,
        color: rgb(0.7, 0.75, 0.8),
      });
      page2.drawText("{{customer:signature}}", {
        x: 60,
        y: 210,
        size: 8,
        font: fontRegular,
        color: rgb(0.85, 0.85, 0.85),
      });
      page2.drawText("Name: {{customer:name}}", {
        x: 50,
        y: 180,
        size: 9,
        font: fontRegular,
        color: rgb(0.3, 0.3, 0.3),
      });
      page2.drawText("Date: {{customer:date}}", {
        x: 50,
        y: 160,
        size: 9,
        font: fontRegular,
        color: rgb(0.3, 0.3, 0.3),
      });

      page2.drawText("Authorized Signature:", {
        x: 320,
        y: 280,
        size: 10,
        font: fontBold,
        color: rgb(0.2, 0.2, 0.2),
      });
      page2.drawLine({
        start: { x: 320, y: 200 },
        end: { x: 530, y: 200 },
        thickness: 1,
        color: rgb(0.7, 0.75, 0.8),
      });
      page2.drawText("SolarDream Authorized Signatory", {
        x: 320,
        y: 180,
        size: 9,
        font: fontRegular,
        color: rgb(0.3, 0.3, 0.3),
      });

      targetPdfBytes = await doc.save();
    }

    // 2. Stamp target PDF with stampQuotationPdf
    const result = await stampQuotationPdf({
      pdfBytes: targetPdfBytes,
      signatureDataUrl: input.signatureDataUrl,
      signedAt: new Date(),
      signerIpAddress: input.signerIpAddress || "127.0.0.1",
      signerUserAgent: input.signerUserAgent || "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
      verificationUrl: input.verificationUrl || "https://solar-dream.org/verify/QTN-2026-DEV-TEST",
      signerName: input.signerName || "Chakkaphan Chaiwong",
    });

    const base64 = Buffer.from(result.pdfBytes).toString("base64");
    const dataUrl = `data:application/pdf;base64,${base64}`;

    return {
      success: true,
      dataUrl,
      sha256Hash: result.sha256Hash,
    };
  } catch (error) {
    console.error("[generateTestStampedPdf] Failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to generate test stamped PDF.",
    };
  }
}
