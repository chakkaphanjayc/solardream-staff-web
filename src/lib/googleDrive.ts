import { google, type drive_v3 } from 'googleapis';
import type { MethodOptions } from 'googleapis-common';
import { PassThrough } from 'stream';

type DriveFileMetadata = {
  name: string;
  mimeType?: string;
  parents?: string[];
};

export type DriveFolderReference = {
  folderId: string;
  folderUrl: string;
  folderName: string;
};

export type DriveFileReference = {
  fileId: string;
  fileUrl: string;
  fileName: string;
  folderId: string;
  folderUrl: string;
};

export type DriveMoveResult = {
  fileId: string;
  fileUrl: string;
  destinationFolderId: string;
  destinationFolderUrl: string;
  previousParentIds: string[];
};

export type QuotationDeliveryDriveHierarchy = {
  userFolder: DriveFolderReference;
  quotationFolder: DriveFolderReference;
  archiveFolder: DriveFolderReference;
};

const DRIVE_FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function requireDriveFileId(id: string | null | undefined, context: string) {
  if (!id) {
    throw new Error(`Google Drive did not return a file ID while creating ${context}.`);
  }
  return id;
}

function requireUuid(value: string, context: string) {
  const normalized = value.trim();
  if (!UUID_PATTERN.test(normalized)) {
    throw new Error(`${context} must be a UUID.`);
  }
  return normalized;
}

function getDriveFolderUrl(folderId: string) {
  return `https://drive.google.com/drive/folders/${folderId}`;
}

function getDriveFileUrl(fileId: string) {
  return `https://drive.google.com/file/d/${fileId}/preview`;
}

export function escapeDriveQueryValue(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function getSharedDriveListOptions() {
  const driveId = process.env.GOOGLE_DRIVE_SHARED_DRIVE_ID?.trim();
  return driveId
    ? { corpora: 'drive' as const, driveId }
    : {};
}

function getConfiguredDriveRootFolderId() {
  const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID?.trim();
  if (!rootFolderId || rootFolderId === 'root' || rootFolderId === 'placeholder') {
    throw new Error('GOOGLE_DRIVE_ROOT_FOLDER_ID is not configured.');
  }
  return rootFolderId;
}

function getDriveClient(): drive_v3.Drive {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY
    ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
    : undefined;

  if (!clientEmail || !privateKey) {
    console.error("Error: Setup missing for Cloud Google Credentials in .env");
    throw new Error("Error: Setup missing for Cloud Google Credentials in .env");
  }

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });

  return google.drive({ version: 'v3', auth });
}

export async function getOrCreateDriveFolder(
  parentFolderId: string,
  folderName: string,
): Promise<DriveFolderReference> {
  const normalizedParentId = parentFolderId.trim();
  const normalizedName = folderName.trim();
  if (!normalizedParentId || !normalizedName) {
    throw new Error('Google Drive parent folder ID and folder name are required.');
  }

  const drive = getDriveClient();
  const query = [
    `mimeType = '${DRIVE_FOLDER_MIME_TYPE}'`,
    `name = '${escapeDriveQueryValue(normalizedName)}'`,
    `'${escapeDriveQueryValue(normalizedParentId)}' in parents`,
    'trashed = false',
  ].join(' and ');

  try {
    const listResponse = await drive.files.list({
      q: query,
      fields: 'files(id, name)',
      spaces: 'drive',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      ...getSharedDriveListOptions(),
    });
    const existing = listResponse.data.files?.find((file) => file.id);
    if (existing?.id) {
      return {
        folderId: existing.id,
        folderUrl: getDriveFolderUrl(existing.id),
        folderName: existing.name || normalizedName,
      };
    }

    const createResponse = await drive.files.create({
      requestBody: {
        name: normalizedName,
        mimeType: DRIVE_FOLDER_MIME_TYPE,
        parents: [normalizedParentId],
      },
      fields: 'id, name',
      supportsAllDrives: true,
    });
    const folderId = requireDriveFileId(createResponse.data.id, `folder ${normalizedName}`);
    return {
      folderId,
      folderUrl: getDriveFolderUrl(folderId),
      folderName: createResponse.data.name || normalizedName,
    };
  } catch (error: unknown) {
    throw new Error(
      `Google Drive folder resolution failed for ${normalizedName}: ${getErrorMessage(error, 'Unknown Drive error')}`,
    );
  }
}

