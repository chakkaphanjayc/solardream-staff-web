import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { installationWorkflowProjects, proposalRevisions, proposals, salesDealActivities, salesDeals } from "@/db/schema";
import { assertDealTransition, DealDomainError, type DealState, type DealTransitionContext } from "./deal-state-policy";

export type TransitionDealInput = {
  dealId: string;
  toState: DealState;
  expectedVersion: number;
  idempotencyKey: string;
  actorUserId?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown>;
};

function proposalIdFor(deal: typeof salesDeals.$inferSelect): string | null {
  const referenced = deal.sourceReferences.proposalId;
  return typeof referenced === "string" && referenced.trim() ? referenced : deal.sourceSystem === "PROPOSAL" ? deal.sourceId : null;
}

async function loadTransitionContext(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], deal: typeof salesDeals.$inferSelect): Promise<DealTransitionContext> {
  const proposalId = proposalIdFor(deal);
  const proposal = proposalId ? await tx.query.proposals.findFirst({ where: eq(proposals.id, proposalId) }) : null;
  const revision = proposalId ? await tx.query.proposalRevisions.findFirst({ where: eq(proposalRevisions.proposalId, proposalId), orderBy: [sql`${proposalRevisions.revisionNumber} desc`] }) : null;
  const project = proposalId ? await tx.query.installationWorkflowProjects.findFirst({ where: eq(installationWorkflowProjects.proposalId, proposalId) }) : null;
  return {
    hasCustomer: Boolean(deal.salesCustomerId || deal.customerId), hasSite: Boolean(deal.siteId), qualificationCompleted: Boolean(deal.qualificationCompletedAt),
    quotation: { official: Boolean(revision?.erpQuotationReference && revision.pdfDocumentReference), current: Boolean(revision && proposal && revision.revisionNumber === proposal.revisionNumber), issued: revision?.status === "SENT" || revision?.status === "VIEWED" || revision?.status === "ACCEPTED", expired: false },
    acceptance: { attributable: Boolean(revision?.acceptedAt), currentQuotation: Boolean(revision && proposal && revision.revisionNumber === proposal.revisionNumber) },
    payment: { verified: Boolean(proposal?.paidAt), policySatisfied: proposal?.paymentStatus === "FULLY_PAID" },
    handoff: { reference: project?.id ?? "", acceptanceValid: Boolean(revision?.acceptedAt), paymentSatisfied: proposal?.paymentStatus === "FULLY_PAID" },
  };
}

/** The sole mutation boundary for a Deal's internal lifecycle state. */
export async function transitionDeal(input: TransitionDealInput) {
  if (!input.dealId.trim() || !input.idempotencyKey.trim() || input.expectedVersion < 1)
    throw new DealDomainError("INVALID_INPUT", "Deal ID, idempotency key, and expected version are required.");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`sales-deal:${input.dealId}`}))`);
    const replay = await tx.query.salesDealActivities.findFirst({
      where: and(eq(salesDealActivities.dealId, input.dealId), eq(salesDealActivities.idempotencyKey, input.idempotencyKey)),
    });
    if (replay) {
      if (replay.toState !== input.toState) throw new DealDomainError("CONFLICT", "Idempotency key was already used for another transition.");
      return { activity: replay, replayed: true as const };
    }
    const deal = await tx.query.salesDeals.findFirst({ where: eq(salesDeals.id, input.dealId) });
    if (!deal) throw new DealDomainError("NOT_FOUND", "Deal was not found.");
    if (deal.version !== input.expectedVersion) throw new DealDomainError("CONFLICT", "Deal was modified by another request.");
    assertDealTransition(deal.lifecycleState, input.toState, await loadTransitionContext(tx, deal));
    if ((input.toState === "LOST" || input.toState === "CANCELLED") && !input.reason?.trim())
      throw new DealDomainError("INVALID_INPUT", "A reason is required for loss or cancellation.");
    const nextVersion = deal.version + 1;
    const [updated] = await tx.update(salesDeals).set({
      lifecycleState: input.toState,
      state: input.toState === "LOST" ? "LOST" : input.toState === "CANCELLED" ? "CANCELLED" : input.toState === "HANDED_OFF" ? "WON" : "OPEN",
      version: nextVersion,
      lossReason: input.toState === "LOST" ? input.reason!.trim() : deal.lossReason,
      closedAt: ["LOST", "CANCELLED", "HANDED_OFF"].includes(input.toState) ? new Date() : deal.closedAt,
      updatedAt: new Date(),
    }).where(and(eq(salesDeals.id, input.dealId), eq(salesDeals.version, input.expectedVersion))).returning();
    if (!updated) throw new DealDomainError("CONFLICT", "Deal was modified by another request.");
    const [activity] = await tx.insert(salesDealActivities).values({
      dealId: deal.id, actorUserId: input.actorUserId, fromState: deal.lifecycleState,
      toState: input.toState, reason: input.reason?.trim() || null, metadata: input.metadata ?? {},
      idempotencyKey: input.idempotencyKey, dealVersion: nextVersion,
    }).returning();
    if (!activity) throw new DealDomainError("CONFLICT", "Deal activity could not be recorded.");
    return { deal: updated, activity, replayed: false as const };
  });
}
