import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { Locale } from "@/i18n/locales";
import type { AuthClaimPrefill } from "@/types/auth";

import { db } from "@/db";
import {
  proposals,
  serviceOrderItems,
  serviceOrders,
  servicePortalAuditEvents,
  servicePortalClaimIntents,
  servicePortalEmailDeliveries,
  servicePortalTokens,
  serviceRequests,
  users,
} from "@/db/schema";
import { sendConfiguredTemplateEmail } from "@/lib/email";
import { enqueueIntegrationEvent } from "@/lib/integrationOutbox";
import { hashServiceActor } from "@/lib/serviceGuestSession";
import { signHs256Jwt, verifyHs256Jwt } from "@/lib/signedJwt";
import { deriveServiceTrackingReference } from "@/lib/trackingReference";
import {
  isPortalDeliveryBindingCurrent,
  portalShareLinkSchema,
  shouldSuppressPortalRecovery,
} from "@/lib/servicePortalContracts";

export const SERVICE_PORTAL_EMAIL_TOPIC = "service.portal.email";
export const SERVICE_PORTAL_SESSION_COOKIE = "sd_service_portal";
export const SERVICE_PORTAL_CLAIM_COOKIE = "sd_service_claim";

function portalSecret() {
  const value = process.env.SERVICE_PORTAL_TOKEN_SECRET?.trim() || "";
  if (Buffer.byteLength(value) < 32)
    throw new Error("SERVICE_PORTAL_TOKEN_SECRET must be at least 32 bytes.");
  return value;
}
function hmac(context: string, value: string) {
  return createHmac("sha256", portalSecret())
    .update(`${context}:${value}`)
    .digest("base64url");
}
function equal(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
function recordSnapshot(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function serviceContactEmailDigest(email: string) {
  return hmac("email", email.trim().toLowerCase());
}
function capabilityDigest(secret: string) {
  return hmac("capability", secret);
}
function capabilityMac(tokenId: string, secret: string) {
  return hmac("access", `${tokenId}:${secret}`);
}
function encryptionKey() {
  return createHash("sha256").update(`delivery:${portalSecret()}`).digest();
}
function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
}
function decrypt(value: string) {
  const [iv, tag, body] = value.split(".");
  if (!iv || !tag || !body)
    throw new Error("Invalid portal delivery envelope.");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(body, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
function publicOrigin() {
  const value =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!value)
    throw new Error("Public site URL is required for service portal email.");
  return new URL(value).origin;
}
type Executor = Pick<typeof db, "insert" | "update">;
const STATE_BASED_PORTAL_EXPIRES_AT = new Date("2126-01-01T00:00:00.000Z");

export function isClosedServiceOrderStatus(status: string | null | undefined) {
  const normalized = (status || "").trim().toUpperCase();
  return ["COMPLETED", "COMPLETE", "CANCELLED", "CANCELED", "CLOSED"].includes(normalized);
}

function isServiceOrderPortalOpen(order: {
  status?: string | null;
  portalClosedAt?: Date | null;
}) {
  return !order.portalClosedAt && !isClosedServiceOrderStatus(order.status);
}

async function insertGuestPortalToken(
  executor: Executor,
  input: {
    orderId: string;
    email: string;
    locale: Locale;
    rotatedFromId?: string | null;
  },
) {
  const tokenId = crypto.randomUUID();
  const secret = randomBytes(32).toString("base64url");
  const access = `sv1.${secret}.${capabilityMac(tokenId, secret)}`;
  const [token] = await executor
    .insert(servicePortalTokens)
    .values({
      id: tokenId,
      serviceOrderId: input.orderId,
      secretDigest: capabilityDigest(secret),
      emailDigest: serviceContactEmailDigest(input.email),
      expiresAt: STATE_BASED_PORTAL_EXPIRES_AT,
      rotatedFromId: input.rotatedFromId || null,
    })
    .returning();
  const linkUrl = new URL(`/${input.locale}/track/${tokenId}`, publicOrigin());
  linkUrl.hash = `access=${access}`;
  const link = linkUrl.toString();
  return { token, link };
}

export async function issueGuestServicePortalAccess(
  executor: Executor,
  input: {
    orderId: string;
    email: string;
    locale: Locale;
    purpose?: "INITIAL" | "RECOVERY";
    rotatedFromId?: string | null;
  },
) {
  const { token, link } = await insertGuestPortalToken(executor, input);
  const [delivery] = await executor
    .insert(servicePortalEmailDeliveries)
    .values({
      tokenId: token.id,
      encryptedCapability: encrypt(link),
      locale: input.locale,
      purpose: input.purpose || "INITIAL",
    })
    .returning();
  await enqueueIntegrationEvent(executor, {
    topic: SERVICE_PORTAL_EMAIL_TOPIC,
    aggregateType: "SERVICE_ORDER",
    aggregateId: input.orderId,
    payload: { deliveryId: delivery.id },
    dedupeKey: `${SERVICE_PORTAL_EMAIL_TOPIC}:${delivery.id}`,
  });
  await executor
    .insert(servicePortalAuditEvents)
    .values({
      serviceOrderId: input.orderId,
      tokenId: token.id,
      eventType: "TOKEN_ISSUED",
      metadata: {
        expiresAt: token.expiresAt.toISOString(),
        purpose: input.purpose || "INITIAL",
      },
      dedupeKey: `TOKEN_ISSUED:${token.id}`,
    });
  return { tokenId: token.id, link };
}

export async function rotateAndCopyServicePortalLink(currentTokenId: string) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`service-share-link:${currentTokenId}`}))`,
    );
    const [current] = await tx
      .select()
      .from(servicePortalTokens)
      .where(eq(servicePortalTokens.id, currentTokenId))
      .for("update");
    if (!current || current.status !== "ACTIVE")
      return null;
    const [order] = await tx
      .select()
      .from(serviceOrders)
      .where(eq(serviceOrders.id, current.serviceOrderId))
      .for("update");
    if (
      !order ||
      order.customerUserId !== null ||
      !isServiceOrderPortalOpen(order) ||
      !order.contactEmailDigest ||
      !equal(order.contactEmailDigest, current.emailDigest)
    )
      return null;
    const contact =
      order.contactSnapshot &&
      typeof order.contactSnapshot === "object" &&
      !Array.isArray(order.contactSnapshot)
        ? (order.contactSnapshot as Record<string, unknown>)
        : {};
    const email =
      typeof contact.email === "string"
        ? contact.email.trim().toLowerCase()
        : "";
    if (!email || !equal(serviceContactEmailDigest(email), current.emailDigest))
      return null;
    const now = new Date();
    const [revoked] = await tx
      .update(servicePortalTokens)
      .set({ status: "REVOKED", revokedAt: now })
      .where(
        and(
          eq(servicePortalTokens.id, current.id),
          eq(servicePortalTokens.status, "ACTIVE"),
        ),
      )
      .returning({ id: servicePortalTokens.id });
    if (!revoked) return null;
    const { token, link } = await insertGuestPortalToken(tx, {
      orderId: order.id,
      email,
      locale: order.portalLocale === "en" ? "en" : "th",
      rotatedFromId: current.id,
    });
    portalShareLinkSchema.parse(link);
    await tx
      .insert(servicePortalAuditEvents)
      .values({
        serviceOrderId: order.id,
        tokenId: token.id,
        eventType: "TOKEN_ROTATED_COPY",
        metadata: { rotatedAt: now.toISOString() },
        dedupeKey: `TOKEN_ROTATED_COPY:${token.id}`,
      });
    return { tokenId: token.id, tokenExpiresAt: token.expiresAt, link };
  });
}

export async function verifyPortalCapability(tokenId: string, access: string) {
  const parts = access.split(".");
  if (parts.length !== 3 || parts[0] !== "sv1") return null;
  const [, secret, mac] = parts;
  if (!equal(mac, capabilityMac(tokenId, secret))) return null;
  return db.transaction(async (tx) => {
    const [token] = await tx
      .select()
      .from(servicePortalTokens)
      .where(
        and(
          eq(servicePortalTokens.id, tokenId),
          eq(servicePortalTokens.status, "ACTIVE"),
        ),
      )
      .for("update");
    if (
      !token ||
      !equal(token.secretDigest, capabilityDigest(secret))
    )
      return null;
    const order = await tx.query.serviceOrders.findFirst({
      where: eq(serviceOrders.id, token.serviceOrderId),
      columns: { contactEmailDigest: true, portalClosedAt: true, status: true },
    });
    if (
      !order ||
      !isServiceOrderPortalOpen(order) ||
      !order.contactEmailDigest ||
      !equal(token.emailDigest, order.contactEmailDigest)
    )
      return null;
    const now = new Date();
    await tx
      .update(servicePortalTokens)
      .set({ lastUsedAt: now })
      .where(eq(servicePortalTokens.id, token.id));
    await tx
      .insert(servicePortalAuditEvents)
      .values({
        serviceOrderId: token.serviceOrderId,
        tokenId: token.id,
        eventType: "CAPABILITY_EXCHANGED",
        dedupeKey: `CAPABILITY_EXCHANGED:${token.id}`,
      })
      .onConflictDoNothing({ target: servicePortalAuditEvents.dedupeKey });
    return { ...token, lastUsedAt: now };
  });
}

export function createPortalSessionCookie(
  tokenId: string,
  _tokenExpiresAt: Date,
) {
  void _tokenExpiresAt;
  const now = Math.floor(Date.now() / 1000);
  const expires = now + 2 * 60 * 60;
  return {
    value: signHs256Jwt(
      { typ: "service_portal_session", tokenId },
      portalSecret(),
      expires - now,
    ),
    maxAge: expires - now,
    expiresAt: new Date(expires * 1000),
  };
}
export async function resolvePortalSession(cookie: string | undefined) {
  if (!cookie) return null;
  const jwtSession = verifyHs256Jwt(cookie, portalSecret());
  if (
    jwtSession?.typ === "service_portal_session" &&
    typeof jwtSession.tokenId === "string"
  ) {
    const token = await db.query.servicePortalTokens.findFirst({
      where: and(
        eq(servicePortalTokens.id, jwtSession.tokenId),
        eq(servicePortalTokens.status, "ACTIVE"),
      ),
    });
    if (!token) return null;
    const order = await db.query.serviceOrders.findFirst({
      where: eq(serviceOrders.id, token.serviceOrderId),
      columns: { portalClosedAt: true, contactEmailDigest: true, status: true },
    });
    return order &&
      isServiceOrderPortalOpen(order) &&
      order.contactEmailDigest &&
      equal(token.emailDigest, order.contactEmailDigest)
      ? token
      : null;
  }
  const [tokenId, expiry, signature] = cookie.split(".");
  if (
    !tokenId ||
    !expiry ||
    !signature ||
    Number(expiry) < Date.now() / 1000 ||
    !equal(signature, hmac("session", `${tokenId}:${expiry}`))
  )
    return null;
  const token = await db.query.servicePortalTokens.findFirst({
    where: and(
      eq(servicePortalTokens.id, tokenId),
      eq(servicePortalTokens.status, "ACTIVE"),
    ),
  });
  if (!token) return null;
  const order = await db.query.serviceOrders.findFirst({
    where: eq(serviceOrders.id, token.serviceOrderId),
    columns: { portalClosedAt: true, contactEmailDigest: true, status: true },
  });
  return order &&
    isServiceOrderPortalOpen(order) &&
    order.contactEmailDigest &&
    equal(token.emailDigest, order.contactEmailDigest)
    ? token
    : null;
}

export async function rotatePortalAccessForRecovery(
  orderId: string,
  email: string,
) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`portal-recovery:${orderId}`}))`,
    );
    const [order] = await tx
      .select({
        portalLocale: serviceOrders.portalLocale,
        portalClosedAt: serviceOrders.portalClosedAt,
        customerUserId: serviceOrders.customerUserId,
        contactEmailDigest: serviceOrders.contactEmailDigest,
        paymentStatus: serviceOrders.paymentStatus,
        paymentRequirement: serviceOrders.paymentRequirement,
      })
      .from(serviceOrders)
      .where(eq(serviceOrders.id, orderId))
      .for("update");
    if (
      !order ||
      order.portalClosedAt ||
      order.customerUserId !== null ||
      !order.contactEmailDigest ||
      !equal(order.contactEmailDigest, serviceContactEmailDigest(email)) ||
      !(
        order.paymentRequirement === "NOT_REQUIRED" ||
        ["VERIFIED", "PAID"].includes(order.paymentStatus)
      )
    )
      return null;
    const active = await tx.query.servicePortalTokens.findFirst({
      where: and(
        eq(servicePortalTokens.serviceOrderId, orderId),
        eq(servicePortalTokens.status, "ACTIVE"),
      ),
    });
    if (active) {
      const recentRecovery =
        await tx.query.servicePortalEmailDeliveries.findFirst({
          where: and(
            eq(servicePortalEmailDeliveries.tokenId, active.id),
            eq(servicePortalEmailDeliveries.purpose, "RECOVERY"),
          ),
          orderBy: [desc(servicePortalEmailDeliveries.createdAt)],
        });
      if (shouldSuppressPortalRecovery(recentRecovery?.createdAt || null))
        return { tokenId: active.id, suppressed: true as const };
    }
    if (active)
      await tx
        .update(servicePortalTokens)
        .set({ status: "REVOKED", revokedAt: new Date() })
        .where(eq(servicePortalTokens.id, active.id));
    return issueGuestServicePortalAccess(tx, {
      orderId,
      email,
      locale: order.portalLocale === "en" ? "en" : "th",
      purpose: "RECOVERY",
      rotatedFromId: active?.id,
    });
  });
}

