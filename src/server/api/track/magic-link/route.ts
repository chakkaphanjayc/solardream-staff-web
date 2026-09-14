import { and, eq, or, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import { proposals, serviceOrders, users } from "@/db/schema";
import { sendConfiguredTemplateEmail } from "@/lib/email";
import { enforcePortalRateLimit } from "@/lib/portalRateLimit";
import { issuePortalDispatchLink } from "@/lib/portalTokens";
import { isSameOrigin, privacyHmac, requestClientAddress } from "@/lib/privacyConsent";
import {
  rotatePortalAccessForRecovery,
  serviceContactEmailDigest,
} from "@/lib/servicePortal";
import { normalizeTrackingReference, isUuidLike } from "@/lib/trackingReference";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { getConfiguredPublicSiteUrl } from "@/lib/siteUrl";

const GENERIC_MESSAGE =
  "If a request is linked to these details, a secure access link has been sent to your inbox.";

const floor = (started: number) =>
  new Promise((resolve) =>
    setTimeout(resolve, Math.max(0, 700 - (Date.now() - started))),
  );

function json(body: unknown, status = 202) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Pragma": "no-cache",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function referenceWithoutKnownPrefix(value: string) {
  return value
    .trim()
    .replace(/^(QT|QTN|TRK|REF)-/i, "")
    .trim();
}

function proposalReferenceConditions(reference: string) {
  const cleanReference = normalizeTrackingReference(reference);
  const shortReference = referenceWithoutKnownPrefix(cleanReference);
  const conditions = [
    eq(proposals.id, cleanReference),
    eq(proposals.erpnextQuotationId, cleanReference),
    eq(proposals.magicTokenSlug, cleanReference),
    sql`${proposals.configurationData}->>'trackingRef' = ${cleanReference}`,
    sql`${proposals.configurationData}->>'trackingId' = ${cleanReference}`,
    sql`${proposals.configurationData}->>'orderReference' = ${cleanReference}`,
    sql`('SD-QT-' || upper(substr(translate(replace(${proposals.id}::text, '-', ''), '01ILO', '23444'), 1, 6))) = ${cleanReference}`,
  ];

  if (/^[a-z0-9]{6,16}$/i.test(shortReference)) {
    conditions.push(
      sql`upper(substring(${proposals.id}::text from 1 for ${shortReference.length})) = ${shortReference.toUpperCase()}`,
    );
  }

  return conditions;
}

async function sendAccessEmail(input: {
  to: string;
  locale: "en" | "th";
  links: string[];
}) {
  if (input.links.length === 0) return false;
  const siteUrl = getConfiguredPublicSiteUrl();
  const linkExpiry =
    input.locale === "th"
      ? "ลิงก์ใช้งานได้จนกว่าคำขอที่เกี่ยวข้องจะเสร็จสิ้นหรือถูกยกเลิก"
      : "Links remain valid until the related request is completed or cancelled.";
  const [primary] = input.links;
  const requestLinks = input.links
    .map((link, index) =>
      input.links.length > 1 ? `${index + 1}. ${link}` : link,
    )
    .join("\n");
  const response = await sendConfiguredTemplateEmail({
    templateKey: "track_request_access",
    to: input.to,
    values: {
      customer_name: input.to.split("@")[0] || "there",
      customer_email: input.to,
      access_link: primary || siteUrl,
      request_links: requestLinks,
      request_count: String(input.links.length),
      link_expiry: linkExpiry,
      site_url: siteUrl,
    },
  });
  return response.success;
}

export async function POST(request: NextRequest) {
  const started = Date.now();
  try {
    if (!isSameOrigin(request)) {
      await floor(started);
      return json({ success: true, message: GENERIC_MESSAGE });
    }

    const ipRate = await enforcePortalRateLimit({
      namespace: "track-request-public-ip-minute",
      identity: privacyHmac(requestClientAddress(request.headers), "ip"),
      limit: 5,
      windowSeconds: 60,
    });
    if (!ipRate.allowed) {
      await floor(started);
      return json({ success: true, message: GENERIC_MESSAGE }, 429);
    }

    const body = await request.json().catch(() => null);
    if (!body || !body.trackingRef || !body.email) {
      await floor(started);
      return json({ success: true, message: GENERIC_MESSAGE });
    }

    const trackingRef = normalizeTrackingReference(body.trackingRef);
    const email = normalizeEmail(body.email);
    const locale = body.locale === "th" ? "th" : "en";

    // Validate turnstile token (strictly required to prevent spam)
    const botCheck = await verifyTurnstileToken({
      token: body.turnstileToken,
      remoteIp: requestClientAddress(request.headers),
      expectedAction: "track_request",
    });
    if (!botCheck.success) {
      await floor(started);
      return json(
        { success: false, code: "BOT_CHECK_FAILED", error: "Security check failed." },
        403,
      );
    }

    const inputHash = privacyHmac(`${trackingRef}:${email}`, "session");
    const inputRate = await enforcePortalRateLimit({
      namespace: "track-request-input",
      identity: inputHash,
      limit: 4,
      windowSeconds: 3600,
    });
    if (!inputRate.allowed) {
      await floor(started);
      return json({ success: true, message: GENERIC_MESSAGE });
    }

    if (trackingRef.includes("SD-SV")) {
      // It's a service order
      const orderWhere = isUuidLike(trackingRef)
        ? or(eq(serviceOrders.trackingRef, trackingRef), eq(serviceOrders.trackingId, trackingRef))
        : eq(serviceOrders.trackingRef, trackingRef);
      const order = await db.query.serviceOrders.findFirst({
        where: orderWhere,
        columns: { id: true, contactEmailDigest: true },
      });
      if (order && order.contactEmailDigest === serviceContactEmailDigest(email)) {
        await rotatePortalAccessForRecovery(order.id, email);
      }
    } else {
      // It's a proposal
      const [row] = await db
        .select({
          id: proposals.id,
          userId: proposals.userId,
        })
        .from(proposals)
        .innerJoin(users, eq(users.id, proposals.userId))
        .where(
          and(
            or(...proposalReferenceConditions(trackingRef)),
            sql`lower(${users.email}) = ${email}`,
            sql`${proposals.status} NOT IN ('CANCELLED','EXPIRED','ARCHIVED')`,
          ),
        )
        .limit(1);

      if (row) {
        try {
          const magicLink = await issuePortalDispatchLink({
            proposalId: row.id,
            actorUserId: row.userId,
            locale,
          });
          await sendAccessEmail({ to: email, locale, links: [magicLink] });
        } catch (error) {
          console.error("[Track Magic Link] Failed to generate/send link", error);
        }
      }
    }
  } catch (error) {
    console.error("[Track Magic Link Error]", error);
  }

  await floor(started);
  return json({ success: true, message: GENERIC_MESSAGE });
}
