import "server-only";

import { createHash, createHmac } from "node:crypto";
import { z } from "zod";

export const privacyPolicyVersion = () => process.env.PRIVACY_POLICY_VERSION?.trim() || "v1";

export const privacyPreferencesSchema = z.object({
  necessary: z.literal(true),
  functional: z.boolean().default(false),
  analytics: z.boolean().default(false),
  marketing: z.boolean().default(false),
}).strict();

export const privacyConsentSchema = z.object({
  consentType: z.enum(["COOKIE", "PRIVACY_POLICY", "MARKETING"]),
  granted: z.boolean(),
  policyVersion: z.string().trim().min(1).max(64).optional(),
  preferences: privacyPreferencesSchema,
  source: z.enum(["banner", "settings", "registration", "account_deletion"]).default("banner"),
  sessionId: z.string().min(16).max(256).optional(),
  eventId: z.string().uuid().optional(),
}).strict();

export type PrivacyConsentInput = z.infer<typeof privacyConsentSchema>;

function hashSecret() {
  const secret = process.env.PRIVACY_IP_HASH_SECRET?.trim()
    || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    || process.env.CRON_SECRET?.trim()
    || process.env.NEXTAUTH_SECRET?.trim()
    || process.env.JWT_SECRET?.trim()
    || "solardream-privacy-ip-hash-secret-default-32bytes-fallback";
  return secret;
}

export function privacyHmac(value: string, context: "ip" | "session") {
  return createHmac("sha256", hashSecret()).update(`${context}:${value}`).digest("hex");
}

export function userAgentHash(value: string | null) {
  return value ? createHash("sha256").update(value).digest("hex") : null;
}

export function requestClientAddress(headers: Headers) {
  return (headers.get("x-forwarded-for")?.split(",")[0] || headers.get("x-real-ip") || "unknown").trim();
}

export function isSameOrigin(request: Request) {
  if (process.env.NODE_ENV !== "production") return true;
  const requestUrl = new URL(request.url);
  const source = request.headers.get("origin") || request.headers.get("referer");
  if (!source) return false;
  const allowed = new Set([requestUrl.origin]);
  for (const configured of [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NEXT_PUBLIC_ADMIN_URL,
  ]) {
    if (!configured) continue;
    try { allowed.add(new URL(configured).origin); } catch { /* Fail closed for invalid configuration. */ }
  }
  try { return allowed.has(new URL(source).origin); } catch { return false; }
}

export function needsPrivacyReconsent(accepted: string | null | undefined) {
  return accepted !== privacyPolicyVersion();
}

export function hasRecentAuthentication(lastSignInAt: string | null | undefined, maxAgeMinutes = 30) {
  if (!lastSignInAt) return false;
  const signedInAt = Date.parse(lastSignInAt);
  return Number.isFinite(signedInAt) && Date.now() - signedInAt <= maxAgeMinutes * 60_000;
}