export async function deliverServicePortalEmail(deliveryId: string) {
  const delivery = await db.query.servicePortalEmailDeliveries.findFirst({
    where: eq(servicePortalEmailDeliveries.id, deliveryId),
  });
  if (!delivery || delivery.status === "SENT") return;
  const token = await db.query.servicePortalTokens.findFirst({
    where: eq(servicePortalTokens.id, delivery.tokenId),
  });
  const order = token
    ? await db.query.serviceOrders.findFirst({
        where: eq(serviceOrders.id, token.serviceOrderId),
      })
    : null;
  const contact =
    order?.contactSnapshot &&
    typeof order.contactSnapshot === "object" &&
    !Array.isArray(order.contactSnapshot)
      ? (order.contactSnapshot as Record<string, unknown>)
      : {};
  const email =
    typeof contact.email === "string" ? contact.email.trim().toLowerCase() : "";
  const recipientDigest = email ? serviceContactEmailDigest(email) : "";
  if (
    !token ||
    !order ||
    !email ||
    !isPortalDeliveryBindingCurrent({
      tokenStatus: token.status,
      tokenExpiresAt: token.expiresAt,
      portalClosedAt: order.portalClosedAt,
      customerUserId: order.customerUserId,
      tokenEmailDigest: token.emailDigest,
      orderEmailDigest: order.contactEmailDigest,
      recipientEmailDigest: recipientDigest,
    })
  ) {
    await db
      .update(servicePortalEmailDeliveries)
      .set({ encryptedCapability: null })
      .where(eq(servicePortalEmailDeliveries.id, delivery.id));
    return;
  }
  if (!delivery.encryptedCapability)
    throw new Error("Service portal delivery envelope was already cleared.");
  const link = decrypt(delivery.encryptedCapability);
  const linkExpiry =
    delivery.locale === "th"
      ? "ลิงก์นี้ใช้งานได้จนกว่าคำขอบริการจะเสร็จสิ้นหรือถูกยกเลิก"
      : "This link remains valid until the service request is completed or cancelled.";
  const response = await sendConfiguredTemplateEmail({
    templateKey: "track_request_access",
    to: email,
    values: {
      customer_name:
        typeof contact.fullName === "string" && contact.fullName.trim()
          ? contact.fullName.trim()
          : email.split("@")[0] || "there",
      customer_email: email,
      access_link: link,
      request_links: link,
      request_count: "1",
      link_expiry: linkExpiry,
      site_url: publicOrigin(),
    },
  });
  if (!response.success)
    throw new Error("Listmonk did not confirm service portal delivery.");
  await db
    .update(servicePortalEmailDeliveries)
    .set({
      status: "SENT",
      encryptedCapability: null,
      listmonkDeliveryRef: response.messageId,
      sentAt: new Date(),
    })
    .where(eq(servicePortalEmailDeliveries.id, delivery.id));
  await db
    .insert(servicePortalAuditEvents)
    .values({
      serviceOrderId: token.serviceOrderId,
      tokenId: token.id,
      eventType: "EMAIL_SENT",
      dedupeKey: `EMAIL_SENT:${delivery.id}`,
    })
    .onConflictDoNothing({ target: servicePortalAuditEvents.dedupeKey });
}

