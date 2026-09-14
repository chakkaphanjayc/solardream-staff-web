import "server-only";

import { and, count, desc, eq, inArray } from "drizzle-orm";

import { auditEvents, installationWorkflowProjects, integrationOutbox } from "@/db/schema";
import { db } from "@/db";
import { erpNextGateway, ERPNextGatewayError } from "@/server/services/integrations/erpnext-gateway";
import { OpsDomainError } from "@/lib/opsV2State";

const OUTBOX_RETRYABLE_STATUSES = ["PENDING", "RETRY", "PROCESSING", "DEAD"] as const;

function countByStatus(rows: Array<{ status: string; count: number }>) {
  return Object.fromEntries(rows.map((row) => [row.status, Number(row.count)]));
}

export async function getIntegrationCenterSnapshot() {
  const [outboxCounts, projectCounts, events] = await Promise.all([
    db.select({ status: integrationOutbox.status, count: count() })
      .from(integrationOutbox)
      .groupBy(integrationOutbox.status),
    db.select({ status: installationWorkflowProjects.erpnextSyncStatus, count: count() })
      .from(installationWorkflowProjects)
      .groupBy(installationWorkflowProjects.erpnextSyncStatus),
    db.query.integrationOutbox.findMany({
      columns: {
        id: true,
        topic: true,
        eventVersion: true,
        aggregateType: true,
        aggregateId: true,
        correlationId: true,
        dedupeKey: true,
        status: true,
        attempts: true,
        lastError: true,
        providerReference: true,
        availableAt: true,
        processedAt: true,
        deadAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [desc(integrationOutbox.updatedAt)],
      limit: 100,
    }),
  ]);

  return {
    configured: erpNextGateway.isConfigured(),
    installationSyncEnabled: process.env.ERPNEXT_INSTALLATION_SYNC_ENABLED?.trim().toLowerCase() === "true",
    outboxCounts: countByStatus(outboxCounts),
    projectCounts: countByStatus(projectCounts),
    events: events.map((event) => ({
      ...event,
      availableAt: event.availableAt.toISOString(),
      processedAt: event.processedAt?.toISOString() || null,
      deadAt: event.deadAt?.toISOString() || null,
      createdAt: event.createdAt.toISOString(),
      updatedAt: event.updatedAt.toISOString(),
    })),
  };
}

export async function checkERPNextConnection() {
  if (!erpNextGateway.isConfigured()) {
    throw new ERPNextGatewayError("CONFIGURATION", "ERPNext integration is not configured.");
  }
  return erpNextGateway.ping();
}

export async function retryIntegrationOutboxEvent(input: { eventId: string; actorUserId: string }) {
  if (!input.eventId.trim() || !input.actorUserId.trim()) {
    throw new OpsDomainError("INVALID_INPUT", "An outbox event and operator are required.");
  }

  return db.transaction(async (tx) => {
    const event = await tx.query.integrationOutbox.findFirst({
      where: eq(integrationOutbox.id, input.eventId),
    });
    if (!event) throw new OpsDomainError("NOT_FOUND", "Integration event was not found.");
    if (!OUTBOX_RETRYABLE_STATUSES.includes(event.status as (typeof OUTBOX_RETRYABLE_STATUSES)[number])) {
      throw new OpsDomainError("CONFLICT", "Only pending, processing, retry, or dead events can be retried.");
    }

    const now = new Date();
    const [updated] = await tx.update(integrationOutbox)
      .set({
        status: "RETRY",
        attempts: 0,
        lastError: null,
        availableAt: now,
        deadAt: null,
        updatedAt: now,
      })
      .where(and(eq(integrationOutbox.id, event.id), inArray(integrationOutbox.status, [...OUTBOX_RETRYABLE_STATUSES])))
      .returning();
    if (!updated) throw new OpsDomainError("CONFLICT", "Integration event changed before it could be retried.");

    await tx.insert(auditEvents).values({
      actorUserId: input.actorUserId,
      actorType: "USER",
      action: "INTEGRATION_OUTBOX_RETRY",
      resourceType: "INTEGRATION_OUTBOX",
      resourceId: event.id,
      outcome: "SUCCESS",
      metadata: {
        topic: event.topic,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        previousStatus: event.status,
        previousAttempts: event.attempts,
      },
    });

    return {
      id: updated.id,
      status: updated.status,
      availableAt: updated.availableAt.toISOString(),
    };
  });
}
