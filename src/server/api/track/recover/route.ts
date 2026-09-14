import { and, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { proposals, serviceOrders, users, consultationLeads } from "@/db/schema";
import { sendConfiguredTemplateEmail } from "@/lib/email";
import { enforcePortalRateLimit } from "@/lib/portalRateLimit";
import { isSameOrigin, privacyHmac, requestClientAddress } from "@/lib/privacyConsent";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { getSigningSecret } from "@/lib/portalTokens";
import { signHs256Jwt } from "@/lib/signedJwt";
import { getConfiguredPublicSiteUrl } from "@/lib/siteUrl";
import { serviceContactEmailDigest } from "@/lib/servicePortal";

const GENERIC_MESSAGE =
  "If the provided details match any orders in our records, a secure access link will be sent to your inbox.";

const floor = (started: number) =>
  new Promise((resolve) =>
    setTimeout(resolve, Math.max(0, 700 - (Date.now() - started))),
  );

function json(body: unknown, status = 200) {
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

export async function POST(request: NextRequest) {
  const started = Date.now();
  try {
    if (!isSameOrigin(request)) {
      await floor(started);
      return json({ success: true, message: GENERIC_MESSAGE });
    }

    const body = await request.json().catch(() => null);
    if (!body || !body.email) {
      await floor(started);
      return json({ success: true, message: GENERIC_MESSAGE });
    }

    const email = body.email.trim().toLowerCase();
    const phoneLast4 = body.phoneLast4 ? body.phoneLast4.trim().replace(/\D/g, "") : "";
    const locale = body.locale === "th" ? "th" : "en";

    // Validate turnstile token (strictly required to prevent automated spam)
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

    // IP rate limit
    const ipRate = await enforcePortalRateLimit({
      namespace: "track-recovery-ip-minute",
      identity: privacyHmac(requestClientAddress(request.headers), "ip"),
      limit: 5,
      windowSeconds: 60,
    });
    if (!ipRate.allowed) {
      await floor(started);
      return json({ success: true, message: GENERIC_MESSAGE }, 429);
    }

    // Email rate limit
    const emailRate = await enforcePortalRateLimit({
      namespace: "track-recovery-email",
      identity: privacyHmac(email, "session"),
      limit: 5,
      windowSeconds: 3600,
    });
    if (!emailRate.allowed) {
      await floor(started);
      return json({ success: true, message: GENERIC_MESSAGE });
    }

    let hasMatch = false;

    // 1. Check users
    const matchedUsers = await db.query.users.findMany({
      where: eq(users.email, email),
    });
    for (const u of matchedUsers) {
      if (phoneLast4) {
        const cleanPhone = (u.phoneNumber || "").replace(/\D/g, "");
        if (!cleanPhone.endsWith(phoneLast4)) continue;
      }
      // Look up if they have any proposals or service orders
      const userProposals = await db.query.proposals.findFirst({
        where: and(
          eq(proposals.userId, u.id),
          sql`${proposals.status} NOT IN ('CANCELLED','EXPIRED','ARCHIVED')`
        ),
      });
      const userOrders = await db.query.serviceOrders.findFirst({
        where: eq(serviceOrders.customerUserId, u.id),
      });
      if (userProposals || userOrders) {
        hasMatch = true;
        break;
      }
    }

    // 2. Check consultation leads if no user match
    if (!hasMatch) {
      const matchedLeads = await db.query.consultationLeads.findMany({
        where: eq(consultationLeads.email, email),
      });
      for (const l of matchedLeads) {
        if (phoneLast4) {
          const cleanPhone = (l.phone || "").replace(/\D/g, "");
          if (!cleanPhone.endsWith(phoneLast4)) continue;
        }
        const leadProposals = await db.query.proposals.findFirst({
          where: and(
            eq(proposals.wizardLeadId, l.id),
            sql`${proposals.status} NOT IN ('CANCELLED','EXPIRED','ARCHIVED')`
          ),
        });
        if (leadProposals) {
          hasMatch = true;
          break;
        }
      }
    }

    // 3. Check service orders if still no match
    if (!hasMatch) {
      const matchedOrders = await db.query.serviceOrders.findMany({
        where: eq(serviceOrders.contactEmailDigest, serviceContactEmailDigest(email)),
      });
      for (const o of matchedOrders) {
        if (phoneLast4) {
          const phone = typeof o.contactSnapshot === "object" && o.contactSnapshot !== null && "phone" in o.contactSnapshot
            ? String((o.contactSnapshot as Record<string, unknown>).phone)
            : "";
          const cleanPhone = phone.replace(/\D/g, "");
          if (!cleanPhone.endsWith(phoneLast4)) continue;
        }
        hasMatch = true;
        break;
      }
    }

    if (hasMatch) {
      const secret = await getSigningSecret();
      const token = signHs256Jwt(
        { typ: "guest_master_session", email },
        secret,
      );

      const siteUrl = getConfiguredPublicSiteUrl();
      const magicUrl = new URL("/api/auth/verify-guest", siteUrl);
      magicUrl.searchParams.set("mode", "guest");
      magicUrl.searchParams.set("locale", locale);
      magicUrl.searchParams.set("token", token);
      const masterMagicLink = magicUrl.toString();

      const linkExpiry =
        locale === "th"
          ? "ลิงก์นี้ใช้งานได้จนกว่าคำขอที่เกี่ยวข้องจะเสร็จสิ้นหรือถูกยกเลิก"
          : "This link remains valid until the related request is completed or cancelled.";

      await sendConfiguredTemplateEmail({
        templateKey: "track_request_access",
        to: email,
        values: {
          customer_name: email.split("@")[0] || "there",
          customer_email: email,
          access_link: masterMagicLink,
          request_links: masterMagicLink,
          request_count: "all",
          link_expiry: linkExpiry,
          site_url: siteUrl,
        },
      });
    }
  } catch (error) {
    console.error("[Track Recovery Error]", error);
  }

  await floor(started);
  return json({ success: true, message: GENERIC_MESSAGE });
}
