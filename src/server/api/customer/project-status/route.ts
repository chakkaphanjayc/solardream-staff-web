import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { proposals } from "@/db/schema";
import {
  getErpnextQuotation,
  getErpnextSalesOrder,
  getErpnextTasksByProject,
  getProjectBySalesOrder,
  type ErpnextDocument,
} from "@/lib/erpnext";
import { portalJson, resolvePortalAccess } from "@/lib/portalAccess";

const projectStatusQuerySchema = z.object({
  proposal_id: z.string().trim().min(1).max(160).optional(),
  quotation_id: z.string().trim().min(1).max(160).optional(),
}).refine((value) => Boolean(value.proposal_id || value.quotation_id), {
  message: "proposal_id or quotation_id is required.",
});

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function getText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function getNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getGoldenThreadState(configurationData: unknown) {
  const config = asRecord(configurationData);
  const state = asRecord(config.goldenThread);
  return {
    salesOrderId: getText(state.salesOrderId),
    projectId: getText(state.projectId),
  };
}

function summarizeQuotation(quotation: ErpnextDocument) {
  return {
    id: getText(quotation.name),
    status: getText(quotation.status),
    docstatus: getNumber(quotation.docstatus),
    transactionDate: getText(quotation.transaction_date) || null,
    grandTotal: getNumber(quotation.grand_total),
  };
}

function summarizeSalesOrder(salesOrder: ErpnextDocument) {
  return {
    id: getText(salesOrder.name),
    status: getText(salesOrder.status),
    docstatus: getNumber(salesOrder.docstatus),
    transactionDate: getText(salesOrder.transaction_date) || null,
    grandTotal: getNumber(salesOrder.grand_total),
  };
}

function summarizeProject(project: ErpnextDocument, tasks: ErpnextDocument[]) {
  return {
    id: getText(project.name),
    name: getText(project.project_name) || getText(project.name),
    status: getText(project.status),
    customer: getText(project.customer) || null,
    percentComplete: getNumber(project.percent_complete),
    expectedStartDate: getText(project.expected_start_date) || null,
    expectedEndDate: getText(project.expected_end_date) || null,
    tasks: tasks.map((task) => ({
      id: getText(task.name),
      title: getText(task.subject) || getText(task.name),
      status: getText(task.status),
      progress: getNumber(task.progress),
      priority: getText(task.priority) || null,
      expectedStartDate: getText(task.exp_start_date) || null,
      expectedEndDate: getText(task.exp_end_date) || null,
      completedOn: getText(task.completed_on) || null,
    })),
  };
}

export async function GET(request: NextRequest) {
  const parsed = projectStatusQuerySchema.safeParse({
    proposal_id: request.nextUrl.searchParams.get("proposal_id") || undefined,
    quotation_id: request.nextUrl.searchParams.get("quotation_id") || undefined,
  });
  if (!parsed.success) {
    return portalJson(
      { success: false, error: "proposal_id or quotation_id is required." },
      { status: 400 },
    );
  }

  const proposal = parsed.data.proposal_id
    ? await db.query.proposals.findFirst({ where: eq(proposals.id, parsed.data.proposal_id) })
    : await db.query.proposals.findFirst({ where: eq(proposals.erpnextQuotationId, parsed.data.quotation_id || "") });
  if (!proposal) return portalJson({ success: false, error: "Project status not found." }, { status: 404 });

  const access = await resolvePortalAccess({
    request,
    proposalId: proposal.id,
    capability: "proposal:read",
  });
  if (!access) return portalJson({ success: false, error: "Access denied." }, { status: 401 });

  try {
    const quotationId = access.proposal.erpnextQuotationId?.trim();
    if (!quotationId) {
      return portalJson({ success: false, error: "ERPNext quotation is not available yet." }, { status: 409 });
    }

    const quotation = await getErpnextQuotation(quotationId);
    const goldenThreadState = getGoldenThreadState(access.proposal.configurationData);
    const customer = {
      id: getText(quotation.customer),
      name: getText(quotation.customer_name) || getText(quotation.customer),
    };
    const quotationSummary = summarizeQuotation(quotation);

    if (!goldenThreadState.salesOrderId) {
      return portalJson({
        success: true,
        status: "SALES_ORDER_PENDING",
        goldenThread: {
          customer,
          quotation: quotationSummary,
          salesOrder: null,
        },
      });
    }

    const salesOrder = await getErpnextSalesOrder(goldenThreadState.salesOrderId);
    const project = await getProjectBySalesOrder(goldenThreadState.salesOrderId);
    const tasks = project?.name ? await getErpnextTasksByProject(getText(project.name)) : [];
    const projectSummary = project ? summarizeProject(project, tasks) : null;

    return portalJson({
      success: true,
      status: projectSummary ? "PROJECT_CREATED" : "PROJECT_PENDING",
      goldenThread: {
        customer,
        quotation: quotationSummary,
        salesOrder: {
          ...summarizeSalesOrder(salesOrder),
          project: projectSummary,
        },
      },
    });
  } catch (error: unknown) {
    console.error("[Customer Project Status] Failed to load ERPNext hierarchy.", {
      proposalId: proposal.id,
      error: error instanceof Error ? error.message : "Unknown ERPNext error.",
    });
    return portalJson(
      {
        success: false,
        error: "Project status is temporarily unavailable. Please try again.",
        retryable: true,
      },
      { status: 503 },
    );
  }
}
