import { and, gt, lte, desc } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db, withDatabaseRetry } from "@/db";
import { leads, proposals, installationWorkflowProjects } from "@/db/schema";
import { requireStaffJson } from "@/lib/auth-guard";

type PollEvent = {
  eventType:
    | "NEW_LEAD"
    | "LEAD_STATUS_CHANGED"
    | "QUOTATION_UPDATED"
    | "PROJECT_CREATED"
    | "PROJECT_STATUS_CHANGED";
  payload: {
    id: string;
    projectId?: string;
    name?: string;
    status?: string;
    title?: string;
  };
  occurredAt: string;
};

const MAX_EVENTS = 50;

function parseCursor(value: string | null): Date {
  if (!value) return new Date();
  const cursor = new Date(value);
  if (Number.isNaN(cursor.getTime())) throw new Error("Invalid realtime cursor.");
  return cursor;
}

export async function GET(request: Request) {
  const access = await requireStaffJson();
  if (!access.ok) return access.response;

  const url = new URL(request.url);
  let cursor: Date;
  try {
    cursor = parseCursor(url.searchParams.get("cursor"));
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid realtime cursor." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const serverTime = new Date();
  const [leadRows, quotationRows, projectRows] = await withDatabaseRetry(() => Promise.all([
    db
      .select({
        id: leads.id,
        name: leads.name,
        status: leads.status,
        createdAt: leads.createdAt,
        updatedAt: leads.updatedAt,
      })
      .from(leads)
      .where(and(gt(leads.updatedAt, cursor), lte(leads.updatedAt, serverTime)))
      .orderBy(desc(leads.updatedAt))
      .limit(MAX_EVENTS),
    db
      .select({
        id: proposals.id,
        status: proposals.status,
        updatedAt: proposals.updatedAt,
      })
      .from(proposals)
      .where(and(gt(proposals.updatedAt, cursor), lte(proposals.updatedAt, serverTime)))
      .orderBy(desc(proposals.updatedAt))
      .limit(MAX_EVENTS),
    db
      .select({
        id: installationWorkflowProjects.id,
        projectCode: installationWorkflowProjects.projectCode,
        proposalId: installationWorkflowProjects.proposalId,
        status: installationWorkflowProjects.status,
        createdAt: installationWorkflowProjects.createdAt,
        updatedAt: installationWorkflowProjects.updatedAt,
      })
      .from(installationWorkflowProjects)
      .where(and(gt(installationWorkflowProjects.updatedAt, cursor), lte(installationWorkflowProjects.updatedAt, serverTime)))
      .orderBy(desc(installationWorkflowProjects.updatedAt))
      .limit(MAX_EVENTS),
  ]));

  const events: PollEvent[] = [
    ...leadRows.map((row) => ({
      eventType: row.createdAt.getTime() > cursor.getTime() ? "NEW_LEAD" : "LEAD_STATUS_CHANGED",
      payload: { id: row.id, name: row.name, status: row.status },
      occurredAt: row.updatedAt.toISOString(),
    } satisfies PollEvent)),
    ...quotationRows.map((row) => ({
      eventType: "QUOTATION_UPDATED",
      payload: { id: row.id, title: `Quotation ${row.id}`, status: row.status },
      occurredAt: row.updatedAt.toISOString(),
    } satisfies PollEvent)),
    ...projectRows.map((row) => ({
      eventType: row.createdAt.getTime() > cursor.getTime() ? "PROJECT_CREATED" : "PROJECT_STATUS_CHANGED",
      payload: { id: row.projectCode, projectId: row.id, title: row.projectCode, status: row.status },
      occurredAt: row.updatedAt.toISOString(),
    } satisfies PollEvent)),
  ]
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))
    .slice(0, MAX_EVENTS);

  return NextResponse.json(
    { success: true, events, cursor: serverTime.toISOString() },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
      },
    },
  );
}
