import { NextResponse } from "next/server";

import { getCachedWebsiteSettings } from "@/lib/websiteSettings";

export async function GET() {
  try {
    return NextResponse.json(
      { success: true, settings: await getCachedWebsiteSettings() },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      },
    );
  } catch (error) {
    console.error("[Website Settings API]", error);
    return NextResponse.json(
      { success: false, error: "Website settings are unavailable." },
      { status: 503 },
    );
  }
}
