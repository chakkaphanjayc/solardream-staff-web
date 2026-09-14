import "server-only";

import { and, asc, desc, eq, inArray, or } from "drizzle-orm";

import { db } from "@/db";
import {
  fieldVisits,
  installationChecklistItems,
  installationTasks,
  installationWarranties,
  installationWorkflowProjects,
  installedAssets,
  productWarranties,
  proposals,
  serviceCases,
  sites,
  users,
} from "@/db/schema";
import { OpsDomainError } from "@/lib/opsV2State";
import type { OpsActor } from "@/types/ops-v2";

function assertCustomer(actor: OpsActor) {
  if (!["USER", "CUSTOMER"].includes(actor.role)) throw new OpsDomainError("FORBIDDEN", "Customer portal access is not permitted.");
}

function iso(value: Date | null | undefined) {
  return value?.toISOString() || null;
}

function projectState(value: string) {
  return [
    "NEW",
    "SITE_REVIEW",
    "ENGINEERING",
    "MATERIAL_PREPARATION",
    "READY_TO_SCHEDULE",
    "SCHEDULED",
    "IN_PROGRESS",
    "QA_COMMISSIONING",
    "HANDOVER",
    "WARRANTY_ACTIVATION",
    "COMPLETED",
  ].includes(value) ? value : "NEW";
}

function serializeAsset(asset: typeof installedAssets.$inferSelect) {
  return {
    id: asset.id,
    projectId: asset.projectId,
    siteId: asset.siteId,
    productName: asset.productName,
    serialNumber: asset.serialNumber,
    status: asset.status,
    installedDate: asset.installedDate.toISOString(),
    warrantyExpiryDate: asset.warrantyExpiryDate.toISOString(),
  };
}

async function getOwnedProject(actor: OpsActor, projectId: string) {
  assertCustomer(actor);
  const rows = await db
    .select({ project: installationWorkflowProjects, proposal: proposals })
    .from(installationWorkflowProjects)
    .innerJoin(proposals, eq(installationWorkflowProjects.proposalId, proposals.id))
    .where(and(
      eq(installationWorkflowProjects.id, projectId),
      or(eq(installationWorkflowProjects.customerId, actor.userId), eq(proposals.userId, actor.userId)),
    ))
    .limit(1);
  const row = rows[0];
  if (!row) throw new OpsDomainError("NOT_FOUND", "Customer project was not found.");
  const site = row.project.siteId
    ? await db.query.sites.findFirst({ where: eq(sites.id, row.project.siteId) })
    : null;
  return { ...row, site };
}

export async function listCustomerProjects(actor: OpsActor) {
  assertCustomer(actor);
  const rows = await db
    .select({ project: installationWorkflowProjects, proposal: proposals, customer: users })
    .from(installationWorkflowProjects)
    .innerJoin(proposals, eq(installationWorkflowProjects.proposalId, proposals.id))
    .leftJoin(users, eq(users.id, proposals.userId))
    .where(or(eq(installationWorkflowProjects.customerId, actor.userId), eq(proposals.userId, actor.userId)))
    .orderBy(desc(installationWorkflowProjects.updatedAt));
  const projectIds = rows.map(({ project }) => project.id);
  if (projectIds.length === 0) return [];
  const siteIds = rows.flatMap(({ project }) => project.siteId ? [project.siteId] : []);
  const [visits, warranties, siteRows] = await Promise.all([
    db.query.fieldVisits.findMany({ where: inArray(fieldVisits.projectId, projectIds), orderBy: [desc(fieldVisits.scheduledStart), desc(fieldVisits.createdAt)] }),
    db.query.installationWarranties.findMany({ where: inArray(installationWarranties.projectId, projectIds), orderBy: [desc(installationWarranties.createdAt)] }),
    siteIds.length > 0 ? db.query.sites.findMany({ where: inArray(sites.id, siteIds) }) : Promise.resolve([]),
  ]);
  const visitByProject = new Map<string, typeof visits[number]>();
  for (const visit of visits) if (!visitByProject.has(visit.projectId)) visitByProject.set(visit.projectId, visit);
  const warrantyByProject = new Map<string, typeof warranties[number]>();
  for (const warranty of warranties) if (!warrantyByProject.has(warranty.projectId)) warrantyByProject.set(warranty.projectId, warranty);
  const siteById = new Map(siteRows.map((site) => [site.id, site]));
  const projects = rows.map(({ project, proposal, customer }) => {
    const visit = visitByProject.get(project.id);
    const warranty = warrantyByProject.get(project.id);
    const site = project.siteId ? siteById.get(project.siteId) : null;
    return {
      id: project.id,
      projectCode: project.projectCode,
      state: projectState(project.lifecycleState),
      systemSizeKwp: proposal.systemSizeKwp,
      panelCount: proposal.panelCount,
      site: site ? { label: site.label, addressLine1: site.addressLine1, city: site.city, province: site.province, country: site.country } : null,
      nextVisit: visit ? { status: visit.status, scheduledStart: iso(visit.scheduledStart), scheduledEnd: iso(visit.scheduledEnd) } : null,
      installationWarranty: warranty ? { status: warranty.status, startsAt: iso(warranty.startsAt), endsAt: iso(warranty.endsAt) } : null,
      updatedAt: project.updatedAt.toISOString(),
      customerName: customer?.fullName || customer?.name || customer?.email || "Customer",
    };
  });
  return projects;
}

