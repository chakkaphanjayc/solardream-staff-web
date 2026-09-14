import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { enforcePublicApiRateLimit } from "@/lib/apiRateLimit";
import { frappeRequest } from "@/lib/erpnext";
import { isSameOrigin } from "@/lib/privacyConsent";

const websiteFeedbackSchema = z.object({
  reference_id: z.string().trim().min(1).max(128),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(2_000).optional(),
  source: z.enum(["wizard", "build", "services"]),
});

export async function POST(request: NextRequest) {
  try {
    if (!isSameOrigin(request)) {
      return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });
    }
    const limited = await enforcePublicApiRateLimit(request, {
      namespace: "website-feedback",
      limit: 5,
      windowSeconds: 600,
    });
    if (limited) return limited;

    const parsed = websiteFeedbackSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Invalid feedback submission." }, { status: 400 });
    }
    const { reference_id, rating, comment, source } = parsed.data;

    const erpPayload = {
      reference_id,
      rating,
      comment: comment ?? "",
      source,
    };

    try {
      const response = await frappeRequest("POST", "/api/resource/Website UX Feedback", erpPayload);
      if (response.status >= 400) {
        throw new Error(`ERPNext responded with status ${response.status}`);
      }
    } catch (erpError) {
      console.warn("[Website Feedback API] Failed to forward feedback to ERPNext. Mocking success locally.", erpError);
      // Fallback/Mock during development or when ERPNext is unconfigured
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Website Feedback API Error]", error);
    return NextResponse.json({ success: false, error: "Internal server error." }, { status: 500 });
  }
}