export async function getOrCreateQuotationDeliveryDriveHierarchy(
  userId: string,
  proposalId: string,
): Promise<QuotationDeliveryDriveHierarchy> {
  const normalizedUserId = requireUuid(userId, 'Proposal user ID');
  const normalizedProposalId = requireUuid(proposalId, 'Proposal ID');
  const rootFolderId = getConfiguredDriveRootFolderId();
  const userFolder = await getOrCreateDriveFolder(rootFolderId, normalizedUserId);
  const quotationFolder = await getOrCreateDriveFolder(
    userFolder.folderId,
    normalizedProposalId,
  );
  const archiveFolder = await getOrCreateDriveFolder(
    quotationFolder.folderId,
    'Archive',
  );
  return { userFolder, quotationFolder, archiveFolder };
}

export async function uploadBufferToDriveFolder(options: {
  folder: DriveFolderReference;
  fileBuffer: Buffer;
  mimeType: string;
  fileName: string;
  signal?: AbortSignal;
}): Promise<DriveFileReference> {
  const { folder, fileBuffer, mimeType, fileName, signal } = options;
  const drive = getDriveClient();
  const stream = new PassThrough();
  stream.end(fileBuffer);
  const methodOptions: MethodOptions | undefined = signal
    ? ({ signal } as unknown as MethodOptions)
    : undefined;

  try {
    const uploadResponse = await drive.files.create({
      requestBody: { name: fileName, parents: [folder.folderId] },
      media: { mimeType, body: stream },
      fields: 'id, name, webViewLink',
      supportsAllDrives: true,
      keepRevisionForever: true,
    }, methodOptions);
    const fileId = requireDriveFileId(uploadResponse.data.id, `file ${fileName}`);

    try {
      await drive.permissions.create({
        fileId,
        supportsAllDrives: true,
        requestBody: { role: 'reader', type: 'anyone' },
      }, methodOptions);
    } catch (permissionError: unknown) {
      console.warn(
        `[Google Drive] Failed to apply public permission to ${fileId}:`,
        getErrorMessage(permissionError, 'Unknown permission error'),
      );
    }

    return {
      fileId,
      fileUrl: convertToEmbedPreviewUrl(uploadResponse.data.webViewLink) || getDriveFileUrl(fileId),
      fileName: uploadResponse.data.name || fileName,
      folderId: folder.folderId,
      folderUrl: folder.folderUrl,
    };
  } catch (error: unknown) {
    throw new Error(
      `Google Drive upload failed for ${fileName}: ${getErrorMessage(error, 'Unknown Drive upload error')}`,
    );
  }
}

export async function moveDriveFile(
  fileId: string,
  destinationFolder: DriveFolderReference,
): Promise<DriveMoveResult> {
  const normalizedFileId = fileId.trim();
  if (!normalizedFileId) throw new Error('Google Drive file ID is required.');
  const drive = getDriveClient();

  try {
    const current = await drive.files.get({
      fileId: normalizedFileId,
      fields: 'id, parents',
      supportsAllDrives: true,
    });
    const previousParentIds = current.data.parents?.filter(Boolean) || [];
    if (!previousParentIds.includes(destinationFolder.folderId)) {
      await drive.files.update({
        fileId: normalizedFileId,
        addParents: destinationFolder.folderId,
        removeParents: previousParentIds.join(',') || undefined,
        fields: 'id, parents',
        supportsAllDrives: true,
      });
    }

    return {
      fileId: normalizedFileId,
      fileUrl: getDriveFileUrl(normalizedFileId),
      destinationFolderId: destinationFolder.folderId,
      destinationFolderUrl: destinationFolder.folderUrl,
      previousParentIds,
    };
  } catch (error: unknown) {
    throw new Error(
      `Google Drive move failed for ${normalizedFileId}: ${getErrorMessage(error, 'Unknown Drive move error')}`,
    );
  }
}

