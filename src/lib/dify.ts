import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { isIP } from "node:net";

const DIFY_TIMEOUT_MS = 12_000;
const ENCRYPTION_ALGORITHM = "aes-256-gcm";

export type DifyAppType = "chat" | "completion";

export type DifyConnectionInput = {
  baseUrl: string;
  apiKey: string;
  appType: DifyAppType;
  timeoutMs?: number;
};

export type DifyRunResult = {
  success: boolean;
  answer?: string;
  conversationId?: string | null;
  messageId?: string | null;
  status: number;
  error?: string;
};

function readEncryptionKey() {
  const raw = (process.env.DIFY_ENCRYPTION_KEY || process.env.SOLAR_DREAM_SECRET_KEY || "").trim();
  if (!raw) throw new Error("DIFY_ENCRYPTION_KEY is not configured on the server.");

  const key = /^[0-9a-f]{64}$/i.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("DIFY_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  return key;
}

export function encryptDifySecret(value: string) {
  const key = readEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptDifySecret(value: string) {
  const [ivValue, tagValue, encryptedValue] = value.split(".");
  if (!ivValue || !tagValue || !encryptedValue) throw new Error("Stored Dify secret is invalid.");
  const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, readEncryptionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, "base64url")), decipher.final()]).toString("utf8");
}

export function maskDifySecret(value: string) {
  const clean = value.trim();
  if (!clean) return null;
  return clean.length <= 8 ? "••••••••" : `${clean.slice(0, 4)}...${clean.slice(-4)}`;
}

function isPrivateHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  if (normalized === "localhost" || normalized.endsWith(".localhost") || normalized.endsWith(".local")) return true;
  const version = isIP(normalized);
  if (version === 6) {
    return normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb");
  }
  if (version !== 4) return false;
  const octets = normalized.split(".").map(Number);
  const [first, second] = octets;
  return first === 10 || first === 127 || first === 0 || (first === 169 && second === 254) || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
}

function isAllowedHost(hostname: string) {
  const configuredHosts = (process.env.DIFY_ALLOWED_HOSTS || "")
    .split(",")
    .map((host) => host.trim().toLowerCase().replace(/^\.|\.$/g, ""))
    .filter(Boolean);
  return configuredHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`));
}

export function validateDifyBaseUrl(value: string) {
  try {
    const url = new URL(value.trim());
    const allowPrivate = process.env.DIFY_ALLOW_PRIVATE_NETWORK === "true";
    const allowHttp = process.env.DIFY_ALLOW_INSECURE_HTTP === "true";
    if (!url.hostname || url.username || url.password || !["https:", "http:"].includes(url.protocol)) {
      return { ok: false as const, error: "Use an HTTP(S) Dify URL without credentials in the URL." };
    }
    if (url.protocol === "http:" && !allowHttp) {
      return { ok: false as const, error: "HTTP Dify endpoints are disabled. Use HTTPS or explicitly enable DIFY_ALLOW_INSECURE_HTTP." };
    }
    if (isPrivateHostname(url.hostname) && !allowPrivate) {
      return { ok: false as const, error: "Private or localhost Dify endpoints are blocked until DIFY_ALLOW_PRIVATE_NETWORK=true is set." };
    }
    if (!isPrivateHostname(url.hostname) && !isAllowedHost(url.hostname)) {
      return { ok: false as const, error: "Dify host is not in the server-side DIFY_ALLOWED_HOSTS allowlist." };
    }
    url.pathname = url.pathname.replace(/\/+$/, "");
    url.search = "";
    url.hash = "";
    return { ok: true as const, url: url.toString().replace(/\/$/, "") };
  } catch {
    return { ok: false as const, error: "Enter a valid Dify base URL." };
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function requestDify(input: DifyConnectionInput, path: string, init: RequestInit = {}) {
  const validated = validateDifyBaseUrl(input.baseUrl);
  if (!validated.ok) return { ok: false as const, status: 400, error: validated.error, body: {} as Record<string, unknown> };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(Math.max(input.timeoutMs ?? DIFY_TIMEOUT_MS, 1_000), 60_000));
  try {
    const response = await fetch(`${validated.url}${path}`, {
      ...init,
      headers: { Accept: "application/json", Authorization: `Bearer ${input.apiKey}`, ...(init.headers || {}) },
      signal: controller.signal,
    });
    const body = asRecord(await response.json().catch(() => ({})));
    if (!response.ok) return { ok: false as const, status: response.status, error: typeof body.message === "string" ? body.message : "Dify request failed.", body };
    return { ok: true as const, status: response.status, body };
  } catch (error: unknown) {
    return { ok: false as const, status: 503, error: error instanceof Error && error.name === "AbortError" ? "Dify request timed out." : "Dify could not be reached.", body: {} as Record<string, unknown> };
  } finally {
    clearTimeout(timeout);
  }
}

export async function testDifyConnection(input: DifyConnectionInput) {
  if (!input.apiKey.trim()) return { success: false as const, status: 400, error: "Dify API key is required." };
  const result = await requestDify(input, "/v1/parameters");
  return result.ok ? { success: true as const, status: result.status } : { success: false as const, status: result.status, error: result.error };
}

export async function runDifyMessage(
  input: DifyConnectionInput,
  query: string,
  user: string,
  conversationId?: string | null,
  inputs: Readonly<Record<string, string | number | boolean | null>> = {},
): Promise<DifyRunResult> {
  const path = input.appType === "completion" ? "/v1/completion-messages" : "/v1/chat-messages";
  const body = input.appType === "completion"
    ? { inputs, response_mode: "blocking", query, user }
    : { inputs, response_mode: "blocking", query, user, ...(conversationId ? { conversation_id: conversationId } : {}) };
  const result = await requestDify(input, path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!result.ok) return { success: false, status: result.status, error: result.error };
  const answer = typeof result.body.answer === "string" ? result.body.answer.trim() : "";
  if (!answer) return { success: false, status: 502, error: "Dify returned no validated answer." };
  return {
    success: true,
    status: result.status,
    answer,
    conversationId: typeof result.body.conversation_id === "string" ? result.body.conversation_id : null,
    messageId: typeof result.body.message_id === "string" ? result.body.message_id : null,
  };
}

