import { Suspense } from "react";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { installationTasks, installationWorkflowProjects, proposals } from "@/db/schema";
import type { DeliveryTask } from "@/types/delivery";
import TechWorkOrderClient, { TechWorkOrderLoading } from "./TechWorkOrderClient";

type PageProps = {
  params: Promise<{
    locale: string;
    taskId: string;
  }>;
};

function getText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getConfig(proposal?: typeof proposals.$inferSelect | null): Record<string, unknown> {
  const data = proposal?.configurationData;
  return data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : {};
}

function getConfigText(proposal: typeof proposals.$inferSelect | null | undefined, ...keys: string[]): string | null {
  const config = getConfig(proposal);
  for (const key of keys) {
    const value = getText(config[key]);
    if (value) return value;
  }
  return null;
}

function getAddress(proposal?: typeof proposals.$inferSelect | null): string | null {
  return getText(proposal?.installationMapAddress)
    || getConfigText(proposal, "installationMapAddress", "installationAddress", "location", "address");
}

function getPositiveNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export default function TechWorkOrderPage({ params }: PageProps) {
  return (
    <Suspense fallback={<TechWorkOrderLoading />}>
      <TechWorkOrderContent params={params} />
    </Suspense>
  );
}

async function TechWorkOrderContent({ params }: PageProps) {
  const { taskId } = await params;

  const taskRow = await db.query.installationTasks.findFirst({
    where: eq(installationTasks.id, taskId),
  });

  if (!taskRow) return notFound();

  const projectRow = await db.query.installationWorkflowProjects.findFirst({
    where: eq(installationWorkflowProjects.id, taskRow.projectId),
  });

  if (!projectRow) return notFound();

  const proposal = await db.query.proposals.findFirst({
    where: eq(proposals.id, projectRow.proposalId),
    with: { user: true },
  });

  const task: DeliveryTask = {
    id: taskRow.id,
    projectId: taskRow.projectId,
    projectCode: projectRow.projectCode,
    erpnextTaskId: taskRow.erpnextTaskId,
    taskCode: taskRow.taskCode,
    title: taskRow.title,
    sequence: taskRow.sequence,
    status: (taskRow.status || "OPEN") as DeliveryTask["status"],
    assignedUserId: taskRow.assignedUserId,
    customerName: getText(proposal?.user?.fullName) || getText(proposal?.user?.name) || getConfigText(proposal, "clientName") || "",
    customerEmail: getText(proposal?.user?.email) || getConfigText(proposal, "email"),
    customerPhone: getConfigText(proposal, "phone", "phoneNumber", "contactPhoneNumber") || getText(proposal?.user?.phoneNumber),
    installationAddress: getAddress(proposal),
    systemSizeKwp: getPositiveNumber(proposal?.systemSizeKwp),
    panelCount: getPositiveNumber(proposal?.panelCount),
    inverterModel: getConfigText(proposal, "inverterModel"),
    createdAt: taskRow.createdAt.toISOString(),
    updatedAt: taskRow.updatedAt.toISOString(),
  };

  return <TechWorkOrderClient initialTask={task} />;
}
