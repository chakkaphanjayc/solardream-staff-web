import { asc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import { serviceOrderItems, serviceOrders, servicePortalAuditEvents } from "@/db/schema";
import { maskPortalEmail } from "@/lib/servicePortalContracts";
import { resolvePortalSession, SERVICE_PORTAL_SESSION_COOKIE } from "@/lib/servicePortal";
import { enforcePortalRateLimit } from "@/lib/portalRateLimit";
import { privacyHmac, requestClientAddress } from "@/lib/privacyConsent";
import { deriveServiceTrackingReference } from "@/lib/trackingReference";

function json(body: unknown, status = 200) { return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store, max-age=0", "Pragma": "no-cache", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'" } }); }
export async function GET(request: NextRequest) {
  try {
    const ipRate = await enforcePortalRateLimit({ namespace: "service-portal-status-ip", identity: privacyHmac(requestClientAddress(request.headers), "ip"), limit: 60, windowSeconds: 60 });
    if (!ipRate.allowed) return json({ success: false, error: "Too many requests." }, 429);
    const token = await resolvePortalSession(request.cookies.get(SERVICE_PORTAL_SESSION_COOKIE)?.value); if (!token) return json({ success: false, error: "Unauthorized." }, 401);
    const tokenRate = await enforcePortalRateLimit({ namespace: "service-portal-status-token", identity: token.id, limit: 60, windowSeconds: 60 });
    if (!tokenRate.allowed) return json({ success: false, error: "Too many requests." }, 429);
    const order = await db.query.serviceOrders.findFirst({ where: eq(serviceOrders.id, token.serviceOrderId) }); if (!order) return json({ success: false, error: "Service order not found." }, 404);
    const contact = order.contactSnapshot && typeof order.contactSnapshot === "object" && !Array.isArray(order.contactSnapshot) ? order.contactSnapshot as Record<string, unknown> : {};
    const email = typeof contact.email === "string" ? contact.email : ""; const phone = typeof contact.phone === "string" ? contact.phone : ""; const fullName = typeof contact.fullName === "string" ? contact.fullName : "";
    const timeline = await db.select({ eventType: servicePortalAuditEvents.eventType, createdAt: servicePortalAuditEvents.createdAt }).from(servicePortalAuditEvents).where(eq(servicePortalAuditEvents.serviceOrderId, order.id)).orderBy(asc(servicePortalAuditEvents.createdAt)).limit(100);
    const offering = order.offeringSnapshot && typeof order.offeringSnapshot === "object" && !Array.isArray(order.offeringSnapshot) ? order.offeringSnapshot as Record<string, unknown> : {};
    const items = await db.select({ snapshot: serviceOrderItems.offeringSnapshot, totalSatang: serviceOrderItems.totalSatang }).from(serviceOrderItems).where(eq(serviceOrderItems.serviceOrderId, order.id));
    const paymentActionAvailable = order.paymentRequirement === "REQUIRED" && order.paymentStatus === "UNPAID";
    const publicReference = order.trackingRef || deriveServiceTrackingReference(order.trackingId);
    return json({ success: true, order: { reference: publicReference, status: order.status, paymentStatus: order.paymentRequirement === "NOT_REQUIRED" ? "NOT_REQUIRED" : order.paymentStatus, paymentRequirement: order.paymentRequirement, erpSyncStatus: order.erpPaymentSyncStatus, paymentActionAvailable, checkoutDisposition: order.checkoutDisposition, pricing: order.paymentRequirement === "NOT_REQUIRED" ? null : { subtotalSatang: order.subtotalSatang, discountSatang: order.discountSatang, totalSatang: order.totalSatang, currency: order.currency }, appointmentDate: order.appointmentDate, offering: { name: offering.name, durationMinutes: offering.durationMinutes }, items: items.map((item) => { const snapshot = item.snapshot && typeof item.snapshot === "object" && !Array.isArray(item.snapshot) ? item.snapshot as Record<string, unknown> : {}; return { slug: snapshot.slug, name: snapshot.name, totalSatang: order.paymentRequirement === "NOT_REQUIRED" ? null : item.totalSatang }; }), contact: { fullName: fullName ? `${fullName.slice(0, 1)}***` : "***", email: maskPortalEmail(email), phone: phone ? `***${phone.replace(/\D/g, "").slice(-4)}` : "***" }, timeline } });
  } catch (error) { console.error("[Service Portal Status]", error); return json({ success: false, error: "Service status is temporarily unavailable." }, 503); }
}
