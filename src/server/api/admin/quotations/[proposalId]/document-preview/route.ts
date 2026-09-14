import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getSystemSetting } from "@/app/actions/systemSettings";
import { db } from "@/db";
import {
  leads,
  proposals,
} from "@/db/schema";
import { createAdminClient } from "@/utils/supabase/server";
import { requireStaffJson } from "@/lib/auth-guard";
import {
  downloadDriveFile,
  type DriveStoredFile,
} from "@/lib/document-signing/drive";
import {
  extractGoogleDriveFileId,
  normalizeMediaUrl,
} from "@/lib/mediaUrls";

export const maxDuration = 30;

const MAX_PREVIEW_BYTES = 30 * 1024 * 1024;
const PREVIEW_TIMEOUT_MS = 15_000;

type PreviewSource = {
  documentId: string;
  url: string;
  storageProvider: string | null;
  storageFileId: string | null;
  fallbackUrl: string | null;
  fileName: string;
  contentType: string | null;
};

type DownloadedPreview = {
  bytes: Buffer;
  fileName: string;
  contentType: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function safeFileName(value: string, fallback: string) {
  const normalized = value.replace(/[\r\n"\\/]+/g, "_").trim();
  return normalized.slice(0, 180) || fallback;
}

function fileNameFromUrl(value: string, fallback: string) {
  try {
    const pathname = new URL(value).pathname;
    const segment = pathname.split("/").pop() || "";
    return safeFileName(decodeURIComponent(segment), fallback);
  } catch {
    return fallback;
  }
}

function contentTypeFromFileName(fileName: string): string | null {
  const normalized = fileName.toLowerCase();
  if (normalized.endsWith(".pdf")) return "application/pdf";
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) return "image/jpeg";
  if (normalized.endsWith(".png")) return "image/png";
  if (normalized.endsWith(".webp")) return "image/webp";
  if (normalized.endsWith(".gif")) return "image/gif";
  if (normalized.endsWith(".avif")) return "image/avif";
  return null;
}

function normalizeContentType(value: string | null | undefined): string | null {
  const normalized = value?.split(";", 1)[0]?.trim().toLowerCase();
  return normalized || null;
}

function sameUrl(left: string, right: string) {
  return normalizeMediaUrl(left) === normalizeMediaUrl(right);
}

function addSource(sources: PreviewSource[], source: PreviewSource) {
  const url = normalizeMediaUrl(source.url);
  if (!url || sources.some((candidate) => candidate.documentId === source.documentId)) return;
  sources.push({ ...source, url });
}

function sourceFromUrl(input: {
  documentId: string;
  url: string | null | undefined;
  fileName: string;
  contentType?: string | null;
  storageProvider?: string | null;
  storageFileId?: string | null;
  fallbackUrl?: string | null;
}): PreviewSource | null {
  const url = normalizeMediaUrl(input.url);
  if (!url) return null;

  return {
    documentId: input.documentId,
    url,
    storageProvider: input.storageProvider || null,
    storageFileId: input.storageFileId || null,
    fallbackUrl: normalizeMediaUrl(input.fallbackUrl) || null,
    fileName: safeFileName(input.fileName, fileNameFromUrl(url, "document")),
    contentType: normalizeContentType(input.contentType),
  };
}

function metadataFileName(metadata: unknown, fallback: string) {
  const record = asRecord(metadata);
  return asText(record.originalFileName)
    || asText(record.fileName)
    || asText(record.storedFileName)
    || fallback;
}

function metadataContentType(metadata: unknown) {
  return normalizeContentType(asText(asRecord(metadata).contentType));
}

async function getPreviewSources(proposalId: string): Promise<PreviewSource[]> {
  const [proposal, lead] = await Promise.all([
    db.query.proposals.findFirst({
      where: eq(proposals.id, proposalId),
      columns: {
        id: true,
        pdfUrl: true,
        revisedPdfUrl: true,
        signedDocumentDriveUrl: true,
        surveyPhotos: true,
        configurationData: true,
      },
      with: {
        documentRequests: {
          with: { attachments: true },
        },
        deliveryDocuments: {
          with: { attachments: true },
        },
        paymentRequests: true,
      },
    }),
    db.query.leads.findFirst({
      where: eq(leads.id, proposalId),
      columns: {
        id: true,
        configurationSnapshot: true,
      },
      with: {
        proposalDocuments: true,
      },
    }),
  ]);

  const sources: PreviewSource[] = [];
  if (!proposal && !lead) return sources;

  const add = (source: PreviewSource | null) => {
    if (source) addSource(sources, source);
  };

  if (proposal) {
    add(sourceFromUrl({
      documentId: "signedDocumentDriveUrl",
      url: proposal.signedDocumentDriveUrl,
      fileName: "Signed quotation.pdf",
      contentType: "application/pdf",
    }));
    add(sourceFromUrl({
      documentId: "revisedPdfUrl",
      url: proposal.revisedPdfUrl,
      fileName: "Revised quotation.pdf",
      contentType: "application/pdf",
    }));
    add(sourceFromUrl({
      documentId: "pdfUrl",
      url: proposal.pdfUrl,
      fileName: "Quotation.pdf",
      contentType: "application/pdf",
    }));

    if (Array.isArray(proposal.surveyPhotos)) {
      proposal.surveyPhotos.forEach((photo, index) => {
        if (typeof photo !== "string") return;
        add(sourceFromUrl({
          documentId: `survey-photo-${index}`,
          url: photo,
          fileName: `Site survey photo ${index + 1}`,
          contentType: "image/*",
        }));
      });
    }

    const configuration = asRecord(proposal.configurationData);
    const customerDocuments = configuration.customerDocuments;
    if (Array.isArray(customerDocuments)) {
      customerDocuments.forEach((value, index) => {
        const document = asRecord(value);
        add(sourceFromUrl({
          documentId: asText(document.id) || `customer-document-${index}`,
          url: asText(document.url),
          fileName: asText(document.name) || `Customer document ${index + 1}`,
          contentType: asText(document.mimeType) || metadataContentType(document.metadata),
          storageProvider: asText(document.storageProvider) || null,
          storageFileId: asText(document.storageFileId) || null,
          fallbackUrl: asText(document.fallbackUrl) || null,
        }));
      });
    }

    proposal.documentRequests.forEach((request) => {
      const attachment = [...request.attachments].reverse().find((candidate) => candidate.fileUrl === request.fileUrl)
        || request.attachments.at(-1);
      const metadata = request.metadata || attachment?.metadata;
      add(sourceFromUrl({
        documentId: `document-request-${request.id}`,
        url: request.fileUrl || attachment?.fileUrl,
        fileName: metadataFileName(metadata, request.documentName),
        contentType: metadataContentType(metadata),
        storageProvider: request.storageProvider || attachment?.storageProvider || null,
        storageFileId: request.storageFileId || attachment?.storageFileId || null,
        fallbackUrl: request.fallbackUrl || attachment?.fallbackUrl || null,
      }));
    });

    proposal.paymentRequests.forEach((request) => {
      const metadata = asRecord(request.easySlipData);
      add(sourceFromUrl({
        documentId: `payment-slip-${request.id}`,
        url: request.slipImageUrl || request.slipUrl,
        fileName: `Payment slip ${request.title}`,
        contentType: "image/*",
        storageProvider: request.storageProvider || asText(metadata.storageProvider) || null,
        storageFileId: request.storageFileId || asText(metadata.storageFileId) || null,
        fallbackUrl: request.fallbackUrl || asText(metadata.fallbackUrl) || null,
      }));
    });

    proposal.deliveryDocuments.forEach((document) => {
      const attachment = [...document.attachments].reverse().find((candidate) => candidate.fileUrl === document.fileUrl)
        || document.attachments.at(-1);
      const metadata = document.metadata || attachment?.metadata;
      add(sourceFromUrl({
        documentId: `delivery-${document.id}`,
        url: document.fileUrl || attachment?.fileUrl,
        fileName: metadataFileName(metadata, document.title),
        contentType: metadataContentType(metadata),
        storageProvider: document.storageProvider || attachment?.storageProvider || null,
        storageFileId: document.storageFileId || attachment?.storageFileId || null,
        fallbackUrl: document.fallbackUrl || attachment?.fallbackUrl || null,
      }));
    });
  }

  if (lead) {
    const configuration = asRecord(lead.configurationSnapshot);
    const customerDocuments = configuration.customerDocuments;
    if (Array.isArray(customerDocuments)) {
      customerDocuments.forEach((value, index) => {
        const document = asRecord(value);
        add(sourceFromUrl({
          documentId: asText(document.id) || `customer-document-${index}`,
          url: asText(document.url),
          fileName: asText(document.name) || `Customer document ${index + 1}`,
          contentType: asText(document.mimeType) || metadataContentType(document.metadata),
          storageProvider: asText(document.storageProvider) || null,
          storageFileId: asText(document.storageFileId) || null,
          fallbackUrl: asText(document.fallbackUrl) || null,
        }));
      });
    }

    lead.proposalDocuments.forEach((document, index) => {
      add(sourceFromUrl({
        documentId: `lead-document-${index}`,
        url: document.fileUrl,
        fileName: `Proposal document ${index + 1}`,
        contentType: "application/pdf",
      }));
    });
  }

  return sources;
}

function parseSupabaseObjectUrl(value: string) {
  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!configuredUrl) return null;

  try {
    const candidate = new URL(value);
    const configured = new URL(configuredUrl);
    if (candidate.origin !== configured.origin) return null;

    const marker = "/storage/v1/object/";
    const markerIndex = candidate.pathname.indexOf(marker);
    if (markerIndex === -1) return null;

    const parts = candidate.pathname.slice(markerIndex + marker.length).split("/");
    const mode = parts.shift();
    if (mode !== "public" && mode !== "authenticated" && mode !== "sign") return null;

    const bucket = parts.shift();
    const path = parts.map((part) => decodeURIComponent(part)).join("/");
    if (!bucket || !path) return null;
    return { bucket: decodeURIComponent(bucket), path };
  } catch {
    return null;
  }
}

function isPdf(bytes: Buffer) {
  return bytes.subarray(0, 4).toString("ascii") === "%PDF";
}

function resolvePreviewContentType(
  contentType: string | null,
  fileName: string,
  bytes: Buffer,
): string | null {
  if (isPdf(bytes)) return "application/pdf";
  if (
    contentType?.startsWith("image/")
    && contentType !== "image/*"
    && contentType !== "image/svg+xml"
  ) {
    return contentType;
  }
  const inferred = contentTypeFromFileName(fileName);
  return inferred?.startsWith("image/") ? inferred : null;
}

async function readBytes(response: Response) {
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_PREVIEW_BYTES) throw new Error("The preview file is too large.");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_PREVIEW_BYTES) {
    throw new Error("The preview file is empty or too large.");
  }
  return bytes;
}

