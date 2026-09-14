import { createHmac, timingSafeEqual } from "node:crypto";

type JwtPayload = Record<string, unknown> & {
  exp?: number;
  iat?: number;
};

function base64UrlJson(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decodeJsonPart(part: string) {
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as unknown;
  } catch {
    return null;
  }
}

function sign(input: string, secret: string) {
  return createHmac("sha256", secret).update(input).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function signHs256Jwt(
  payload: JwtPayload,
  secret: string,
  expiresInSeconds?: number,
) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlJson({ alg: "HS256", typ: "JWT" });
  const exp =
    typeof expiresInSeconds === "number"
      ? { exp: now + expiresInSeconds }
      : {};
  const body = base64UrlJson({ ...payload, iat: now, ...exp });
  const signingInput = `${header}.${body}`;
  return `${signingInput}.${sign(signingInput, secret)}`;
}

export function verifyHs256Jwt(token: string, secret: string) {
  const [headerPart, payloadPart, signature, ...rest] = token.split(".");
  if (!headerPart || !payloadPart || !signature || rest.length > 0) return null;
  const header = decodeJsonPart(headerPart);
  if (
    !header ||
    typeof header !== "object" ||
    Array.isArray(header) ||
    (header as Record<string, unknown>).alg !== "HS256"
  ) {
    return null;
  }
  const expected = sign(`${headerPart}.${payloadPart}`, secret);
  if (!safeEqual(signature, expected)) return null;
  const payload = decodeJsonPart(payloadPart);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const record = payload as JwtPayload;
  if (typeof record.exp === "number" && record.exp <= Math.floor(Date.now() / 1000)) return null;
  return record;
}