export async function restoreDriveFileParents(
  fileId: string,
  previousParentIds: readonly string[],
): Promise<void> {
  const normalizedFileId = fileId.trim();
  const desiredParents = [...new Set(previousParentIds.map((id) => id.trim()).filter(Boolean))];
  if (!normalizedFileId || desiredParents.length === 0) {
    throw new Error('Google Drive file ID and previous parent IDs are required for restore.');
  }
  const drive = getDriveClient();

  try {
    const current = await drive.files.get({
      fileId: normalizedFileId,
      fields: 'parents',
      supportsAllDrives: true,
    });
    const currentParents = current.data.parents?.filter(Boolean) || [];
    const addParents = desiredParents.filter((id) => !currentParents.includes(id));
    const removeParents = currentParents.filter((id) => !desiredParents.includes(id));
    if (addParents.length > 0 || removeParents.length > 0) {
      await drive.files.update({
        fileId: normalizedFileId,
        addParents: addParents.join(',') || undefined,
        removeParents: removeParents.join(',') || undefined,
        fields: 'id, parents',
        supportsAllDrives: true,
      });
    }
  } catch (error: unknown) {
    throw new Error(
      `Google Drive restore failed for ${normalizedFileId}: ${getErrorMessage(error, 'Unknown Drive restore error')}`,
    );
  }
}

export async function deleteDriveFile(fileId: string): Promise<void> {
  const normalizedFileId = fileId.trim();
  if (!normalizedFileId) throw new Error('Google Drive file ID is required.');
  const drive = getDriveClient();
  try {
    await drive.files.delete({
      fileId: normalizedFileId,
      supportsAllDrives: true,
    });
  } catch (error: unknown) {
    throw new Error(
      `Google Drive delete failed for ${normalizedFileId}: ${getErrorMessage(error, 'Unknown Drive delete error')}`,
    );
  }
}

/**
 * Converts Google Drive webViewLink to preview embed URL
 * Extracts file ID and formats as proper preview endpoint
 */
export function convertToEmbedPreviewUrl(webViewLink: string | null | undefined): string {
  if (!webViewLink) return '';
  const match = webViewLink.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (!match || !match[1]) return webViewLink;
  return `https://drive.google.com/file/d/${match[1]}/preview`;
}

export function extractDriveFileId(url: string | null | undefined): string | null {
  if (!url) return null;
  const directMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (directMatch?.[1]) return directMatch[1];
  const queryMatch = url.match(/[?&]id=([a-zA-Z0-9-_]+)/);
  return queryMatch?.[1] || null;
}

/**
 * Resolves or creates Customer folder: Customer_[User_ID]_[User_Name]
 * Uses Shared Drive with tiered structure
 */