export async function createPortalClaimIntent(tokenId: string) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`service-claim-intent:${tokenId}`}))`,
    );
    const token = await tx.query.servicePortalTokens.findFirst({
      where: and(
        eq(servicePortalTokens.id, tokenId),
        eq(servicePortalTokens.status, "ACTIVE"),
      ),
    });
    if (!token)
      throw new Error("Portal token is unavailable.");
    const order = await tx.query.serviceOrders.findFirst({
      where: eq(serviceOrders.id, token.serviceOrderId),
      columns: {
        portalClosedAt: true,
        status: true,
        contactEmailDigest: true,
        customerUserId: true,
      },
    });
    if (
      !order ||
      order.customerUserId !== null ||
      !isServiceOrderPortalOpen(order) ||
      !order.contactEmailDigest ||
      !equal(order.contactEmailDigest, token.emailDigest)
    )
      throw new Error("Portal order is unavailable.");
    await tx
      .update(servicePortalClaimIntents)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(servicePortalClaimIntents.serviceOrderId, token.serviceOrderId),
          isNull(servicePortalClaimIntents.consumedAt),
          sql`${servicePortalClaimIntents.expiresAt} <= now()`,
        ),
      );
    const active = await tx.query.servicePortalClaimIntents.findFirst({
      where: and(
        eq(servicePortalClaimIntents.serviceOrderId, token.serviceOrderId),
        isNull(servicePortalClaimIntents.consumedAt),
      ),
    });
    if (active) return null;
    const secret = randomBytes(32).toString("base64url");
    const claimId = crypto.randomUUID();
    const digest = hmac("claim", `${claimId}:${secret}`);
    await tx
      .insert(servicePortalClaimIntents)
      .values({
        id: claimId,
        serviceOrderId: token.serviceOrderId,
        tokenId: token.id,
        claimDigest: digest,
        emailDigest: token.emailDigest,
        expiresAt: new Date(Date.now() + 20 * 60_000),
      });
    return `${claimId}.${secret}.${hmac("claim-cookie", `${claimId}:${secret}`)}`;
  });
}

function parseClaimCookie(cookieValue: string | undefined) {
  if (!cookieValue) return null;
  const [claimId, secret, signature, ...extra] = cookieValue.split(".");
  if (
    !claimId ||
    !secret ||
    !signature ||
    extra.length ||
    !equal(signature, hmac("claim-cookie", `${claimId}:${secret}`))
  )
    return null;
  return { claimId, secret };
}

export async function getPortalClaimPrefill(
  cookieValue: string | undefined,
): Promise<AuthClaimPrefill | null> {
  const parsed = parseClaimCookie(cookieValue);
  if (!parsed) return null;
  const intent = await db.query.servicePortalClaimIntents.findFirst({
    where: eq(servicePortalClaimIntents.id, parsed.claimId),
  });
  if (
    !intent ||
    intent.consumedAt ||
    intent.expiresAt <= new Date() ||
    !equal(
      intent.claimDigest,
      hmac("claim", `${parsed.claimId}:${parsed.secret}`),
    )
  )
    return null;
  const token = await db.query.servicePortalTokens.findFirst({
    where: and(
      eq(servicePortalTokens.id, intent.tokenId),
      eq(servicePortalTokens.status, "ACTIVE"),
    ),
  });
  if (
    !token ||
    token.serviceOrderId !== intent.serviceOrderId ||
    !equal(token.emailDigest, intent.emailDigest)
  )
    return null;
  const order = await db.query.serviceOrders.findFirst({
    where: eq(serviceOrders.id, intent.serviceOrderId),
  });
  if (
    !order ||
    order.customerUserId !== null ||
    !isServiceOrderPortalOpen(order) ||
    !order.contactEmailDigest ||
    !equal(order.contactEmailDigest, intent.emailDigest)
  )
    return null;
  const contact =
    order.contactSnapshot &&
    typeof order.contactSnapshot === "object" &&
    !Array.isArray(order.contactSnapshot)
      ? (order.contactSnapshot as Record<string, unknown>)
      : {};
  const email = typeof contact.email === "string" ? contact.email.trim() : "";
  if (!email || !equal(serviceContactEmailDigest(email), intent.emailDigest))
    return null;
  return {
    fullName: typeof contact.fullName === "string" ? contact.fullName : "",
    email,
    phone: typeof contact.phone === "string" ? contact.phone : "",
    serviceAddress: order.serviceAddress || "",
  };
}

export async function claimServicePortalIntent(
  userId: string,
  verifiedEmail: string,
  cookieValue: string | undefined,
) {
  if (!cookieValue) return { terminal: false };
  const parsed = parseClaimCookie(cookieValue);
  if (!parsed) return { terminal: true };
  const { claimId, secret } = parsed;
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`service-claim:${claimId}`}))`,
    );
    const intent = await tx.query.servicePortalClaimIntents.findFirst({
      where: eq(servicePortalClaimIntents.id, claimId),
    });
    if (
      !intent ||
      intent.consumedAt ||
      intent.expiresAt <= new Date() ||
      !equal(intent.claimDigest, hmac("claim", `${claimId}:${secret}`)) ||
      !equal(intent.emailDigest, serviceContactEmailDigest(verifiedEmail))
    )
      return { terminal: true };
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`service-claim-order:${intent.serviceOrderId}`}))`,
    );
    const [order] = await tx
      .select()
      .from(serviceOrders)
      .where(eq(serviceOrders.id, intent.serviceOrderId))
      .for("update");
    if (
      !order ||
      !order.contactEmailDigest ||
      !equal(order.contactEmailDigest, intent.emailDigest)
    )
      return { terminal: true };
    if (order.customerUserId !== null)
      return order.customerUserId === userId
        ? { terminal: true, claimed: true, orderId: order.id }
        : { terminal: true };
    if (!isServiceOrderPortalOpen(order)) return { terminal: true };
    const token = await tx.query.servicePortalTokens.findFirst({
      where: and(
        eq(servicePortalTokens.id, intent.tokenId),
        eq(servicePortalTokens.status, "ACTIVE"),
      ),
    });
    if (
      !token ||
      !equal(token.emailDigest, intent.emailDigest)
    )
      return { terminal: true };
    const [user] = await tx
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .for("update");
    if (!user) return { terminal: true };
    const contact =
      order.contactSnapshot &&
      typeof order.contactSnapshot === "object" &&
      !Array.isArray(order.contactSnapshot)
        ? (order.contactSnapshot as Record<string, unknown>)
        : {};
    const fullName =
      typeof contact.fullName === "string" ? contact.fullName : "";
    const phone = typeof contact.phone === "string" ? contact.phone : "";
    await tx
      .update(users)
      .set({
        ...(!user.fullName && fullName
          ? { fullName, name: user.name || fullName }
          : {}),
        ...(!user.phoneNumber && phone ? { phoneNumber: phone } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));
    const [claimedOrder] = await tx
      .update(serviceOrders)
      .set({
        customerUserId: userId,
        actorHash: hashServiceActor("member", userId),
        guestSessionHash: null,
        claimedAt: new Date(),
        portalClosedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(serviceOrders.id, order.id),
          isNull(serviceOrders.customerUserId),
        ),
      )
      .returning({ id: serviceOrders.id });
    if (!claimedOrder) return { terminal: true };
    await tx
      .update(serviceRequests)
      .set({ customerUserId: userId })
      .where(eq(serviceRequests.serviceOrderId, order.id));
    const existingProposal = await tx.query.proposals.findFirst({
      where: eq(proposals.serviceOrderId, order.id),
      columns: { id: true },
    });
    if (!existingProposal) {
      const items = await tx
        .select()
        .from(serviceOrderItems)
        .where(eq(serviceOrderItems.serviceOrderId, order.id));
      const serviceItems = items.map((item) => ({
        ...recordSnapshot(item.offeringSnapshot),
        unitSatang: item.unitPriceSatang,
        discountSatang: item.discountSatang,
        totalSatang: item.totalSatang,
      }));
      const system = recordSnapshot(order.systemSnapshot);
      const systemSizeKwp = Number(system.systemSizeKw);
      const erpPayload = recordSnapshot(order.erpPayload);
      const erpQuotationId =
        typeof erpPayload.quotationId === "string"
          ? erpPayload.quotationId
          : null;
      const publicReference =
        order.trackingRef || deriveServiceTrackingReference(order.trackingId);
      await tx
        .insert(proposals)
        .values({
          userId,
          requestType: "Service",
          serviceItems,
          preferredDate: order.appointmentDate,
          serviceOrderId: order.id,
          systemSizeKwp: Number.isFinite(systemSizeKwp) ? systemSizeKwp : 0,
          panelCount: 0,
          totalPrice: order.totalSatang === null ? 0 : order.totalSatang / 100,
          monthlySavings: 0,
          paybackPeriod: "N/A",
          status: "PENDING_QUOTE",
          erpnextCustomerId: order.erpCustomerId,
          erpnextQuotationId: erpQuotationId,
          configurationData: {
            requestType: "Service",
            serviceItems,
            serviceOrderId: order.id,
            trackingId: publicReference,
            trackingRef: publicReference,
            serviceOrderTrackingId: order.trackingId,
            pricingStatus:
              order.totalSatang === null ? "CUSTOM_REQUIRED" : "FINAL",
            preferredDate: order.appointmentDate.toISOString(),
            contact: order.contactSnapshot,
            location: order.locationSnapshot,
            system,
          },
          fulfillmentType: "INSTALLATION",
          isInstallationRequired: false,
        });
    }
    await tx
      .update(servicePortalClaimIntents)
      .set({ consumedAt: new Date() })
      .where(eq(servicePortalClaimIntents.id, intent.id));
    await tx
      .update(servicePortalTokens)
      .set({ status: "CLOSED", closedAt: new Date() })
      .where(eq(servicePortalTokens.serviceOrderId, order.id));
    await tx.execute(
      sql`UPDATE service_portal_email_deliveries SET encrypted_capability=NULL WHERE token_id IN (SELECT id FROM service_portal_tokens WHERE service_order_id=${order.id})`,
    );
    await tx
      .insert(servicePortalAuditEvents)
      .values({
        serviceOrderId: order.id,
        tokenId: intent.tokenId,
        eventType: "ORDER_CLAIMED",
        actorHash: hmac("user", userId),
        dedupeKey: `ORDER_CLAIMED:${order.id}`,
      })
      .onConflictDoNothing({ target: servicePortalAuditEvents.dedupeKey });
    return { terminal: true, claimed: true, orderId: order.id };
  });
}
