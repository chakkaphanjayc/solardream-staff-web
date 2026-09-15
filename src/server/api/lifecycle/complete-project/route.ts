import { NextResponse } from "next/server";
import { db } from "@/db";
import { enqueueLifecycleNotification } from "@/server/services/communications/lifecycle-notifications";
import type { LifecyclePayload } from "@/lib/customerLifecycle";

export async function POST(request: Request) {
  try {
    const payload: LifecyclePayload = await request.json();
    if (!payload.customerName) {
      return NextResponse.json(
        { success: false, error: "customerName is required" },
        { status: 400 }
      );
    }

    const notificationOperationId = await enqueueLifecycleNotification(db, {
      eventType: "PROJECT_COMPLETED",
      payload,
      aggregateId: payload.projectId || undefined,
    });
    return NextResponse.json({
      success: true,
      phase: "AFTER_SALE",
      queued: true,
      richMenuSwapped: false,
      pendingRichMenuSwap: true,
      notificationOperationId,
    });
  } catch (error) {
    console.error("POST /api/lifecycle/complete-project error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to process project completion transition" },
      { status: 500 }
    );
  }
}
