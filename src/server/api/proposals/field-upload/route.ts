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

const MAX_FIELD_FILE_SIZE = 20 * 1024 * 1024;
const MAX_FIELD_FILES_PER_REQUEST = 8;
const MAX_FIELD_REQUEST_BYTES =
  MAX_FIELD_FILE_SIZE * MAX_FIELD_FILES_PER_REQUEST + 1024 * 1024;
const ALLOWED_FIELD_FILE_KINDS: readonly UploadFileKind[] = ["pdf", "jpeg", "png", "webp", "heic"];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
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

    if (isUploadContentLengthExceeded(req.headers, MAX_FIELD_REQUEST_BYTES)) {
      return NextResponse.json(
        { success: false, error: "Field upload request is too large." },
        { status: 413 },
      );
    }

    const formData = await req.formData();
    const proposalId = String(formData.get("proposal_id") || "");
    const step = Number(formData.get("step") || 0);
    const files = formData.getAll("files").filter((file): file is File => file instanceof File);

    if (!proposalId || !Number.isInteger(step) || step < 1 || files.length === 0) {
      return NextResponse.json({ success: false, error: "Missing proposal_id, step, or files" }, { status: 400 });
    }

    if (files.length > MAX_FIELD_FILES_PER_REQUEST) {
      return NextResponse.json(
        { success: false, error: `Upload a maximum of ${MAX_FIELD_FILES_PER_REQUEST} files per request.` },
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

    const userObj = proposal.user || { name: null, email: null };
    const customerName = userObj.name || userObj.email?.split("@")[0] || "Customer";
    const customerFolderId = await getOrCreateCustomerFolder(customerName, proposal.userId);
    const proposalFolderId = await getOrCreateProposalFolder(customerFolderId, proposalId);
    const uploaded: Array<{ url: string; fileName: string; uploadedAt: string; step: number }> = [];

    for (const file of files) {
      const validatedFile = await validateUploadFile({
        file,
        allowedKinds: ALLOWED_FIELD_FILE_KINDS,
        fallbackName: "field-attachment",
        maxBytes: MAX_FIELD_FILE_SIZE,
      });
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const fileName = `Field_Step_${step}_${proposalId}_${Date.now()}.${validatedFile.extension}`;
      const driveUrl = await uploadFileToDrive(proposalFolderId, buffer, validatedFile.contentType, fileName);
      uploaded.push({
        url: convertToEmbedPreviewUrl(driveUrl),
        fileName,
        uploadedAt: new Date().toISOString(),
        step,
      });
    }

    const fieldChecklistData = asRecord(proposal.fieldChecklistData);
    const stepKey = `step_${step}`;
    const existingStep = asRecord(fieldChecklistData[stepKey]);
    const existingAttachments = Array.isArray(existingStep.attachments) ? existingStep.attachments : [];

    await db.update(proposals)
      .set({
        fieldChecklistData: {
          ...fieldChecklistData,
          [stepKey]: {
            ...existingStep,
            attachments: [...existingAttachments, ...uploaded],
            updatedAt: new Date().toISOString(),
          },
        },
      })
      .where(eq(proposals.id, proposalId));

    return NextResponse.json({ success: true, uploaded });
  } catch (error: unknown) {
    console.error("[Field Upload]:", error);
    return NextResponse.json(
      { success: false, error: "Failed to upload field files" },
      { status: 500 }
    );
  }
}
