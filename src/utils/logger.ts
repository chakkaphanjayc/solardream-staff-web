import type { NextRequest } from "next/server";

import { db } from "@/db";
import { apiLogs } from "@/db/schema";

export type ApiLogDirection = "INBOUND" | "OUTBOUND";
export type ApiLogSourceSystem = "ERPNEXT" | "SOLARDREAM_INTERNAL";

type LogApiEventInput = {
  direction: ApiLogDirection;
  sourceSystem: ApiLogSourceSystem;
  endpoint: string;
  method: string;
  statusCode: number;
  requestHeaders?: Headers | Record<string, unknown> | null;
  requestBody?: unknown;
  responseBody?: unknown;
  errorMessage?: string | null;
};

const SENSITIVE_HEADER_KEYS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-line-signature",
  "x-signature",
  "x-api-key",
  "x-erpnext-webhook-secret",
  "x-solardream-webhook-secret",
  "api-key",
]);

const MAX_LOG_DEPTH = 8;
const MAX_LOG_ARRAY_ITEMS = 100;
const MAX_LOG_STRING_LENGTH = 8_000;
const MAX_ERROR_MESSAGE_LENGTH = 12_000;

function isSensitiveBodyKey(key: string) {
  const compactKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return (
    compactKey.includes("authorization") ||
    compactKey.includes("cookie") ||
    compactKey.includes("password") ||
    compactKey.includes("secret") ||
    compactKey.includes("signature") ||
    compactKey.includes("token") ||
    compactKey.includes("apikey") ||
    compactKey.includes("accesskey") ||
    compactKey.includes("privatekey")
  );
}

function truncateString(value: string) {
  if (value.length <= MAX_LOG_STRING_LENGTH) return value;
  return `${value.slice(0, MAX_LOG_STRING_LENGTH)}...[truncated ${value.length - MAX_LOG_STRING_LENGTH} chars]`;
}

function sanitizeErrorMessage(value?: string | null) {
  if (!value) return null;

  const redacted = value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/token\s+[A-Za-z0-9._~+/=-]+/gi, "token [redacted]")
    .replace(/api[_-]?key[=:]\s*['\"]?[^\\s,'\"]+/gi, "api_key=[redacted]")
    .replace(/secret[=:]\s*['\"]?[^\\s,'\"]+/gi, "secret=[redacted]");

  if (redacted.length <= MAX_ERROR_MESSAGE_LENGTH) return redacted;
  return `${redacted.slice(0, MAX_ERROR_MESSAGE_LENGTH)}...[truncated ${redacted.length - MAX_ERROR_MESSAGE_LENGTH} chars]`;
}

function sanitizeJsonValue(value: unknown, depth = 0): unknown {
  if (depth > MAX_LOG_DEPTH) return "[max-depth-exceeded]";
  if (value === undefined || value === null) return {};
  if (typeof value === "string") return truncateString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_LOG_ARRAY_ITEMS)
      .map((item) => sanitizeJsonValue(item, depth + 1));

    if (value.length > MAX_LOG_ARRAY_ITEMS) {
      items.push(`[truncated ${value.length - MAX_LOG_ARRAY_ITEMS} items]`);
    }

    return items;
  }

  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>(
      (safeObject, [key, item]) => {
        safeObject[key] = isSensitiveBodyKey(key)
          ? "[redacted]"
          : sanitizeJsonValue(item, depth + 1);
        return safeObject;
      },
      {},
    );
  }

  return String(value);
}

function normalizeJson(value: unknown): unknown {
  if (value === undefined || value === null) return {};

  try {
    return sanitizeJsonValue(JSON.parse(JSON.stringify(value)));
  } catch {
    return { unserializable: truncateString(String(value)) };
  }
}

export function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack ?? null,
      name: error.name,
    };
  }

  return {
    message: String(error),
    stack: null,
    name: "UnknownError",
  };
}

export function sanitizeHeaders(headers?: Headers | Record<string, unknown> | null) {
  if (!headers) return {};

  const entries = headers instanceof Headers
    ? Array.from(headers.entries())
    : Object.entries(headers);

  return entries.reduce<Record<string, unknown>>((safeHeaders, [key, value]) => {
    const normalizedKey = key.toLowerCase();
    safeHeaders[key] = SENSITIVE_HEADER_KEYS.has(normalizedKey) ? "[redacted]" : value;
    return safeHeaders;
  }, {});
}

export function getRequestEndpoint(request: NextRequest) {
  return request.nextUrl.pathname;
}

export function logApiEvent(input: LogApiEventInput) {
  const statusCode = Number.isFinite(input.statusCode) ? Math.trunc(input.statusCode) : 0;

  return db
    .insert(apiLogs)
    .values({
      direction: input.direction,
      sourceSystem: input.sourceSystem,
      endpoint: input.endpoint,
      method: input.method.toUpperCase(),
      statusCode,
      requestHeaders: sanitizeHeaders(input.requestHeaders),
      requestBody: normalizeJson(input.requestBody),
      responseBody: normalizeJson(input.responseBody),
      errorMessage: sanitizeErrorMessage(input.errorMessage),
    })
    .catch((error: unknown) => {
      console.error("[ApiLog] Failed to write API log:", error);
    });
}

export function queueApiLog(input: LogApiEventInput) {
  void logApiEvent(input);
}
