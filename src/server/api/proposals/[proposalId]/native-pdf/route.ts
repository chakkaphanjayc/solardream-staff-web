import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { quotationDeliveryDocuments } from "@/db/schema";
import { getSystemSetting } from "@/app/actions/systemSettings";
import { downloadDrivePdf } from "@/lib/document-signing/drive";
import { resolvePortalAccess } from "@/lib/portalAccess";


const MAX_NATIVE_PDF_BYTES = 25 * 1024 * 1024;
const ERP_TIMEOUT_MS = 20_000;

type ErpnextFileConfig = {
  baseUrl: string;
  origin: string;
  headers: Record<string, string>;
};

function extractDriveFileId(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /\/file\/d\/([a-zA-Z0-9_-]{10,200})/.exec(value);
  return match?.[1] || null;
}

function contentDispositionFileName(value: string): string {
  return value.replace(/[\r\n"\\/]/g, "_").slice(0, 180) || "quotation.pdf";
}

async function getErpnextFileConfig(): Promise<ErpnextFileConfig | null> {
  const [siteUrl, savedApiKey, savedApiSecret] = await Promise.all([
    getSystemSetting("erpnext_site_endpoint"),
    getSystemSetting("erpnext_api_key"),
    getSystemSetting("erpnext_api_secret"),
  ]);
  const baseUrl = (siteUrl || process.env.ERPNEXT_BASE_URL || "").trim().replace(/\/$/, "");
  if (!baseUrl) return null;

  try {
    const origin = new URL(baseUrl).origin;
    const headers: Record<string, string> = {};
    const apiKey = savedApiKey || process.env.ERPNEXT_API_KEY || "";
    const apiSecret = savedApiSecret || process.env.ERPNEXT_API_SECRET || "";
    if (apiKey && apiSecret) headers.Authorization = `token ${apiKey}:${apiSecret}`;
    return { baseUrl, origin, headers };
  } catch {
    return null;
  }
}

function resolveTrustedErpnextFileUrl(value: string | null | undefined, config: ErpnextFileConfig) {
  if (!value) return null;
  try {
    const candidate = new URL(value, `${config.baseUrl}/`);
    return candidate.origin === config.origin ? candidate : null;
  } catch {
    return null;
  }
}

async function downloadErpnextPdf(url: URL, config: ErpnextFileConfig) {
  const response = await fetch(url, {
    headers: config.headers,
    cache: "no-store",
    signal: AbortSignal.timeout(ERP_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`ERPNext signed quotation download failed with status ${response.status}.`);
  }

  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_NATIVE_PDF_BYTES) {
    throw new Error("The ERPNext signed quotation is too large to preview.");
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (
    bytes.length === 0
    || bytes.length > MAX_NATIVE_PDF_BYTES
    || bytes.subarray(0, 4).toString("ascii") !== "%PDF"
  ) {
    throw new Error("ERPNext did not return a valid signed quotation PDF.");
  }

  const encodedFileName = url.pathname.split("/").pop() || "quotation-signed.pdf";
  let fileName = encodedFileName;
  try {
    fileName = decodeURIComponent(encodedFileName);
  } catch {
    // Keep the encoded segment if the upstream filename is malformed.
  }
  return { bytes, fileName: contentDispositionFileName(fileName) };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ proposalId: string }> },
) {
  const { proposalId } = await context.params;
  const access = await resolvePortalAccess({
    request,
    proposalId,
    capability: "proposal:read",
  });
  if (!access) {
    return NextResponse.json({ error: "Document access was not granted." }, { status: 403 });
  }

  const proposal = access.proposal;
  const finalQuotation = await db.query.quotationDeliveryDocuments.findFirst({
    where: and(
      eq(quotationDeliveryDocuments.quotationId, proposal.id),
      eq(quotationDeliveryDocuments.deliveryType, "FINAL_QUOTATION"),
      eq(quotationDeliveryDocuments.status, "READY"),
    ),
    columns: {
      fileUrl: true,
      storageFileId: true,
    },
  });
  const isSignedStatus = ["SIGNED", "FULLY_SIGNED", "CLIENT_SIGNED_PENDING_REVIEW", "APPROVED", "APPROVED_BY_CUSTOMER", "CUSTOMER_APPROVED"].includes(proposal.status.toUpperCase());
  try {
    let pdf: { bytes: Buffer; fileName: string } | null = null;
    if (isSignedStatus) {
      const signedDriveFileId = extractDriveFileId(proposal.signedDocumentDriveUrl);
      if (signedDriveFileId) {
        pdf = await downloadDrivePdf(signedDriveFileId);
      } else {
        const erpnext = await getErpnextFileConfig();
        const signedErpnextUrl = erpnext
          ? resolveTrustedErpnextFileUrl(proposal.signedDocumentDriveUrl, erpnext)
          : null;
        if (erpnext && signedErpnextUrl) {
          pdf = await downloadErpnextPdf(signedErpnextUrl, erpnext);
        }
      }
    }

    if (!pdf) {
      const fileId = finalQuotation?.storageFileId
        || extractDriveFileId(finalQuotation?.fileUrl)
        || extractDriveFileId(proposal.revisedPdfUrl)
        || extractDriveFileId(proposal.pdfUrl);
      if (!fileId) {
        return NextResponse.json({ error: "A signed quotation PDF is not available." }, { status: 404 });
      }
      pdf = await downloadDrivePdf(fileId);
    }

    return new NextResponse(new Uint8Array(pdf.bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(pdf.bytes.length),
        "Content-Disposition": `inline; filename="${contentDispositionFileName(pdf.fileName)}"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error: unknown) {
    console.error("[Native quotation PDF] Failed to stream the stored document.", error);
    return NextResponse.json({ error: "The quotation PDF could not be loaded." }, { status: 502 });
  }
}
