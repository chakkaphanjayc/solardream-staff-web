import { NextResponse } from "next/server";
import { db } from "@/db";
import { enqueueLifecycleNotification } from "@/server/services/communications/lifecycle-notifications";
import type { LifecyclePayload } from "@/lib/customerLifecycle";

export async function POST(request: Request) {
  try {
    const payload: LifecyclePayload = await request.json();
    if (!payload.customerName || (!payload.email && !payload.lineUserId)) {
      return NextResponse.json(
        { success: false, error: "customerName and at least email or lineUserId are required" },
        { status: 400 }
      );
    }

    const notificationOperationId = await enqueueLifecycleNotification(db, {
      eventType: "QUOTATION_READY",
      payload,
      aggregateId: payload.quotationId || undefined,
    });
    return NextResponse.json({ success: true, phase: "QUOTATION", queued: true, notificationOperationId });
  } catch (error) {
    console.error("POST /api/lifecycle/quotation error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to process quotation phase transition" },
      { status: 500 }
    );
  }
}
