import { NextResponse } from "next/server";
import { NotificationOrchestrator } from "@/lib/notificationOrchestrator";
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

    const result = await NotificationOrchestrator("PROJECT_COMPLETED", payload);
    return NextResponse.json({
      success: true,
      phase: "AFTER_SALE",
      richMenuSwapped: result.channelsDispatched.includes("line_rich_menu_swapped"),
      result,
    });
  } catch (error) {
    console.error("POST /api/lifecycle/complete-project error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to process project completion transition" },
      { status: 500 }
    );
  }
}
