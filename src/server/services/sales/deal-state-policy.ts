export const DEAL_STATES = [
  "NEW", "QUALIFYING", "QUALIFIED", "SOLUTION_DESIGN", "QUOTATION_ISSUED",
  "ACCEPTED", "PAYMENT_PENDING", "PAID", "HANDOFF_READY", "HANDED_OFF",
  "LOST", "CANCELLED",
] as const;

export type DealState = (typeof DEAL_STATES)[number];

export const DEAL_TRANSITIONS = {
  NEW: ["QUALIFYING", "LOST", "CANCELLED"],
  QUALIFYING: ["QUALIFIED", "LOST", "CANCELLED"],
  QUALIFIED: ["SOLUTION_DESIGN", "LOST", "CANCELLED"],
  SOLUTION_DESIGN: ["QUOTATION_ISSUED", "LOST", "CANCELLED"],
  QUOTATION_ISSUED: ["ACCEPTED", "LOST", "CANCELLED"],
  ACCEPTED: ["PAYMENT_PENDING", "LOST", "CANCELLED"],
  PAYMENT_PENDING: ["PAID", "LOST", "CANCELLED"],
  PAID: ["HANDOFF_READY", "CANCELLED"],
  HANDOFF_READY: ["HANDED_OFF", "CANCELLED"],
  HANDED_OFF: [], LOST: [], CANCELLED: [],
} as const satisfies Record<DealState, readonly DealState[]>;

export type DealTransitionContext = {
  hasCustomer?: boolean;
  hasSite?: boolean;
  qualificationCompleted?: boolean;
  quotation?: { official: boolean; current: boolean; issued: boolean; expired: boolean };
  acceptance?: { attributable: boolean; currentQuotation: boolean };
  payment?: { verified: boolean; policySatisfied: boolean };
  handoff?: { reference: string; acceptanceValid: boolean; paymentSatisfied: boolean };
};

export type DealErrorCode = "NOT_FOUND" | "INVALID_TRANSITION" | "PREDICATE_FAILED" | "CONFLICT" | "INVALID_INPUT";
export class DealDomainError extends Error {
  constructor(public readonly code: DealErrorCode, message: string) { super(message); this.name = "DealDomainError"; }
}

export function assertDealTransition(from: DealState, to: DealState, context: DealTransitionContext): void {
  if (!(DEAL_TRANSITIONS[from] as readonly DealState[]).includes(to))
    throw new DealDomainError("INVALID_TRANSITION", `Deal cannot transition from ${from} to ${to}.`);
  const fail = (message: string): never => { throw new DealDomainError("PREDICATE_FAILED", message); };
  if (to === "QUALIFIED" && (!context.hasCustomer || !context.hasSite || !context.qualificationCompleted)) fail("Qualification requires a customer, site, and completed assessment.");
  if (to === "QUOTATION_ISSUED" && (!context.quotation?.official || !context.quotation.current || !context.quotation.issued || context.quotation.expired)) fail("An official, current, unexpired quotation is required.");
  if (to === "ACCEPTED" && (!context.acceptance?.attributable || !context.acceptance.currentQuotation)) fail("Acceptance of the current quotation by an attributable actor is required.");
  if (to === "PAID" && (!context.payment?.verified || !context.payment.policySatisfied)) fail("Verified payment satisfying policy is required.");
  if (to === "HANDED_OFF" && (!context.handoff?.reference.trim() || !context.handoff.acceptanceValid || !context.handoff.paymentSatisfied)) fail("A durable handoff reference, valid acceptance, and satisfied payment are required.");
}
