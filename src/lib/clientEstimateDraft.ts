export const CLIENT_ESTIMATE_DRAFT_KEY = "solardream:pending-estimate-draft";

const CLIENT_ESTIMATE_DRAFT_VERSION = 1 as const;
const ESTIMATE_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{16,160}$/;

export type EstimateDraftIntent = "SAVE" | "REPORT" | "PROPOSAL";

export type ClientEstimateDraftEnvelope<T = unknown> = {
  version: typeof CLIENT_ESTIMATE_DRAFT_VERSION;
  intent: EstimateDraftIntent;
  idempotencyKey: string;
  savedAt: number;
  expiresAt: number;
  estimate: T;
};

function getLocalStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function createFallbackIdempotencyKey() {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    return `draft-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  }
  return `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export function createEstimateDraftIdempotencyKey() {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  return randomUuid && IDEMPOTENCY_KEY_PATTERN.test(randomUuid)
    ? randomUuid
    : createFallbackIdempotencyKey();
}

export function createEstimateDraftEnvelope<T>(
  intent: EstimateDraftIntent,
  estimate: T,
): ClientEstimateDraftEnvelope<T> {
  const savedAt = Date.now();
  return {
    version: CLIENT_ESTIMATE_DRAFT_VERSION,
    intent,
    idempotencyKey: createEstimateDraftIdempotencyKey(),
    savedAt,
    expiresAt: savedAt + ESTIMATE_DRAFT_TTL_MS,
    estimate,
  };
}

export function cacheEstimateDraft<T>(
  intent: EstimateDraftIntent,
  estimate: T,
): ClientEstimateDraftEnvelope<T> {
  const envelope = createEstimateDraftEnvelope(intent, estimate);
  const storage = getLocalStorage();
  if (storage) {
    try {
      storage.setItem(CLIENT_ESTIMATE_DRAFT_KEY, JSON.stringify(envelope));
    } catch {
      // The server bridge remains usable when browser storage is unavailable.
    }
  }
  return envelope;
}

export function readEstimateDraft(): ClientEstimateDraftEnvelope | null {
  const storage = getLocalStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(CLIENT_ESTIMATE_DRAFT_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<ClientEstimateDraftEnvelope>;
    const valid = value.version === CLIENT_ESTIMATE_DRAFT_VERSION
      && (value.intent === "SAVE" || value.intent === "REPORT" || value.intent === "PROPOSAL")
      && typeof value.idempotencyKey === "string"
      && IDEMPOTENCY_KEY_PATTERN.test(value.idempotencyKey)
      && typeof value.savedAt === "number"
      && Number.isFinite(value.savedAt)
      && typeof value.expiresAt === "number"
      && Number.isFinite(value.expiresAt)
      && value.expiresAt === value.savedAt + ESTIMATE_DRAFT_TTL_MS
      && value.expiresAt > Date.now()
      && value.estimate !== undefined;
    if (!valid) {
      storage.removeItem(CLIENT_ESTIMATE_DRAFT_KEY);
      return null;
    }
    return value as ClientEstimateDraftEnvelope;
  } catch {
    try {
      storage.removeItem(CLIENT_ESTIMATE_DRAFT_KEY);
    } catch {
      // Ignore storage cleanup failures.
    }
    return null;
  }
}

export function removeEstimateDraft() {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    storage.removeItem(CLIENT_ESTIMATE_DRAFT_KEY);
  } catch {
    // Ignore storage cleanup failures.
  }
}

export async function bridgeEstimateDraft(
  envelope: ClientEstimateDraftEnvelope,
) {
  const response = await fetch("/api/wizard/estimate-draft", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": envelope.idempotencyKey,
    },
    body: JSON.stringify({
      version: CLIENT_ESTIMATE_DRAFT_VERSION,
      intent: envelope.intent,
      estimate: envelope.estimate,
    }),
  });
  if (!response.ok) {
    throw new Error(`Unable to save estimate draft (${response.status}).`);
  }
}
