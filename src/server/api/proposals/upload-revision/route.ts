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
  convertToEmbedPreviewUrl,
  getOrCreateCustomerFolder,
  getOrCreateProposalFolder,
  uploadFileToDrive,
} from "@/lib/googleDrive";

export const maxDuration = 60;

const MAX_REVISION_FILE_SIZE = 20 * 1024 * 1024;
const MAX_REVISION_FILES_PER_REQUEST = 5;
const MAX_REVISION_REQUEST_BYTES =
  MAX_REVISION_FILE_SIZE * MAX_REVISION_FILES_PER_REQUEST + 1024 * 1024;
const ALLOWED_REVISION_FILE_KINDS: readonly UploadFileKind[] = ["pdf"];

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

    if (isUploadContentLengthExceeded(req.headers, MAX_REVISION_REQUEST_BYTES)) {
      return NextResponse.json(
        { success: false, error: "Revision upload request is too large." },
        { status: 413 },
      );
    }

    const formData = await req.formData();
    const proposalId = String(formData.get("proposal_id") || "");
    const files = formData.getAll("files").filter((file): file is File => file instanceof File);

    if (!proposalId || files.length === 0) {
      return NextResponse.json({ success: false, error: "Missing proposal_id or files" }, { status: 400 });
    }

    if (files.length > MAX_REVISION_FILES_PER_REQUEST) {
      return NextResponse.json(
        { success: false, error: `Upload a maximum of ${MAX_REVISION_FILES_PER_REQUEST} revised PDFs per request.` },
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
    const uploaded: Array<{ url: string; fileName: string; uploadedAt: string }> = [];

    for (const file of files) {
      const validatedFile = await validateUploadFile({
        file,
        allowedKinds: ALLOWED_REVISION_FILE_KINDS,
        fallbackName: "revised-quotation",
        maxBytes: MAX_REVISION_FILE_SIZE,
      });
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const fileName = `Revised_Quotation_${proposalId}_${Date.now()}.${validatedFile.extension}`;
      const driveUrl = await uploadFileToDrive(proposalFolderId, buffer, validatedFile.contentType, fileName);
      uploaded.push({
        url: convertToEmbedPreviewUrl(driveUrl),
        fileName,
        uploadedAt: new Date().toISOString(),
      });
    }

    const config = (proposal.configurationData as Record<string, unknown>) || {};
    const revisedQuoteVersions = Array.isArray(config.revisedQuoteVersions) ? config.revisedQuoteVersions : [];
    const latest = uploaded[uploaded.length - 1];
    const nextRevision = (proposal.revisionNumber || 1) + 1;

    await db.update(proposals)
      .set({
        revisionNumber: nextRevision,
        revisedPdfUrl: latest.url,
        pdfUrl: latest.url,
        signedDocumentDriveUrl: null,
        signatureUrl: null,
        signedAt: null,
        verifiedAt: null,
        verifiedByAdminId: null,
        status: "AWAITING_CLIENT_SIGNATURE",
        dispatchStatus: "DISPATCHED",
        configurationData: {
          ...config,
          revisedQuoteVersions: [...revisedQuoteVersions, ...uploaded],
          customerApproval: {
            status: "PENDING",
            revisionVersion: nextRevision,
            replacedAt: new Date().toISOString(),
          },
        },
        updatedAt: new Date(),
      })
      .where(eq(proposals.id, proposalId));

    return NextResponse.json({
      success: true,
      uploaded,
    });
  } catch (error: unknown) {
    console.error("[Revision Upload]:", error);
    return NextResponse.json(
      { success: false, error: "Failed to upload revised quotation" },
      { status: 500 }
    );
  }
}
