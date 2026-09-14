import { z } from "zod";
import { locales } from "@/i18n/locales";
import { isTrackingReference, normalizeTrackingReference } from "@/lib/trackingReference";

export const portalAccessSchema = z.string().regex(/^sv1\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/);
export const portalExchangeSchema = z.object({
  tokenId: z.string().uuid(),
  access: portalAccessSchema,
  turnstileToken: z.string().trim().min(1).max(4096).optional(),
}).strict();
export const portalRecoverySchema = z.object({
  orderReference: z.string().trim().min(6).max(64).transform((value) =>
    isTrackingReference(value) ? normalizeTrackingReference(value) : value,
  ),
  email: z.string().trim().email().max(254),
}).strict();
export const smartTrackRequestSchema = z.object({
  query: z.string().trim().min(3).max(254),
  email: z.string().trim().email().max(254).optional(),
  locale: z.enum(locales).default("th"),
  turnstileToken: z.string().trim().min(1).max(4096).optional(),
}).strict();
export const portalClaimIntentSchema = z.object({ necessaryConsent: z.literal(true) }).strict();
export const portalShareLinkSchema = z.string().url().superRefine((value, context) => {
  const url = new URL(value);
  const tokenId = url.pathname.split("/").filter(Boolean).at(-1) || "";
  const access = url.hash.startsWith("#access=") ? url.hash.slice(8) : "";
  if (!z.string().uuid().safeParse(tokenId).success || !portalAccessSchema.safeParse(access).success) context.addIssue({ code: "custom", message: "Invalid service portal share link." });
  if (url.search) context.addIssue({ code: "custom", message: "Service portal capabilities must remain in the URL fragment." });
});
export const portalShareLinkResponseSchema = z.object({ success: z.literal(true), link: portalShareLinkSchema, expiresAt: z.string().datetime() }).strict();

export function maskPortalEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  return `${local.slice(0, 2)}***@${domain}`;
}

export function isPortalDeliveryBindingCurrent(input: {
  tokenStatus: string;
  tokenExpiresAt: Date;
  portalClosedAt: Date | null;
  customerUserId: string | null;
  tokenEmailDigest: string;
  orderEmailDigest: string | null;
  recipientEmailDigest: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  return input.tokenStatus === "ACTIVE"
    && input.portalClosedAt === null
    && input.customerUserId === null
    && input.tokenExpiresAt > now
    && Boolean(input.orderEmailDigest)
    && input.recipientEmailDigest === input.tokenEmailDigest
    && input.recipientEmailDigest === input.orderEmailDigest;
}

export function shouldSuppressPortalRecovery(lastRecoveryCreatedAt: Date | null, now = new Date(), cooldownMs = 10 * 60_000) {
  return Boolean(lastRecoveryCreatedAt && lastRecoveryCreatedAt.getTime() > now.getTime() - cooldownMs);
}
