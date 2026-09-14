import "server-only";

import { PassThrough } from "node:stream";

import { google, type drive_v3 } from "googleapis";

const PDF_MIME_TYPE = "application/pdf";
export const MAX_DRIVE_PDF_BYTES = 10 * 1024 * 1024;
export const MAX_DRIVE_FILE_BYTES = 30 * 1024 * 1024;
const MAX_SIGNED_PDF_BYTES = 13 * 1024 * 1024;

export type DriveStoredFile = {
  fileId: string;
  fileName: string;
  mimeType: string;
  parentIds: string[];
  bytes: Buffer;
};

export type DrivePdfFile = DriveStoredFile;

function getDriveClient(): drive_v3.Drive {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!clientEmail || !privateKey) {
    throw new Error("Google Drive service-account credentials are not configured.");
  }

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });

  return google.drive({ version: "v3", auth });
}

function assertPdfFile(metadata: drive_v3.Schema$File, bytes: Buffer): void {
  const name = metadata.name || "document.pdf";
  const declaredPdf = metadata.mimeType === PDF_MIME_TYPE;
  const namedPdf = name.toLowerCase().endsWith(".pdf");
  const pdfMagicHeader = bytes.subarray(0, 4).toString("ascii") === "%PDF";

  if ((!declaredPdf && !namedPdf) || !pdfMagicHeader) {
    throw new Error("The requested Google Drive file is not a valid PDF.");
  }
}

function normalizeFileId(fileId: string): string {
  const normalized = fileId.trim();
  if (!/^[a-zA-Z0-9_-]{10,200}$/.test(normalized)) {
    throw new Error("The Google Drive file ID is invalid.");
  }
  return normalized;
}

export async function downloadDriveFile(fileId: string): Promise<DriveStoredFile> {
  const normalizedFileId = normalizeFileId(fileId);
  const drive = getDriveClient();

  try {
    const metadataResponse = await drive.files.get({
      fileId: normalizedFileId,
      fields: "id,name,mimeType,parents,trashed",
      supportsAllDrives: true,
    });
    const metadata = metadataResponse.data;
    if (metadata.trashed) throw new Error("The requested Google Drive file is unavailable.");

    const contentResponse = await drive.files.get(
      {
        fileId: normalizedFileId,
        alt: "media",
        supportsAllDrives: true,
      },
      { responseType: "arraybuffer" },
    );
    const bytes = Buffer.from(contentResponse.data as ArrayBuffer);

    if (bytes.length === 0 || bytes.length > MAX_DRIVE_FILE_BYTES) {
      throw new Error("The requested file must be between 1 byte and 30 MB.");
    }

    return {
      fileId: normalizedFileId,
      fileName: metadata.name || "document.pdf",
      mimeType: metadata.mimeType || "application/octet-stream",
      parentIds: (metadata.parents || []).filter((parentId): parentId is string => Boolean(parentId)),
      bytes,
    };
  } catch (error: unknown) {
    if (error instanceof Error) throw error;
    throw new Error("Unable to download the PDF from Google Drive.");
  }
}

export async function downloadDrivePdf(fileId: string): Promise<DrivePdfFile> {
  const file = await downloadDriveFile(fileId);
  assertPdfFile(
    {
      name: file.fileName,
      mimeType: file.mimeType,
    },
    file.bytes,
  );

  if (file.bytes.length > MAX_DRIVE_PDF_BYTES) {
    throw new Error("The PDF must be between 1 byte and 10 MB.");
  }

  return {
    ...file,
    mimeType: PDF_MIME_TYPE,
  };
}

function signedPdfName(fileName: string): string {
  const normalized = fileName.trim() || "document.pdf";
  const extensionIndex = normalized.toLowerCase().lastIndexOf(".pdf");
  const stem = extensionIndex > 0 ? normalized.slice(0, extensionIndex) : normalized;
  return `${stem}_SIGNED.pdf`;
}

function driveViewerUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`;
}

function configuredSignedPdfParentIds(): string[] {
  const folderId = process.env.GOOGLE_DRIVE_SIGNED_PDF_FOLDER_ID?.trim();
  if (!folderId) return [];
  return [normalizeFileId(folderId)];
}

/** Returns whether a dedicated Shared Drive destination has been configured. */
export function hasConfiguredSignedPdfDestination(): boolean {
  const folderId = process.env.GOOGLE_DRIVE_SIGNED_PDF_FOLDER_ID?.trim();
  return Boolean(folderId && folderId !== "root" && folderId !== "placeholder");
}

async function uploadSignedPdfToDrive(input: {
  fileName: string;
  parentIds: string[];
  signedPdf: Buffer;
}): Promise<{ fileId: string; fileName: string; fileUrl: string }> {
  if (input.signedPdf.length === 0 || input.signedPdf.length > MAX_SIGNED_PDF_BYTES) {
    throw new Error("The signed PDF exceeds the 13 MB upload limit.");
  }
  if (input.signedPdf.subarray(0, 4).toString("ascii") !== "%PDF") {
    throw new Error("PDF signing did not produce a valid PDF.");
  }

  const drive = getDriveClient();
  const stream = new PassThrough();
  stream.end(input.signedPdf);
  const response = await drive.files.create({
    requestBody: {
      name: input.fileName,
      mimeType: PDF_MIME_TYPE,
      ...(input.parentIds.length > 0 ? { parents: input.parentIds } : {}),
    },
    media: { mimeType: PDF_MIME_TYPE, body: stream },
    fields: "id,name",
    supportsAllDrives: true,
  });
  const fileId = response.data.id;
  if (!fileId) throw new Error("Google Drive did not return an ID for the signed PDF.");

  return {
    fileId,
    fileName: response.data.name || input.fileName,
    fileUrl: driveViewerUrl(fileId),
  };
}

export async function uploadSignedDrivePdf(input: {
  source: DrivePdfFile;
  signedPdf: Buffer;
}): Promise<{ fileId: string; fileName: string; fileUrl: string }> {
  return uploadSignedPdfToDrive({
    fileName: signedPdfName(input.source.fileName),
    parentIds: input.source.parentIds,
    signedPdf: input.signedPdf,
  });
}

/** Uploads a signed ERPNext quotation to the configured Drive folder (or the service account root). */
export async function uploadSignedQuotationPdfToDrive(input: {
  quotationId: string;
  signedPdf: Uint8Array;
}): Promise<{ fileId: string; fileName: string; fileUrl: string }> {
  const quotationId = input.quotationId.trim();
  if (!quotationId) throw new Error("A quotation ID is required for the Drive upload.");
  const parentIds = configuredSignedPdfParentIds();
  if (parentIds.length === 0) {
    throw new Error("A Shared Drive folder must be configured before archiving signed quotations to Google Drive.");
  }

  return uploadSignedPdfToDrive({
    fileName: signedPdfName(`Quotation-${quotationId}.pdf`),
    parentIds,
    signedPdf: Buffer.from(input.signedPdf),
  });
}