function fromDriveFile(file: DriveStoredFile, fallbackContentType: string | null): DownloadedPreview {
  const contentType = resolvePreviewContentType(
    normalizeContentType(file.mimeType) || fallbackContentType,
    file.fileName,
    file.bytes,
  );
  if (!contentType) throw new Error("The selected file type cannot be previewed.");
  return { bytes: file.bytes, fileName: file.fileName, contentType };
}

async function downloadSupabaseObject(
  object: { bucket: string; path: string },
  fallbackFileName: string,
  fallbackContentType: string | null,
): Promise<DownloadedPreview> {
  const { data, error } = await createAdminClient().storage
    .from(object.bucket)
    .download(object.path);
  if (error || !data) throw new Error(error?.message || "The stored file could not be loaded.");

  const bytes = Buffer.from(await data.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_PREVIEW_BYTES) throw new Error("The preview file is empty or too large.");
  const fileName = fileNameFromUrl(object.path, fallbackFileName);
  const contentType = resolvePreviewContentType(
    normalizeContentType(data.type) || fallbackContentType,
    fileName,
    bytes,
  );
  if (!contentType) throw new Error("The selected file type cannot be previewed.");
  return { bytes, fileName, contentType };
}

async function getErpnextConfig() {
  const [configuredUrl, apiKey, apiSecret] = await Promise.all([
    getSystemSetting("erpnext_site_endpoint"),
    getSystemSetting("erpnext_api_key"),
    getSystemSetting("erpnext_api_secret"),
  ]);
  const baseUrl = (configuredUrl || process.env.ERPNEXT_BASE_URL || "").trim().replace(/\/$/, "");
  const headers: Record<string, string> = {};
  const resolvedApiKey = apiKey || process.env.ERPNEXT_API_KEY || "";
  const resolvedApiSecret = apiSecret || process.env.ERPNEXT_API_SECRET || "";
  if (resolvedApiKey && resolvedApiSecret) {
    headers.Authorization = `token ${resolvedApiKey}:${resolvedApiSecret}`;
  }
  return {
    origin: baseUrl ? new URL(baseUrl).origin : null,
    headers,
  };
}

