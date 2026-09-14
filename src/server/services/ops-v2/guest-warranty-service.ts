import "server-only";

import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  auditEvents,
  guestWarrantyAccessTokens,
  guestWarrantyOtpChallenges,
  installedAssets,
  installationWarranties,
  users,
} from "@/db/schema";
import { sendConfiguredTemplateEmail } from "@/lib/email";
import { getSigningSecret } from "@/lib/portalTokens";
import { listCustomerAssets, listCustomerProjects, listCustomerWarranties } from "@/server/services/ops-v2/customer-operations-service";
import type { OpsActor } from "@/types/ops-v2";

const OTP_TTL_MS = 10 * 60 * 1000;
const ACCESS_TTL_MS = 30 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;

export const GUEST_WARRANTY_GENERIC_MESSAGE =
  "If the details match a SolarDream warranty record, a verification code will be sent to the registered contact.";

export class GuestWarrantyAccessError extends Error {
  readonly code = "GUEST_WARRANTY_ACCESS_INVALID";

  constructor(message = "The verification code is invalid or expired.") {
    super(message);
    this.name = "GuestWarrantyAccessError";
  }
}

type NormalizedContact =
  | { kind: "email"; value: string }
  | { kind: "phone"; value: string };

function normalizeContact(value: string): NormalizedContact | null {
  const trimmed = value.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { kind: "email", value: trimmed.toLowerCase() };
  }
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length >= 8 && digits.length <= 15) {
    return { kind: "phone", value: digits };
  }
  return null;
}

function digest(secret: string, context: string, value: string) {
  return createHmac("sha256", secret).update(context + ":" + value).digest("hex");
}

