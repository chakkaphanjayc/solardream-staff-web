import { NextRequest, NextResponse } from "next/server";
import { enforcePortalRateLimit } from "@/lib/portalRateLimit";
import { isSameOrigin, privacyHmac, requestClientAddress } from "@/lib/privacyConsent";
import { resolveServiceActor } from "@/lib/serviceApi";
import { attachGuestCookie } from "@/lib/serviceGuestSession";
import type { MultiServiceQuoteInput } from "@/lib/serviceMultiContracts";
import { createMultiServiceQuote } from "@/lib/serviceMultiCommerce";
import { classifyMultiServiceError, multiServiceErrorLog } from "@/lib/serviceMultiErrors";
import {
  stripTurnstileToken,
  turnstilePayloadSchema,
  verifyTurnstileToken,
} from "@/lib/turnstile";

export async function POST(request: NextRequest) {
  try {
    if (!isSameOrigin(request))
      return NextResponse.json(
        { success: false, code: "FORBIDDEN", error: "Forbidden." },
        { status: 403 },
      );
    const strictIpRate = await enforcePortalRateLimit({
      namespace: "multi-service-quote-public-ip-minute",
      identity: privacyHmac(requestClientAddress(request.headers), "ip"),
      limit: 5,
      windowSeconds: 60,
    });
    if (!strictIpRate.allowed)
      return NextResponse.json(
        {
          success: false,
          code: "RATE_LIMITED",
          error: "Too many requests. Please try again shortly.",
        },
        { status: 429, headers: { "Cache-Control": "private, no-store, max-age=0" } },
      );
    const raw = turnstilePayloadSchema.parse(await request.json());
    const botCheck = await verifyTurnstileToken({
      token:
        typeof raw.turnstileToken === "string"
          ? raw.turnstileToken
          : undefined,
      remoteIp: requestClientAddress(request.headers),
      expectedAction: "service_quote",
    });
    if (!botCheck.success)
      return NextResponse.json(
        {
          success: false,
          code: "BOT_CHECK_FAILED",
          error: "Security check failed.",
        },
        {
          status: 403,
          headers: { "Cache-Control": "private, no-store, max-age=0" },
        },
      );
    const subject = await resolveServiceActor(request);
    const [actor, ip] = await Promise.all([
      enforcePortalRateLimit({
        namespace: "multi-service-quote-actor",
        identity: subject.actor.actorHash,
        limit: 20,
        windowSeconds: 60,
      }),
      enforcePortalRateLimit({
        namespace: "multi-service-quote-ip",
        identity: privacyHmac(requestClientAddress(request.headers), "ip"),
        limit: 20,
        windowSeconds: 60,
      }),
    ]);
    if (!actor.allowed || !ip.allowed)
      return NextResponse.json(
        {
          success: false,
          code: "RATE_LIMITED",
          error: "Too many requests. Please try again shortly.",
        },
        { status: 429 },
      );
    const quote = await createMultiServiceQuote(
      subject.actor,
      stripTurnstileToken(raw) as MultiServiceQuoteInput,
    );
    const response = NextResponse.json(
      { success: true, quote },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
    if (subject.newGuestCookie) attachGuestCookie(response, subject.newGuestCookie);
    return response;
  } catch (error) {
    const failure = classifyMultiServiceError(error);
    console.error("[Multi Service Quote]", multiServiceErrorLog(error));
    return NextResponse.json(
      { success: false, code: failure.code, error: failure.message },
      {
        status: failure.status,
        headers: { "Cache-Control": "private, no-store, max-age=0" },
      },
    );
  }
}
