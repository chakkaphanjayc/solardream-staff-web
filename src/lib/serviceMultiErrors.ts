import { Buffer } from "node:buffer";
import { z } from "zod";

export class ServiceConfigurationError extends Error {
  readonly code = "SERVICE_CONFIGURATION_ERROR";
  constructor(message: string) { super(message); this.name = "ServiceConfigurationError"; }
}

export function serviceQuoteSecretReadiness(value: string | undefined) {
  const byteLength = Buffer.byteLength(value?.trim() || "");
  return { ready: byteLength >= 32, code: byteLength >= 32 ? "READY" as const : "SERVICE_QUOTE_SECRET_INVALID" as const };
}

export function serviceCommerceReadiness(environment: NodeJS.ProcessEnv = process.env) {
  const quoteSecret = serviceQuoteSecretReadiness(environment.SERVICE_QUOTE_SECRET);
  return { ready: quoteSecret.ready, checks: { quoteSecret: quoteSecret.code } } as const;
}

export function requireServiceQuoteSecret(value = process.env.SERVICE_QUOTE_SECRET) {
  if (!serviceQuoteSecretReadiness(value).ready) throw new ServiceConfigurationError("SERVICE_QUOTE_SECRET must be configured with at least 32 bytes.");
  return value!.trim();
}

type PublicError = { status: number; code: string; message: string };
const known: Record<string, PublicError> = {
  AUTH_REQUIRED: { status: 401, code: "AUTH_REQUIRED", message: "Sign in to use a registered SolarDream system." },
  ACCOUNT_UNAVAILABLE: { status: 403, code: "ACCOUNT_UNAVAILABLE", message: "An active account is required." },
  ASSET_UNAVAILABLE: { status: 403, code: "ASSET_UNAVAILABLE", message: "The selected SolarDream system is unavailable." },
  OFFERING_UNAVAILABLE: { status: 422, code: "OFFERING_UNAVAILABLE", message: "One or more selected services are unavailable." },
  SYSTEM_OPTION_UNAVAILABLE: { status: 422, code: "SYSTEM_OPTION_UNAVAILABLE", message: "A selected system option is unavailable." },
  PROMOTION_UNAVAILABLE: { status: 409, code: "PROMOTION_UNAVAILABLE", message: "This promotion is unavailable." },
  PROMOTION_LIMIT_REACHED: { status: 409, code: "PROMOTION_LIMIT_REACHED", message: "This promotion has reached its usage limit." },
  PROMOTION_CHANGED: { status: 409, code: "PROMOTION_CHANGED", message: "Promotion terms changed. Request a new quote." },
  QUOTE_INVALID: { status: 409, code: "QUOTE_INVALID", message: "This quote is invalid, expired, or already used." },
  QUOTE_CHANGED: { status: 409, code: "QUOTE_CHANGED", message: "System details changed. Request a new quote." },
  CUSTOM_QUOTE_REQUIRED: { status: 409, code: "CUSTOM_QUOTE_REQUIRED", message: "Request a custom quotation for this system." },
  APPOINTMENT_INVALID: { status: 422, code: "APPOINTMENT_INVALID", message: "Choose a future appointment date." },
  BOT_DETECTED: { status: 400, code: "INVALID_REQUEST", message: "Please check the submitted details." },
};

export function classifyMultiServiceError(error: unknown): PublicError {
  if (error instanceof z.ZodError || error instanceof SyntaxError) return { status: 400, code: "INVALID_REQUEST", message: "Please check the submitted service details." };
  if (error instanceof ServiceConfigurationError || (error instanceof Error && error.message.startsWith("SERVICE_QUOTE_SECRET"))) return { status: 503, code: "SERVICE_CONFIGURATION_ERROR", message: "Service quoting is temporarily unavailable due to configuration." };
  if (error instanceof Error) { const publicError = known[error.message]; if (publicError) return publicError; }
  return { status: 503, code: "SERVICE_UNAVAILABLE", message: "Service commerce is temporarily unavailable." };
}

function externalCode(error: unknown) { let current = error; for (let depth = 0; depth < 4; depth += 1) { if (!current || typeof current !== "object" || Array.isArray(current)) return undefined; const row = current as Record<string, unknown>; if (typeof row.code === "string") return row.code.slice(0, 40); current = row.cause; } return undefined; }
export function multiServiceErrorLog(error: unknown) {
  const classified = classifyMultiServiceError(error);
  const stackFrames = error instanceof Error ? error.stack?.split("\n").slice(1, 13).map((line) => line.trim()).join("\n").slice(0, 4000) : undefined;
  return { name: error instanceof Error ? error.name : "UnknownError", safeCode: classified.code, externalCode: externalCode(error), stackFrames };
}
