import { NextResponse } from "next/server";
import { db } from "@/db";
import { enqueueLifecycleNotification } from "@/server/services/communications/lifecycle-notifications";
import type { LifecyclePayload } from "@/lib/customerLifecycle";

export async function POST(request: Request) {
  try {
    const payload: LifecyclePayload = await request.json();
    if (!payload.customerName || !payload.phone) {
      return NextResponse.json(
        { success: false, error: "customerName and phone are required" },
        { status: 400 }
      );
    }

    const notificationOperationId = await enqueueLifecycleNotification(db, {
      eventType: "REQUEST_RECEIVED",
      payload,
      aggregateId: payload.leadId || undefined,
    });
    return NextResponse.json({ success: true, phase: "REQUEST", queued: true, notificationOperationId });
  } catch (error) {
    console.error("POST /api/lifecycle/request error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to process request phase transition" },
      { status: 500 }
    );
  }
}
