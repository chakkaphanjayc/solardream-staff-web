import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, desc, eq, or } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { activityLogs, proposalRevisions, proposals, signatureAuditTrails, signatureEnvelopes } from "@/db/schema";
import {
  createErpnextSalesOrderFromQuotation,
  getProjectBySalesOrder,
  getQuotationDocumentNo,
} from "@/lib/erpnext";
import { NotificationOrchestrator } from "@/lib/notificationOrchestrator";
import {
  markErpnextQuotationAccepted,
  stampQuotationPdf,
  updateErpnextQuotationSignatureAudit,
} from "@/lib/pdf-signer";
import { downloadDrivePdf, uploadSignedDrivePdf, type DrivePdfFile } from "@/lib/document-signing/drive";
import { getSigningSecret, PORTAL_SESSION_COOKIE, validatePortalToken } from "@/lib/portalTokens";
import { isQuotationAvailableForSignature } from "@/lib/quotationSigningEligibility";
import { broadcastAdminEvent } from "@/lib/sse-publisher";
import { verifyHs256Jwt } from "@/lib/signedJwt";
import { createClient } from "@/utils/supabase/server";
import { enqueueIntegrationEvent } from "@/lib/integrationOutbox";
import { processOutboxBestEffort } from "@/lib/outboxProcessor";
import { SALES_NOTIFICATION_TOPICS } from "@/lib/salesNotificationConfig";


const signQuotationSchema = z.object({
  quotation_id: z.string().trim().min(1).max(160),
  signature: z.string().trim().min(32).max(3_000_000),
  signer_name: z.string().trim().min(1).max(160).optional(),
});

type GoldenThreadState = {
  status: "PROJECT_CREATED" | "SALES_ORDER_SUBMITTED" | "SYNC_FAILED";
  quotationId: string;
  salesOrderId: string | null;
  projectId: string | null;
  updatedAt: string;
  error?: string;
};

function clientIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || "unknown";
}

function verificationUrl(request: NextRequest, quotationId: string) {
  const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  const origin = configuredOrigin || request.nextUrl.origin;
  return new URL(`/verify/${encodeURIComponent(quotationId)}`, origin).toString();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function getText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function getExistingGoldenThreadState(configurationData: unknown) {
  const config = asRecord(configurationData);
  const state = asRecord(config.goldenThread);
  return {
    salesOrderId: getText(state.salesOrderId) || null,
    projectId: getText(state.projectId) || null,
  };
}

async function waitForProjectBySalesOrder(salesOrderId: string) {
  const attempts = 5;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const project = await getProjectBySalesOrder(salesOrderId);
    if (project) return project;
    if (attempt < attempts - 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, 400));
    }
  }
  return null;
}

async function orchestrateGoldenThread(
  quotationId: string,
  configurationData: unknown,
): Promise<GoldenThreadState> {
  const existing = getExistingGoldenThreadState(configurationData);
  const salesOrderId = existing.salesOrderId
    || (await createErpnextSalesOrderFromQuotation(quotationId)).salesOrderName;
  const project = await waitForProjectBySalesOrder(salesOrderId);
  const projectId = project ? getText(project.name) || null : null;
  const updatedAt = new Date().toISOString();

  if (projectId && existing.projectId !== projectId) {
    broadcastAdminEvent("PROJECT_CREATED", { projectId });
  }

  return {
    status: projectId ? "PROJECT_CREATED" : "SALES_ORDER_SUBMITTED",
    quotationId,
    salesOrderId,
    projectId,
    updatedAt,
  };
}

function extractDriveFileId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (/^[a-zA-Z0-9_-]{10,200}$/.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    const pathMatch = /\/file\/d\/([a-zA-Z0-9_-]{10,200})/.exec(url.pathname);
    if (pathMatch?.[1]) return pathMatch[1];
    const queryId = url.searchParams.get("id");
    return queryId && /^[a-zA-Z0-9_-]{10,200}$/.test(queryId) ? queryId : null;
  } catch {
    return null;
  }
}

