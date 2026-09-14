"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { proposals, quotationDeliveryDocuments } from "@/db/schema";
import { downloadDrivePdf, uploadSignedDrivePdf } from "@/lib/document-signing/drive";
import { stampAndCryptographicallySignPdf } from "@/lib/document-signing/signPdf";
import { stampSignatureOnPdf } from "@/lib/document-signing/stampSignatureOnPdf";
import type {
  DrivePdfPayload,
  ProcessAndSignPdfInput,
  ProcessAndSignPdfResult,
} from "@/types/documentSigning";
import { createClient } from "@/utils/supabase/server";

const driveFileIdSchema = z.string().trim().regex(/^[a-zA-Z0-9_-]{10,200}$/, "Invalid Google Drive file ID.");
const processAndSignPdfSchema = z.object({
  fileId: driveFileIdSchema,
  signatureBase64: z.string().trim().min(32).max(3_000_000),
  pageNumber: z.number().int().positive().max(500),
  x: z.number().finite().min(0).max(1),
  y: z.number().finite().min(0).max(1),
  width: z.number().finite().positive().max(1).default(0.3),
  height: z.number().finite().positive().max(1).default(0.15),
});
const stampPdfAtAnchorSchema = z.object({
  fileId: driveFileIdSchema,
  signatureBase64: z.string().trim().min(32).max(3_000_000),
  anchorText: z.string().trim().min(1).max(160),
  signatureWidth: z.number().finite().positive().max(360).optional(),
  maxSignatureHeight: z.number().finite().positive().max(180).optional(),
  offsetX: z.number().finite().min(-360).max(360).optional(),
  offsetY: z.number().finite().min(-360).max(360).optional(),
});

function extractDriveFileId(value: string): string | null {
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

async function requireAuthorizedDriveFile(fileId: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("You must sign in to access this document.");

  const userProposals = await db
    .select({
      pdfUrl: proposals.pdfUrl,
      revisedPdfUrl: proposals.revisedPdfUrl,
      signedDocumentDriveUrl: proposals.signedDocumentDriveUrl,
    })
    .from(proposals)
    .where(eq(proposals.userId, user.id));

  const proposalDirectlyReferencesFile = userProposals.some((proposal) => [
    proposal.pdfUrl,
    proposal.revisedPdfUrl,
    proposal.signedDocumentDriveUrl,
  ].some((url) => typeof url === "string" && extractDriveFileId(url) === fileId));

  const deliveryDocuments = await db
    .select({
      fileUrl: quotationDeliveryDocuments.fileUrl,
      storageFileId: quotationDeliveryDocuments.storageFileId,
      fallbackUrl: quotationDeliveryDocuments.fallbackUrl,
    })
    .from(quotationDeliveryDocuments)
    .innerJoin(proposals, eq(quotationDeliveryDocuments.quotationId, proposals.id))
    .where(eq(proposals.userId, user.id));
  const deliveryDocumentReferencesFile = deliveryDocuments.some((document) => [
    document.fileUrl,
    document.storageFileId,
    document.fallbackUrl,
  ].some((value) => typeof value === "string" && extractDriveFileId(value) === fileId));

  if (!proposalDirectlyReferencesFile && !deliveryDocumentReferencesFile) {
    throw new Error("You do not have access to this document.");
  }
}

/** Returns an authorized Google Drive PDF as serializable base64 for react-pdf. */
export async function getDrivePdf(fileId: string): Promise<DrivePdfPayload> {
  const normalizedFileId = driveFileIdSchema.parse(fileId);
  await requireAuthorizedDriveFile(normalizedFileId);
  const pdf = await downloadDrivePdf(normalizedFileId);

  return {
    fileId: pdf.fileId,
    fileName: pdf.fileName,
    base64: pdf.bytes.toString("base64"),
    byteLength: pdf.bytes.length,
  };
}

/** Stamps a PNG signature, applies a PKCS#12 cryptographic signature, and uploads a new Drive file. */
export async function processAndSignPdf(
  input: ProcessAndSignPdfInput,
): Promise<ProcessAndSignPdfResult> {
  const validatedInput = processAndSignPdfSchema.parse(input);
  await requireAuthorizedDriveFile(validatedInput.fileId);

  const originalPdf = await downloadDrivePdf(validatedInput.fileId);
  const signedPdf = await stampAndCryptographicallySignPdf(originalPdf.bytes, validatedInput);
  return uploadSignedDrivePdf({ source: originalPdf, signedPdf });
}

/**
 * Locates a text anchor in an authorized Drive PDF and returns a stamped PDF.
 * The base64 result is intended for the next server-side upload/signing step.
 */
export async function stampDrivePdfSignatureAtAnchor(input: {
  fileId: string;
  signatureBase64: string;
  anchorText: string;
  signatureWidth?: number;
  maxSignatureHeight?: number;
  offsetX?: number;
  offsetY?: number;
}) {
  const validatedInput = stampPdfAtAnchorSchema.parse(input);
  await requireAuthorizedDriveFile(validatedInput.fileId);

  const source = await downloadDrivePdf(validatedInput.fileId);
  const stamped = await stampSignatureOnPdf(
    source.bytes,
    validatedInput.signatureBase64,
    validatedInput.anchorText,
    {
      signatureWidth: validatedInput.signatureWidth,
      maxSignatureHeight: validatedInput.maxSignatureHeight,
      offsetX: validatedInput.offsetX,
      offsetY: validatedInput.offsetY,
    },
  );

  return {
    fileId: source.fileId,
    fileName: source.fileName,
    base64: stamped.pdfBuffer.toString("base64"),
    anchor: stamped.anchor,
    signature: stamped.signature,
  };
}