function tokenDigest(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function codeDigest(secret: string, challengeId: string, code: string) {
  return digest(secret, "guest-warranty-otp:" + challengeId, code);
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

async function findUser(contact: NormalizedContact | null) {
  if (!contact) return null;
  if (contact.kind === "email") {
    return db.query.users.findFirst({
      where: and(eq(users.email, contact.value), eq(users.isActive, true)),
      columns: { id: true, email: true, fullName: true, name: true },
    });
  }
  return db.query.users.findFirst({
    where: and(
      sql`regexp_replace(coalesce(${users.phoneNumber}, ''), '[^0-9]', '', 'g') = ${contact.value}`,
      eq(users.isActive, true),
    ),
    columns: { id: true, email: true, fullName: true, name: true },
  });
}

async function hasWarrantyRecord(userId: string) {
  const [installation, asset] = await Promise.all([
    db.query.installationWarranties.findFirst({
      where: and(
        eq(installationWarranties.customerId, userId),
        inArray(installationWarranties.status, ["ACTIVE", "PENDING_ACTIVATION"]),
      ),
      columns: { id: true },
    }),
    db.query.installedAssets.findFirst({
      where: and(
        eq(installedAssets.customerId, userId),
        inArray(installedAssets.status, ["REGISTERED", "ACTIVE", "UNKNOWN"]),
      ),
      columns: { id: true },
    }),
  ]);
  return Boolean(installation || asset);
}

export async function requestGuestWarrantyOtp(input: { contact: string }) {
  const secret = await getSigningSecret();
  const normalized = normalizeContact(input.contact);
  const boundedContact = input.contact.trim().slice(0, 180);
  const contactDigest = digest(
    secret,
    "guest-warranty-contact",
    normalized ? normalized.kind + ":" + normalized.value : "invalid:" + boundedContact.toLowerCase(),
  );
  const user = await findUser(normalized);
  const eligible = Boolean(user && await hasWarrantyRecord(user.id));
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OTP_TTL_MS);

  const challengeId = await db.transaction(async (tx) => {
    await tx.update(guestWarrantyOtpChallenges).set({ consumedAt: now }).where(and(
      eq(guestWarrantyOtpChallenges.contactDigest, contactDigest),
      isNull(guestWarrantyOtpChallenges.consumedAt),
      gt(guestWarrantyOtpChallenges.expiresAt, now),
    ));
    const [challenge] = await tx.insert(guestWarrantyOtpChallenges).values({
      contactDigest,
      customerUserId: eligible && user ? user.id : null,
      codeDigest: codeDigest(secret, "pending", code),
      deliveryChannel: "EMAIL",
      expiresAt,
    }).returning({ id: guestWarrantyOtpChallenges.id });
    if (!challenge) throw new Error("The warranty verification challenge could not be created.");
    await tx.update(guestWarrantyOtpChallenges)
      .set({ codeDigest: codeDigest(secret, challenge.id, code) })
      .where(eq(guestWarrantyOtpChallenges.id, challenge.id));
    return challenge.id;
  });

  if (eligible && user?.email) {
    const emailResult = await sendConfiguredTemplateEmail({
      templateKey: "warranty_access_otp",
      to: user.email,
      values: {
        customer_name: user.fullName || user.name || "SolarDream customer",
        otp_code: code,
        expires_minutes: Math.round(OTP_TTL_MS / 60_000),
        site_url: process.env.NEXT_PUBLIC_SITE_URL || "",
      },
    });
    if (!emailResult.success) {
      console.warn("[Guest Warranty] Verification email was not dispatched.", { reason: emailResult.reason || emailResult.error || "unknown" });
    }
  }

  return { challengeId };
}

export async function verifyGuestWarrantyOtp(input: {
  challengeId: string;
  code: string;
  ipHash?: string | null;
}) {
  const secret = await getSigningSecret();
  const now = new Date();
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`guest-warranty:otp:` + input.challengeId}))`);
    const challenge = await tx.query.guestWarrantyOtpChallenges.findFirst({
      where: eq(guestWarrantyOtpChallenges.id, input.challengeId),
    });
    if (!challenge || challenge.consumedAt || challenge.expiresAt <= now || challenge.attemptCount >= MAX_OTP_ATTEMPTS) {
      throw new GuestWarrantyAccessError();
    }

    const expectedDigest = codeDigest(secret, challenge.id, input.code);
    if (!safeEqual(challenge.codeDigest, expectedDigest)) {
      await tx.update(guestWarrantyOtpChallenges).set({ attemptCount: challenge.attemptCount + 1 }).where(eq(guestWarrantyOtpChallenges.id, challenge.id));
      throw new GuestWarrantyAccessError();
    }
    if (!challenge.customerUserId) {
      await tx.update(guestWarrantyOtpChallenges).set({ consumedAt: now }).where(eq(guestWarrantyOtpChallenges.id, challenge.id));
      throw new GuestWarrantyAccessError();
    }

    const rawToken = randomBytes(32).toString("base64url");
    const expiresAt = new Date(now.getTime() + ACCESS_TTL_MS);
    const [access] = await tx.insert(guestWarrantyAccessTokens).values({
      tokenDigest: tokenDigest(rawToken),
      customerUserId: challenge.customerUserId,
      expiresAt,
    }).returning();
    if (!access) throw new Error("Guest warranty access could not be issued.");

    await tx.update(guestWarrantyOtpChallenges).set({ consumedAt: now }).where(eq(guestWarrantyOtpChallenges.id, challenge.id));
    await tx.insert(auditEvents).values({
      actorUserId: challenge.customerUserId,
      actorType: "GUEST",
      action: "GUEST_WARRANTY_ACCESS_ISSUED",
      resourceType: "GUEST_WARRANTY_ACCESS",
      resourceId: access.id,
      outcome: "SUCCESS",
      route: "/api/v2/guest/warranty/verify",
      method: "POST",
      ipHash: input.ipHash || null,
      metadata: { challengeId: challenge.id, expiresAt: expiresAt.toISOString() },
      occurredAt: now,
    });

    return {
      accessId: access.id,
      accessToken: rawToken,
      expiresAt: expiresAt.toISOString(),
    };
  });
}

export async function getGuestWarrantyPortal(input: {
  accessToken: string;
  ipHash?: string | null;
}) {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(input.accessToken)) return null;
  const now = new Date();
  const access = await db.query.guestWarrantyAccessTokens.findFirst({
    where: and(
      eq(guestWarrantyAccessTokens.tokenDigest, tokenDigest(input.accessToken)),
      isNull(guestWarrantyAccessTokens.revokedAt),
      gt(guestWarrantyAccessTokens.expiresAt, now),
    ),
  });
  if (!access) return null;

  await db.update(guestWarrantyAccessTokens).set({ lastUsedAt: now }).where(eq(guestWarrantyAccessTokens.id, access.id));
  await db.insert(auditEvents).values({
    actorUserId: access.customerUserId,
    actorType: "GUEST",
    action: "GUEST_WARRANTY_ACCESS_VIEWED",
    resourceType: "GUEST_WARRANTY_ACCESS",
    resourceId: access.id,
    outcome: "SUCCESS",
    route: "/api/v2/guest/warranty/access",
    method: "GET",
    ipHash: input.ipHash || null,
    metadata: {},
    occurredAt: now,
  });

  const actor: OpsActor = { userId: access.customerUserId, role: "CUSTOMER" };
  const [projects, assets, warranties] = await Promise.all([
    listCustomerProjects(actor),
    listCustomerAssets(actor),
    listCustomerWarranties(actor),
  ]);
  return {
    access: { id: access.id, expiresAt: access.expiresAt.toISOString() },
    projects,
    assets,
    warranties,
  };
}

export async function revokeGuestWarrantyAccess(input: {
  accessId: string;
  actorUserId: string;
  ipHash?: string | null;
}) {
  const now = new Date();
  const [revoked] = await db.update(guestWarrantyAccessTokens).set({ revokedAt: now }).where(and(
    eq(guestWarrantyAccessTokens.id, input.accessId),
    isNull(guestWarrantyAccessTokens.revokedAt),
  )).returning({ id: guestWarrantyAccessTokens.id, customerUserId: guestWarrantyAccessTokens.customerUserId });
  if (!revoked) throw new GuestWarrantyAccessError("The guest warranty access session was not found or was already revoked.");
  await db.insert(auditEvents).values({
    actorUserId: input.actorUserId,
    actorType: "ADMIN",
    action: "GUEST_WARRANTY_ACCESS_REVOKED",
    resourceType: "GUEST_WARRANTY_ACCESS",
    resourceId: revoked.id,
    outcome: "SUCCESS",
    route: "/api/v2/guest/warranty/revoke",
    method: "POST",
    ipHash: input.ipHash || null,
    metadata: { customerUserId: revoked.customerUserId },
    occurredAt: now,
  });
  return { revoked: true };
}
