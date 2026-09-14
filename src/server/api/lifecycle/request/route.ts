import { NextResponse } from "next/server";
import { NotificationOrchestrator } from "@/lib/notificationOrchestrator";
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

    const result = await NotificationOrchestrator("REQUEST_RECEIVED", payload);
    return NextResponse.json({ success: true, phase: "REQUEST", result });
  } catch (error) {
    console.error("POST /api/lifecycle/request error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to process request phase transition" },
      { status: 500 }
    );
  }
}