export async function getOrCreateCustomerFolder(customerName: string, userId: string): Promise<string> {
  const drive = getDriveClient();
  const cleanName = customerName.trim().replace(/\s+/g, '_').replace(/['"\\/]/g, '');
  const folderName = `Customer_${userId}_${cleanName || 'Name'}`;
  const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;

  let query = `mimeType = 'application/vnd.google-apps.folder' and name = '${folderName.replace(/'/g, "\\'")}' and trashed = false`;
  if (rootFolderId && rootFolderId !== 'root' && rootFolderId !== 'placeholder') {
    query += ` and '${rootFolderId}' in parents`;
  }

  try {
    const listRes = await drive.files.list({
      q: query,
      fields: 'files(id, name)',
      spaces: 'drive',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    const files = listRes.data.files || [];
    if (files.length > 0 && files[0].id) {
      console.log(`[Google Drive] Found existing customer folder: ${folderName} (ID: ${files[0].id})`);
      return files[0].id;
    }

    const fileMetadata: DriveFileMetadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    };

    if (rootFolderId && rootFolderId !== 'root' && rootFolderId !== 'placeholder') {
      fileMetadata.parents = [rootFolderId];
    }

    const folder = await drive.files.create({
      requestBody: fileMetadata,
      fields: 'id',
      supportsAllDrives: true,
    });

    console.log(`[Google Drive] Created new customer folder: ${folderName} (ID: ${folder.data.id})`);
    return requireDriveFileId(folder.data.id, `customer folder ${folderName}`);
  } catch (error: unknown) {
    console.error(`[Google Drive] Failed to resolve customer folder for ${customerName}:`, error);
    throw new Error(`Google Drive Customer Folder Resolution Failed: ${getErrorMessage(error, "Unknown Drive error")}`);
  }
}

/**
 * Resolves or creates Proposal folder: Proposal_[Proposal_ID]
 * Nested under Customer folder (Tier 3 of hierarchy)
 */
export async function getOrCreateProposalFolder(customerFolderId: string, proposalId: string): Promise<string> {
  const drive = getDriveClient();
  const folderName = `Proposal_${proposalId}`;
  const query = `mimeType = 'application/vnd.google-apps.folder' and name = '${folderName}' and trashed = false and '${customerFolderId}' in parents`;

  try {
    const listRes = await drive.files.list({
      q: query,
      fields: 'files(id, name)',
      spaces: 'drive',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    const files = listRes.data.files || [];
    if (files.length > 0 && files[0].id) {
      console.log(`[Google Drive] Found existing proposal folder: ${folderName} (ID: ${files[0].id})`);
      return files[0].id;
    }

    const fileMetadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [customerFolderId],
    };

    const folder = await drive.files.create({
      requestBody: fileMetadata,
      fields: 'id',
      supportsAllDrives: true,
    });

    console.log(`[Google Drive] Created new proposal folder: ${folderName} (ID: ${folder.data.id})`);
    return requireDriveFileId(folder.data.id, `proposal folder ${folderName}`);
  } catch (error: unknown) {
    console.error(`[Google Drive] Failed to resolve proposal folder for proposalId ${proposalId}:`, error);
    throw new Error(`Google Drive Proposal Folder Resolution Failed: ${getErrorMessage(error, "Unknown Drive error")}`);
  }
}

/**
 * Lists files in proposal folder and determines next version number
 */
export async function getProposalNextVersion(proposalFolderId: string, proposalId: string): Promise<number> {
  const drive = getDriveClient();
  const query = `'${proposalFolderId}' in parents and trashed = false`;

  try {
    const listRes = await drive.files.list({
      q: query,
      fields: 'files(id, name)',
      spaces: 'drive',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    const files = listRes.data.files || [];
    let maxVersion = 0;
    const regex = new RegExp(`^Signed_Proposal_${proposalId}_v(\\d+)\\.[a-zA-Z0-9]+$`);

    for (const file of files) {
      if (file.name) {
        const match = file.name.match(regex);
        if (match) {
          const versionNum = parseInt(match[1], 10);
          if (versionNum > maxVersion) {
            maxVersion = versionNum;
          }
        }
      }
    }

    return maxVersion + 1;
  } catch (error: unknown) {
    console.error(`[Google Drive] Failed to determine next version for proposal ${proposalId}:`, error);
    return 1;
  }
}

/**
 * Uploads file to Drive with PassThrough stream and applies public read permissions
 */
export async function uploadFileToDrive(
  folderId: string,
  fileBuffer: Buffer,
  mimeType: string,
  fileName: string,
  signal?: AbortSignal
): Promise<string> {
  const drive = getDriveClient();

  try {
    const fileMetadata = {
      name: fileName,
      parents: [folderId],
    };

    const bufferStream = new PassThrough();
    bufferStream.end(fileBuffer);

    const media = {
      mimeType: mimeType,
      body: bufferStream,
    };

    const createParams: drive_v3.Params$Resource$Files$Create = {
      requestBody: fileMetadata,
      media: media,
      fields: 'id, webViewLink',
      supportsAllDrives: true,
      keepRevisionForever: true,
    };
    const methodOptions: MethodOptions | undefined = signal
      ? ({ signal } as unknown as MethodOptions)
      : undefined;
    const file = await drive.files.create(createParams, methodOptions);

    const fileId = file.data.id;
    const webViewLink = file.data.webViewLink;

    if (!fileId || !webViewLink) {
      throw new Error("Upload did not return expected file metadata.");
    }

    // PILLAR 2: Apply public read-only permission immediately after upload
    try {
      await drive.permissions.create({
        fileId: fileId,
        supportsAllDrives: true,
        requestBody: {
          role: 'reader',
          type: 'anyone'
        }
      }, methodOptions);
      console.log(`[Google Drive] Applied public read permission to file: ${fileName} (ID: ${fileId})`);
    } catch (permErr: unknown) {
      console.error(`[Google Drive] Warning: Failed to apply public permission:`, getErrorMessage(permErr, "Unknown permission error"));
    }

    console.log(`[Google Drive] Uploaded file successfully: ${fileName} (ID: ${fileId})`);
    return convertToEmbedPreviewUrl(webViewLink);
  } catch (error: unknown) {
    console.error(`[Google Drive] Failed to upload file: ${fileName}:`, error);
    throw new Error(`Google Drive Upload Failed: ${getErrorMessage(error, "Unknown Drive upload error")}`);
  }
}

/**
 * Uploads HTML content as PDF to Google Drive
 */
export async function uploadToGoogleDrive(options: {
  filename: string;
  mimeType: string;
  htmlContent: string;
  folderId?: string;
}): Promise<{
  success: boolean;
  fileId?: string;
  previewUrl?: string;
  error?: string;
}> {
  try {
    const { filename, htmlContent, folderId } = options;
    const drive = getDriveClient();

    const pdfBuffer = Buffer.from(htmlContent);

    const fileMetadata: DriveFileMetadata = {
      name: filename,
      mimeType: "application/pdf",
    };

    if (folderId && folderId !== "root") {
      fileMetadata.parents = [folderId];
    }

    const media = {
      mimeType: "application/pdf",
      body: new PassThrough().end(pdfBuffer),
    };

    const uploadResponse = await drive.files.create({
      requestBody: fileMetadata,
      media,
      fields: "id, webViewLink",
      supportsAllDrives: true,
    });

    const fileId = uploadResponse.data.id;
    const webViewLink = uploadResponse.data.webViewLink;

    if (!fileId) {
      return {
        success: false,
        error: "Failed to get file ID from upload response",
      };
    }

    // PILLAR 2: Apply public permission
    try {
      await drive.permissions.create({
        fileId: fileId,
        supportsAllDrives: true,
        requestBody: {
          role: 'reader',
          type: 'anyone'
        }
      });
    } catch (permErr: unknown) {
      console.error(`[Google Drive] Warning: Failed to apply public permission:`, getErrorMessage(permErr, "Unknown permission error"));
    }

    const previewUrl = convertToEmbedPreviewUrl(webViewLink);

    return {
      success: true,
      fileId,
      previewUrl,
    };
  } catch (error: unknown) {
    console.error("[Google Drive] Document upload failed:", error);
    return {
      success: false,
      error: getErrorMessage(error, "Unknown error"),
    };
  }
}

/**
 * Resolves or creates a subfolder within a parent folder
 */
export async function getOrCreateSubfolder(parentFolderId: string, folderName: string): Promise<string> {
  const drive = getDriveClient();
  const query = `mimeType = 'application/vnd.google-apps.folder' and name = '${folderName}' and trashed = false and '${parentFolderId}' in parents`;

  try {
    const listRes = await drive.files.list({
      q: query,
      fields: 'files(id, name)',
      spaces: 'drive',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    const files = listRes.data.files || [];
    if (files.length > 0 && files[0].id) {
      console.log(`[Google Drive] Found existing subfolder: ${folderName} (ID: ${files[0].id})`);
      return files[0].id;
    }

    const fileMetadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId],
    };

    const folder = await drive.files.create({
      requestBody: fileMetadata,
      fields: 'id',
      supportsAllDrives: true,
    });

    console.log(`[Google Drive] Created new subfolder: ${folderName} (ID: ${folder.data.id})`);
    return requireDriveFileId(folder.data.id, `subfolder ${folderName}`);
  } catch (error: unknown) {
    console.error(`[Google Drive] Failed to resolve subfolder ${folderName}:`, error);
    throw new Error(`Google Drive Subfolder Resolution Failed: ${getErrorMessage(error, "Unknown Drive error")}`);
  }
}

/**
 * Resolves the finance archive hierarchy:
 * /Finance/[Year]/[Quarter]/[Quotation_ID]/
 */
export async function getOrCreateFinanceQuotationFolder(
  quotationId: string,
  date = new Date(),
): Promise<string> {
  const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID?.trim();
  if (!rootFolderId || rootFolderId === "root" || rootFolderId === "placeholder") {
    throw new Error("GOOGLE_DRIVE_ROOT_FOLDER_ID is not configured.");
  }

  const normalizedQuotationId = quotationId.trim();
  if (!normalizedQuotationId) {
    throw new Error("Quotation ID is required for the finance folder.");
  }

  const year = String(date.getUTCFullYear());
  const quarter = `Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
  const financeFolderId = await getOrCreateSubfolder(rootFolderId, "Finance");
  const yearFolderId = await getOrCreateSubfolder(financeFolderId, year);
  const quarterFolderId = await getOrCreateSubfolder(yearFolderId, quarter);

  return getOrCreateSubfolder(quarterFolderId, normalizedQuotationId);
}
