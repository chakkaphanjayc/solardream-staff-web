import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { listServiceConfig } from "@/lib/serviceMultiCommerce";

const cached = unstable_cache(listServiceConfig, ["public-service-config-v1"], { revalidate: 300, tags: ["service-config"] });
export async function GET() { try { return NextResponse.json({ success: true, config: await cached() }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }); } catch { return NextResponse.json({ success: false, error: "Service configuration is unavailable." }, { status: 503 }); } }
