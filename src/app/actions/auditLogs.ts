"use server";

import { and, desc, eq, ilike, inArray, or } from "drizzle-orm";

import { db } from "@/db";
import { auditEvents, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth-guard";
import type {
  AuditActorType,
  AuditLogResult,
  AuditMetadata,
  AuditOutcome,
} from "@/types/audit";

const MAX_AUDIT_ROWS = 250;

export type AuditLogFilters = {
  action?: string;
  resourceType?: string;
  outcome?: AuditOutcome | "ALL";
  search?: string;
  limit?: number;
};

function getDatabaseErrorCode(error: unknown) {
  const cause = (error as { cause?: { code?: unknown } } | null)?.cause;
  return typeof cause?.code === "string" ? cause.code : null;
}

function isMissingAuditTableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return getDatabaseErrorCode(error) === "42P01" || message.includes("audit_events");
}

function normalizeFilter(value: string | undefined, maxLength: number) {
  return value?.trim().slice(0, maxLength) || undefined;
}

function normalizeActorType(value: string): AuditActorType {
  if (["ANONYMOUS", "USER", "STAFF", "ADMIN", "SYSTEM", "INTEGRATION"].includes(value)) {
    return value as AuditActorType;
  }
  return "SYSTEM";
}

function normalizeOutcome(value: string): AuditOutcome {
  if (["SUCCESS", "FAILURE", "DENIED"].includes(value)) {
    return value as AuditOutcome;
  }
  return "FAILURE";
}

export async function getAuditLogPage(filters: AuditLogFilters = {}): Promise<AuditLogResult> {
  await requireAdmin();

  const action = normalizeFilter(filters.action, 120);
  const resourceType = normalizeFilter(filters.resourceType, 120);
  const search = normalizeFilter(filters.search, 160);
  const limit = Math.min(Math.max(filters.limit || MAX_AUDIT_ROWS, 1), MAX_AUDIT_ROWS);
  const conditions = [];

  if (action && action !== "ALL") conditions.push(eq(auditEvents.action, action));
  if (resourceType && resourceType !== "ALL") conditions.push(eq(auditEvents.resourceType, resourceType));
  if (filters.outcome && filters.outcome !== "ALL") conditions.push(eq(auditEvents.outcome, filters.outcome));
  if (search) {
    const searchPattern = `%${search.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
    conditions.push(
      or(
        ilike(auditEvents.action, searchPattern),
        ilike(auditEvents.resourceType, searchPattern),
        ilike(auditEvents.resourceId, searchPattern),
        ilike(auditEvents.route, searchPattern),
        ilike(auditEvents.actorUserId, searchPattern),
        ilike(auditEvents.requestId, searchPattern),
      ),
    );
  }

  try {
    const rows = await db.query.auditEvents.findMany({
      where: conditions.length ? and(...conditions) : undefined,
      orderBy: [desc(auditEvents.occurredAt)],
      limit,
    });

    const actorIds = [...new Set(rows.map((row) => row.actorUserId).filter((id): id is string => Boolean(id)))];
    const actorRows = actorIds.length
      ? await db.query.users.findMany({
          where: inArray(users.id, actorIds),
          columns: { id: true, name: true, fullName: true, email: true },
        })
      : [];
    const actorsById = new Map(actorRows.map((actor) => [actor.id, actor]));

    return {
      success: true,
      storageReady: true,
      error: null,
      rows: rows.map((row) => {
        const actor = row.actorUserId ? actorsById.get(row.actorUserId) : undefined;
        return {
          id: row.id,
          occurredAt: row.occurredAt.toISOString(),
          actorUserId: row.actorUserId,
          actorName: actor?.fullName || actor?.name || null,
          actorEmail: actor?.email || null,
          actorType: normalizeActorType(row.actorType),
          action: row.action,
          resourceType: row.resourceType,
          resourceId: row.resourceId,
          outcome: normalizeOutcome(row.outcome),
          route: row.route,
          method: row.method,
          requestId: row.requestId,
          ipHash: row.ipHash,
          userAgentHash: row.userAgentHash,
          metadata: row.metadata as AuditMetadata,
        };
      }),
    };
  } catch (error) {
    if (isMissingAuditTableError(error)) {
      return {
        success: true,
        storageReady: false,
        rows: [],
        error: "Audit log storage is not ready.",
      };
    }

    console.error("[Audit] Failed to load audit events:", error);
    return {
      success: false,
      storageReady: true,
      rows: [],
      error: "Could not load audit logs.",
    };
  }
}
