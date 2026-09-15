import { NextResponse } from "next/server";
import { db } from "@/db";
import { enqueueLifecycleNotification } from "@/server/services/communications/lifecycle-notifications";
import type { LifecyclePayload } from "@/lib/customerLifecycle";

export async function POST(request: Request) {
  try {
    const payload: LifecyclePayload = await request.json();
    if (!payload.milestone) {
      return NextResponse.json(
        { success: false, error: "milestone phase status is required" },
        { status: 400 }
      );
    }

    const notificationOperationId = await enqueueLifecycleNotification(db, {
      eventType: "PROJECT_UPDATE",
      payload,
      aggregateId: payload.projectId || undefined,
    });
    return NextResponse.json({ success: true, phase: "PROJECT", queued: true, notificationOperationId });
  } catch (error) {
    console.error("POST /api/lifecycle/project-update error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to process project milestone update" },
      { status: 500 }
    );
  }
}
