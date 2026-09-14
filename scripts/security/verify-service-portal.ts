import {
  maskPortalEmail,
  isPortalDeliveryBindingCurrent,
  portalAccessSchema,
  portalClaimIntentSchema,
  portalExchangeSchema,
  portalRecoverySchema,
  portalShareLinkResponseSchema,
  shouldSuppressPortalRecovery,
} from "../../src/lib/servicePortalContracts";
import { serviceBookingSchema } from "../../src/lib/serviceCommerceContracts";

const tokenId = "9ab1540a-ab57-4aac-a7dd-c9b5ad5ee810";
const access = `sv1.${"a".repeat(43)}.${"b".repeat(43)}`;
portalExchangeSchema.parse({ tokenId, access });
portalShareLinkResponseSchema.parse({ success: true, link: `https://example.com/th/track/${tokenId}#access=${access}`, expiresAt: "2026-08-17T12:00:00.000Z" });

for (const invalid of [
  "sv1.short.signature",
  `sv2.${"a".repeat(43)}.${"b".repeat(43)}`,
  `sv1.${"a".repeat(43)}.${"b".repeat(42)}!`,
]) {
  if (portalAccessSchema.safeParse(invalid).success) throw new Error("Malformed portal capability was accepted.");
}
if (portalExchangeSchema.safeParse({ tokenId, access, secret: "leak" }).success) throw new Error("Portal exchange accepted an unknown field.");
if (portalShareLinkResponseSchema.safeParse({ success: true, link: `https://example.com/th/track/${tokenId}?access=${access}`, expiresAt: "2026-08-17T12:00:00.000Z" }).success) throw new Error("Share link accepted a capability outside the URL fragment.");
if (portalShareLinkResponseSchema.safeParse({ success: true, link: `https://example.com/th/track/${tokenId}#access=${access}`, expiresAt: "2026-08-17T12:00:00.000Z", persistedSecret: access }).success) throw new Error("Share response accepted an extra bearer field.");
if (portalRecoverySchema.safeParse({ orderReference: tokenId, email: "guest@example.com", reveal: true }).success) throw new Error("Recovery accepted an unknown field.");
if (portalClaimIntentSchema.safeParse({ necessaryConsent: false }).success) throw new Error("Claim intent accepted missing necessary consent.");
if (maskPortalEmail("guest@example.com") !== "gu***@example.com") throw new Error("Email masking contract failed.");

const now = new Date("2026-07-18T12:00:00.000Z");
const currentBinding = { tokenStatus: "ACTIVE", tokenExpiresAt: new Date("2026-07-19T12:00:00.000Z"), portalClosedAt: null, customerUserId: null, tokenEmailDigest: "email-digest", orderEmailDigest: "email-digest", recipientEmailDigest: "email-digest", now };
if (!isPortalDeliveryBindingCurrent(currentBinding)) throw new Error("Current delivery binding was rejected.");
for (const stale of [
  { ...currentBinding, tokenStatus: "REVOKED" },
  { ...currentBinding, tokenExpiresAt: now },
  { ...currentBinding, portalClosedAt: now },
  { ...currentBinding, customerUserId: "claimed-user" },
  { ...currentBinding, recipientEmailDigest: "wrong-recipient" },
]) if (isPortalDeliveryBindingCurrent(stale)) throw new Error("Stale or mismatched delivery binding was accepted.");
if (!shouldSuppressPortalRecovery(new Date(now.getTime() - 9 * 60_000), now)) throw new Error("Recovery cooldown did not suppress link churn.");
if (shouldSuppressPortalRecovery(new Date(now.getTime() - 11 * 60_000), now)) throw new Error("Recovery cooldown did not release after its window.");

const booking = {
  offeringSlug: "inspection",
  systemSource: "EXTERNAL" as const,
  systemDetails: { systemSizeKw: 5, inverterBrand: "Example", roofType: "Tile" },
  locale: "th" as const,
  appointmentDate: new Date(Date.now() + 86_400_000),
  contact: { fullName: "Guest Customer", phone: "0812345678", email: "guest@example.com", serviceAddress: "123 Example Road, Bangkok" },
  necessaryConsent: true as const,
  website: "",
};
serviceBookingSchema.parse(booking);
if (serviceBookingSchema.safeParse({ ...booking, necessaryConsent: false }).success) throw new Error("Booking accepted missing necessary processing consent.");
if (serviceBookingSchema.safeParse({ ...booking, contact: { ...booking.contact, serviceAddress: "short" } }).success) throw new Error("Booking accepted an incomplete service address.");

process.stdout.write("Service guest portal fail-closed contracts passed.\n");
