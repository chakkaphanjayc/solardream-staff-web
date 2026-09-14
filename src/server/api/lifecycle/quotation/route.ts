import { NextResponse } from "next/server";
import { NotificationOrchestrator } from "@/lib/notificationOrchestrator";
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

    const result = await NotificationOrchestrator("QUOTATION_READY", payload);
    return NextResponse.json({ success: true, phase: "QUOTATION", result });
  } catch (error) {
    console.error("POST /api/lifecycle/quotation error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to process quotation phase transition" },
      { status: 500 }
    );
  }
}
