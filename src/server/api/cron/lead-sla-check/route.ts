import { NextResponse } from "next/server";
import { db } from "@/db";
import { inboundRequests } from "@/db/schema";
import { eq, and, lte } from "drizzle-orm";
import { notifySLABreach } from "@/lib/discord";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const authHeader = request.headers.get("Authorization");
    const secretParam = searchParams.get("secret");

    const expectedSecret = process.env.CRON_SECRET;

    if (expectedSecret) {
      const isValidBearer = authHeader === `Bearer ${expectedSecret}`;
      const isValidParam = secretParam === expectedSecret;

      if (!isValidBearer && !isValidParam) {
        return NextResponse.json(
          { success: false, error: "Unauthorized: Invalid Cron Secret" },
          { status: 401 }
        );
      }
    }

    // 1. Query inbound_requests for NEW leads older than 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const breachedLeads = await db
      .select()
      .from(inboundRequests)
      .where(
        and(
          eq(inboundRequests.status, "NEW"),
          lte(inboundRequests.createdAt, twentyFourHoursAgo)
        )
      );

    if (breachedLeads.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No SLA breach leads found (>24h uncontacted).",
        breachedCount: 0,
      });
    }

    // 2. Format breach data for Discord alert
    const uncontactedLeads = breachedLeads.map((lead) => {
      const ageHours = Math.round(
        (Date.now() - new Date(lead.createdAt).getTime()) / (1000 * 60 * 60)
      );

      return {
        id: lead.id,
        name: lead.customerName,
        phone: lead.phone,
        ageHours,
      };
    });

    // 3. Trigger Discord SLA Alert Webhook
    await notifySLABreach({ uncontactedLeads });

    return NextResponse.json({
      success: true,
      message: `SLA breach alert triggered for ${uncontactedLeads.length} uncontacted lead(s).`,
      breachedCount: uncontactedLeads.length,
      leads: uncontactedLeads,
    });
  } catch (error) {
    console.error("GET /api/cron/lead-sla-check error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to run SLA check",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}
