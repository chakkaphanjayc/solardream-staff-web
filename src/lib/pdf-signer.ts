import "server-only";

import { createHash } from "node:crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";

import { getSystemSetting } from "@/app/actions/systemSettings";

const MAX_PDF_BYTES = 25 * 1024 * 1024;
const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024;
const ERP_TIMEOUT_MS = 20_000;

type ErpnextSigningConfig = {
  baseUrl: string;
  authorization: string;
};

export type StampQuotationPdfInput = {
  pdfBytes: Uint8Array;
  signatureDataUrl: string;
  signedAt: Date;
  signerIpAddress: string;
  signerUserAgent: string;
  verificationUrl: string;
  signerName?: string | null;
  /** Require the customer signature marker instead of using the legacy page fallback. */
  requireSignatureAnchor?: boolean;
};

export type StampedQuotationPdf = {
  pdfBytes: Uint8Array;
  sha256Hash: string;
};

export type ErpnextQuotationSignatureAudit = {
  quotationId: string;
  sha256Hash: string | null;
  signedAt: string | null;
  signerIpAddress: string | null;
  signerUserAgent: string | null;
  verificationUrl: string | null;
};

export type PdfAnchorCoordinates = {
  pageIndex: number;
  x: number;
  y: number;
};

type ErpnextAuditFieldNames = {
  sha256Hash: string;
  signedAt: string;
  signerIpAddress: string;
  signerUserAgent: string;
  verificationUrl: string;
};

function getPngBytes(dataUrl: string, label: string) {
  const match = /^data:image\/png;base64,([a-zA-Z0-9+/=]+)$/.exec(dataUrl.trim());
  if (!match) throw new Error(`${label} must be a PNG data URL.`);

  const bytes = Buffer.from(match[1], "base64");
  if (bytes.length === 0 || bytes.length > MAX_SIGNATURE_BYTES) {
    throw new Error(`${label} image is invalid or exceeds 2 MB.`);
  }
  return bytes;
}

function auditFieldNames(): ErpnextAuditFieldNames {
  return {
    sha256Hash: process.env.ERPNEXT_ESIGN_HASH_FIELD?.trim() || "custom_esign_sha256_hash",
    signedAt: process.env.ERPNEXT_ESIGN_SIGNED_AT_FIELD?.trim() || "custom_esign_signed_at",
    signerIpAddress: process.env.ERPNEXT_ESIGN_SIGNER_IP_FIELD?.trim() || "custom_esign_signer_ip",
    signerUserAgent: process.env.ERPNEXT_ESIGN_USER_AGENT_FIELD?.trim() || "custom_esign_user_agent",
    verificationUrl: process.env.ERPNEXT_ESIGN_VERIFICATION_URL_FIELD?.trim() || "custom_esign_verification_url",
  };
}