export async function getCustomerProjectStatus(actor: OpsActor, projectId: string) {
  const { project, proposal, site } = await getOwnedProject(actor, projectId);
  const [tasks, visits, assets, installationWarranty, cases] = await Promise.all([
    db.select({ task: installationTasks, checklist: installationChecklistItems })
      .from(installationTasks)
      .leftJoin(installationChecklistItems, eq(installationChecklistItems.taskId, installationTasks.id))
      .where(eq(installationTasks.projectId, project.id))
      .orderBy(asc(installationTasks.sequence), asc(installationChecklistItems.sequence)),
    db.query.fieldVisits.findMany({ where: eq(fieldVisits.projectId, project.id), orderBy: [desc(fieldVisits.scheduledStart), desc(fieldVisits.createdAt)] }),
    db.query.installedAssets.findMany({ where: eq(installedAssets.projectId, project.id), orderBy: [desc(installedAssets.installedDate)] }),
    db.query.installationWarranties.findFirst({ where: eq(installationWarranties.projectId, project.id) }),
    db.query.serviceCases.findMany({ where: eq(serviceCases.projectId, project.id), orderBy: [desc(serviceCases.createdAt)] }),
  ]);
  const taskMap = new Map<string, { task: typeof tasks[number]["task"]; checklist: Array<NonNullable<typeof tasks[number]["checklist"]>> }>();
  for (const row of tasks) {
    const current = taskMap.get(row.task.id) || { task: row.task, checklist: [] };
    if (row.checklist) current.checklist.push(row.checklist);
    taskMap.set(row.task.id, current);
  }
  return {
    project: {
      id: project.id,
      projectCode: project.projectCode,
      state: projectState(project.lifecycleState),
      systemSizeKwp: proposal.systemSizeKwp,
      panelCount: proposal.panelCount,
      site: site ? { label: site.label, addressLine1: site.addressLine1, city: site.city, province: site.province, postalCode: site.postalCode, country: site.country, accessNotes: site.accessNotes } : null,
      updatedAt: project.updatedAt.toISOString(),
    },
    tasks: [...taskMap.values()].map(({ task, checklist }) => ({
      id: task.id,
      code: task.taskCode,
      title: task.title,
      status: task.status,
      completedAt: iso(task.completedAt),
      checklist: checklist.map((item) => ({ label: item.label, status: item.status, outcome: item.outcome })),
    })),
    visits: visits.map((visit) => ({ id: visit.id, type: visit.visitType, status: visit.status, scheduledStart: iso(visit.scheduledStart), scheduledEnd: iso(visit.scheduledEnd), timezone: visit.timezone })),
    assets: assets.map(serializeAsset),
    installationWarranty: installationWarranty ? { status: installationWarranty.status, policyVersion: installationWarranty.policyVersion, startsAt: iso(installationWarranty.startsAt), endsAt: iso(installationWarranty.endsAt) } : null,
    serviceCases: cases.map((item) => ({ id: item.id, caseNumber: item.caseNumber, subject: item.subject, status: item.status, priority: item.priority, createdAt: item.createdAt.toISOString() })),
  };
}

export async function listCustomerAssets(actor: OpsActor) {
  assertCustomer(actor);
  const assets = await db.query.installedAssets.findMany({ where: eq(installedAssets.customerId, actor.userId), orderBy: [desc(installedAssets.installedDate)] });
  return assets.map(serializeAsset);
}

export async function listCustomerWarranties(actor: OpsActor) {
  assertCustomer(actor);
  const [installation, product] = await Promise.all([
    db.query.installationWarranties.findMany({ where: eq(installationWarranties.customerId, actor.userId), orderBy: [desc(installationWarranties.createdAt)] }),
    db.select({ warranty: productWarranties, asset: installedAssets })
      .from(productWarranties)
      .innerJoin(installedAssets, eq(productWarranties.assetId, installedAssets.id))
      .where(eq(installedAssets.customerId, actor.userId))
      .orderBy(desc(productWarranties.createdAt)),
  ]);
  return {
    installation: installation.map((item) => ({ id: item.id, projectId: item.projectId, status: item.status, policyVersion: item.policyVersion, startsAt: iso(item.startsAt), endsAt: iso(item.endsAt) })),
    product: product.map((item) => ({ id: item.warranty.id, provider: item.warranty.provider, productName: item.warranty.productName, status: item.warranty.status, startsAt: iso(item.warranty.startsAt), endsAt: iso(item.warranty.endsAt), asset: { id: item.asset.id, serialNumber: item.asset.serialNumber, productName: item.asset.productName } })),
  };
}
