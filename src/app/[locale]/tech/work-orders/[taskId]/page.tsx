import { notFound } from "next/navigation";
import { db } from "@/db";
import { installationTasks, installationWorkflowProjects, proposals } from "@/db/schema";
import { eq } from "drizzle-orm";
import TechWorkOrderClient from "./TechWorkOrderClient";
import type { DeliveryTask } from "@/types/delivery";

export const instant = false;

type PageProps = {
  params: Promise<{
    locale: string;
    taskId: string;
  }>;
};

function getAddress(proposal?: typeof proposals.$inferSelect | null): string {
  if (!proposal?.configurationData || typeof proposal.configurationData !== "object" || Array.isArray(proposal.configurationData)) {
    return "Customer Site Location";
  }
  const config = proposal.configurationData as Record<string, unknown>;
  const address = (typeof config.installationMapAddress === "string" && config.installationMapAddress)
    || (typeof config.location === "string" && config.location)
    || (typeof config.address === "string" && config.address);
  return address || "Customer Site Location";
}

export default async function TechWorkOrderPage({ params }: PageProps) {
  const { locale, taskId } = await params;

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
    customerName: proposal?.user?.fullName || proposal?.user?.name || "Solar Customer",
    customerEmail: proposal?.user?.email,
    customerPhone: proposal?.user?.phoneNumber,
    installationAddress: getAddress(proposal),
    systemSizeKwp: proposal?.systemSizeKwp || 5.5,
    panelCount: proposal?.panelCount || 10,
    inverterModel: "On-Grid Hybrid Smart Inverter 5kW",
    createdAt: taskRow.createdAt.toISOString(),
    updatedAt: taskRow.updatedAt.toISOString(),
  };

  return <TechWorkOrderClient locale={locale} initialTask={task} />;
}