function truncateAuditText(value: string, maxLength: number) {
  return value.length <= maxLength ? value : `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function toNullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function resolveErpnextFileUrl(value: string, baseUrl: string) {
  try {
    return new URL(value, `${baseUrl.replace(/\/$/, "")}/`).toString();
  } catch {
    return value;
  }
}

function isPdfTextItem(value: unknown): value is { str: string; transform: number[] } {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { str?: unknown; transform?: unknown };
  return typeof candidate.str === "string"
    && Array.isArray(candidate.transform)
    && candidate.transform.length >= 6
    && candidate.transform.every((coordinate) => typeof coordinate === "number");
}

/**
 * Resolves an invisible ERPNext print-format marker to native PDF coordinates.
 * pdfjs-dist returns text transforms in the same bottom-left coordinate system
 * consumed by pdf-lib, so no viewport conversion is needed for standard pages.
 */
export async function findAnchorCoordinates(
  pdfBytes: Uint8Array,
  anchorText: string,
): Promise<PdfAnchorCoordinates | null> {
  const { ensureDomMatrixPolyfill } = await import("@/lib/pdfjsPolyfill");
  ensureDomMatrixPolyfill();

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdfBytes),
    useSystemFonts: true,
  });

  try {
    const document = await loadingTask.promise;
    try {
      for (let pageIndex = 0; pageIndex < document.numPages; pageIndex += 1) {
        const page = await document.getPage(pageIndex + 1);
        const content = await page.getTextContent();
        const item = content.items.find((candidate) => isPdfTextItem(candidate) && candidate.str.trim() === anchorText);
        if (isPdfTextItem(item)) {
          return {
            pageIndex,
            x: item.transform[4],
            y: item.transform[5],
          };
        }
      }
      return null;
    } finally {
      document.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }
}

async function getErpnextSigningConfig(): Promise<ErpnextSigningConfig> {
  const [siteUrl, savedApiKey, savedApiSecret] = await Promise.all([
    getSystemSetting("erpnext_site_endpoint"),
    getSystemSetting("erpnext_api_key"),
    getSystemSetting("erpnext_api_secret"),
  ]);
  const baseUrl = (siteUrl || process.env.ERPNEXT_BASE_URL || "").trim().replace(/\/$/, "");
  const apiKey = (savedApiKey || process.env.ERPNEXT_API_KEY || "").trim();
  const apiSecret = (savedApiSecret || process.env.ERPNEXT_API_SECRET || "").trim();

  if (!baseUrl || !apiKey || !apiSecret) {
    throw new Error("ERPNext signing configuration is incomplete.");
  }

  return { baseUrl, authorization: `token ${apiKey}:${apiSecret}` };
}

async function erpFetch(config: ErpnextSigningConfig, path: string, init: RequestInit) {
  return fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: config.authorization,
      ...(init.headers || {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(ERP_TIMEOUT_MS),
  });
}

export async function fetchErpnextQuotationPdf(quotationId: string) {
  const config = await getErpnextSigningConfig();
  const query = new URLSearchParams({
    doctype: "Quotation",
    name: quotationId,
    format: "Standard",
    no_letterhead: "0",
  });
  const response = await erpFetch(
    config,
    `/api/method/frappe.utils.print_format.download_pdf?${query.toString()}`,
    { method: "GET" },
  );

  if (!response.ok) {
    throw new Error(`ERPNext quotation PDF download failed with status ${response.status}.`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_PDF_BYTES || !new TextDecoder().decode(bytes.slice(0, 4)).startsWith("%PDF")) {
    throw new Error("ERPNext did not return a valid quotation PDF.");
  }
  return bytes;
}

function parseHumanReadableUserAgent(ua: string): string {
  if (!ua) return "Unknown Device";
  let os = "Web Device";
  if (/macintosh|mac os x/i.test(ua)) os = "macOS";
  else if (/windows|win32|win64/i.test(ua)) os = "Windows";
  else if (/iphone|ipad|ipod/i.test(ua)) os = "iOS";
  else if (/android/i.test(ua)) os = "Android";
  else if (/linux/i.test(ua)) os = "Linux";

  let browser = "";
  if (/edg/i.test(ua)) browser = "Edge";
  else if (/chrome|crios/i.test(ua)) browser = "Chrome";
  else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = "Safari";
  else if (/firefox|fxios/i.test(ua)) browser = "Firefox";

  return browser ? `${os} (${browser})` : os;
}

function formatUtcTimestamp(date: Date): string {
  return date.toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

export async function stampQuotationPdf(input: StampQuotationPdfInput) {
  const [signatureAnchor, nameAnchor, dateAnchor] = await Promise.all([
    findAnchorCoordinates(input.pdfBytes, "{{customer:signature}}").catch(() => null),
    findAnchorCoordinates(input.pdfBytes, "{{customer:name}}").catch(() => null),
    findAnchorCoordinates(input.pdfBytes, "{{customer:date}}").catch(() => null),
  ]);
  if (input.requireSignatureAnchor && !signatureAnchor) {
    throw new Error("The stored quotation PDF does not contain the customer signature field.");
  }
  const pdf = await PDFDocument.load(input.pdfBytes);
  const pages = pdf.getPages();
  const auditPage = pages.at(-1);
  if (!auditPage) throw new Error("Quotation PDF has no pages.");

  const signaturePage = signatureAnchor ? pages[signatureAnchor.pageIndex] : auditPage;
  if (!signaturePage) throw new Error("Quotation signature anchor points to an invalid page.");

  const signature = await pdf.embedPng(getPngBytes(input.signatureDataUrl, "Signature"));
  const qrDataUrl = await QRCode.toDataURL(input.verificationUrl, {
    errorCorrectionLevel: "M",
    margin: 0,
    width: 256,
    color: { dark: "#0F172A", light: "#FFFFFFFF" },
  });
  const verificationQr = await pdf.embedPng(getPngBytes(qrDataUrl, "Verification QR code"));
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const { width: signaturePageWidth, height: signaturePageHeight } = signaturePage.getSize();
  const maxWidth = Math.min(120, signaturePageWidth * 0.28);
  const maxHeight = 50;
  const scaled = signature.scale(Math.min(maxWidth / signature.width, maxHeight / signature.height, 1));
  const signatureX = signatureAnchor
    ? Math.max(0, Math.min(signatureAnchor.x, signaturePageWidth - scaled.width))
    : Math.max(150, signaturePageWidth - scaled.width - 48);
  const signatureY = signatureAnchor
    ? Math.max(0, Math.min(signatureAnchor.y - 10, signaturePageHeight - scaled.height))
    : Math.max(114, Math.min(150, signaturePageHeight * 0.2));

  signaturePage.drawImage(signature, {
    x: signatureX,
    y: signatureY,
    width: scaled.width,
    height: scaled.height,
  });

  const signer = input.signerName?.trim() || "Customer";
  const dateText = input.signedAt.toISOString().slice(0, 10);
  for (const [anchor, value] of [[nameAnchor, signer], [dateAnchor, dateText]] as const) {
    if (!anchor) continue;
    const textPage = pages[anchor.pageIndex];
    if (!textPage) continue;
    textPage.drawText(value, {
      x: anchor.x,
      y: anchor.y - 2,
      size: 11,
      font,
      color: rgb(0, 0, 0),
    });
  }

  const { width } = auditPage.getSize();

  // Audit Box Dimensions & Positioning (Ultra-compact 210x62 pt footprint positioned cleanly in bottom-right margin)
  const auditWidth = 210;
  const auditHeight = 62;
  const auditX = Math.max(36, width - auditWidth - 36);
  const auditY = 18;

  // 1. Background Card Body (Linen Ground / Cloud White #F5F2EB)
  auditPage.drawRectangle({
    x: auditX,
    y: auditY,
    width: auditWidth,
    height: auditHeight,
    color: rgb(0.96, 0.95, 0.92),
    borderColor: rgb(0.72, 0.82, 0.92),
    borderWidth: 0.75,
  });

  // 2. Top Header Bar (Abyss #0F172A Header)
  const headerHeight = 12;
  auditPage.drawRectangle({
    x: auditX,
    y: auditY + auditHeight - headerHeight,
    width: auditWidth,
    height: headerHeight,
    color: rgb(0.06, 0.09, 0.16),
  });

  // Header Title
  auditPage.drawText("E-SIGNATURE AUDIT TRAIL", {
    x: auditX + 5,
    y: auditY + auditHeight - 8.5,
    size: 5.2,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  // Header Security Badge (Nantucket Breeze #B7D1EA)
  auditPage.drawText("VERIFIED & SECURED", {
    x: auditX + auditWidth - 64,
    y: auditY + auditHeight - 8.5,
    size: 4.8,
    font: fontBold,
    color: rgb(0.72, 0.82, 0.92),
  });

  // 3. Left Frame - Security QR Code
  const qrSize = 38;
  const qrX = auditX + 5;
  const qrY = auditY + 12;

  // Frame background around QR
  auditPage.drawRectangle({
    x: qrX - 1.5,
    y: qrY - 1.5,
    width: qrSize + 3,
    height: qrSize + 3,
    color: rgb(1, 1, 1),
    borderColor: rgb(0.72, 0.82, 0.92),
    borderWidth: 0.5,
  });

  auditPage.drawImage(verificationQr, {
    x: qrX,
    y: qrY,
    width: qrSize,
    height: qrSize,
  });

  // Caption under QR Code (Slate Mid #475569)
  auditPage.drawText("SCAN TO VERIFY", {
    x: qrX + 1.5,
    y: auditY + 4.5,
    size: 4,
    font: fontBold,
    color: rgb(0.28, 0.33, 0.41),
  });

  // 4. Right Column - Structured Key-Value Metadata
  const textX = auditX + qrSize + 12;
  const dateFormatted = formatUtcTimestamp(input.signedAt);
  const formattedDevice = parseHumanReadableUserAgent(input.signerUserAgent);
  const cleanVerifyUrl = input.verificationUrl.replace(/^https?:\/\//, "");

  const auditRows: Array<{ label: string; value: string }> = [
    { label: "Signer:", value: truncateAuditText(signer, 26) },
    { label: "Timestamp:", value: dateFormatted },
    { label: "IP / Device:", value: `${input.signerIpAddress || "127.0.0.1"} (${formattedDevice})` },
    { label: "Verify:", value: truncateAuditText(cleanVerifyUrl, 30) },
  ];

  let currentY = auditY + auditHeight - headerHeight - 9.5;
  for (const row of auditRows) {
    auditPage.drawText(row.label, {
      x: textX,
      y: currentY,
      size: 4.8,
      font: fontBold,
      color: rgb(0.06, 0.09, 0.16),
    });

    auditPage.drawText(row.value, {
      x: textX + 38,
      y: currentY,
      size: 4.8,
      font,
      color: rgb(0.28, 0.33, 0.41),
    });

    currentY -= 9;
  }

  const pdfBytes = await pdf.save();
  return {
    pdfBytes,
    sha256Hash: createHash("sha256").update(pdfBytes).digest("hex"),
  } satisfies StampedQuotationPdf;
}

export async function uploadSignedQuotationPdf(input: {
  quotationId: string;
  pdfBytes: Uint8Array;
}) {
  const config = await getErpnextSigningConfig();
  const form = new FormData();
  const pdfCopy = new Uint8Array(input.pdfBytes);
  form.set("file", new Blob([pdfCopy.buffer], { type: "application/pdf" }), `Quotation-${input.quotationId}-signed.pdf`);
  form.set("is_private", "1");
  form.set("doctype", "Quotation");
  form.set("docname", input.quotationId);

  const response = await erpFetch(config, "/api/method/upload_file", { method: "POST", body: form });
  if (!response.ok) throw new Error(`ERPNext signed PDF upload failed with status ${response.status}.`);

  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  const message = body.message && typeof body.message === "object" ? body.message as Record<string, unknown> : {};
  return typeof message.file_url === "string"
    ? resolveErpnextFileUrl(message.file_url, config.baseUrl)
    : null;
}

export async function markErpnextQuotationAccepted(quotationId: string) {
  const config = await getErpnextSigningConfig();
  const endpoint = `/api/resource/Quotation/${encodeURIComponent(quotationId)}`;
  const updateStatus = async (status: "Accepted" | "Approved") => erpFetch(config, endpoint, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: { status, workflow_state: status } }),
  });

  const accepted = await updateStatus("Accepted");
  if (accepted.ok) return;

  // Some ERPNext workflow configurations expose Approved instead of Accepted.
  const approved = await updateStatus("Approved");
  if (!approved.ok) {
    throw new Error(`ERPNext quotation acceptance update failed with status ${approved.status}.`);
  }
}

export async function updateErpnextQuotationSignatureAudit(input: ErpnextQuotationSignatureAudit) {
  const config = await getErpnextSigningConfig();
  const fields = auditFieldNames();
  const response = await erpFetch(
    config,
    `/api/resource/Quotation/${encodeURIComponent(input.quotationId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: {
          [fields.sha256Hash]: input.sha256Hash,
          [fields.signedAt]: input.signedAt,
          [fields.signerIpAddress]: input.signerIpAddress,
          [fields.signerUserAgent]: input.signerUserAgent,
          [fields.verificationUrl]: input.verificationUrl,
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `ERPNext signature audit update failed with status ${response.status}. Configure the Quotation audit fields or ERPNEXT_ESIGN_*_FIELD environment variables.`,
    );
  }
}

export async function getErpnextQuotationSignatureAudit(quotationId: string): Promise<ErpnextQuotationSignatureAudit | null> {
  const config = await getErpnextSigningConfig();
  const fields = auditFieldNames();
  const response = await erpFetch(
    config,
    `/api/resource/Quotation/${encodeURIComponent(quotationId)}?${new URLSearchParams({
      fields: JSON.stringify([
        fields.sha256Hash,
        fields.signedAt,
        fields.signerIpAddress,
        fields.signerUserAgent,
        fields.verificationUrl,
      ]),
    }).toString()}`,
    { method: "GET" },
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`ERPNext signature audit lookup failed with status ${response.status}.`);
  }

  const body = await response.json().catch(() => null) as { data?: Record<string, unknown> } | null;
  const data = body?.data;
  if (!data) return null;

  return {
    quotationId,
    sha256Hash: toNullableString(data[fields.sha256Hash]),
    signedAt: toNullableString(data[fields.signedAt]),
    signerIpAddress: toNullableString(data[fields.signerIpAddress]),
    signerUserAgent: toNullableString(data[fields.signerUserAgent]),
    verificationUrl: toNullableString(data[fields.verificationUrl]),
  };
}
