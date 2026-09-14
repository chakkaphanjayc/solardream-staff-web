import { eq, or } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import { serviceOrders } from "@/db/schema";
import { enforcePortalRateLimit } from "@/lib/portalRateLimit";
import { isSameOrigin, privacyHmac, requestClientAddress } from "@/lib/privacyConsent";
import { portalRecoverySchema } from "@/lib/servicePortalContracts";
import { rotatePortalAccessForRecovery, serviceContactEmailDigest } from "@/lib/servicePortal";
import { isUuidLike, normalizeTrackingReference } from "@/lib/trackingReference";

const floor = (started: number) => new Promise((resolve) => setTimeout(resolve, Math.max(0, 650 - (Date.now() - started))));
export async function POST(request: NextRequest) {
  const started = Date.now(); const generic = () => NextResponse.json({ success: true, message: "If the details match an eligible service order, a secure link will be sent." }, { status: 202, headers: { "Cache-Control": "private, no-store, max-age=0" } });
  try {
    if (!isSameOrigin(request)) { await floor(started); return generic(); }
    const parsed = portalRecoverySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) { await floor(started); return generic(); }
    const ip = privacyHmac(requestClientAddress(request.headers), "ip"); const emailDigest = serviceContactEmailDigest(parsed.data.email);
    const [ipRate, emailRate] = await Promise.all([
      enforcePortalRateLimit({ namespace: "service-portal-recovery-ip", identity: ip, limit: 5, windowSeconds: 900 }),
      enforcePortalRateLimit({ namespace: "service-portal-recovery-email", identity: emailDigest, limit: 3, windowSeconds: 3600 }),
    ]);
    if (ipRate.allowed && emailRate.allowed) {
      const normalizedReference = normalizeTrackingReference(parsed.data.orderReference);
      const orderWhere = isUuidLike(parsed.data.orderReference)
        ? or(eq(serviceOrders.trackingRef, normalizedReference), eq(serviceOrders.trackingId, parsed.data.orderReference))
        : eq(serviceOrders.trackingRef, normalizedReference);
      const order = await db.query.serviceOrders.findFirst({ where: orderWhere, columns: { id: true, customerUserId: true, contactEmailDigest: true, paymentStatus: true, paymentRequirement: true, portalClosedAt: true } });
      if (
        order?.customerUserId === null &&
        !order.portalClosedAt &&
        order.contactEmailDigest === emailDigest &&
        (order.paymentRequirement === "NOT_REQUIRED" || ["VERIFIED", "PAID"].includes(order.paymentStatus))
      ) await rotatePortalAccessForRecovery(order.id, parsed.data.email);
    }
  } catch (error) { console.error("[Service Portal Recovery] Request handling failed.", error); }
  await floor(started); return generic();
}
