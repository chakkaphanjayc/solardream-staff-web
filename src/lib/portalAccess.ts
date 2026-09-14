import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { proposals } from "@/db/schema";
import { createClient } from "@/utils/supabase/server";
import { enforcePortalRateLimit, getPortalClientAddress } from "@/lib/portalRateLimit";
import {
  PORTAL_SESSION_COOKIE,
  validatePortalToken,
  type PortalScope,
} from "@/lib/portalTokens";

export type PortalAccess = {
  proposal: typeof proposals.$inferSelect;
  actorUserId: string;
  mode: "member" | "guest";
  tokenId: string | null;
};

function getAllowedOrigins(request: NextRequest) {
  const origins = new Set([request.nextUrl.origin]);
  for (const configured of [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NEXT_PUBLIC_ADMIN_URL,
  ]) {
    if (!configured) continue;
    try { origins.add(new URL(configured).origin); } catch { /* Invalid config is not trusted. */ }
  }
  return origins;
}

function hasValidOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const candidate = origin || referer;
  if (!candidate) return false;
  try { return getAllowedOrigins(request).has(new URL(candidate).origin); } catch { return false; }
}

function getPresentedToken(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) return authorization.slice(7).trim();
  return request.cookies.get(PORTAL_SESSION_COOKIE)?.value || "";
}

export async function resolvePortalAccess(input: {
  request: NextRequest;
  proposalId: string;
  capability: PortalScope;
  mutation?: boolean;
}): Promise<PortalAccess | null> {
  if (input.mutation && !hasValidOrigin(input.request)) return null;
  const rate = await enforcePortalRateLimit({
    namespace: `portal:${input.capability}`,
    identity: `${input.proposalId}:${getPortalClientAddress(input.request.headers)}`,
    limit: input.mutation ? 20 : 60,
    windowSeconds: 60,
  });
  if (!rate.allowed) return null;

  const proposal = await db.query.proposals.findFirst({
    where: eq(proposals.id, input.proposalId),
  });
  if (!proposal) return null;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user?.id === proposal.userId) {
    return { proposal, actorUserId: user.id, mode: "member", tokenId: null };
  }

  const token = getPresentedToken(input.request);
  if (!token) return null;
  const tokenRecord = await validatePortalToken({
    token,
    proposalId: proposal.id,
    requiredScope: input.capability,
  });
  if (!tokenRecord) return null;
  return {
    proposal,
    actorUserId: proposal.userId,
    mode: "guest",
    tokenId: tokenRecord.id,
  };
}

export function portalJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}
