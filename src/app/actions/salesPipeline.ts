"use server";

import { revalidatePath } from "next/cache";
import { desc, inArray } from "drizzle-orm";

import { db } from "@/db";
import { activityLogs } from "@/db/schema";
import { requireStaff } from "@/lib/auth-guard";
import {
  deleteLinkedSalesRecords,
  type SalesPipelineDeleteActor,
  type SalesPipelineDeleteResult,
  type SalesPipelineDeleteTarget,
} from "@/lib/salesPipelineDeletion";

export type { SalesPipelineDeleteTarget, SalesPipelineDeleteResult } from "@/lib/salesPipelineDeletion";

function normalizeTarget(target: SalesPipelineDeleteTarget): SalesPipelineDeleteTarget | null {
  if (!target || typeof target.id !== "string" || !target.id.trim()) return null;
  return { ...target, id: target.id.trim() };
}

export async function deleteSalesPipelineRecords(
  targets: SalesPipelineDeleteTarget[],
): Promise<SalesPipelineDeleteResult> {
  const staff = await requireStaff();
  const normalizedTargets = Array.from(
    new Map(
      (Array.isArray(targets) ? targets : [])
        .map(normalizeTarget)
        .filter((target): target is SalesPipelineDeleteTarget => Boolean(target))
        .map((target) => [`${target.type}:${target.id}`, target]),
    ).values(),
  );
  if (normalizedTargets.length > 100) {
    return { success: false, error: "Select no more than 100 linked sales records at a time." };
  }

  const actor: SalesPipelineDeleteActor = {
    id: staff.id,
    label: staff.fullName || staff.name || staff.email || "Staff",
  };
  const result = await deleteLinkedSalesRecords(normalizedTargets, actor);

  if (result.success) {
    revalidatePath("/admin/leads");
    revalidatePath("/admin/crm");
    revalidatePath("/admin/quotations");
    revalidatePath("/admin/requests");
    revalidatePath("/admin/orders");
    revalidatePath("/admin/sales-thread");
    revalidatePath("/admin/tickets");
    revalidatePath("/proposals");
  }

  return result;
}

export async function deleteSalesPipelineRecord(
  target: SalesPipelineDeleteTarget,
): Promise<SalesPipelineDeleteResult> {
  return deleteSalesPipelineRecords([target]);
}

export async function getSalesPipelineAuditLogs(entityIds: string[]) {
  await requireStaff();
  const validIds = Array.from(
    new Set(
      (Array.isArray(entityIds) ? entityIds : [])
        .filter((id): id is string => typeof id === "string")
        .map((id) => id.trim())
        .filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)),
    ),
  ).slice(0, 100);

  if (validIds.length === 0) return { success: true as const, logs: [] };

  const logs = await db
    .select({
      id: activityLogs.id,
      action: activityLogs.action,
      description: activityLogs.description,
      userId: activityLogs.userId,
      createdAt: activityLogs.createdAt,
    })
    .from(activityLogs)
    .where(inArray(activityLogs.entityId, validIds))
    .orderBy(desc(activityLogs.createdAt))
    .limit(100);

  return {
    success: true as const,
    logs: logs.map((log) => ({
      ...log,
      createdAt: log.createdAt.toISOString(),
    })),
  };
}
