import crypto from "crypto";

export function timingSafeStringEqual(received: string, expected: string) {
  if (!received || !expected) return false;

  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);

  return (
    receivedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

export function hasValidBearerToken(authorization: string | null, expectedSecret: string | null | undefined) {
  const expected = expectedSecret?.trim() || "";
  const header = authorization?.trim() || "";
  const token = header.replace(/^Bearer\s+/i, "");

  return Boolean(expected && header && timingSafeStringEqual(token, expected));
}

export function hasValidAuthorizationToken(
  authorization: string | null,
  expectedSecret: string | null | undefined,
) {
  const expected = expectedSecret?.trim() || "";
  const header = authorization?.trim() || "";
  if (!expected || !header) return false;

  const candidates = [
    header,
    header.replace(/^Bearer\s+/i, ""),
    header.replace(/^token\s+/i, ""),
  ].filter(Boolean);

  return candidates.some((candidate) => timingSafeStringEqual(candidate, expected));
}

export function hasValidHeaderSecret(receivedSecret: string | null, expectedSecret: string | null | undefined) {
  const expected = expectedSecret?.trim() || "";
  const received = receivedSecret?.trim() || "";

  return Boolean(expected && received && timingSafeStringEqual(received, expected));
}
