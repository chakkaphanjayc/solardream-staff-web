import "server-only";

import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  installationAuditEvents,
  installationWarranties,
  installationWorkflowProjects,
  installedAssets,
  productWarranties,
  proposals,
} from "@/db/schema";
import { enqueueIntegrationEvent } from "@/lib/integrationOutbox";
import { hasOpsCapability, OpsDomainError } from "@/lib/opsV2State";
import { erpNextGateway } from "@/server/services/integrations/erpnext-gateway";
import type { OpsActor } from "@/types/ops-v2";

type OpsTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function validateKey(value: string) {
  const key = text(value);
  if (!key || key.length > 180) throw new OpsDomainError("INVALID_INPUT", "A bounded idempotency key is required.");
  return key;
}

function normalizeSerial(value: string) {
  return value.trim().replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function parseDate(value: string | null | undefined, label: string, fallback: Date) {
  if (!value?.trim()) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new OpsDomainError("INVALID_INPUT", label + " must be a valid date.");
  return parsed;
}

function addMonths(date: Date, months: number) {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

function iso(value: Date | null | undefined) {
  return value?.toISOString() || null;
}

function serializeAsset(asset: typeof installedAssets.$inferSelect) {
  return {
    ...asset,
    installedDate: asset.installedDate.toISOString(),
    warrantyExpiryDate: asset.warrantyExpiryDate.toISOString(),
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
  };
}

function serializeInstallationWarranty(warranty: typeof installationWarranties.$inferSelect) {
  return {
    ...warranty,
    startsAt: iso(warranty.startsAt),
    endsAt: iso(warranty.endsAt),
    createdAt: warranty.createdAt.toISOString(),
    updatedAt: warranty.updatedAt.toISOString(),
  };
}

async function getProject(tx: OpsTransaction, projectId: string) {
  const rows = await tx
    .select({ project: installationWorkflowProjects, proposal: proposals })
    .from(installationWorkflowProjects)
    .innerJoin(proposals, eq(installationWorkflowProjects.proposalId, proposals.id))
    .where(eq(installationWorkflowProjects.id, projectId))
    .limit(1);
  const row = rows[0];
  if (!row) throw new OpsDomainError("NOT_FOUND", "Installation project was not found.");
  return row;
}

function assertCapability(actor: OpsActor, capability: Parameters<typeof hasOpsCapability>[1], message: string) {
  if (!hasOpsCapability(actor, capability)) throw new OpsDomainError("FORBIDDEN", message);
}

export async function lookupInstalledAssetSerial(actor: OpsActor, serialNumber: string) {
  assertCapability(actor, "asset.read", "Asset lookup is not permitted.");
  const serial = text(serialNumber);
  if (!serial || serial.length > 160) throw new OpsDomainError("INVALID_INPUT", "A valid serial number is required.");
  const document = await erpNextGateway.getSerialNumber(serial);
  if (!document) return { sourceOfTruth: "ERPNext" as const, found: false, serialNumber: serial, item: null, warrantyExpiryDate: null, status: null };
  return {
    sourceOfTruth: "ERPNext" as const,
    found: true,
    serialNumber: text(document.serial_no) || serial,
    item: {
      code: text(document.item_code) || null,
      name: text(document.item_name) || text(document.description) || text(document.item_code) || "ERPNext item",
    },
    warrantyExpiryDate: text(document.warranty_expiry_date) || null,
    status: text(document.status) || text(document.warranty_amc_status) || null,
  };
}

export async function listProjectAssets(actor: OpsActor, projectId: string) {
  assertCapability(actor, "asset.read", "Asset access is not permitted.");
  const assets = await db.query.installedAssets.findMany({
    where: eq(installedAssets.projectId, projectId),
    orderBy: (table, { desc }) => [desc(table.installedDate)],
  });
  return assets.map(serializeAsset);
}

export async function registerInstalledAsset(actor: OpsActor, input: {
  projectId: string;
  productName: string;
  serialNumber: string;
  catalogProductId?: string | null;
  verificationStatus?: "VERIFIED" | "UNVERIFIED";
  installedDate?: string | null;
  productWarrantyProvider?: string | null;
  productWarrantyMonths?: number | null;
  idempotencyKey: string;
}) {
  assertCapability(actor, "asset.register", "Asset registration is not permitted.");
  const idempotencyKey = validateKey(input.idempotencyKey);
  const productName = text(input.productName);
  const serialNumber = text(input.serialNumber);
  const serialNumberNormalized = normalizeSerial(serialNumber);
  if (!productName || serialNumber.length < 2 || serialNumberNormalized.length < 2) {
    throw new OpsDomainError("INVALID_INPUT", "A product name and valid serial number are required.");
  }
  const catalogProductId = text(input.catalogProductId) || null;
  const verificationStatus = input.verificationStatus || (catalogProductId ? "VERIFIED" : "UNVERIFIED");
  if (verificationStatus === "VERIFIED" && !catalogProductId) {
    throw new OpsDomainError("INVALID_INPUT", "A verified asset must reference a catalog product.");
  }
  const installedDate = parseDate(input.installedDate, "installedDate", new Date());
  const warrantyMonths = input.productWarrantyMonths === null || input.productWarrantyMonths === undefined
    ? 12
    : Math.floor(input.productWarrantyMonths);
  if (!Number.isInteger(warrantyMonths) || warrantyMonths < 1 || warrantyMonths > 240) {
    throw new OpsDomainError("INVALID_INPUT", "Product warranty duration must be between 1 and 240 months.");
  }

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"ops-v2:asset:" + serialNumberNormalized}))`);
    const replay = await tx.query.installationAuditEvents.findFirst({ where: eq(installationAuditEvents.idempotencyKey, idempotencyKey) });
    if (replay) {
      const assetId = asText(asObject(replay.payload).assetId);
      const asset = assetId ? await tx.query.installedAssets.findFirst({ where: eq(installedAssets.id, assetId) }) : null;
      if (asset) return { asset: serializeAsset(asset), replayed: true };
      throw new OpsDomainError("CONFLICT", "This idempotency key belongs to another operation.");
    }

    const { project, proposal } = await getProject(tx, input.projectId);
    const duplicate = await tx.query.installedAssets.findFirst({ where: eq(installedAssets.serialNumberNormalized, serialNumberNormalized) });
    if (duplicate) {
      if (duplicate.projectId === project.id) return { asset: serializeAsset(duplicate), replayed: true };
      throw new OpsDomainError("CONFLICT", "This serial number is already registered to another installation.");
    }

    const warrantyExpiryDate = addMonths(installedDate, warrantyMonths);
    const [asset] = await tx.insert(installedAssets).values({
      proposalId: proposal.id,
      customerId: project.customerId || proposal.userId,
      productName,
      serialNumber,
      serialNumberNormalized,
      projectId: project.id,
      siteId: project.siteId,
      catalogProductId,
      status: verificationStatus === "VERIFIED" ? "ACTIVE" : "UNKNOWN",
      source: "OPS_V2",
      installedDate,
      warrantyExpiryDate,
    }).returning();
    if (!asset) throw new OpsDomainError("CONFLICT", "Installed asset could not be registered.");

    const [warranty] = await tx.insert(productWarranties).values({
      assetId: asset.id,
      provider: text(input.productWarrantyProvider) || "MANUFACTURER_PENDING",
      productName,
      serialNumber,
      status: "PENDING",
      startsAt: installedDate,
      endsAt: warrantyExpiryDate,
      terms: { source: "OPS_V2", durationMonths: warrantyMonths },
    }).returning({ id: productWarranties.id });
    if (!warranty) throw new OpsDomainError("CONFLICT", "Product warranty could not be created.");

    const [audit] = await tx.insert(installationAuditEvents).values({
      proposalId: proposal.id,
      eventType: "ASSET_REGISTERED",
      actorUserId: actor.userId,
      idempotencyKey,
      payload: {
        projectId: project.id,
        assetId: asset.id,
        productWarrantyId: warranty.id,
        serialNumberNormalized,
        verificationStatus,
        source: "OPS_V2",
      },
    }).returning({ id: installationAuditEvents.id });
    if (!audit) throw new OpsDomainError("CONFLICT", "Asset audit event could not be recorded.");

    await enqueueIntegrationEvent(tx, {
      topic: "installation.asset.registered",
      aggregateType: "INSTALLATION_PROJECT",
      aggregateId: project.id,
      correlationId: idempotencyKey,
      payload: { projectId: project.id, assetId: asset.id, auditEventId: audit.id, source: "OPS_V2" },
      dedupeKey: "installation.asset.registered:" + idempotencyKey,
    });

    return { asset: serializeAsset(asset), replayed: false };
  });
}

export async function registerInstalledAssetsBulk(actor: OpsActor, input: {
  projectId: string;
  productName: string;
  serialNumbers: readonly string[];
  catalogProductId?: string | null;
  verificationStatus?: "VERIFIED" | "UNVERIFIED";
  installedDate?: string | null;
  productWarrantyProvider?: string | null;
  productWarrantyMonths?: number | null;
  idempotencyKey: string;
}) {
  assertCapability(actor, "asset.register", "Asset registration is not permitted.");
  const batchKey = validateKey(input.idempotencyKey);
  const productName = text(input.productName);
  if (!productName) throw new OpsDomainError("INVALID_INPUT", "A product name is required for bulk registration.");
  if (input.serialNumbers.length < 1 || input.serialNumbers.length > 200) {
    throw new OpsDomainError("INVALID_INPUT", "Bulk registration accepts between 1 and 200 serial numbers.");
  }

  const items: Array<{ serialNumber: string; asset: ReturnType<typeof serializeAsset>; replayed: boolean }> = [];
  const failures: Array<{ serialNumber: string; code: string; message: string }> = [];
  const seen = new Set<string>();

  for (const rawSerialNumber of input.serialNumbers) {
    const serialNumber = text(rawSerialNumber);
    const normalized = normalizeSerial(serialNumber);
    if (serialNumber.length < 2 || normalized.length < 2 || serialNumber.length > 160) {
      failures.push({ serialNumber, code: "INVALID_INPUT", message: "The serial number is invalid." });
      continue;
    }
    if (seen.has(normalized)) {
      failures.push({ serialNumber, code: "CONFLICT", message: "The serial number appears more than once in this batch." });
      continue;
    }
    seen.add(normalized);

    const itemKey = "ops-v2:asset-bulk:" + createHash("sha256")
      .update(batchKey + ":" + normalized)
      .digest("hex");
    try {
      const result = await registerInstalledAsset(actor, {
        projectId: input.projectId,
        productName,
        serialNumber,
        catalogProductId: input.catalogProductId,
        verificationStatus: input.verificationStatus,
        installedDate: input.installedDate,
        productWarrantyProvider: input.productWarrantyProvider,
        productWarrantyMonths: input.productWarrantyMonths,
        idempotencyKey: itemKey,
      });
      items.push({ serialNumber, asset: result.asset, replayed: result.replayed });
    } catch (error: unknown) {
      if (error instanceof OpsDomainError) {
        failures.push({ serialNumber, code: error.code, message: error.message });
      } else {
        console.error("[Ops V2] Bulk asset item failed.", error instanceof Error ? { name: error.name, message: error.message } : { type: typeof error });
        failures.push({ serialNumber, code: "INTERNAL_ERROR", message: "This serial number could not be registered." });
      }
    }
  }

  return {
    requested: input.serialNumbers.length,
    succeeded: items.length,
    created: items.filter((item) => !item.replayed).length,
    replayed: items.filter((item) => item.replayed).length,
    items,
    failures,
  };
}

export async function resolveInstalledAsset(actor: OpsActor, input: {
  projectId: string;
  assetId: string;
  catalogProductId: string;
  productName?: string | null;
  idempotencyKey: string;
}) {
  assertCapability(actor, "asset.register", "Asset resolution is not permitted.");
  const idempotencyKey = validateKey(input.idempotencyKey);
  const catalogProductId = text(input.catalogProductId);
  if (!catalogProductId || catalogProductId.length > 160) {
    throw new OpsDomainError("INVALID_INPUT", "A catalog product reference is required.");
  }

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"ops-v2:asset-resolve:" + input.assetId}))`);
    const replay = await tx.query.installationAuditEvents.findFirst({
      where: eq(installationAuditEvents.idempotencyKey, idempotencyKey),
    });
    if (replay) {
      const assetId = asText(asObject(replay.payload).assetId);
      const asset = assetId ? await tx.query.installedAssets.findFirst({ where: eq(installedAssets.id, assetId) }) : null;
      if (asset) return { asset: serializeAsset(asset), replayed: true };
      throw new OpsDomainError("CONFLICT", "This idempotency key belongs to another operation.");
    }

    const { project, proposal } = await getProject(tx, input.projectId);
    const asset = await tx.query.installedAssets.findFirst({
      where: and(eq(installedAssets.id, input.assetId), eq(installedAssets.projectId, project.id)),
    });
    if (!asset) throw new OpsDomainError("NOT_FOUND", "Installed asset was not found.");
    if (asset.status !== "UNKNOWN") {
      if (asset.catalogProductId === catalogProductId) return { asset: serializeAsset(asset), replayed: true };
      throw new OpsDomainError("CONFLICT", "Only UNKNOWN assets can be resolved.");
    }

    const now = new Date();
    const [updated] = await tx.update(installedAssets).set({
      catalogProductId,
      productName: text(input.productName) || asset.productName,
      status: "ACTIVE",
      updatedAt: now,
    }).where(eq(installedAssets.id, asset.id)).returning();
    if (!updated) throw new OpsDomainError("CONFLICT", "Installed asset changed before resolution.");

    const [audit] = await tx.insert(installationAuditEvents).values({
      proposalId: proposal.id,
      eventType: "ASSET_RESOLVED",
      actorUserId: actor.userId,
      idempotencyKey,
      payload: {
        projectId: project.id,
        assetId: asset.id,
        catalogProductId,
        source: "OPS_V2",
      },
    }).returning({ id: installationAuditEvents.id });
    if (!audit) throw new OpsDomainError("CONFLICT", "Asset resolution audit could not be recorded.");

    await enqueueIntegrationEvent(tx, {
      topic: "installation.asset.resolved",
      aggregateType: "INSTALLATION_PROJECT",
      aggregateId: project.id,
      correlationId: idempotencyKey,
      payload: { projectId: project.id, assetId: asset.id, auditEventId: audit.id, source: "OPS_V2" },
      dedupeKey: "installation.asset.resolved:" + idempotencyKey,
    });

    return { asset: serializeAsset(updated), replayed: false };
  });
}

