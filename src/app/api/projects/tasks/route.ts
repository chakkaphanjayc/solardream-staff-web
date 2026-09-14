import { NextResponse } from "next/server";
import { getDeliveryProjectsAndTasksAction, assignDeliveryTaskAction } from "@/app/actions/deliveryTasks";

export async function GET() {
  const result = await getDeliveryProjectsAndTasksAction();
  if (!result.success) {
    return NextResponse.json({ error: result.error || "Failed to fetch tasks" }, { status: 500 });
  }
  return NextResponse.json({
    projects: result.projects || [],
    tasks: result.tasks || [],
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { taskId, technicianUserId, startDate, endDate } = body;

    if (!taskId || !technicianUserId || !startDate || !endDate) {
      return NextResponse.json(
        { error: "Missing required fields: taskId, technicianUserId, startDate, endDate" },
        { status: 400 }
      );
    }

    const result = await assignDeliveryTaskAction({
      taskId,
      technicianUserId,
      startDate,
      endDate,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error || "Failed to assign task" }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      eventLink: result.eventLink,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process task assignment" },
      { status: 500 }
    );
  }
}
