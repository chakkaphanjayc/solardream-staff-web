export type DrivePdfPayload = {
  fileId: string;
  fileName: string;
  base64: string;
  byteLength: number;
};

export type SignaturePlacement = {
  signatureBase64: string;
  pageNumber: number;
  /** Normalized left edge of the signature box (0–1 from the PDF page's left). */
  x: number;
  /** Normalized top edge of the signature box (0–1 from the PDF page's top). */
  y: number;
  /** Normalized signature-box width relative to the PDF page. */
  width: number;
  /** Normalized signature-box height relative to the PDF page. */
  height: number;
};

export type ProcessAndSignPdfInput = SignaturePlacement & {
  fileId: string;
};

export type ProcessAndSignPdfResult = {
  fileId: string;
  fileName: string;
};

export type DocumentVerificationResult = {
  /** True only when every signature is intact, trusted, and unexpired. */
  verified: boolean;
  /** True when every signing certificate chains to a trusted system CA. */
  authenticity: boolean;
  /** True when the PDF bytes covered by every signature are unchanged. */
  integrity: boolean;
  /** True when at least one signing certificate has expired or is not yet valid. */
  expired: boolean;
  signatureCount: number;
  message: string | null;
};
