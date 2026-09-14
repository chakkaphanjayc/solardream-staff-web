import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { enforcePortalRateLimit } from "@/lib/portalRateLimit";
import { isSameOrigin, privacyHmac, requestClientAddress } from "@/lib/privacyConsent";
import { reserveNominatimRequestSlot, searchNominatim } from "@/lib/serviceGeocoding";

const querySchema = z.string().trim().min(3).max(160);
export async function GET(request: NextRequest) { try { if (!isSameOrigin(request)) return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 }); const query = querySchema.parse(new URL(request.url).searchParams.get("q")); const ipRate = await enforcePortalRateLimit({ namespace: "nominatim-ip", identity: privacyHmac(requestClientAddress(request.headers), "ip"), limit: 20, windowSeconds: 3600 }); if (!ipRate.allowed || !(await reserveNominatimRequestSlot())) return NextResponse.json({ success: false, error: "Location search is temporarily rate limited." }, { status: 429 }); return NextResponse.json({ success: true, results: await searchNominatim(query), attribution: "© OpenStreetMap contributors" }, { headers: { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" } }); } catch (error) { return NextResponse.json({ success: false, error: error instanceof z.ZodError ? "Enter a complete location search." : "Location search is unavailable." }, { status: error instanceof z.ZodError ? 400 : 503, headers: { "Cache-Control": "private, no-store, max-age=0" } }); } }
