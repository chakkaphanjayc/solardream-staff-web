export type TrackingReferenceType = "QT" | "SV";

const TRACKING_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
// Existing requests may use legacy numeric IDs (for example SD-QT-123456).
// Keep the client-side gate compatible with the API and persisted references.
const TRACKING_REFERENCE_PATTERN = /^SD-(QT|SV)-[A-Z0-9]{4,6}$/;
const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isEmailLike(value: string) {
  return EMAIL_PATTERN.test(value.trim());
}

export function isTrackingReference(value: string) {
  return TRACKING_REFERENCE_PATTERN.test(value.trim().toUpperCase());
}

export function isUuidLike(value: string) {
  return UUID_PATTERN.test(value.trim());
}

export function normalizeTrackingReference(value: string) {
  const raw = value.trim();
  if (isEmailLike(raw)) return raw.toLowerCase();
  if (isUuidLike(raw)) return raw.toLowerCase();
  const compact = raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");

  if (compact.startsWith("SDQT")) {
    return `SD-QT-${compact.slice(4, 10)}`;
  }
  if (compact.startsWith("SDSV")) {
    return `SD-SV-${compact.slice(4, 10)}`;
  }
  if (/^(QT|SV)[A-Z0-9]{1,6}$/.test(compact)) {
    return `SD-${compact.slice(0, 2)}-${compact.slice(2, 8)}`;
  }
  return raw.toUpperCase();
}

export function formatTrackingInput(value: string) {
  if (value.includes("@") || /[a-z0-9._%+-]+@/i.test(value)) return value.trimStart();
  return normalizeTrackingReference(value);
}

function fallbackRandom(max: number) {
  return Math.floor(Math.random() * max);
}

function randomIndex(max: number) {
  const cryptoObject = globalThis.crypto;
  if (!cryptoObject?.getRandomValues) return fallbackRandom(max);
  const bytes = new Uint8Array(1);
  const limit = Math.floor(256 / max) * max;
  do {
    cryptoObject.getRandomValues(bytes);
  } while (bytes[0] >= limit);
  return bytes[0] % max;
}

export function generateTrackingReference(type: TrackingReferenceType, length = 6) {
  const safeLength = Math.min(Math.max(length, 4), 6);
  let suffix = "";
  for (let index = 0; index < safeLength; index += 1) {
    suffix += TRACKING_ALPHABET[randomIndex(TRACKING_ALPHABET.length)];
  }
  return `SD-${type}-${suffix}`;
}

export function deriveQuotationTrackingReference(id: string) {
  const compact = id.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const suffix = compact
    .replace(/0/g, "2")
    .replace(/1/g, "3")
    .replace(/[ILO]/g, "4")
    .slice(0, 6)
    .padEnd(6, "X");
  return `SD-QT-${suffix}`;
}

export function deriveServiceTrackingReference(id: string) {
  const compact = id.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const suffix = compact
    .replace(/0/g, "2")
    .replace(/1/g, "3")
    .replace(/[ILO]/g, "4")
    .slice(0, 6)
    .padEnd(6, "S");
  return `SD-SV-${suffix}`;
}
