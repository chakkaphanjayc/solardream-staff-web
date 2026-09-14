"use server";

import { desc } from "drizzle-orm";

import { db } from "@/db";
import {
  consultationLeads,
  inboundRequests,
  installationJobTickets,
  installationProjects,
  installationWorkflowProjects,
  jobTickets,
  leads,
  proposals,
} from "@/db/schema";
import { requireStaff } from "@/lib/auth-guard";
import type {
  SalesThread,
  SalesThreadInstallation,
  SalesThreadLead,
} from "@/types/salesThread";

type JsonRecord = Record<string, unknown>;

type LeadRow = typeof leads.$inferSelect;
type ConsultationLeadRow = typeof consultationLeads.$inferSelect;
type InboundRequestRow = typeof inboundRequests.$inferSelect;
type ProposalRow = typeof proposals.$inferSelect & {
  user: {
    name: string | null;
    fullName: string;
    email: string;
    phoneNumber: string | null;
  } | null;
  wizardLead: (ConsultationLeadRow & { legacyLead: LeadRow | null }) | null;
};
type WorkflowProjectRow = typeof installationWorkflowProjects.$inferSelect;
type InstallationJobTicketRow = typeof installationJobTickets.$inferSelect;
type LegacyProjectRow = typeof installationProjects.$inferSelect;
type LegacyJobTicketRow = typeof jobTickets.$inferSelect;

type LeadContext = {
  legacy: LeadRow | null;
  consultation: ConsultationLeadRow | null;
  inbound: InboundRequestRow | null;
};

