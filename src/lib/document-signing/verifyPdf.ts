import "server-only";

import { verifyPDF } from "@qlever-llc/verify-pdf";

import type { DocumentVerificationResult } from "@/types/documentSigning";

const MAX_RESULT_MESSAGE_LENGTH = 240;

function safeMessage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[\u0000-\u001F\u007F]/g, " ").trim();
  return normalized ? normalized.slice(0, MAX_RESULT_MESSAGE_LENGTH) : null;
}

/**
 * Verifies the cryptographic PDF signatures embedded in an in-memory document.
 * A self-signed certificate can have intact bytes while remaining untrusted.
 */
export function verifySignedPdf(pdfBytes: Uint8Array): DocumentVerificationResult {
  try {
    const result = verifyPDF(pdfBytes);
    return {
      verified: result.verified === true,
      authenticity: result.authenticity === true,
      integrity: result.integrity === true,
      expired: result.expired === true,
      signatureCount: result.signatures?.length || 0,
      message: safeMessage(result.message),
    };
  } catch {
    return {
      verified: false,
      authenticity: false,
      integrity: false,
      expired: false,
      signatureCount: 0,
      message: "The uploaded file does not contain a readable cryptographic PDF signature.",
    };
  }
}
