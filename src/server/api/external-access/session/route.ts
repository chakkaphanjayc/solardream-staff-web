import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";

import {
  findExternalAccessAccountById,
  findExternalAccessAccountByToken,
  loadExternalWorkView,
  touchExternalAccessAccount,
} from "@/lib/developerAccess";
import { getSigningSecret } from "@/lib/portalTokens";
import { signHs256Jwt, verifyHs256Jwt } from "@/lib/signedJwt";

export const EXTERNAL_ACCESS_SESSION_COOKIE = "sd_external_access";

function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

function clearSession(response: NextResponse) {
  response.cookies.set({ name: EXTERNAL_ACCESS_SESSION_COOKIE, value: "", httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
  return noStore(response);
}

async function loadViewFromCookie() {
  const cookieStore = await cookies();
  const value = cookieStore.get(EXTERNAL_ACCESS_SESSION_COOKIE)?.value || "";
  if (!value) return null;
  const secret = await getSigningSecret();
  const payload = verifyHs256Jwt(value, secret);
  if (!payload || payload.typ !== "external_access_session" || typeof payload.accountId !== "string") return null;
  const account = await findExternalAccessAccountById(payload.accountId);
  if (!account) return null;
  await touchExternalAccessAccount(account.id);
  return loadExternalWorkView(account);
}

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    const parsed = z.object({ token: z.string().trim().min(40).max(300) }).safeParse(body);
    if (!parsed.success) return noStore(NextResponse.json({ success: false, error: "The temporary access link is invalid." }, { status: 400 }));

    const account = await findExternalAccessAccountByToken(parsed.data.token);
    if (!account) return noStore(NextResponse.json({ success: false, error: "This temporary access link is expired or revoked." }, { status: 401 }));
    if (!account.permissions.includes("external:work:read") && !account.permissions.includes("*")) {
      return noStore(NextResponse.json({ success: false, error: "This account has no work-view permission." }, { status: 403 }));
    }

    const remainingSeconds = Math.max(60, Math.floor((account.expiresAt.getTime() - Date.now()) / 1000));
    const secret = await getSigningSecret();
    const session = signHs256Jwt({ typ: "external_access_session", accountId: account.id }, secret, remainingSeconds);
    await touchExternalAccessAccount(account.id);
    const response = noStore(NextResponse.json({ success: true, view: await loadExternalWorkView(account) }));
    response.cookies.set({ name: EXTERNAL_ACCESS_SESSION_COOKIE, value: session, httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: remainingSeconds });
    return response;
  } catch (error: unknown) {
    console.error("[External Access] Failed to establish session:", error);
    return noStore(NextResponse.json({ success: false, error: "Temporary access is unavailable." }, { status: 500 }));
  }
}

export async function GET() {
  try {
    const view = await loadViewFromCookie();
    if (!view) return noStore(NextResponse.json({ success: false, error: "The temporary access session is expired or revoked." }, { status: 401 }));
    return noStore(NextResponse.json({ success: true, view }));
  } catch (error: unknown) {
    console.error("[External Access] Failed to load session:", error);
    return noStore(NextResponse.json({ success: false, error: "Temporary access is unavailable." }, { status: 500 }));
  }
}

export async function DELETE() {
  return clearSession(noStore(NextResponse.json({ success: true })));
}
