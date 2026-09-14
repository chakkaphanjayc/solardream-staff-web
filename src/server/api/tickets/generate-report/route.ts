import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { operationsTickets } from "@/db/schema";
import { eq } from "drizzle-orm";
import { generateDocumentHTML } from "@/lib/documentTemplates";
import { uploadToGoogleDrive } from "@/lib/googleDrive";
import { requireStaffJson } from "@/lib/auth-guard";
import { isRequestContentLengthExceeded } from "@/lib/requestSize";

interface GenerateReportPayload {
  ticketId: string;
  formData: Record<string, unknown>;
  signatures: Record<string, string>;
}

const MAX_GENERATE_REPORT_BODY_BYTES = 512 * 1024;

export async function POST(request: NextRequest) {
  try {
    const auth = await requireStaffJson();
    if (!auth.ok) return auth.response;

    if (isRequestContentLengthExceeded(request.headers, MAX_GENERATE_REPORT_BODY_BYTES)) {
      return NextResponse.json(
        { success: false, error: "Report generation payload is too large." },
        { status: 413 },
      );
    }

    const body = (await request.json().catch(() => null)) as GenerateReportPayload | null;
    if (!body?.ticketId || !body.formData || !body.signatures) {
      return NextResponse.json(
        { success: false, error: "ticketId, formData, and signatures are required." },
        { status: 400 },
      );
    }

    const { ticketId, formData, signatures } = body;

    // 1. Fetch ticket and proposal details
    const ticket = await db.query.operationsTickets.findFirst({
      where: eq(operationsTickets.id, ticketId),
      with: {
        proposal: {
          with: {
            user: true,
          },
        },
      },
    });

    if (!ticket) {
      return NextResponse.json(
        { error: "Ticket not found" },
        { status: 404 }
      );
    }

    if (!ticket.proposal) {
      return NextResponse.json(
        { error: "Associated proposal not found" },
        { status: 404 }
      );
    }

    const customerName = ticket.proposal.user?.name || "Unknown Customer";

    // 2. Generate HTML document based on document code
    const htmlContent = generateDocumentHTML({
      documentCode: ticket.documentCode,
      documentTitle: ticket.documentTitle,
      customerName,
      formData,
      signatureImage: signatures.authorizedSignature,
      timestamp: new Date().toISOString(),
    });

    // 3. Upload to Google Drive
    const driveResult = await uploadToGoogleDrive({
      filename: `${ticket.ticketNumber}_${ticket.documentTitle.replace(/\s+/g, "_")}.pdf`,
      mimeType: "application/pdf",
      htmlContent,
      folderId: ticket.proposal.user?.id || "unknown", // Use user ID as folder path
    });

    if (!driveResult.success) {
      return NextResponse.json(
        { error: "Failed to upload document to Google Drive" },
        { status: 500 }
      );
    }

    // 4. Update ticket with generated document URL and form data
    await db.update(operationsTickets)
      .set({
        formData,
        signatures,
        generatedDocUrl: driveResult.previewUrl,
        status: "COMPLETED",
        updatedAt: new Date(),
      })
      .where(eq(operationsTickets.id, ticketId));

    // 5. Return telemetry report
    return NextResponse.json({
      success: true,
      documentCode: ticket.documentCode,
      driveFileId: driveResult.fileId,
      previewUrl: driveResult.previewUrl,
      ticketNumber: ticket.ticketNumber,
      documentTitle: ticket.documentTitle,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Document generation error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
