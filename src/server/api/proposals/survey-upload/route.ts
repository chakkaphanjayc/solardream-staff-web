import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { proposals, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createClient } from "@/utils/supabase/server";
import {
  isUploadContentLengthExceeded,
  validateUploadFile,
  type UploadFileKind,
} from "@/lib/fileValidation";
import {
  getOrCreateCustomerFolder,
  getOrCreateProposalFolder,
  uploadFileToDrive,
  convertToEmbedPreviewUrl,
} from "@/lib/googleDrive";

export const maxDuration = 60;

const MAX_SURVEY_FILE_SIZE = 15 * 1024 * 1024;
const MAX_SURVEY_FILES_PER_REQUEST = 12;
const MAX_SURVEY_REQUEST_BYTES =
  MAX_SURVEY_FILE_SIZE * MAX_SURVEY_FILES_PER_REQUEST + 1024 * 1024;
const ALLOWED_SURVEY_FILE_KINDS: readonly UploadFileKind[] = ["jpeg", "png", "webp", "heic"];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

async function withNetworkTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs = 50000
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await Promise.race([
      operation(controller.signal),
      new Promise<T>((_, reject) => {
        controller.signal.addEventListener(
          "abort",
          () => reject(new Error("Network operation timed out")),
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
    const { data: { user: authUser } } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const dbUser = await db.query.users.findFirst({
      where: eq(users.id, authUser.id),
      columns: { role: true },
    });

    if (!dbUser || (dbUser.role !== "ADMIN" && dbUser.role !== "STAFF")) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    if (isUploadContentLengthExceeded(req.headers, MAX_SURVEY_REQUEST_BYTES)) {
      return NextResponse.json(
        { success: false, error: "Survey upload request is too large." },
        { status: 413 },
      );
    }

    const formData = await req.formData();
    const proposalId = String(formData.get("proposal_id") || "");
    const files = formData.getAll("files").filter((file): file is File => file instanceof File);

    if (!proposalId || files.length === 0) {
      return NextResponse.json({ success: false, error: "Missing proposal_id or files" }, { status: 400 });
    }

    if (files.length > MAX_SURVEY_FILES_PER_REQUEST) {
      return NextResponse.json(
        { success: false, error: `Upload a maximum of ${MAX_SURVEY_FILES_PER_REQUEST} survey photos per request.` },
        { status: 413 },
      );
    }

    const proposal = await db.query.proposals.findFirst({
      where: eq(proposals.id, proposalId),
      with: {
        user: {
          columns: {
            name: true,
            email: true,
          },
        },
      },
    });

    if (!proposal) {
      return NextResponse.json({ success: false, error: "Proposal not found" }, { status: 404 });
    }

    // 1. Target Handler: Extract driveFolderId from configurationData JSONB column
    const configData = asRecord(proposal.configurationData);
    let driveFolderId = typeof configData.driveFolderId === "string" ? configData.driveFolderId : null;

    if (!driveFolderId) {
      // Robust fallback resolver
      const userObj = proposal.user || { name: null, email: null };
      const customerName = userObj.name || userObj.email?.split("@")[0] || "Customer";
      const customerFolderId = await getOrCreateCustomerFolder(customerName, proposal.userId);
      driveFolderId = await getOrCreateProposalFolder(customerFolderId, proposalId);
    }

    // 2. Asynchronous Loop Factory wrapped in secure withNetworkTimeout wrapper
    const uploadedUrls: string[] = [];

    await withNetworkTimeout(async (signal) => {
      for (const file of files) {
        if (signal.aborted) {
          throw new Error("Upload operation timed out");
        }

        const validatedFile = await validateUploadFile({
          file,
          allowedKinds: ALLOWED_SURVEY_FILE_KINDS,
          fallbackName: "survey-photo",
          maxBytes: MAX_SURVEY_FILE_SIZE,
        });
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const fileName = `Survey_${proposalId}_${Date.now()}.${validatedFile.extension}`;

        // Call internal uploadFileToDrive utility passing the file buffer and active folder ID
        const driveUrl = await uploadFileToDrive(
          driveFolderId,
          buffer,
          validatedFile.contentType,
          fileName,
          signal
        );

        uploadedUrls.push(convertToEmbedPreviewUrl(driveUrl));
      }
    });

    // 3. Database Tracking: Append new URLs back into the surveyPhotos JSONB block
    const existingPhotos = asArray(proposal.surveyPhotos);
    const updatedPhotos = [...existingPhotos, ...uploadedUrls];

    await db.update(proposals)
      .set({
        surveyPhotos: updatedPhotos,
      })
      .where(eq(proposals.id, proposalId));

    return NextResponse.json({
      success: true,
      surveyPhotos: updatedPhotos,
      uploaded: uploadedUrls,
    });
  } catch (error: unknown) {
    console.error("[Survey Upload Error]:", error);
    return NextResponse.json(
      { success: false, error: "Failed to complete survey files upload" },
      { status: 500 }
    );
  }
}