export async function listProjectWarranties(actor: OpsActor, projectId: string) {
  assertCapability(actor, "warranty.read", "Warranty access is not permitted.");
  const [installation, product] = await Promise.all([
    db.query.installationWarranties.findMany({ where: eq(installationWarranties.projectId, projectId) }),
    db.select({ warranty: productWarranties, asset: installedAssets })
      .from(productWarranties)
      .innerJoin(installedAssets, eq(productWarranties.assetId, installedAssets.id))
      .where(eq(installedAssets.projectId, projectId)),
  ]);
  return {
    installation: installation.map(serializeInstallationWarranty),
    product: product.map((item) => ({
      warranty: {
        ...item.warranty,
        startsAt: iso(item.warranty.startsAt),
        endsAt: iso(item.warranty.endsAt),
        createdAt: item.warranty.createdAt.toISOString(),
        updatedAt: item.warranty.updatedAt.toISOString(),
      },
      asset: serializeAsset(item.asset),
    })),
  };
}

export async function activateInstallationWarranty(actor: OpsActor, input: {
  projectId: string;
  durationMonths?: number | null;
  startsAt?: string | null;
  sourceHandoverId?: string | null;
  idempotencyKey: string;
}) {
  assertCapability(actor, "warranty.activate", "Warranty activation is not permitted.");
  const idempotencyKey = validateKey(input.idempotencyKey);
  const durationMonths = input.durationMonths === null || input.durationMonths === undefined ? 24 : Math.floor(input.durationMonths);
  if (!Number.isInteger(durationMonths) || durationMonths < 1 || durationMonths > 240) {
    throw new OpsDomainError("INVALID_INPUT", "Installation warranty duration must be between 1 and 240 months.");
  }

  return db.transaction(async (tx) => {
    const replay = await tx.query.installationAuditEvents.findFirst({ where: eq(installationAuditEvents.idempotencyKey, idempotencyKey) });
    if (replay) {
      const warrantyId = asText(asObject(replay.payload).installationWarrantyId);
      const warranty = warrantyId ? await tx.query.installationWarranties.findFirst({ where: eq(installationWarranties.id, warrantyId) }) : null;
      if (warranty) return { warranty: serializeInstallationWarranty(warranty), replayed: true };
      throw new OpsDomainError("CONFLICT", "This idempotency key belongs to another operation.");
    }

    const { project } = await getProject(tx, input.projectId);
    if (!["HANDOVER", "WARRANTY_ACTIVATION"].includes(project.lifecycleState)) {
      throw new OpsDomainError("DEPENDENCY_BLOCKED", "The project must complete handover before warranty activation.");
    }
    const warranty = await tx.query.installationWarranties.findFirst({ where: eq(installationWarranties.projectId, project.id) });
    if (!warranty) throw new OpsDomainError("NOT_FOUND", "Installation warranty record was not found.");
    if (warranty.status === "ACTIVE") return { warranty: serializeInstallationWarranty(warranty), replayed: true };
    const startsAt = parseDate(input.startsAt, "startsAt", new Date());
    const endsAt = addMonths(startsAt, durationMonths);
    const now = new Date();
    const [updated] = await tx.update(installationWarranties).set({
      status: "ACTIVE",
      startsAt,
      endsAt,
      durationMonths,
      activatedByUserId: actor.userId,
      sourceHandoverId: text(input.sourceHandoverId) || warranty.sourceHandoverId,
      updatedAt: now,
    }).where(eq(installationWarranties.id, warranty.id)).returning();
    if (!updated) throw new OpsDomainError("CONFLICT", "Installation warranty changed before activation.");

    if (project.lifecycleState === "HANDOVER") {
      await tx.update(installationWorkflowProjects).set({
        lifecycleState: "WARRANTY_ACTIVATION",
        lifecycleVersion: project.lifecycleVersion + 1,
        lastTransitionAt: now,
        updatedAt: now,
      }).where(eq(installationWorkflowProjects.id, project.id));
      const [stateAudit] = await tx.insert(installationAuditEvents).values({
        proposalId: project.proposalId,
        eventType: "PROJECT_STATE_CHANGED",
        actorUserId: actor.userId,
        idempotencyKey: idempotencyKey + ":project",
        payload: { from: "HANDOVER", to: "WARRANTY_ACTIVATION", source: "WARRANTY_ACTIVATION", lifecycleVersion: project.lifecycleVersion + 1 },
      }).returning({ id: installationAuditEvents.id });
      if (!stateAudit) throw new OpsDomainError("CONFLICT", "Warranty lifecycle audit could not be recorded.");
      await enqueueIntegrationEvent(tx, {
        topic: "installation.project.state_changed",
        aggregateType: "INSTALLATION_PROJECT",
        aggregateId: project.id,
        correlationId: idempotencyKey,
        payload: { projectId: project.id, proposalId: project.proposalId, auditEventId: stateAudit.id, from: "HANDOVER", to: "WARRANTY_ACTIVATION", source: "WARRANTY_ACTIVATION" },
        dedupeKey: "installation.project.state_changed:" + idempotencyKey + ":project",
      });
    }

    const [audit] = await tx.insert(installationAuditEvents).values({
      proposalId: project.proposalId,
      eventType: "INSTALLATION_WARRANTY_ACTIVATED",
      actorUserId: actor.userId,
      idempotencyKey,
      payload: { projectId: project.id, installationWarrantyId: warranty.id, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), source: "OPS_V2" },
    }).returning({ id: installationAuditEvents.id });
    if (!audit) throw new OpsDomainError("CONFLICT", "Warranty activation audit could not be recorded.");
    await enqueueIntegrationEvent(tx, {
      topic: "installation.warranty.activated",
      aggregateType: "INSTALLATION_PROJECT",
      aggregateId: project.id,
      correlationId: idempotencyKey,
      payload: { projectId: project.id, installationWarrantyId: warranty.id, auditEventId: audit.id, source: "OPS_V2" },
      dedupeKey: "installation.warranty.activated:" + idempotencyKey,
    });

    return { warranty: serializeInstallationWarranty(updated), replayed: false };
  });
}
