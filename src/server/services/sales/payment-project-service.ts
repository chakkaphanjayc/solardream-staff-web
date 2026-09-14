import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { proposals, sites, users } from "@/db/schema";
import { OpsDomainError } from "@/lib/opsV2State";
import { createInstallationProjectFromSalesHandoff } from "@/server/services/installations/create-project-from-sales-handoff";
import { validateSalesHandoff } from "./sales-handoff";

function text(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

const forbiddenSalesKey = /(^|_)(margin|discount|negotiation|internal_notes?|sales_internal|internal_sales)(_|$)|negotiationhistory|salesinternalnotes?/i;

/** Copies configuration while enforcing the installation boundary at every depth. */
export function sanitizeInstallationConfiguration(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const sanitized: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    const normalized = key.replace(/([a-z])([A-Z])/g, "$1_$2");
    if (forbiddenSalesKey.test(normalized)) continue;
    if (Array.isArray(nested)) {
      sanitized[key] = nested.map((item) => item && typeof item === "object" && !Array.isArray(item) ? sanitizeInstallationConfiguration(item) : item);
    } else if (nested && typeof nested === "object") {
      sanitized[key] = sanitizeInstallationConfiguration(nested);
    } else {
      sanitized[key] = nested;
    }
  }
  return sanitized;
}

/** Compatibility adapter for the legacy payment-triggered integration. */
export async function createInstallationProjectFromPayment(input: {
  proposalId: string;
  paymentEventKey: string;
  paymentId?: string | null;
  paidAt?: Date | null;
}) {
  if (!input.proposalId.trim() || !input.paymentEventKey.trim()) {
    throw new OpsDomainError("INVALID_INPUT", "A proposal ID and payment event key are required.");
  }
  const proposal = await db.query.proposals.findFirst({ where: eq(proposals.id, input.proposalId) });
  if (!proposal) throw new OpsDomainError("NOT_FOUND", "Payment completion references a missing proposal.");
  if (proposal.paymentStatus !== "FULLY_PAID" && proposal.paidAt === null) {
    throw new OpsDomainError("DEPENDENCY_BLOCKED", "The proposal is not fully paid.");
  }
  const [customer, existingSite] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, proposal.userId), columns: { fullName: true, name: true, email: true, phoneNumber: true } }),
    proposal.siteId ? db.query.sites.findFirst({ where: eq(sites.id, proposal.siteId) }) : Promise.resolve(undefined),
  ]);
  const configuration = sanitizeInstallationConfiguration(proposal.configurationData);
  const customerName = text(customer?.fullName) || text(customer?.name) || text(customer?.email) || "Customer";
  const address = text(existingSite?.addressLine1) || text(proposal.installationMapAddress) || text(configuration.address) || "Address pending site review";
  const documentReference = text(proposal.signedDocumentDriveUrl) || text(proposal.pdfUrl);
  const handoff = validateSalesHandoff({
    dealId: proposal.id,
    acceptedProposalRevision: { id: `legacy:${proposal.id}:${proposal.revisionNumber}`, proposalId: proposal.id, revisionNumber: proposal.revisionNumber },
    customer: { userId: proposal.userId, name: customerName, ...(customer?.email ? { email: customer.email } : {}), ...(customer?.phoneNumber ? { phone: customer.phoneNumber } : {}) },
    site: {
      ...(existingSite ? { id: existingSite.id } : {}),
      label: text(existingSite?.label) || `${customerName} installation site`,
      addressLine1: address,
      ...(existingSite?.city ? { city: existingSite.city } : {}),
      ...(existingSite?.province ? { province: existingSite.province } : {}),
      ...(existingSite?.postalCode ? { postalCode: existingSite.postalCode } : {}),
      country: text(existingSite?.country) || "Thailand",
      ...(proposal.installationNotes ? { accessNote: proposal.installationNotes } : {}),
    },
    ...(proposal.erpnextQuotationId ? { erpSalesOrderReference: proposal.erpnextQuotationId } : {}),
    paymentSnapshot: { status: "FULLY_PAID", ...(input.paymentId ? { paymentId: input.paymentId } : {}), paidAt: (input.paidAt || proposal.paidAt || new Date()).toISOString() },
    configurationSnapshot: configuration,
    documentManifest: documentReference ? [{ kind: "ACCEPTED_PROPOSAL", reference: documentReference, revision: String(proposal.revisionNumber) }] : [],
    operationalNote: proposal.installationNotes || undefined,
    readinessPolicyVersion: "PAYMENT-COMPAT-2026-V1",
    status: "READY",
    idempotencyKey: input.paymentEventKey,
  });
  return createInstallationProjectFromSalesHandoff(handoff);
}
