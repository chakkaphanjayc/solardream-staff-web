import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { enforcePortalRateLimit } from "@/lib/portalRateLimit";
import { isSameOrigin, privacyHmac, requestClientAddress } from "@/lib/privacyConsent";
import { reserveNominatimRequestSlot, reverseNominatim } from "@/lib/serviceGeocoding";

export { GET } from "@/server/api/services/location/search/route";

const reverseSchema = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }).strict();

export async function POST(request: NextRequest) {
  try {
    if (!isSameOrigin(request)) return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });
    const input = reverseSchema.parse(await request.json());
    const ipRate = await enforcePortalRateLimit({ namespace: "nominatim-reverse-ip", identity: privacyHmac(requestClientAddress(request.headers), "ip"), limit: 30, windowSeconds: 3600 });
    if (!ipRate.allowed || !(await reserveNominatimRequestSlot())) return NextResponse.json({ success: false, error: "Location lookup is temporarily rate limited." }, { status: 429 });
    const location = await reverseNominatim(input.latitude, input.longitude);
    return NextResponse.json({ success: true, location }, { headers: { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof z.ZodError ? "Invalid map coordinates." : "Location lookup is unavailable." }, { status: error instanceof z.ZodError ? 400 : 503, headers: { "Cache-Control": "private, no-store, max-age=0" } });
  }
}
