import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { installedAssets, integrationOutbox, serviceCases, serviceVisits, users } from "@/db/schema";
import { isInstallationErpnextSyncEnabled } from "@/lib/installationErpnextSync";
import { erpNextGateway } from "@/server/services/integrations/erpnext-gateway";

export const SERVICE_CASE_ERPNEXT_TOPICS = [
  "service.case.created",
  "service.case.updated",
  "service.visit.created",
] as const;

type ServiceCaseOutboxEvent = typeof integrationOutbox.$inferSelect;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

async function loadCaseContext(caseId: string) {
  const rows = await db
    .select({ serviceCase: serviceCases, customer: users, asset: installedAssets })
    .from(serviceCases)
    .innerJoin(users, eq(serviceCases.customerUserId, users.id))
    .leftJoin(installedAssets, eq(serviceCases.assetId, installedAssets.id))
    .where(eq(serviceCases.id, caseId))
    .limit(1);
  return rows[0] || null;
}

async function syncCase(event: ServiceCaseOutboxEvent) {
  const caseId = text(asRecord(event.payload).serviceCaseId) || event.aggregateId;
  const context = await loadCaseContext(caseId);
  if (!context) throw new Error("Service case outbox event references missing local records.");
  const status = context.serviceCase.status === "CANCELLED"
    ? "Cancelled"
    : ["RESOLVED", "CLOSED"].includes(context.serviceCase.status)
      ? "Closed"
      : context.serviceCase.status === "WAITING_CUSTOMER"
        ? "On Hold"
        : ["SCHEDULED", "IN_PROGRESS"].includes(context.serviceCase.status)
          ? "Work In Progress"
          : "Open";

  if (context.serviceCase.externalReference) {
    await erpNextGateway.updateWarrantyClaim({
      providerId: context.serviceCase.externalReference,
      status,
    });
    await db.update(serviceCases).set({
      metadata: {
        ...asRecord(context.serviceCase.metadata),
        erpnextWarrantyClaimId: context.serviceCase.externalReference,
        erpnextSyncedAt: new Date().toISOString(),
      },
      updatedAt: new Date(),
    }).where(eq(serviceCases.id, context.serviceCase.id));
    return;
  }

  const claim = await erpNextGateway.createWarrantyClaim({
    customerId: context.customer.erpnextCustomerId,
    serialNumber: context.asset?.serialNumber,
    itemCode: null,
    description: [
      context.serviceCase.caseNumber + " | " + context.serviceCase.type + " | " + context.serviceCase.priority,
      context.serviceCase.subject,
      context.serviceCase.description,
      "SolarDream status: " + context.serviceCase.status,
    ].join("\n"),
    idempotencyKey: event.dedupeKey || event.id,
  });

  await db.update(serviceCases).set({
    externalReference: claim.providerId,
    metadata: {
      ...asRecord(context.serviceCase.metadata),
      erpnextWarrantyClaimId: claim.providerId,
      erpnextWarrantyClaimReused: claim.reused,
      erpnextSyncedAt: new Date().toISOString(),
    },
    updatedAt: new Date(),
  }).where(eq(serviceCases.id, context.serviceCase.id));
}

async function syncVisit(event: ServiceCaseOutboxEvent) {
  const visitId = text(asRecord(event.payload).serviceVisitId) || event.aggregateId;
  const rows = await db
    .select({ visit: serviceVisits, serviceCase: serviceCases, customer: users, asset: installedAssets })
    .from(serviceVisits)
    .innerJoin(serviceCases, eq(serviceVisits.caseId, serviceCases.id))
    .innerJoin(users, eq(serviceCases.customerUserId, users.id))
    .leftJoin(installedAssets, eq(serviceCases.assetId, installedAssets.id))
    .where(eq(serviceVisits.id, visitId))
    .limit(1);
  const row = rows[0];
  if (!row) throw new Error("Service visit outbox event references missing local records.");
  await erpNextGateway.createMaintenanceVisit({
    customerId: row.customer.erpnextCustomerId,
    serialNumber: row.asset?.serialNumber,
    itemCode: null,
    scheduledDate: row.visit.scheduledStart?.toISOString() || null,
    description: [
      row.serviceCase.caseNumber + " | " + row.serviceCase.subject,
      row.serviceCase.description,
      row.visit.notes || "",
    ].filter(Boolean).join("\n"),
    idempotencyKey: event.dedupeKey || event.id,
  });
}

export async function deliverServiceCaseErpnextEvent(event: ServiceCaseOutboxEvent) {
  if (!SERVICE_CASE_ERPNEXT_TOPICS.includes(event.topic as (typeof SERVICE_CASE_ERPNEXT_TOPICS)[number])) return;
  if (!isInstallationErpnextSyncEnabled()) return;
  if (event.topic === "service.visit.created") return syncVisit(event);
  return syncCase(event);
}