async function downloadRemoteSource(
  url: string,
  source: PreviewSource,
  erpnext: Awaited<ReturnType<typeof getErpnextConfig>>,
): Promise<DownloadedPreview> {
  const parsed = new URL(url);
  const supabaseObject = parseSupabaseObjectUrl(url);
  if (supabaseObject) {
    return downloadSupabaseObject(supabaseObject, source.fileName, source.contentType);
  }

  const driveFileId = extractGoogleDriveFileId(url) || (
    source.storageProvider === "GOOGLE_DRIVE" ? source.storageFileId : null
  );
  if (driveFileId) {
    return fromDriveFile(await downloadDriveFile(driveFileId), source.contentType);
  }

  if (!erpnext.origin || parsed.origin !== erpnext.origin) {
    throw new Error("The preview source is not a trusted storage host.");
  }

  const response = await fetch(url, {
    headers: erpnext.headers,
    cache: "no-store",
    signal: AbortSignal.timeout(PREVIEW_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Storage returned ${response.status}.`);
  const bytes = await readBytes(response);
  const contentType = resolvePreviewContentType(
    normalizeContentType(response.headers.get("content-type")) || source.contentType,
    source.fileName,
    bytes,
  );
  if (!contentType) throw new Error("The selected file type cannot be previewed.");
  return {
    bytes,
    fileName: fileNameFromUrl(url, source.fileName),
    contentType,
  };
}

function contentDisposition(fileName: string, download: boolean) {
  return `${download ? "attachment" : "inline"}; filename="${safeFileName(fileName, "document")}"`;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ proposalId: string }> },
) {
  const staff = await requireStaffJson();
  if (!staff.ok) return staff.response;

  const { proposalId } = await context.params;
  const documentId = request.nextUrl.searchParams.get("documentId")?.trim() || "";
  const requestedUrl = normalizeMediaUrl(request.nextUrl.searchParams.get("sourceUrl"));
  const download = request.nextUrl.searchParams.get("download") === "1";
  if (!proposalId || !documentId) {
    return NextResponse.json({ error: "A quotation and document are required." }, { status: 400 });
  }

  try {
    const sources = await getPreviewSources(proposalId);
    const source = sources.find((candidate) => (
      candidate.documentId === documentId && (!requestedUrl || sameUrl(candidate.url, requestedUrl))
    )) || (requestedUrl ? sources.find((candidate) => sameUrl(candidate.url, requestedUrl)) : null);

    if (!source) {
      return NextResponse.json({ error: "The requested document was not found for this quotation." }, { status: 404 });
    }

    const erpnext = await getErpnextConfig();
    const attempts = [source.url, source.fallbackUrl].filter(
      (url, index, all): url is string => Boolean(url) && all.indexOf(url) === index,
    );
    let preview: DownloadedPreview | null = null;
    for (const url of attempts) {
      try {
        preview = await downloadRemoteSource(url, source, erpnext);
        break;
      } catch (error) {
        if (url === attempts.at(-1)) throw error;
      }
    }

    if (!preview) throw new Error("The preview file could not be loaded.");
    return new NextResponse(new Uint8Array(preview.bytes), {
      headers: {
        "Content-Type": preview.contentType,
        "Content-Length": String(preview.bytes.length),
        "Content-Disposition": contentDisposition(preview.fileName, download),
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[Admin quotation document preview] Failed to stream document.", error);
    return NextResponse.json({ error: "The document preview is currently unavailable." }, { status: 502 });
  }
}
