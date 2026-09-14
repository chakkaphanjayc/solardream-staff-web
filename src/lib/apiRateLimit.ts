import { NextResponse } from "next/server";

import { enforcePortalRateLimit, getPortalClientAddress } from "@/lib/portalRateLimit";

export async function enforcePublicApiRateLimit(request: Request, input: {
  namespace: string;
  limit: number;
  windowSeconds: number;
}) {
  const result = await enforcePortalRateLimit({
    namespace: input.namespace,
    identity: getPortalClientAddress(request.headers),
    limit: input.limit,
    windowSeconds: input.windowSeconds,
  });
  if (result.allowed) return null;

  const retryAfter = Math.max(1, Math.ceil((result.resetAt.getTime() - Date.now()) / 1_000));
  return NextResponse.json(
    { success: false, error: "Too many requests. Please try again shortly." },
    { status: 429, headers: { "Retry-After": String(retryAfter), "Cache-Control": "no-store" } },
  );
}
