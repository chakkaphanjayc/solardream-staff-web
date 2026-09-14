import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { proposals } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { createClient } from "@/utils/supabase/server";
import { sendDiscordEmbedNotification } from "@/lib/discord";
import { getProposalWithExpiration } from "@/app/actions/proposals";
import {
  isUploadContentLengthExceeded,
  validateUploadFile,
  type UploadFileKind,
} from "@/lib/fileValidation";
import {
  getOrCreateFinanceQuotationFolder,
  getProposalNextVersion,
  uploadFileToDrive,
  convertToEmbedPreviewUrl
} from "@/lib/googleDrive";

export const maxDuration = 60;

const MAX_SIGNED_FILE_SIZE = 20 * 1024 * 1024;
const MAX_SIGNED_REQUEST_BYTES = MAX_SIGNED_FILE_SIZE + 1024 * 1024;
const ALLOWED_SIGNED_FILE_KINDS: readonly UploadFileKind[] = ["pdf"];

type ProposalConfigData = Record<string, unknown> & {
  uploadedVersions?: unknown[];
};

interface DriveUploadResult {
  proposalFolderId: string;
  nextVersion: number;
  fileName: string;
  webViewLink: string;
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) {
    throw new Error("Upload operation timed out");
  }
}

async function withNetworkTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs = 25000
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await Promise.race([
      operation(controller.signal),
      new Promise<T>((_, reject) => {
        controller.signal.addEventListener(
          "abort",
          () => reject(new Error("Upload operation timed out")),
          { once: true }
        );
      }),
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json(
        { success: false, error: "User not authenticated. Please sign in again before uploading." },
        { status: 401 }
      );
    }

    if (isUploadContentLengthExceeded(req.headers, MAX_SIGNED_REQUEST_BYTES)) {
      return NextResponse.json(
        { success: false, error: "Signed proposal upload request is too large." },
        { status: 413 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file");
    const proposalId = String(formData.get("proposal_id") || "").trim();

    if (!(file instanceof File) || !proposalId) {
      return NextResponse.json(
        { success: false, error: "Missing required fields (file, proposal_id)" },
        { status: 400 }
      );
    }

    // Validate proposal ownership before doing slow external Google Drive work.
    const proposal = await db.query.proposals.findFirst({
      where: and(
        eq(proposals.id, proposalId),
        eq(proposals.userId, authUser.id)
      ),
      with: {
        user: {
          columns: {
            name: true,
            email: true,
          },
        },
      },
    });

    const resolvedProposal = await getProposalWithExpiration(proposal ?? null);

    if (!resolvedProposal) {
      return NextResponse.json(
        { success: false, error: "Proposal not found or you do not have permission to upload this document." },
        { status: 404 }
      );
    }

    if (resolvedProposal.status.toUpperCase() === "EXPIRED") {
      return NextResponse.json(
        {
          success: false,
          error: "ใบเสนอราคานี้หมดอายุความสอดคล้องแล้ว กรุณากดติดต่อเจ้าหน้าที่เพื่อขอทบทวนราคาโครงการใหม่",
        },
        { status: 410 }
      );
    }

    const customerName = resolvedProposal.user?.name || resolvedProposal.user?.email?.split("@")[0] || "Customer";

    console.log(`[Upload Route] Starting signed proposal ingestion for: ${customerName} (User ID: ${authUser.id}, Proposal ID: ${proposalId})`);

    const validatedFile = await validateUploadFile({
      file,
      allowedKinds: ALLOWED_SIGNED_FILE_KINDS,
      fallbackName: "signed-proposal",
      maxBytes: MAX_SIGNED_FILE_SIZE,
    });

    // Convert File to Buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    let driveResult: DriveUploadResult;

    try {
      driveResult = await withNetworkTimeout(async (signal) => {
        throwIfAborted(signal);

        const proposalFolderId = await getOrCreateFinanceQuotationFolder(
          proposalId,
        );
        throwIfAborted(signal);

        // Dynamic Version Control
        const nextVersion = await getProposalNextVersion(proposalFolderId, proposalId);
        const fileName = `Signed_Proposal_${proposalId}_v${nextVersion}.${validatedFile.extension}`;
        throwIfAborted(signal);

        // Upload file with public permissions
        const webViewLink = await uploadFileToDrive(proposalFolderId, buffer, validatedFile.contentType, fileName, signal);
        throwIfAborted(signal);

        return {
          proposalFolderId,
          nextVersion,
          fileName,
          webViewLink,
        };
      });
    } catch (error: unknown) {
      console.error("Google Drive API Stream Error:", error);
      return NextResponse.json(
        { success: false, error: "Failed to upload signed proposal file." },
        { status: 500 }
      );
    }

    const { proposalFolderId, nextVersion, fileName, webViewLink } = driveResult;

    // Structured error handling for configuration updates
    try {
      const configData = (resolvedProposal.configurationData as ProposalConfigData | null) || {};
      const uploadedVersions = Array.isArray(configData.uploadedVersions) ? configData.uploadedVersions : [];

      const previewUrl = convertToEmbedPreviewUrl(webViewLink);

      const newVersionObj = {
        version: nextVersion,
        url: previewUrl,
        fileName: fileName,
        uploadedAt: new Date().toISOString(),
      };

      const updatedConfigData = {
        ...configData,
        driveFolderId: proposalFolderId,
        driveFolderUrl: `https://drive.google.com/drive/folders/${proposalFolderId}`,
        uploadedVersions: [...uploadedVersions, newVersionObj],
      };

      await db.update(proposals)
        .set({
          status: "SIGNED_WAITING_VERIFY",
          signedDocumentDriveUrl: previewUrl,
          configurationData: updatedConfigData,
        })
        .where(eq(proposals.id, proposalId));

      const notificationProposal = await db.query.proposals.findFirst({
        where: eq(proposals.id, proposalId),
        with: {
          user: true
        }
      });

      if (!notificationProposal) {
        throw new Error("Updated proposal not found.");
      }

      console.log(`[Upload Route] Proposal updated: SIGNED_WAITING_VERIFY. Version: v${nextVersion}. Drive URL: ${webViewLink}`);

      // Dispatch Premium Discord Embed Notification
      void sendDiscordEmbedNotification({
        proposalId: notificationProposal.id,
        customerName: notificationProposal.user?.name || customerName,
        customerEmail: notificationProposal.user?.email || "ไม่มีอีเมล",
        systemSizeKwp: notificationProposal.systemSizeKwp,
        panelCount: notificationProposal.panelCount,
        totalPrice: notificationProposal.totalPrice,
        version: nextVersion,
        driveLink: webViewLink
      }).then((success) => {
        if (success) {
          console.log(`[Upload Route] High-fidelity Discord embed alert deployed.`);
        } else {
          console.warn(`[Upload Route] Discord webhook did not confirm delivery.`);
        }
      }).catch((error) => {
        console.error("[Upload Route] Discord webhook dispatch failed:", error);
      });

      return NextResponse.json({
        success: true,
        message: `Proposal uploaded successfully as version v${nextVersion}.`,
        webViewLink: previewUrl,
        driveWebViewLink: webViewLink,
        driveUploadConfirmed: true,
        status: "SIGNED_WAITING_VERIFY",
        version: nextVersion,
      });
    } catch (dbErr: unknown) {
      console.error("[Upload Route] Database update failed:", dbErr);
      throw new Error("Failed to update proposal after signed upload.");
    }
  } catch (error: unknown) {
    console.error(`[Upload Route] Ingestion process failed:`, error);
    return NextResponse.json(
      { success: false, error: "Failed to process proposal ingestion." },
      { status: 500 }
    );
  }
}
