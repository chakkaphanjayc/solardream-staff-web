import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

export type DiscourseConnectRequest = {
  nonce: string;
  returnSsoUrl: string;
};

export type DiscourseConnectProfile = {
  email: string;
  externalId: string;
  username: string;
  name: string;
};

const MAX_SSO_PAYLOAD_LENGTH = 8_192;
const MAX_NONCE_LENGTH = 512;

function getRequiredEnvironmentValue(name: "DISCOURSE_SSO_SECRET" | "DISCOURSE_FORUM_URL") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function getSecret() {
  const secret = getRequiredEnvironmentValue("DISCOURSE_SSO_SECRET");
  if (Buffer.byteLength(secret) < 32) {
    throw new Error("DISCOURSE_SSO_SECRET must be at least 32 bytes.");
  }
  return secret;
}

function digest(value: string) {
  return createHmac("sha256", getSecret()).update(value, "utf8").digest("hex");
}

function signaturesMatch(received: string, expected: string) {
  if (!/^[a-f0-9]{64}$/i.test(received)) return false;

  const receivedBuffer = Buffer.from(received, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

function decodeBase64(value: string) {
  if (!value || value.length > MAX_SSO_PAYLOAD_LENGTH || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw new Error("Malformed DiscourseConnect payload.");
  }

  const decoded = Buffer.from(value, "base64").toString("utf8");
  if (!decoded) throw new Error("Malformed DiscourseConnect payload.");
  return decoded;
}

function normalizedPathname(pathname: string) {
  const normalized = pathname.replace(/\/+$/, "");
  return normalized || "";
}

function getDiscourseBasePath() {
  return normalizedPathname(getDiscourseForumUrl().pathname);
}

function isValidDiscourseReturnUrl(returnUrl: URL) {
  const configuredForumUrl = getDiscourseForumUrl();
  const basePath = getDiscourseBasePath();
  const expectedPath = basePath ? `${basePath}/session/sso_login` : "/session/sso_login";

  return (
    returnUrl.origin === configuredForumUrl.origin &&
    returnUrl.pathname === expectedPath
  );
}

export function verifyAndParseDiscourseConnectRequest(sso: string, signature: string): DiscourseConnectRequest {
  if (!signaturesMatch(signature, digest(sso))) {
    throw new Error("Invalid DiscourseConnect signature.");
  }

  const payload = new URLSearchParams(decodeBase64(sso));
  const nonce = payload.get("nonce")?.trim() || "";
  const returnSsoUrl = payload.get("return_sso_url")?.trim() || "";

  if (!nonce || nonce.length > MAX_NONCE_LENGTH || !returnSsoUrl) {
    throw new Error("Missing required DiscourseConnect parameters.");
  }

  let returnUrl: URL;
  try {
    returnUrl = new URL(returnSsoUrl);
  } catch {
    throw new Error("Invalid DiscourseConnect return URL.");
  }

  if (returnUrl.protocol !== "https:" && returnUrl.protocol !== "http:") {
    throw new Error("Invalid DiscourseConnect return URL.");
  }

  if (!isValidDiscourseReturnUrl(returnUrl)) {
    throw new Error("Invalid DiscourseConnect return URL.");
  }

  return { nonce, returnSsoUrl };
}

export function createDiscourseConnectResponse(
  nonce: string,
  profile: DiscourseConnectProfile,
) {
  const payload = new URLSearchParams({
    nonce,
    email: profile.email,
    external_id: profile.externalId,
    username: profile.username,
    name: profile.name,
  }).toString();
  const sso = Buffer.from(payload, "utf8").toString("base64");

  return { sso, sig: digest(sso) };
}

export function getDiscourseSsoLoginUrl(
  returnSsoUrl: string,
  sso: string,
  signature: string,
) {
  const loginUrl = new URL(returnSsoUrl);
  if (!isValidDiscourseReturnUrl(loginUrl)) {
    throw new Error("Invalid DiscourseConnect return URL.");
  }

  loginUrl.searchParams.set("sso", sso);
  loginUrl.searchParams.set("sig", signature);
  return loginUrl;
}

export function getDiscourseSsoStartUrl() {
  const forumUrl = getDiscourseForumUrl();
  const baseUrl = new URL(forumUrl.toString());
  baseUrl.pathname = `${normalizedPathname(baseUrl.pathname)}/`;
  baseUrl.search = "";
  baseUrl.hash = "";

  return new URL("session/sso", baseUrl);
}

export function getDiscourseForumUrl() {
  const forumUrl = new URL(getRequiredEnvironmentValue("DISCOURSE_FORUM_URL"));
  if (forumUrl.protocol !== "https:" && forumUrl.protocol !== "http:") {
    throw new Error("DISCOURSE_FORUM_URL must use HTTP or HTTPS.");
  }
  return forumUrl;
}
