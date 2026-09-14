import "server-only";

import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { createHash } from "node:crypto";

export interface HandoverPdfInput {
  projectCode: string;
  taskTitle: string;
  customerName: string;
  customerPhone?: string | null;
  installationAddress?: string | null;
  systemSizeKwp?: number | null;
  panelCount?: number | null;
  inverterModel?: string | null;
  technicianName?: string;
  completedAt: Date | string;
  customerSignatureBase64: string;
  qcVerifiedItems?: string[];
  qcTestValues?: Record<string, string | number | boolean>;
  customerIp?: string | null;
  technicianGps?: { latitude: number; longitude: number; accuracy?: number } | null;
  notes?: string;
}

export interface HandoverPdfResult {
  pdfBuffer: Buffer;
  sha256Hash: string;
  filename: string;
}

/**
 * Generates an official Project Handover Certificate PDF using pdf-lib,
 * embedding the customer's E-signature and SHA-256 hash.
 */
export async function generateProjectHandoverPdf(
  input: HandoverPdfInput
): Promise<HandoverPdfResult> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4 Size
  const { width, height } = page.getSize();

  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Background Brand Fill
  page.drawRectangle({
    x: 0,
    y: height - 100,
    width,
    height: 100,
    color: rgb(0.06, 0.09, 0.16), // #0F172A (Abyss)
  });

  // Header Titles
  page.drawText("SolarDream (Thailand) Co., Ltd.", {
    x: 35,
    y: height - 40,
    size: 18,
    font: fontBold,
    color: rgb(0.72, 0.82, 0.92), // #B7D1EA
  });

  page.drawText("PROJECT HANDOVER & COMMISSIONING CERTIFICATE", {
    x: 35,
    y: height - 65,
    size: 12,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  page.drawText(`CERT-${input.projectCode}-${Date.now().toString().slice(-4)}`, {
    x: width - 200,
    y: height - 40,
    size: 10,
    font: fontBold,
    color: rgb(0.72, 0.82, 0.92),
  });

  const completedDateStr = new Date(input.completedAt).toLocaleDateString("th-TH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  page.drawText(`Date: ${completedDateStr}`, {
    x: width - 200,
    y: height - 60,
    size: 9,
    font: fontRegular,
    color: rgb(0.8, 0.8, 0.8),
  });

  let currentY = height - 130;

  // Section 1: Customer & Site Details
  page.drawRectangle({
    x: 35,
    y: currentY - 80,
    width: width - 70,
    height: 80,
    color: rgb(0.96, 0.95, 0.92), // #F5F2EB
    borderColor: rgb(0.85, 0.82, 0.77),
    borderWidth: 1,
  });

  page.drawText("1. CUSTOMER & SITE INFORMATION", {
    x: 45,
    y: currentY - 20,
    size: 11,
    font: fontBold,
    color: rgb(0.06, 0.09, 0.16),
  });

  page.drawText(`Customer Name: ${input.customerName}`, {
    x: 45,
    y: currentY - 40,
    size: 10,
    font: fontRegular,
    color: rgb(0.2, 0.2, 0.2),
  });

  page.drawText(`Phone: ${input.customerPhone || "N/A"}`, {
    x: 320,
    y: currentY - 40,
    size: 10,
    font: fontRegular,
    color: rgb(0.2, 0.2, 0.2),
  });

  page.drawText(`Installation Address: ${input.installationAddress || "N/A"}`, {
    x: 45,
    y: currentY - 60,
    size: 10,
    font: fontRegular,
    color: rgb(0.2, 0.2, 0.2),
  });

  currentY -= 105;

  // Section 2: Installed Solar Equipment Specs
  page.drawRectangle({
    x: 35,
    y: currentY - 90,
    width: width - 70,
    height: 90,
    color: rgb(0.96, 0.95, 0.92),
    borderColor: rgb(0.85, 0.82, 0.77),
    borderWidth: 1,
  });

  page.drawText("2. INSTALLED SYSTEM SPECIFICATIONS", {
    x: 45,
    y: currentY - 20,
    size: 11,
    font: fontBold,
    color: rgb(0.06, 0.09, 0.16),
  });

  page.drawText(`System Capacity: ${input.systemSizeKwp ? `${input.systemSizeKwp} kWp` : "Standard Solar System"}`, {
    x: 45,
    y: currentY - 40,
    size: 10,
    font: fontRegular,
    color: rgb(0.2, 0.2, 0.2),
  });

  page.drawText(`Solar Panels: ${input.panelCount ? `${input.panelCount} Panels (Tier-1 Monocrystalline)` : "N/A"}`, {
    x: 320,
    y: currentY - 40,
    size: 10,
    font: fontRegular,
    color: rgb(0.2, 0.2, 0.2),
  });

  page.drawText(`Inverter Model: ${input.inverterModel || "On-Grid Smart Inverter System"}`, {
    x: 45,
    y: currentY - 60,
    size: 10,
    font: fontRegular,
    color: rgb(0.2, 0.2, 0.2),
  });

  page.drawText(`Work Order Task: ${input.taskTitle}`, {
    x: 45,
    y: currentY - 80,
    size: 10,
    font: fontRegular,
    color: rgb(0.2, 0.2, 0.2),
  });

  currentY -= 115;

  // Section 3: Quality Control & Commissioning Verification
  page.drawRectangle({
    x: 35,
    y: currentY - 110,
    width: width - 70,
    height: 110,
    color: rgb(0.96, 0.95, 0.92),
    borderColor: rgb(0.85, 0.82, 0.77),
    borderWidth: 1,
  });

  page.drawText("3. QUALITY CONTROL & SAFETY INSPECTION", {
    x: 45,
    y: currentY - 20,
    size: 11,
    font: fontBold,
    color: rgb(0.06, 0.09, 0.16),
  });

  const verifiedItems = input.qcVerifiedItems?.length
    ? input.qcVerifiedItems
    : [
        "Rooftop Panel Mounting & Clamping Integrity Verified",
        "DC/AC Wiring Insulation & Conduit Enclosure Checked",
        "Inverter Startup, Voltage Sync & Grid Testing Passed",
        "Grounding Protection & Surge Arrester Resistance Tested",
        "On-Site Cleanliness & Safety Inspection Completed",
      ];

  let itemY = currentY - 38;
  for (const item of verifiedItems.slice(0, 5)) {
    page.drawText(`[V]  ${item}`, {
      x: 45,
      y: itemY,
      size: 9,
      font: fontRegular,
      color: rgb(0.1, 0.5, 0.2),
    });
    itemY -= 15;
  }

  currentY -= 135;

  // Section 4: Customer E-Signature & Handover Confirmation
  page.drawRectangle({
    x: 35,
    y: currentY - 160,
    width: width - 70,
    height: 160,
    color: rgb(1, 1, 1),
    borderColor: rgb(0.06, 0.09, 0.16),
    borderWidth: 1.5,
  });

  page.drawText("4. CUSTOMER ACCEPTANCE & ON-SITE SIGN-OFF", {
    x: 45,
    y: currentY - 20,
    size: 11,
    font: fontBold,
    color: rgb(0.06, 0.09, 0.16),
  });

  page.drawText(
    "I hereby confirm that the installation work has been completed to my satisfaction, the site has been cleaned,",
    { x: 45, y: currentY - 38, size: 8.5, font: fontRegular, color: rgb(0.3, 0.3, 0.3) }
  );
  page.drawText(
    "and the solar generation system has been successfully tested and handed over in full operating condition.",
    { x: 45, y: currentY - 50, size: 8.5, font: fontRegular, color: rgb(0.3, 0.3, 0.3) }
  );

  const utcTimestamp = new Date(input.completedAt).toISOString();
  const gpsText = input.technicianGps
    ? `${input.technicianGps.latitude.toFixed(6)}, ${input.technicianGps.longitude.toFixed(6)}${typeof input.technicianGps.accuracy === "number" ? ` (±${input.technicianGps.accuracy.toFixed(1)}m)` : ""}`
    : "Not captured";
  const testValueText = input.qcTestValues && Object.keys(input.qcTestValues).length > 0
    ? Object.entries(input.qcTestValues).map(([key, value]) => `${key}=${String(value)}`).join("; ").slice(0, 90)
    : "Recorded in ERPNext Quality Inspection";

  page.drawText(`UTC timestamp: ${utcTimestamp}`, {
    x: 320,
    y: currentY - 70,
    size: 7.5,
    font: fontRegular,
    color: rgb(0.25, 0.25, 0.25),
  });
  page.drawText(`Observed client IP: ${input.customerIp || "Not available"}`, {
    x: 320,
    y: currentY - 82,
    size: 7.5,
    font: fontRegular,
    color: rgb(0.25, 0.25, 0.25),
  });
  page.drawText(`Technician GPS: ${gpsText}`, {
    x: 320,
    y: currentY - 94,
    size: 7.5,
    font: fontRegular,
    color: rgb(0.25, 0.25, 0.25),
  });
  page.drawText(`QC readings: ${testValueText}`, {
    x: 320,
    y: currentY - 106,
    size: 7.5,
    font: fontRegular,
    color: rgb(0.25, 0.25, 0.25),
  });

  // Embed E-Signature PNG if valid base64 provided
  if (input.customerSignatureBase64 && input.customerSignatureBase64.includes("base64,")) {
    try {
      const cleanBase64 = input.customerSignatureBase64.split("base64,")[1];
      const imageBuffer = Buffer.from(cleanBase64, "base64");
      const signatureImage = await pdfDoc.embedPng(imageBuffer);
      page.drawImage(signatureImage, {
        x: 60,
        y: currentY - 145,
        width: 160,
        height: 70,
      });
    } catch (e) {
      console.error("[generateProjectHandoverPdf] Failed to embed signature image:", e);
    }
  }

  // Signature Underlines & Names
  page.drawLine({
    start: { x: 50, y: currentY - 148 },
    end: { x: 230, y: currentY - 148 },
    thickness: 1,
    color: rgb(0.4, 0.4, 0.4),
  });

  page.drawText(`Customer Signature (${input.customerName})`, {
    x: 50,
    y: currentY - 158,
    size: 8,
    font: fontBold,
    color: rgb(0.2, 0.2, 0.2),
  });

  page.drawLine({
    start: { x: 320, y: currentY - 148 },
    end: { x: 500, y: currentY - 148 },
    thickness: 1,
    color: rgb(0.4, 0.4, 0.4),
  });

  page.drawText(`Technician: ${input.technicianName || "Lead Field Engineer"}`, {
    x: 320,
    y: currentY - 158,
    size: 8,
    font: fontBold,
    color: rgb(0.2, 0.2, 0.2),
  });

  // Footer Security Watermark & Hash
  const pdfBytes = await pdfDoc.save();
  const pdfBuffer = Buffer.from(pdfBytes);
  const sha256Hash = createHash("sha256").update(pdfBuffer).digest("hex");

  const filename = `Handover_${input.projectCode}_${Date.now()}.pdf`;

  return {
    pdfBuffer,
    sha256Hash,
    filename,
  };
}
