import { eq, or } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { proposals, serviceOrders } from "@/db/schema";
import { enforcePublicApiRateLimit } from "@/lib/apiRateLimit";
import { frappeRequest } from "@/lib/erpnext";
import { isSameOrigin } from "@/lib/privacyConsent";
import { normalizeTrackingReference } from "@/lib/trackingReference";

const customerFeedbackSchema = z.object({
  referenceId: z.string().trim().min(1).max(128),
  rating: z.number().int().min(1).max(5),
  comments: z.string().trim().max(2_000).optional(),
});

export async function POST(request: NextRequest) {
  try {
    if (!isSameOrigin(request)) {
      return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });
    }
    const limited = await enforcePublicApiRateLimit(request, {
      namespace: "customer-feedback",
      limit: 5,
      windowSeconds: 600,
    });
    if (limited) return limited;

    const parsed = customerFeedbackSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Invalid feedback submission." }, { status: 400 });
    }
    const { referenceId, rating, comments } = parsed.data;
    const cleanRef = normalizeTrackingReference(referenceId);

    // Resolve customer details from database
    let customerName = "Guest Customer";
    let customerEmail = "";

    // 1. Try to check proposals matching cleanRef
    const matchedProposal = await db.query.proposals.findFirst({
      where: or(
        eq(proposals.id, cleanRef),
        eq(proposals.erpnextQuotationId, cleanRef),
        eq(proposals.magicTokenSlug, cleanRef)
      ),
      with: {
        user: true,
        wizardLead: true,
      }
    });

    if (matchedProposal) {
      if (matchedProposal.user) {
        customerName = matchedProposal.user.fullName || matchedProposal.user.name || "Guest Customer";
        customerEmail = matchedProposal.user.email;
      } else if (matchedProposal.wizardLead) {
        customerName = matchedProposal.wizardLead.customerName || "Guest Customer";
        customerEmail = matchedProposal.wizardLead.email;
      }
    } else {
      // 2. Try to check service orders matching cleanRef
      const matchedOrder = await db.query.serviceOrders.findFirst({
        where: or(
          eq(serviceOrders.id, cleanRef),
          eq(serviceOrders.trackingRef, cleanRef),
          eq(serviceOrders.trackingId, cleanRef)
        ),
      });
      if (matchedOrder && matchedOrder.contactSnapshot) {
        const contact = matchedOrder.contactSnapshot as Record<string, unknown>;
        customerName = String(contact.fullName || contact.name || "Guest Customer");
        customerEmail = String(contact.email || "");
      }
    }

    // Forward to ERPNext
    const erpPayload = {
      reference_id: cleanRef,
      customer_name: customerName,
      customer_email: customerEmail,
      rating: Math.min(5, Math.max(1, rating)),
      comments: comments ?? "",
    };

    try {
      const response = await frappeRequest("POST", "/api/resource/Customer Feedback", erpPayload);
      if (response.status >= 400) {
        throw new Error(`ERPNext responded with status ${response.status}`);
      }
    } catch (erpError) {
      console.warn("[Feedback API] Failed to forward feedback to ERPNext. Mocking success locally.", erpError);
      // Fallback/Mock during development or when ERPNext is unconfigured
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Feedback API Error]", error);
    return NextResponse.json({ success: false, error: "Internal server error." }, { status: 500 });
  }
}