async function getStoredQuotationPdf(proposal: {
  id: string;
  revisedPdfUrl: string | null;
  pdfUrl: string | null;
}): Promise<{ source: DrivePdfFile; sourceDocumentId: string | null }> {
  const finalQuotation = await db.query.quotationDeliveryDocuments.findFirst({
    where: (documents, operators) => operators.and(
      operators.eq(documents.quotationId, proposal.id),
      operators.eq(documents.deliveryType, "FINAL_QUOTATION"),
      operators.eq(documents.status, "READY"),
    ),
    columns: {
      id: true,
      fileUrl: true,
      storageFileId: true,
      fallbackUrl: true,
    },
  });

  const sourceValues = finalQuotation
    ? [finalQuotation.storageFileId, finalQuotation.fileUrl, finalQuotation.fallbackUrl]
    : [proposal.revisedPdfUrl, proposal.pdfUrl];
  const sourceFileId = sourceValues
    .map(extractDriveFileId)
    .find((fileId): fileId is string => Boolean(fileId));

  if (!sourceFileId) {
    throw new Error(
      finalQuotation
        ? "The current final quotation must be stored as a Google Drive PDF before signing."
        : "A stored quotation PDF is required before signing.",
    );
  }

  return {
    source: await downloadDrivePdf(sourceFileId),
    sourceDocumentId: finalQuotation?.id || null,
  };
}

