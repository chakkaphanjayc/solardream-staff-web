import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextResponse } from "next/server";

export const SERVICE_GUEST_COOKIE = "sd_service_guest";

function secret() {
  const value = process.env.SERVICE_GUEST_COOKIE_SECRET?.trim() || process.env.PRIVACY_IP_HASH_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.CRON_SECRET?.trim();
  if (!value || value.length < 24) throw new Error("Service guest signing secret is not configured securely.");
  return value;
}

function signature(token: string) {
  return createHmac("sha256", secret()).update(`service-guest:${token}`).digest("base64url");
}

export function createGuestSession() {
  const token = randomBytes(32).toString("base64url");
  return { token, cookieValue: `${token}.${signature(token)}` };
}

export function verifyGuestSession(cookieValue: string | undefined) {
  if (!cookieValue) return null;
  const [token, supplied, extra] = cookieValue.split(".");
  if (!token || !supplied || extra) return null;
  const expected = signature(token);
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right) ? token : null;
}

export function hashServiceActor(kind: "member" | "guest" | "tracking", value: string) {
  return createHmac("sha256", secret()).update(`${kind}:${value}`).digest("hex");
}

export function attachGuestCookie(response: NextResponse, cookieValue: string) {
  response.cookies.set(SERVICE_GUEST_COOKIE, cookieValue, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
}