function asRecord(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toIsoDate(value: Date | string | null | undefined): string {
  const date = value instanceof Date ? value : new Date(String(value ?? ""));
  return Number.isNaN(date.getTime())
    ? new Date(0).toISOString()
    : date.toISOString();
}

function setFirst<T>(map: Map<string, T>, key: string | null, value: T) {
  if (key && !map.has(key)) map.set(key, value);
}

function makeLeadNode(
  context: LeadContext,
  fallbackErpnextLeadId: string | null = null,
): SalesThreadLead | null {
  if (context.legacy) {
    return {
      id: context.legacy.id,
      source: "LEGACY_LEAD",
      target: "CRM_RECORD",
      name: context.legacy.name,
      email: context.legacy.email || null,
      phone: context.legacy.phone || null,
      status: context.legacy.status,
      erpnextLeadId: fallbackErpnextLeadId,
      consultationLeadId: context.consultation?.id ?? null,
      inboundRequestId: context.inbound?.id ?? null,
    };
  }

  if (context.inbound) {
    return {
      id: context.inbound.id,
      source: "INBOUND_REQUEST",
      target: "SALES_PIPELINE",
      name: context.inbound.customerName,
      email: context.inbound.email,
      phone: context.inbound.phone,
      status: context.inbound.status,
      erpnextLeadId: context.inbound.erpnextLeadId,
      consultationLeadId:
        context.consultation?.id ?? context.inbound.consultationLeadId,
      inboundRequestId: context.inbound.id,
    };
  }

  if (context.consultation) {
    return {
      id: context.consultation.id,
      source: "CONSULTATION_LEAD",
      target: "SALES_PIPELINE",
      name: context.consultation.customerName,
      email: context.consultation.email,
      phone: context.consultation.phone,
      status: context.consultation.status,
      erpnextLeadId: context.consultation.erpLeadId,
      consultationLeadId: context.consultation.id,
      inboundRequestId: null,
    };
  }

  return null;
}

function leadContextKeys(context: LeadContext): string[] {
  return [
    context.legacy ? `legacy:${context.legacy.id}` : null,
    context.consultation ? `consultation:${context.consultation.id}` : null,
    context.inbound ? `inbound:${context.inbound.id}` : null,
  ].filter((key): key is string => Boolean(key));
}

function resolveInstallation(
  proposalId: string | null,
  context: LeadContext,
  workflowProjectsByProposal: Map<string, WorkflowProjectRow>,
  jobTicketsByProposal: Map<string, InstallationJobTicketRow>,
  legacyProjectsByLead: Map<string, LegacyProjectRow>,
  legacyJobTicketsByProposal: Map<string, LegacyJobTicketRow>,
): SalesThreadInstallation | null {
  const workflowProject = proposalId
    ? workflowProjectsByProposal.get(proposalId) ?? null
    : null;
  const jobTicket = proposalId
    ? jobTicketsByProposal.get(proposalId) ?? null
    : null;
  const legacyProject = context.legacy
    ? legacyProjectsByLead.get(context.legacy.id) ?? null
    : null;
  const legacyJobTicket = proposalId
    ? legacyJobTicketsByProposal.get(proposalId) ?? null
    : null;

  if (!workflowProject && !jobTicket && !legacyProject && !legacyJobTicket) {
    return null;
  }

  return {
    id:
      workflowProject?.id ??
      jobTicket?.id ??
      legacyProject?.id ??
      legacyJobTicket?.id ??
      "",
    source: workflowProject
      ? "WORKFLOW_PROJECT"
      : jobTicket
        ? "JOB_TICKET"
        : "LEGACY_PROJECT",
    projectId: workflowProject?.id ?? null,
    projectCode: workflowProject?.projectCode ?? null,
    projectStatus: workflowProject?.status ?? null,
    erpnextProjectId: workflowProject?.erpnextProjectId ?? null,
    jobTicketId: jobTicket?.id ?? null,
    jobTicketStatus: jobTicket?.status ?? null,
    legacyProjectId: legacyProject?.id ?? null,
    legacyJobTicketId: legacyJobTicket?.id ?? null,
    legacyJobTicketStatus: legacyJobTicket?.status ?? null,
    proposalId,
  };
}

function resolveProposalLeadContext(
  proposal: ProposalRow,
  consultationLeadsById: Map<string, ConsultationLeadRow>,
  inboundRequestsById: Map<string, InboundRequestRow>,
  inboundRequestsByQuotation: Map<string, InboundRequestRow>,
  consultationLeadsByInboundRequest: Map<string, ConsultationLeadRow>,
  legacyLeadsById: Map<string, LeadRow>,
): LeadContext {
  const config = asRecord(proposal.configurationData);
  const inboundRequestId = getString(config.inboundRequestId);
  const inbound =
    (inboundRequestId ? inboundRequestsById.get(inboundRequestId) : null) ??
    inboundRequestsByQuotation.get(proposal.id) ??
    null;
  const consultationLeadId =
    proposal.wizardLead?.id ??
    getString(config.sourceConsultationLeadId) ??
    (inbound?.consultationLeadId || null);
  const consultation =
    proposal.wizardLead ??
    (consultationLeadId
      ? consultationLeadsById.get(consultationLeadId) ??
        (inbound ? consultationLeadsByInboundRequest.get(inbound.id) ?? null : null)
      : inbound
        ? consultationLeadsByInboundRequest.get(inbound.id) ?? null
        : null);
  const sourceLeadId =
    getString(config.sourceLeadId) ?? consultation?.legacyLeadId ?? null;
  const legacy = sourceLeadId ? legacyLeadsById.get(sourceLeadId) ?? null : null;

  return { legacy, consultation, inbound };
}

function buildProposalThread(
  proposal: ProposalRow,
  context: LeadContext,
  workflowProjectsByProposal: Map<string, WorkflowProjectRow>,
  jobTicketsByProposal: Map<string, InstallationJobTicketRow>,
  legacyProjectsByLead: Map<string, LegacyProjectRow>,
  legacyJobTicketsByProposal: Map<string, LegacyJobTicketRow>,
): SalesThread {
  const config = asRecord(proposal.configurationData);
  const lead = makeLeadNode(
    context,
    getString(asRecord(config.erpSync).erpnextLeadId) ??
      getString(asRecord(config.erpSync).erpLeadId),
  );
  const customerName =
    proposal.user?.name?.trim() ||
    proposal.user?.fullName?.trim() ||
    proposal.user?.email?.trim() ||
    lead?.name ||
    getString(config.clientName) ||
    "Unknown customer";
  const email =
    proposal.user?.email?.trim() ||
    getString(config.email) ||
    lead?.email ||
    null;
  const phone =
    proposal.user?.phoneNumber?.trim() ||
    getString(config.phone) ||
    lead?.phone ||
    null;

  return {
    id: proposal.id,
    customerName,
    email,
    phone,
    createdAt: toIsoDate(proposal.createdAt),
    lead,
    quotation: {
      id: proposal.id,
      documentNo: `QT-${proposal.id.slice(0, 8).toUpperCase()}`,
      status: proposal.status,
      erpnextQuotationId: proposal.erpnextQuotationId,
    },
    installation: resolveInstallation(
      proposal.id,
      context,
      workflowProjectsByProposal,
      jobTicketsByProposal,
      legacyProjectsByLead,
      legacyJobTicketsByProposal,
    ),
  };
}

function buildLeadOnlyThread(
  id: string,
  context: LeadContext,
  workflowProjectsByProposal: Map<string, WorkflowProjectRow>,
  jobTicketsByProposal: Map<string, InstallationJobTicketRow>,
  legacyProjectsByLead: Map<string, LegacyProjectRow>,
  legacyJobTicketsByProposal: Map<string, LegacyJobTicketRow>,
): SalesThread {
  const lead = makeLeadNode(context);
  const source = context.inbound ?? context.consultation ?? context.legacy;
  const customerName =
    lead?.name ||
    (source && "customerName" in source ? source.customerName : null) ||
    (source && "name" in source ? source.name : null) ||
    "Unknown customer";
  const email =
    lead?.email ||
    (source && "email" in source ? source.email : null) ||
    null;
  const phone =
    lead?.phone ||
    (source && "phone" in source ? source.phone : null) ||
    null;
  const createdAt = source?.createdAt ?? new Date(0);

  return {
    id,
    customerName,
    email,
    phone,
    createdAt: toIsoDate(createdAt),
    lead,
    quotation: null,
    installation: resolveInstallation(
      null,
      context,
      workflowProjectsByProposal,
      jobTicketsByProposal,
      legacyProjectsByLead,
      legacyJobTicketsByProposal,
    ),
  };
}

async function loadSalesThreads(): Promise<SalesThread[]> {
  const [
    legacyLeadRows,
    consultationLeadRows,
    inboundRequestRows,
    proposalRows,
    workflowProjectRows,
    installationJobTicketRows,
    legacyProjectRows,
    legacyJobTicketRows,
  ] = await Promise.all([
    db.query.leads.findMany({ orderBy: [desc(leads.createdAt)] }),
    db.query.consultationLeads.findMany({
      orderBy: [desc(consultationLeads.createdAt)],
      with: { legacyLead: true },
    }),
    db.query.inboundRequests
      .findMany({ orderBy: [desc(inboundRequests.createdAt)] })
      .catch((error: unknown) => {
        console.error("[Sales Thread] inbound request table is unavailable:", error);
        return [] as InboundRequestRow[];
      }),
    db.query.proposals.findMany({
      orderBy: [desc(proposals.createdAt)],
      with: {
        user: {
          columns: {
            name: true,
            fullName: true,
            email: true,
            phoneNumber: true,
          },
        },
        wizardLead: {
          with: { legacyLead: true },
        },
      },
    }) as Promise<ProposalRow[]>,
    db.query.installationWorkflowProjects.findMany({
      orderBy: [desc(installationWorkflowProjects.createdAt)],
    }),
    db.query.installationJobTickets.findMany({
      orderBy: [desc(installationJobTickets.createdAt)],
    }),
    db.query.installationProjects.findMany({
      orderBy: [desc(installationProjects.createdAt)],
    }),
    db.query.jobTickets.findMany({ orderBy: [desc(jobTickets.createdAt)] }),
  ]);

  const legacyLeadsById = new Map(legacyLeadRows.map((row) => [row.id, row]));
  const consultationLeadsById = new Map(
    consultationLeadRows.map((row) => [row.id, row]),
  );
  const inboundRequestsById = new Map(
    inboundRequestRows.map((row) => [row.id, row]),
  );
  const inboundRequestsByQuotation = new Map<string, InboundRequestRow>();
  const consultationLeadsByInboundRequest = new Map<string, ConsultationLeadRow>();
  for (const row of inboundRequestRows) {
    setFirst(inboundRequestsByQuotation, row.quotationId, row);
    if (row.consultationLeadId) {
      const consultation = consultationLeadsById.get(row.consultationLeadId);
      if (consultation) setFirst(consultationLeadsByInboundRequest, row.id, consultation);
    }
  }

  const workflowProjectsByProposal = new Map(
    workflowProjectRows.map((row) => [row.proposalId, row]),
  );
  const jobTicketsByProposal = new Map(
    installationJobTicketRows.map((row) => [row.quotationId, row]),
  );
  const legacyProjectsByLead = new Map(
    legacyProjectRows.map((row) => [row.leadId, row]),
  );
  const legacyJobTicketsByProposal = new Map(
    legacyJobTicketRows.map((row) => [row.proposalId, row]),
  );

  const representedLeadKeys = new Set<string>();
  const threads = proposalRows.map((proposal) => {
    const context = resolveProposalLeadContext(
      proposal,
      consultationLeadsById,
      inboundRequestsById,
      inboundRequestsByQuotation,
      consultationLeadsByInboundRequest,
      legacyLeadsById,
    );
    for (const key of leadContextKeys(context)) representedLeadKeys.add(key);
    return buildProposalThread(
      proposal,
      context,
      workflowProjectsByProposal,
      jobTicketsByProposal,
      legacyProjectsByLead,
      legacyJobTicketsByProposal,
    );
  });

  for (const inbound of inboundRequestRows) {
    if (inbound.quotationId || representedLeadKeys.has(`inbound:${inbound.id}`)) {
      continue;
    }
    const consultation = inbound.consultationLeadId
      ? consultationLeadsById.get(inbound.consultationLeadId) ?? null
      : null;
    const context: LeadContext = {
      inbound,
      consultation,
      legacy: consultation?.legacyLeadId
        ? legacyLeadsById.get(consultation.legacyLeadId) ?? null
        : null,
    };
    for (const key of leadContextKeys(context)) representedLeadKeys.add(key);
    threads.push(
      buildLeadOnlyThread(
        `inbound:${inbound.id}`,
        context,
        workflowProjectsByProposal,
        jobTicketsByProposal,
        legacyProjectsByLead,
        legacyJobTicketsByProposal,
      ),
    );
  }

  for (const consultation of consultationLeadRows) {
    const context: LeadContext = {
      consultation,
      legacy: consultation.legacyLeadId
        ? legacyLeadsById.get(consultation.legacyLeadId) ?? null
        : null,
      inbound: null,
    };
    if (leadContextKeys(context).some((key) => representedLeadKeys.has(key))) continue;
    for (const key of leadContextKeys(context)) representedLeadKeys.add(key);
    threads.push(
      buildLeadOnlyThread(
        `consultation:${consultation.id}`,
        context,
        workflowProjectsByProposal,
        jobTicketsByProposal,
        legacyProjectsByLead,
        legacyJobTicketsByProposal,
      ),
    );
  }

  for (const legacy of legacyLeadRows) {
    const context: LeadContext = { legacy, consultation: null, inbound: null };
    if (representedLeadKeys.has(`legacy:${legacy.id}`)) continue;
    threads.push(
      buildLeadOnlyThread(
        `legacy:${legacy.id}`,
        context,
        workflowProjectsByProposal,
        jobTicketsByProposal,
        legacyProjectsByLead,
        legacyJobTicketsByProposal,
      ),
    );
  }

  return threads.sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}

export async function getSalesThreads(): Promise<
  | { success: true; threads: SalesThread[] }
  | { success: false; error: string }
> {
  try {
    await requireStaff();
    return { success: true, threads: await loadSalesThreads() };
  } catch (error: unknown) {
    console.error("Failed to load sales threads:", error);
    return { success: false, error: "Failed to load sales thread data." };
  }
}

export async function getSalesThreadByProposal(
  proposalId: string,
): Promise<SalesThread | null> {
  await requireStaff();
  const threads = await loadSalesThreads();
  return threads.find((thread) => thread.quotation?.id === proposalId) ?? null;
}

export async function getSalesThreadByLead(leadId: string): Promise<SalesThread | null> {
  await requireStaff();
  const threads = await loadSalesThreads();
  return threads.find((thread) => thread.lead?.id === leadId) ?? null;
}
