import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { ensureUserExists } from "@/app/actions/auth";
import {
  createEstimateDraft,
  ESTIMATE_DRAFT_COOKIE,
  ESTIMATE_DRAFT_MAX_BODY_BYTES,
  estimateDraftCookieOptions,
  isValidEstimateDraftToken,
  parseEstimateDraftRequest,
  claimEstimateDraftToken,
} from "@/lib/estimateDraftBridge";
import { enforcePortalRateLimit, getPortalClientAddress } from "@/lib/portalRateLimit";
import { createClient } from "@/utils/supabase/server";

function validOrigin(request: NextRequest) {
  const source = request.headers.get("origin") || request.headers.get("referer") || "";
  if (!source) return false;
  const allowed = new Set([request.nextUrl.origin]);
  for (const configured of [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NEXT_PUBLIC_ADMIN_URL,
  ]) {
    if (!configured) continue;
    try { allowed.add(new URL(configured).origin); } catch { /* Invalid deployment values are not trusted. */ }
  }
  try { return allowed.has(new URL(source).origin); } catch { return false; }
}

async function readBoundedBody(request: NextRequest) {
  const rawLength = request.headers.get("content-length");
  if (!rawLength || !/^\d+$/.test(rawLength)) throw new Error("Content-Length is required.");
  const expected = Number(rawLength);
  if (!Number.isSafeInteger(expected) || expected <= 0 || expected > ESTIMATE_DRAFT_MAX_BODY_BYTES) throw new Error("Estimate request is too large.");
  if (!request.body) throw new Error("Estimate request body is missing.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > ESTIMATE_DRAFT_MAX_BODY_BYTES) { await reader.cancel(); throw new Error("Estimate request is too large."); }
    chunks.push(value);
  }
  if (total !== expected) throw new Error("Content-Length does not match estimate request body.");
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder("utf-8", { fatal: true }).decode(output);
}

export async function POST(request: NextRequest) {
  try {
    if (!validOrigin(request)) return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });
    const clientAddress = getPortalClientAddress(request.headers);
    const rate = await enforcePortalRateLimit({ namespace: "estimate-draft", identity: clientAddress, limit: 12, windowSeconds: 60 });
    if (!rate.allowed) return NextResponse.json({ success: false, error: "Too many requests." }, { status: 429 });
    const idempotencyKey = request.headers.get("idempotency-key")?.trim() || "";
    if (!/^[A-Za-z0-9._:-]{16,160}$/.test(idempotencyKey)) return NextResponse.json({ success: false, error: "A valid idempotency key is required." }, { status: 400 });
    const body = parseEstimateDraftRequest(JSON.parse(await readBoundedBody(request)) as unknown);
    const previousToken = request.cookies.get(ESTIMATE_DRAFT_COOKIE)?.value || "";
    const created = await createEstimateDraft({ request: body, requestKey: `${clientAddress}:${idempotencyKey}`, previousToken: isValidEstimateDraftToken(previousToken) ? previousToken : undefined });
    const response = NextResponse.json({ success: true, version: 1, intent: body.intent, expiresInSeconds: 86_400, replayed: created.replayed });
    response.cookies.set(ESTIMATE_DRAFT_COOKIE, created.token, estimateDraftCookieOptions());
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const dbUser = await ensureUserExists(user);
      if (dbUser) {
        const claim = await claimEstimateDraftToken(dbUser.id, created.token);
        if (claim.terminal) response.cookies.delete(ESTIMATE_DRAFT_COOKIE);
      }
    }
    return response;
  } catch (error: unknown) {
    const isValidation = error instanceof ZodError || error instanceof SyntaxError;
    const message = error instanceof Error ? error.message : "Estimate draft failed.";
    const conflict = message.includes("Idempotency") || message.includes("replay token");
    if (!isValidation && !conflict) console.error("[Estimate Draft Bridge]", error);
    return NextResponse.json({ success: false, error: conflict ? message : "Estimate draft is invalid." }, { status: conflict ? 409 : 400 });
  }
}
