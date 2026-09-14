import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";

import { db } from "@/db";
import { portalAccessTokens, proposals, systemSettingsKeyValue } from "@/db/schema";
import { signHs256Jwt, verifyHs256Jwt } from "@/lib/signedJwt";
import { getConfiguredPublicSiteUrl } from "@/lib/siteUrl";
import type { Locale } from "@/i18n/locales";

export const PORTAL_SESSION_COOKIE = "sd_portal_session";
export const PORTAL_SCOPES = [
  "proposal:read",
  "revision:write",
  "documents:write",
  "payments:write",
] as const;
export type PortalScope = (typeof PORTAL_SCOPES)[number];

const TOKEN_PREFIX = "ml1";
const SESSION_PREFIX = "ps1";
const MIN_SECRET_LENGTH = 32;
const STATE_BASED_TOKEN_EXPIRES_AT = new Date("2126-01-01T00:00:00.000Z");

function isClosedProposalStatus(status: string | null | undefined) {
  const normalized = (status || "").trim().toUpperCase();
  return ["COMPLETED", "COMPLETE", "CANCELLED", "CANCELED", "CLOSED", "ARCHIVED"].includes(normalized);
}

async function isProposalPortalOpen(proposalId: string) {
  const proposal = await db.query.proposals.findFirst({
    where: eq(proposals.id, proposalId),
    columns: { status: true, projectStatus: true },
  });
  return Boolean(
    proposal &&
      !isClosedProposalStatus(proposal.status) &&
      !isClosedProposalStatus(proposal.projectStatus),
  );
}

export async function getSigningSecret() {
  const environmentSecret = process.env.PORTAL_TOKEN_SECRET?.trim();
  if (environmentSecret && environmentSecret.length >= MIN_SECRET_LENGTH) return environmentSecret;

  const setting = await db.query.systemSettingsKeyValue.findFirst({
    where: eq(systemSettingsKeyValue.key, "portal_token_secret"),
    columns: { value: true },
  });
  const configuredSecret = setting?.value.trim();
  if (!configuredSecret || configuredSecret.length < MIN_SECRET_LENGTH) {
    throw new Error("Portal token signing secret is not configured securely.");
  }
  return configuredSecret;
}

function digestToken(rawToken: string) {
  return createHash("sha256").update(rawToken).digest("hex");
}

