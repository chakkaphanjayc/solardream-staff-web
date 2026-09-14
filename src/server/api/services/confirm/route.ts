import { NextRequest, NextResponse } from "next/server";
import { enforcePortalRateLimit } from "@/lib/portalRateLimit";
import { isSameOrigin, privacyHmac, requestClientAddress } from "@/lib/privacyConsent";
import { idempotencyHeaderSchema, resolveServiceActor } from "@/lib/serviceApi";
import { attachGuestCookie } from "@/lib/serviceGuestSession";
import type { MultiServiceConfirmInput } from "@/lib/serviceMultiContracts";
import { confirmMultiServiceQuote } from "@/lib/serviceMultiCommerce";
import { classifyMultiServiceError, multiServiceErrorLog } from "@/lib/serviceMultiErrors";
import {
  stripTurnstileToken,
  turnstilePayloadSchema,
  verifyTurnstileToken,
} from "@/lib/turnstile";
import { after } from "next/server";
import { sendConfiguredTemplateEmail } from "@/lib/email";

export async function POST(request: NextRequest) {
  try {
    if (!isSameOrigin(request))
      return NextResponse.json(
        { success: false, code: "FORBIDDEN", error: "Forbidden." },
        { status: 403 },
      );
    const strictIpRate = await enforcePortalRateLimit({
      namespace: "multi-service-confirm-public-ip-minute",
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
    const key = idempotencyHeaderSchema.parse(
      request.headers.get("idempotency-key"),
    );
    const raw = turnstilePayloadSchema.parse(await request.json());
    const botCheck = await verifyTurnstileToken({
      token:
        typeof raw.turnstileToken === "string"
          ? raw.turnstileToken
          : undefined,
      remoteIp: requestClientAddress(request.headers),
      expectedAction: "service_confirm",
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
        namespace: "multi-service-confirm-actor",
        identity: subject.actor.actorHash,
        limit: 5,
        windowSeconds: 600,
      }),
      enforcePortalRateLimit({
        namespace: "multi-service-confirm-ip",
        identity: privacyHmac(requestClientAddress(request.headers), "ip"),
        limit: 10,
        windowSeconds: 600,
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
    const input = stripTurnstileToken(raw) as MultiServiceConfirmInput;
    const confirmation = await confirmMultiServiceQuote(
      subject.actor,
      input,
      key,
    );
    const response = NextResponse.json(
      { success: true, confirmation },
      {
        status: confirmation.idempotentReplay ? 200 : 201,
        headers: { "Cache-Control": "private, no-store, max-age=0" },
      },
    );
    if (subject.newGuestCookie) attachGuestCookie(response, subject.newGuestCookie);

    after(async () => {
      try {
        const contactEmail = input.contact?.email;
        const contactName = input.contact?.fullName || "customer";
        const orderRef = confirmation.orderReference;
        const trackUrl = confirmation.trackingUrl;
        const emailLocale = input.locale === "th" ? "th" : "en";

        if (contactEmail) {
          await sendConfiguredTemplateEmail({
            templateKey: "service_request_confirmed",
            to: contactEmail,
            values: { customer_name: contactName, order_reference: orderRef, tracking_url: trackUrl, action_url: trackUrl, locale: emailLocale },
          });
        }
      } catch (emailErr) {
        console.error("[SERVICES CONFIRM EMAIL] Deferred email dispatch failed:", emailErr);
      }
    });

    return response;
  } catch (error) {
    const failure = classifyMultiServiceError(error);
    console.error("[Multi Service Confirm]", multiServiceErrorLog(error));
    return NextResponse.json(
      { success: false, code: failure.code, error: failure.message },
      {
        status: failure.status,
        headers: { "Cache-Control": "private, no-store, max-age=0" },
      },
    );
  }
}