async function getGuestEmailAccess(request: NextRequest) {
  const token = request.cookies.get("sd_guest_email")?.value;
  if (!token) return null;

  try {
    const payload = verifyHs256Jwt(token, await getSigningSecret());
    return payload?.typ === "guest_master_session" && typeof payload.email === "string"
      ? payload.email.trim().toLowerCase()
      : null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = signQuotationSchema.parse(await request.json());
    const proposal = await db.query.proposals.findFirst({
      where: or(
        eq(proposals.id, input.quotation_id),
        eq(proposals.erpnextQuotationId, input.quotation_id),
      ),
      with: {
        user: {
          columns: { name: true, fullName: true, email: true, phoneNumber: true, lineUserId: true },
        },
      },
    });
    if (!proposal) return NextResponse.json({ error: "Quotation not found." }, { status: 404 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const portalSession = request.cookies.get(PORTAL_SESSION_COOKIE)?.value || "";
    const portalAccess = portalSession
      ? await validatePortalToken({ token: portalSession, proposalId: proposal.id, requiredScope: "proposal:read" })
      : null;
    const guestEmail = await getGuestEmailAccess(request);
    const proposalEmail = proposal.user?.email?.trim().toLowerCase() || null;
    const hasVerifiedGuestEmail = Boolean(guestEmail && proposalEmail && guestEmail === proposalEmail);
    if (user?.id !== proposal.userId && !portalAccess && !hasVerifiedGuestEmail) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    if (!isQuotationAvailableForSignature({
      status: proposal.status,
      dispatchStatus: proposal.dispatchStatus,
    })) {
      return NextResponse.json({ error: "This quotation is not available for signature." }, { status: 409 });
    }

    const quotationId = proposal.erpnextQuotationId?.trim();
    if (!quotationId) {
      return NextResponse.json({ error: "The ERPNext quotation must be created before signing." }, { status: 409 });
    }

    const signedAt = new Date();
    const signerIpAddress = clientIp(request);
    const signerUserAgent = request.headers.get("user-agent") || "unknown";
    const signerName = input.signer_name || proposal.user?.fullName || proposal.user?.name || "Customer";
    const quotationVerificationUrl = verificationUrl(request, quotationId);
    const { source: originalPdf, sourceDocumentId } = await getStoredQuotationPdf({
      id: proposal.id,
      revisedPdfUrl: proposal.revisedPdfUrl,
      pdfUrl: proposal.pdfUrl,
    });
    const sourceDocumentHash = createHash("sha256").update(originalPdf.bytes).digest("hex");
    const currentRevision = await db.query.proposalRevisions.findFirst({
      where: eq(proposalRevisions.proposalId, proposal.id),
      orderBy: [desc(proposalRevisions.revisionNumber)],
    });
    if (!currentRevision || (currentRevision.status !== "SENT" && currentRevision.status !== "VIEWED")) {
      return NextResponse.json({ error: "The current proposal revision is not available for signature." }, { status: 409 });
    }
    if (!currentRevision.documentHash || currentRevision.documentHash !== sourceDocumentHash) {
      return NextResponse.json({ error: "The stored document does not match the revision that was sent. Create and send a new revision." }, { status: 409 });
    }
    const signedDocument = await stampQuotationPdf({
      pdfBytes: originalPdf.bytes,
      signatureDataUrl: input.signature,
      signedAt,
      signerIpAddress,
      signerUserAgent,
      verificationUrl: quotationVerificationUrl,
      signerName,
      requireSignatureAnchor: true,
    });
    const signedDriveDocument = await uploadSignedDrivePdf({
      source: originalPdf,
      signedPdf: Buffer.from(signedDocument.pdfBytes),
    });
    const signedPdfUrl = signedDriveDocument.fileUrl;
    await updateErpnextQuotationSignatureAudit({
      quotationId,
      sha256Hash: signedDocument.sha256Hash,
      signedAt: signedAt.toISOString(),
      signerIpAddress,
      signerUserAgent,
      verificationUrl: quotationVerificationUrl,
    });
    await markErpnextQuotationAccepted(quotationId);

    const configurationData = asRecord(proposal.configurationData);
    const signature = {
      signedAt: signedAt.toISOString(),
      signerName,
      signerIpAddress,
      signerUserAgent,
      erpnextQuotationId: quotationId,
      signedPdfUrl,
      signedDriveFileId: signedDriveDocument.fileId,
      signedSourceFileId: originalPdf.fileId,
      signedSourceDocumentId: sourceDocumentId,
      signedSourceFileName: originalPdf.fileName,
      signedPdfStorage: "GOOGLE_DRIVE",
      sha256Hash: signedDocument.sha256Hash,
      verificationUrl: quotationVerificationUrl,
      source: "stored_quotation_signature_field",
    };

    const [updatedProposal] = await db.transaction(async (tx) => {
      const [updated] = await tx.update(proposals)
        .set({
          status: "CLIENT_SIGNED_PENDING_REVIEW",
          dispatchStatus: "SIGNED",
          signatureUrl: input.signature,
          signedAt,
          signedDocumentDriveUrl: signedPdfUrl,
          configurationData: { ...configurationData, signature },
          updatedAt: signedAt,
        })
        .where(and(eq(proposals.id, proposal.id), eq(proposals.status, proposal.status)))
        .returning();
      if (!updated) throw new Error("Quotation was updated before it could be signed. Please reload and try again.");

      await tx.insert(signatureAuditTrails).values({
        proposalId: proposal.id,
        signatureUrl: input.signature,
        signerIpAddress,
        signerUserAgent,
        documentHash: signedDocument.sha256Hash,
      });
      const verifiedContactValue = proposalEmail || proposal.user?.phoneNumber?.trim();
      if (!verifiedContactValue) throw new Error("A verified signer contact is required.");
      const verifiedContact = user?.id === proposal.userId
        ? { type: "AUTHENTICATED_USER", userId: user.id, value: verifiedContactValue }
        : portalAccess
          ? { type: "PORTAL_TOKEN", value: verifiedContactValue }
          : { type: "VERIFIED_EMAIL", value: guestEmail || verifiedContactValue };
      await tx.insert(signatureEnvelopes).values({
        revisionId: currentRevision.id,
        status: "SIGNED",
        signerIdentity: { name: signerName, proposalUserId: proposal.userId },
        verifiedContact,
        signedAt,
        consentVersion: process.env.PROPOSAL_SIGNATURE_CONSENT_VERSION?.trim() || "2026-08-28",
        signatureStorageReference: signedDriveDocument.fileId,
        // Evidence binds to the exact document presented; the stamped output hash is retained separately.
        documentHash: sourceDocumentHash,
        auditMetadata: {
          verificationMethod: verifiedContact.type,
          ipAddressHash: createHash("sha256").update(signerIpAddress).digest("hex"),
          userAgentHash: createHash("sha256").update(signerUserAgent).digest("hex"),
          sourceDocumentId: sourceDocumentId || undefined,
          verificationUrl: quotationVerificationUrl,
          signedDocumentHash: signedDocument.sha256Hash,
        },
      });
      const [acceptedRevision] = await tx.update(proposalRevisions).set({ status: "ACCEPTED", acceptedAt: signedAt })
        .where(and(eq(proposalRevisions.id, currentRevision.id), or(eq(proposalRevisions.status, "SENT"), eq(proposalRevisions.status, "VIEWED"))))
        .returning({ id: proposalRevisions.id });
      if (!acceptedRevision) throw new Error("Proposal revision was updated before it could be accepted. Please reload and try again.");
      await tx.insert(activityLogs).values({
        entityId: proposal.id,
        entityType: "QUOTATION",
        action: "CUSTOMER_SIGNATURE_EMBEDDED",
        description: `${signerName} signed ${getQuotationDocumentNo(proposal.id)}. The stored quotation PDF was stamped in its customer signature field and uploaded to Google Drive as ${signedDriveDocument.fileName}.`,
        userId: proposal.userId,
      });
      return [updated];
    });

    let goldenThread: GoldenThreadState;
    try {
      goldenThread = await orchestrateGoldenThread(quotationId, updatedProposal.configurationData);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown ERPNext orchestration error.";
      console.error("[Quotation Sign] Golden Thread orchestration failed.", {
        quotationId,
        proposalId: proposal.id,
        error: message,
      });
      const existing = getExistingGoldenThreadState(updatedProposal.configurationData);
      goldenThread = {
        status: "SYNC_FAILED",
        quotationId,
        salesOrderId: existing.salesOrderId,
        projectId: existing.projectId,
        updatedAt: new Date().toISOString(),
        error: "ERPNext Sales Order and Project synchronization failed.",
      };
    }

    await db.update(proposals)
      .set({
        configurationData: {
          ...asRecord(updatedProposal.configurationData),
          goldenThread,
        },
        updatedAt: new Date(),
      })
      .where(eq(proposals.id, proposal.id));

    await enqueueIntegrationEvent(db, {
      topic: SALES_NOTIFICATION_TOPICS.quotationAccepted,
      aggregateType: "PROPOSAL",
      aggregateId: proposal.id,
      payload: { source: "CUSTOMER_SIGNATURE" },
      dedupeKey: `sales.quotation.accepted:${proposal.id}`,
    });
    await processOutboxBestEffort(proposal.id);

    void NotificationOrchestrator("QUOTATION_ACCEPTED", {
      customerName: signerName,
      phone: proposal.user?.phoneNumber || "",
      email: proposal.user?.email || null,
      lineUserId: proposal.user?.lineUserId || null,
      quotationId: quotationId,
      proposalUrl: `/proposals/${proposal.magicTokenSlug}`,
      pdfUrl: signedPdfUrl,
    }).catch((error: unknown) => console.error("[Quotation Sign] Notification dispatch failed.", error));

    revalidatePath("/proposals");
    revalidatePath(`/proposals/${proposal.magicTokenSlug}`);
    revalidatePath("/admin/crm");
    revalidatePath(`/admin/crm/${proposal.id}`);
    revalidatePath("/admin/projects");

    return NextResponse.json({
      success: true,
      proposal_id: updatedProposal.id,
      status: updatedProposal.status,
      signed_pdf_url: signedPdfUrl,
      signed_drive_file_id: signedDriveDocument.fileId,
      verification_url: quotationVerificationUrl,
      sha256_hash: signedDocument.sha256Hash,
      golden_thread: goldenThread,
    });
  } catch (error: unknown) {
    console.error("[Quotation Sign] Failed to sign quotation.", error);
    const message = error instanceof Error ? error.message : "Unable to sign quotation.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