function signToken(rawToken: string, secret: string) {
  return createHmac("sha256", secret)
    .update(`${TOKEN_PREFIX}.${rawToken}`)
    .digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function parseToken(token: string) {
  const [prefix, rawToken, signature, ...rest] = token.trim().split(".");
  if (prefix !== TOKEN_PREFIX || !rawToken || !signature || rest.length > 0) return null;
  return { rawToken, signature };
}

function parseSession(session: string) {
  const [prefix, tokenId, expires, signature, ...rest] = session.trim().split(".");
  if (prefix !== SESSION_PREFIX || !tokenId || !expires || !signature || rest.length > 0) return null;
  const expiresAt = Number(expires);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return null;
  return { tokenId, expiresAt, signature };
}

function signSession(tokenId: string, expiresAt: number, secret: string) {
  return createHmac("sha256", secret)
    .update(`${SESSION_PREFIX}.${tokenId}.${expiresAt}`)
    .digest("base64url");
}

export async function createPortalSessionCookie(input: {
  tokenId: string;
  expiresAt: Date;
}) {
  const secret = await getSigningSecret();
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + 2 * 60 * 60;
  return {
    value: signHs256Jwt(
      { typ: "proposal_portal_session", tokenId: input.tokenId },
      secret,
      expiresAt - now,
    ),
    maxAge: expiresAt - now,
    expiresAt: new Date(expiresAt * 1000),
  };
}

export async function issuePortalToken(input: {
  proposalId: string;
  issuedByUserId: string;
  scopes?: readonly PortalScope[];
  expiresAt: Date;
  rotatedFromId?: string | null;
}) {
  const secret = await getSigningSecret();
  const rawToken = randomBytes(32).toString("base64url");
  const token = `${TOKEN_PREFIX}.${rawToken}.${signToken(rawToken, secret)}`;
  const scopes = [...new Set(input.scopes || PORTAL_SCOPES)];
  const [record] = await db.insert(portalAccessTokens).values({
    proposalId: input.proposalId,
    tokenDigest: digestToken(rawToken),
    scopes,
    issuedByUserId: input.issuedByUserId,
    rotatedFromId: input.rotatedFromId || null,
    expiresAt: input.expiresAt,
  }).returning();
  if (!record) throw new Error("Portal access token could not be issued.");
  return { token, record };
}

export async function validatePortalToken(input: {
  token: string;
  proposalId: string;
  requiredScope: PortalScope;
}) {
  const secret = await getSigningSecret();
  if (!(await isProposalPortalOpen(input.proposalId))) return null;
  const now = new Date();
  const jwtSession = verifyHs256Jwt(input.token, secret);
  if (
    jwtSession?.typ === "proposal_portal_session" &&
    typeof jwtSession.tokenId === "string"
  ) {
    const record = await db.query.portalAccessTokens.findFirst({
      where: and(
        eq(portalAccessTokens.id, jwtSession.tokenId),
        eq(portalAccessTokens.proposalId, input.proposalId),
        isNull(portalAccessTokens.revokedAt),
        isNull(portalAccessTokens.closedAt),
        gt(portalAccessTokens.expiresAt, now),
      ),
    });
    if (!record || !record.scopes.includes(input.requiredScope)) return null;
    await db.update(portalAccessTokens)
      .set({ lastUsedAt: now, updatedAt: now })
      .where(eq(portalAccessTokens.id, record.id));
    return record;
  }

  const session = parseSession(input.token);
  if (session) {
    if (!safeEqual(session.signature, signSession(session.tokenId, session.expiresAt, secret))) return null;
    const record = await db.query.portalAccessTokens.findFirst({
      where: and(
        eq(portalAccessTokens.id, session.tokenId),
        eq(portalAccessTokens.proposalId, input.proposalId),
        isNull(portalAccessTokens.revokedAt),
        isNull(portalAccessTokens.closedAt),
        gt(portalAccessTokens.expiresAt, now),
      ),
    });
    if (!record || !record.scopes.includes(input.requiredScope)) return null;
    await db.update(portalAccessTokens)
      .set({ lastUsedAt: now, updatedAt: now })
      .where(eq(portalAccessTokens.id, record.id));
    return record;
  }

  const parsed = parseToken(input.token);
  if (!parsed) return null;
  if (!safeEqual(parsed.signature, signToken(parsed.rawToken, secret))) return null;

  const record = await db.query.portalAccessTokens.findFirst({
    where: and(
      eq(portalAccessTokens.tokenDigest, digestToken(parsed.rawToken)),
      eq(portalAccessTokens.proposalId, input.proposalId),
      isNull(portalAccessTokens.revokedAt),
      isNull(portalAccessTokens.closedAt),
      gt(portalAccessTokens.expiresAt, now),
    ),
  });
  if (!record || !record.scopes.includes(input.requiredScope)) return null;
  await db.update(portalAccessTokens)
    .set({ lastUsedAt: now, updatedAt: now })
    .where(eq(portalAccessTokens.id, record.id));
  return record;
}

export async function rotatePortalToken(input: {
  currentTokenId: string;
  proposalId: string;
  issuedByUserId: string;
  scopes: readonly PortalScope[];
  expiresAt: Date;
}) {
  const secret = await getSigningSecret();
  const rawToken = randomBytes(32).toString("base64url");
  const token = `${TOKEN_PREFIX}.${rawToken}.${signToken(rawToken, secret)}`;
  const now = new Date();
  const record = await db.transaction(async (tx) => {
    const [revoked] = await tx.update(portalAccessTokens)
      .set({ revokedAt: now, updatedAt: now })
      .where(and(
        eq(portalAccessTokens.id, input.currentTokenId),
        eq(portalAccessTokens.proposalId, input.proposalId),
        isNull(portalAccessTokens.revokedAt),
        isNull(portalAccessTokens.closedAt),
      ))
      .returning({ id: portalAccessTokens.id });
    if (!revoked) throw new Error("Current portal token is unavailable for rotation.");
    const [created] = await tx.insert(portalAccessTokens).values({
      proposalId: input.proposalId,
      tokenDigest: digestToken(rawToken),
      scopes: [...new Set(input.scopes)],
      issuedByUserId: input.issuedByUserId,
      rotatedFromId: input.currentTokenId,
      expiresAt: input.expiresAt,
    }).returning();
    if (!created) throw new Error("Rotated portal token could not be issued.");
    return created;
  });
  return { token, record };
}

export async function revokePortalToken(tokenId: string, proposalId: string) {
  const now = new Date();
  await db.update(portalAccessTokens)
    .set({ revokedAt: now, updatedAt: now })
    .where(and(eq(portalAccessTokens.id, tokenId), eq(portalAccessTokens.proposalId, proposalId)));
}

export async function closeProposalPortalTokens(
  proposalId: string,
  executor: Pick<typeof db, "update"> = db,
) {
  const now = new Date();
  await executor.update(portalAccessTokens)
    .set({ closedAt: now, updatedAt: now })
    .where(and(eq(portalAccessTokens.proposalId, proposalId), isNull(portalAccessTokens.closedAt)));
}

export async function issuePortalDispatchLink(input: {
  proposalId: string;
  actorUserId: string;
  locale?: Locale;
  expiresAt?: Date;
}) {
  const current = await db.query.portalAccessTokens.findFirst({
    where: and(
      eq(portalAccessTokens.proposalId, input.proposalId),
      isNull(portalAccessTokens.revokedAt),
      isNull(portalAccessTokens.closedAt),
    ),
    orderBy: (tokens, { desc }) => [desc(tokens.createdAt)],
  });
  const expiresAt = input.expiresAt || STATE_BASED_TOKEN_EXPIRES_AT;
  const issued = current
    ? await rotatePortalToken({
        currentTokenId: current.id,
        proposalId: input.proposalId,
        issuedByUserId: input.actorUserId,
        scopes: PORTAL_SCOPES,
        expiresAt,
      })
    : await issuePortalToken({
        proposalId: input.proposalId,
        issuedByUserId: input.actorUserId,
        scopes: PORTAL_SCOPES,
        expiresAt,
      });
  const baseUrl = getConfiguredPublicSiteUrl();
  const url = new URL("/api/auth/verify-guest", baseUrl);
  url.searchParams.set("mode", "proposal");
  url.searchParams.set("locale", input.locale || "th");
  url.searchParams.set("proposalId", input.proposalId);
  url.searchParams.set("token", issued.token);
  return url.toString();
}
