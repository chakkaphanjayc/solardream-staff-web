import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import { consultationLeads, proposals, serviceOrders, users } from "@/db/schema";
import { sendConfiguredTemplateEmail } from "@/lib/email";
import { enforcePortalRateLimit } from "@/lib/portalRateLimit";
import { issuePortalDispatchLink } from "@/lib/portalTokens";
import { isSameOrigin, privacyHmac, requestClientAddress } from "@/lib/privacyConsent";
import {
  rotatePortalAccessForRecovery,
  serviceContactEmailDigest,
} from "@/lib/servicePortal";
import { smartTrackRequestSchema } from "@/lib/servicePortalContracts";
import { getConfiguredPublicSiteUrl } from "@/lib/siteUrl";
import {
  isUuidLike,
  normalizeTrackingReference,
} from "@/lib/trackingReference";
import { verifyTurnstileToken } from "@/lib/turnstile";
import type { Locale } from "@/i18n/locales";

const GENERIC_MESSAGE =
  "If a request is linked to these details, a secure access link has been sent.";

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

function isLikelyEmail(value: string) {
  return /^\S+@\S+\.\S+$/.test(value.trim());
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizeReference(value: string) {
  return normalizeTrackingReference(value.trim());
}

function referenceWithoutKnownPrefix(value: string) {
  return value
    .trim()
    .replace(/^(QT|QTN|TRK|REF)-/i, "")
    .trim();
}

function proposalReferenceConditions(reference: string) {
  const cleanReference = normalizeReference(reference);
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

function consultationLeadReferenceConditions(reference: string) {
  const cleanReference = normalizeReference(reference);
  const shortReference = referenceWithoutKnownPrefix(cleanReference);
  const conditions = [
    eq(consultationLeads.id, cleanReference),
    sql`${consultationLeads.rawPayload}->>'trackingRef' = ${cleanReference}`,
    sql`${consultationLeads.rawPayload}->>'trackingId' = ${cleanReference}`,
    sql`${consultationLeads.dynamicCalculations}->>'trackingRef' = ${cleanReference}`,
    sql`('SD-QT-' || upper(substr(translate(replace(${consultationLeads.id}::text, '-', ''), '01ILO', '23444'), 1, 6))) = ${cleanReference}`,
  ];

  if (/^[a-z0-9]{6,16}$/i.test(shortReference)) {
    conditions.push(
      sql`upper(substring(${consultationLeads.id}::text from 1 for ${shortReference.length})) = ${shortReference.toUpperCase()}`,
    );
  }

  return conditions;
}

async function sendAccessEmail(input: {
  to: string;
  locale: Locale;
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
  if (!response.success) {
    console.error("[Track Request] Configured access email failed.", {
      to: input.to,
      error: response.error || response.reason,
    });
  }
  return response.success;
}

async function collectProposalLinksByEmail(email: string, locale: Locale) {
  const rows = await db
    .select({
      id: proposals.id,
      userId: proposals.userId,
    })
    .from(proposals)
    .innerJoin(users, eq(users.id, proposals.userId))
    .where(
      and(
        sql`lower(${users.email}) = ${normalizeEmail(email)}`,
        sql`${proposals.status} NOT IN ('CANCELLED','EXPIRED','ARCHIVED')`,
      ),
    )
    .orderBy(desc(proposals.createdAt))
    .limit(5);
  const links: string[] = [];
  for (const row of rows) {
    try {
      links.push(
        await issuePortalDispatchLink({
          proposalId: row.id,
          actorUserId: row.userId,
          locale,
        }),
      );
    } catch (error) {
      console.error("[Track Request] Proposal link issue failed.", {
        proposalId: row.id,
        error,
      });
    }
  }
  return links;
}

async function collectProposalLinkByReference(
  reference: string,
  email: string,
  locale: Locale,
) {
  const cleanReference = normalizeReference(reference);
  const [row] = await db
    .select({
      id: proposals.id,
      userId: proposals.userId,
    })
    .from(proposals)
    .innerJoin(users, eq(users.id, proposals.userId))
    .where(
      and(
        or(...proposalReferenceConditions(cleanReference)),
        sql`lower(${users.email}) = ${normalizeEmail(email)}`,
        sql`${proposals.status} NOT IN ('CANCELLED','EXPIRED','ARCHIVED')`,
      ),
    )
    .limit(1);
  if (!row) return [];
  try {
    return [
      await issuePortalDispatchLink({
        proposalId: row.id,
        actorUserId: row.userId,
        locale,
      }),
    ];
  } catch (error) {
    console.error("[Track Request] Referenced proposal link issue failed.", {
      proposalId: row.id,
      error,
    });
    return [];
  }
}

async function recoverServiceByEmail(email: string) {
  const rows = await db.query.serviceOrders.findMany({
    where: and(
      eq(serviceOrders.contactEmailDigest, serviceContactEmailDigest(email)),
      isNull(serviceOrders.customerUserId),
      isNull(serviceOrders.portalClosedAt),
      sql`${serviceOrders.status} NOT IN ('COMPLETED','COMPLETE','CANCELLED','CANCELED','CLOSED')`,
    ),
    columns: { id: true },
    orderBy: [desc(serviceOrders.createdAt)],
    limit: 5,
  });
  for (const row of rows) {
    await rotatePortalAccessForRecovery(row.id, email);
  }
}

async function recoverServiceByReference(reference: string, email: string) {
  const normalizedReference = normalizeReference(reference);
  const orderWhere = isUuidLike(normalizedReference)
    ? or(eq(serviceOrders.trackingRef, normalizedReference), eq(serviceOrders.trackingId, normalizedReference))
    : eq(serviceOrders.trackingRef, normalizedReference);
  const order = await db.query.serviceOrders.findFirst({
    where: orderWhere,
    columns: { id: true },
  });
  if (order) await rotatePortalAccessForRecovery(order.id, email);
}

export async function POST(request: NextRequest) {
  const started = Date.now();
  try {
    if (!isSameOrigin(request)) {
      await floor(started);
      return json({ success: true, message: GENERIC_MESSAGE });
    }
    const strictIpRate = await enforcePortalRateLimit({
      namespace: "track-request-public-ip-minute",
      identity: privacyHmac(requestClientAddress(request.headers), "ip"),
      limit: 5,
      windowSeconds: 60,
    });
    if (!strictIpRate.allowed) {
      await floor(started);
      return json(
        { success: true, message: GENERIC_MESSAGE },
        429,
      );
    }
    const parsed = smartTrackRequestSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      await floor(started);
      return json({ success: true, message: GENERIC_MESSAGE });
    }
    const botCheck = await verifyTurnstileToken({
      token: parsed.data.turnstileToken,
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
    const { locale } = parsed.data;
    const query = isLikelyEmail(parsed.data.query)
      ? parsed.data.query.trim()
      : normalizeReference(parsed.data.query);
    const email = parsed.data.email || (isLikelyEmail(query) ? query : "");
    const ip = privacyHmac(requestClientAddress(request.headers), "ip");
    const inputHash = privacyHmac(`${query}:${email}`, "session");
    const [ipRate, inputRate] = await Promise.all([
      enforcePortalRateLimit({
        namespace: "track-request-ip",
        identity: ip,
        limit: 8,
        windowSeconds: 900,
      }),
      enforcePortalRateLimit({
        namespace: "track-request-input",
        identity: inputHash,
        limit: 4,
        windowSeconds: 3600,
      }),
    ]);
    if (!ipRate.allowed || !inputRate.allowed) {
      await floor(started);
      return json({ success: true, message: GENERIC_MESSAGE });
    }
    if (!email) {
      await floor(started);
      return json({
        success: true,
        needsEmail: true,
        message: GENERIC_MESSAGE,
      });
    }
    if (isLikelyEmail(query)) {
      await Promise.all([
        recoverServiceByEmail(email),
        collectProposalLinksByEmail(email, locale).then((links) =>
          sendAccessEmail({ to: email, locale, links }),
        ),
      ]);
    } else {
      const proposalLinks = await collectProposalLinkByReference(
        query,
        email,
        locale,
      );
      await Promise.all([
        recoverServiceByReference(query, email),
        sendAccessEmail({ to: email, locale, links: proposalLinks }),
      ]);
    }
  } catch (error) {
    console.error("[Track Request] Smart lookup failed.", error);
  }
  await floor(started);
  return json({ success: true, message: GENERIC_MESSAGE });
}
