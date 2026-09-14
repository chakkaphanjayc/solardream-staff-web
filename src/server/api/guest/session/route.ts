import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { proposals, serviceOrders, users } from "@/db/schema";
import { enforcePortalRateLimit, getPortalClientAddress } from "@/lib/portalRateLimit";
import { getSigningSecret } from "@/lib/portalTokens";
import { serviceContactEmailDigest } from "@/lib/servicePortal";
import { verifyHs256Jwt } from "@/lib/signedJwt";
import { verifyTurnstileToken } from "@/lib/turnstile";

const sessionSchema = z.object({
  token: z.string().trim().min(20).max(512),
  turnstileToken: z.string().trim().min(1).max(4096).optional(),
});

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}

async function hasOpenGuestRequest(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return false;

  const [proposal] = await db
    .select({ id: proposals.id })
    .from(proposals)
    .innerJoin(users, eq(users.id, proposals.userId))
    .where(
      and(
        sql`lower(${users.email}) = ${normalizedEmail}`,
        sql`${proposals.status} NOT IN ('COMPLETED','COMPLETE','CANCELLED','CANCELED','CLOSED','ARCHIVED')`,
        sql`coalesce(${proposals.projectStatus}, '') NOT IN ('COMPLETED','COMPLETE','CANCELLED','CANCELED','CLOSED','ARCHIVED')`,
      ),
    )
    .limit(1);

  if (proposal) return true;

  const service = await db.query.serviceOrders.findFirst({
    where: and(
      eq(serviceOrders.contactEmailDigest, serviceContactEmailDigest(normalizedEmail)),
      isNull(serviceOrders.portalClosedAt),
      sql`${serviceOrders.status} NOT IN ('COMPLETED','COMPLETE','CANCELLED','CANCELED','CLOSED')`,
    ),
    columns: { id: true },
  });

  return Boolean(service);
}

export async function POST(request: NextRequest) {
  try {
    const rate = await enforcePortalRateLimit({
      namespace: "guest-session-exchange",
      identity: getPortalClientAddress(request.headers),
      limit: 5,
      windowSeconds: 60,
    });
    if (!rate.allowed) {
      return json({ success: false, error: "Too many requests." }, 429);
    }

    const parsed = sessionSchema.parse(await request.json());
    if (parsed.turnstileToken) {
      const botCheck = await verifyTurnstileToken({
        token: parsed.turnstileToken,
        remoteIp: getPortalClientAddress(request.headers),
        expectedAction: "guest_session_exchange",
      });
      if (!botCheck.success) {
        return json({ success: false, error: "Security check failed." }, 403);
      }
    }

    const secret = await getSigningSecret();
    const payload = verifyHs256Jwt(parsed.token, secret);
    if (!payload || payload.typ !== "guest_master_session" || typeof payload.email !== "string") {
      return json({ success: false, error: "Invalid or expired recovery token." }, 401);
    }
    if (!(await hasOpenGuestRequest(payload.email))) {
      return json(
        { success: false, error: "This link has expired because the request is closed." },
        401,
      );
    }

    const response = json({ success: true, email: payload.email });
    
    // Set cookie: sd_guest_email
    response.cookies.set("sd_guest_email", parsed.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7200, // 2 hours
      expires: new Date(Date.now() + 2 * 60 * 60 * 1000),
    });

    return response;
  } catch (error: unknown) {
    console.error("[Guest Session Exchange]", error);
    return json({ success: false, error: "Unable to establish guest session." }, 400);
  }
}

export async function DELETE() {
  const response = json({ success: true });
  response.cookies.set("sd_guest_email", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
