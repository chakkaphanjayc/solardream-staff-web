import { getDriveClient } from "@/lib/google-client";
import { Readable } from "stream";

export type DriveUploadResult = {
  success: boolean;
  fileId?: string;
  webViewLink?: string;
  webContentLink?: string;
  fileName?: string;
  error?: string;
};

const ATTACHMENTS_FOLDER_NAME = "SolarDream Support Attachments";

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

async function getOrCreateAttachmentsFolderId(): Promise<string | undefined> {
  try {
    const drive = getDriveClient();
    
    // Check if folder already exists
    const searchRes = await drive.files.list({
      q: `name = '${ATTACHMENTS_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "files(id, name)",
    });

    if (searchRes.data.files && searchRes.data.files.length > 0) {
      return searchRes.data.files[0].id || undefined;
    }

    // Create new attachments folder
    const createRes = await drive.files.create({
      requestBody: {
        name: ATTACHMENTS_FOLDER_NAME,
        mimeType: "application/vnd.google-apps.folder",
      },
      fields: "id",
    });

    return createRes.data.id || undefined;
  } catch (error) {
    console.error("[getOrCreateAttachmentsFolderId Error]", error);
    return undefined;
  }
}

export async function uploadTicketAttachmentToDrive(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  ticketNumber?: string
): Promise<DriveUploadResult> {
  try {
    const drive = getDriveClient();
    const folderId = await getOrCreateAttachmentsFolderId();

    const sanitizedFileName = ticketNumber
      ? `[${ticketNumber}]_${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`
      : fileName.replace(/[^a-zA-Z0-9._-]/g, "_");

    const fileStream = Readable.from(fileBuffer);

    // 1. Upload file buffer stream to Google Drive
    const uploadRes = await drive.files.create({
      requestBody: {
        name: sanitizedFileName,
        parents: folderId ? [folderId] : undefined,
      },
      media: {
        mimeType: mimeType || "application/octet-stream",
        body: fileStream,
      },
      fields: "id, name, webViewLink, webContentLink",
    });

    const fileId = uploadRes.data.id;
    if (!fileId) throw new Error("Google Drive did not return a valid file ID.");

    // 2. Set file permissions so admins/technicians can view file via webViewLink
    try {
      await drive.permissions.create({
        fileId,
        requestBody: {
          role: "reader",
          type: "anyone",
        },
      });
    } catch {
      // Permission set warning fallback
    }

    const webViewLink = uploadRes.data.webViewLink || `https://drive.google.com/file/d/${fileId}/view`;
    const webContentLink = uploadRes.data.webContentLink || webViewLink;

    return {
      success: true,
      fileId,
      webViewLink,
      webContentLink,
      fileName: sanitizedFileName,
    };
  } catch (error: unknown) {
    console.error("[uploadTicketAttachmentToDrive Error]", error);
    return {
      success: false,
      error: getErrorMessage(error, "Failed to upload ticket attachment to Google Drive."),
    };
  }
}
