import { NextResponse } from "next/server";
import { NotificationOrchestrator } from "@/lib/notificationOrchestrator";
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

    const result = await NotificationOrchestrator("PROJECT_UPDATE", payload);
    return NextResponse.json({ success: true, phase: "PROJECT", result });
  } catch (error) {
    console.error("POST /api/lifecycle/project-update error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to process project milestone update" },
      { status: 500 }
    );
  }
}
