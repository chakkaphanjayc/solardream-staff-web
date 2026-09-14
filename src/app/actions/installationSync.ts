"use server";

import { count, desc, like } from "drizzle-orm";

import { db } from "@/db";
import { installationWorkflowProjects, integrationOutbox } from "@/db/schema";
import { requireAdmin } from "@/lib/auth-guard";
import { INSTALLATION_ERPNEXT_TOPICS, isInstallationErpnextSyncEnabled } from "@/lib/installationErpnextSync";

const INSTALLATION_TOPIC_PATTERN = "installation.%";

type CountRow = {
  status: string;
  count: number;
};

function countByStatus(rows: CountRow[]) {
  return Object.fromEntries(rows.map((row) => [row.status, row.count]));
}

export async function getInstallationSyncMonitor() {
  await requireAdmin();

  const [projectStatusRows, outboxStatusRows, projects, events] = await Promise.all([
    db.select({
      status: installationWorkflowProjects.erpnextSyncStatus,
      count: count(),
    })
      .from(installationWorkflowProjects)
      .groupBy(installationWorkflowProjects.erpnextSyncStatus),
    db.select({
      status: integrationOutbox.status,
      count: count(),
    })
      .from(integrationOutbox)
      .where(like(integrationOutbox.topic, INSTALLATION_TOPIC_PATTERN))
      .groupBy(integrationOutbox.status),
    db.query.installationWorkflowProjects.findMany({
      columns: {
        id: true,
        proposalId: true,
        projectCode: true,
        status: true,
        sourceVersion: true,
        erpnextProjectId: true,
        erpnextSyncStatus: true,
        erpnextSyncError: true,
        lastSyncedAt: true,
        permitStatus: true,
        permitAuthority: true,
        permitApplicationNumber: true,
        permitSubmittedAt: true,
        updatedAt: true,
      },
      orderBy: [desc(installationWorkflowProjects.updatedAt)],
      limit: 40,
    }),
    db.query.integrationOutbox.findMany({
      where: like(integrationOutbox.topic, INSTALLATION_TOPIC_PATTERN),
      columns: {
        id: true,
        topic: true,
        aggregateId: true,
        status: true,
        attempts: true,
        lastError: true,
        availableAt: true,
        processedAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [desc(integrationOutbox.createdAt)],
      limit: 60,
    }),
  ]);

  return {
    enabled: isInstallationErpnextSyncEnabled(),
    topics: [...INSTALLATION_ERPNEXT_TOPICS],
    projectCounts: countByStatus(projectStatusRows),
    outboxCounts: countByStatus(outboxStatusRows),
    projects: projects.map((project) => ({
      ...project,
      lastSyncedAt: project.lastSyncedAt?.toISOString() || null,
      permitSubmittedAt: project.permitSubmittedAt?.toISOString() || null,
      updatedAt: project.updatedAt.toISOString(),
    })),
    events: events.map((event) => ({
      ...event,
      availableAt: event.availableAt.toISOString(),
      processedAt: event.processedAt?.toISOString() || null,
      createdAt: event.createdAt.toISOString(),
      updatedAt: event.updatedAt.toISOString(),
    })),
  };
}
