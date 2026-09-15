"use server";

import { headers } from "next/headers";

import { validateUploadFile } from "@/lib/fileValidation";
import { getPortalClientAddress, enforcePortalRateLimit } from "@/lib/portalRateLimit";
import { verifySignedPdf } from "@/lib/document-signing/verifyPdf";
import { verifyPdfWithDocumentService } from "@/lib/document-service/client";
import type { DocumentVerificationResult } from "@/types/documentSigning";

const MAX_VERIFICATION_PDF_BYTES = 10 * 1024 * 1024;
const VERIFY_DOCUMENT_FORM_FIELD = "document";

/**
 * Validates an uploaded PDF entirely in memory and returns its signature state.
 * The submitted file is never persisted or forwarded to Google Drive.
 */
export async function verifyDocument(formData: FormData): Promise<DocumentVerificationResult> {
  const requestHeaders = await headers();
  const rateLimit = await enforcePortalRateLimit({
    namespace: "document-verification",
    identity: getPortalClientAddress(requestHeaders),
    limit: 12,
    windowSeconds: 60,
  });
  if (!rateLimit.allowed) {
    throw new Error("Too many verification attempts. Please try again in a minute.");
  }

  const uploadedDocument = formData.get(VERIFY_DOCUMENT_FORM_FIELD);
  if (!(uploadedDocument instanceof File)) {
    throw new Error("Choose a PDF document to verify.");
  }

  await validateUploadFile({
    file: uploadedDocument,
    allowedKinds: ["pdf"],
    fallbackName: "signed-document",
    maxBytes: MAX_VERIFICATION_PDF_BYTES,
  });
  const bytes = new Uint8Array(await uploadedDocument.arrayBuffer());
  if (process.env.DOCUMENT_SERVICE_SIGNATURE_ENABLED?.trim().toLowerCase() === "true") {
    return verifyPdfWithDocumentService(bytes);
  }
  return verifySignedPdf(bytes);
}
