import { timingSafeEqual } from "node:crypto";

export type SignatureEvidence = { signerIdentity: Readonly<Record<string, unknown>>; verifiedContact: Readonly<Record<string, unknown>>; consentVersion: string; signedAt: string; signatureStorageReference: string; documentHash: string; auditReference: string };
const HASH = /^[a-f0-9]{64}$/;
export function validateSignatureEvidence(evidence: SignatureEvidence, expectedDocumentHash: string, now = new Date()): SignatureEvidence {
  if (!Object.keys(evidence.signerIdentity).length || !Object.keys(evidence.verifiedContact).length) throw new Error("Attributable signer identity and verified contact are required.");
  if (!evidence.consentVersion.trim() || !evidence.signatureStorageReference.trim() || !evidence.auditReference.trim()) throw new Error("Consent, storage, and audit references are required.");
  if (!HASH.test(evidence.documentHash) || !HASH.test(expectedDocumentHash)) throw new Error("A lowercase SHA-256 document hash is required.");
  if (!timingSafeEqual(Buffer.from(evidence.documentHash), Buffer.from(expectedDocumentHash))) throw new Error("Signature evidence does not match the signed document.");
  const signedAt = new Date(evidence.signedAt);
  if (!Number.isFinite(signedAt.valueOf()) || signedAt > now) throw new Error("A valid signature timestamp is required.");
  return evidence;
}
