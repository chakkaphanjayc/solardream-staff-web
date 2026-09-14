import type { DealState, DealTransitionContext } from "@/types/sales-v2";
const transitions: Record<DealState, readonly DealState[]> = {
 NEW:["QUALIFYING","LOST","CANCELLED"], QUALIFYING:["QUALIFIED","LOST","CANCELLED"], QUALIFIED:["SOLUTION_DESIGN","LOST","CANCELLED"], SOLUTION_DESIGN:["QUOTATION_ISSUED","LOST","CANCELLED"], QUOTATION_ISSUED:["ACCEPTED","LOST","CANCELLED"], ACCEPTED:["PAYMENT_PENDING","LOST","CANCELLED"], PAYMENT_PENDING:["PAID","LOST","CANCELLED"], PAID:["HANDOFF_READY","CANCELLED"], HANDOFF_READY:["HANDED_OFF","CANCELLED"], HANDED_OFF:[], LOST:[], CANCELLED:[],
};
export function canTransitionDeal(from: DealState, to: DealState, context: DealTransitionContext = {}): boolean {
  if (!transitions[from].includes(to)) return false;
  if (to === "QUALIFIED" && !context.hasQualification) return false;
  if (to === "ACCEPTED" && !context.hasAcceptedProposal) return false;
  if (to === "LOST" && !context.lossReason?.trim()) return false;
  return true;
}
export function assertDealTransition(from: DealState, to: DealState, context?: DealTransitionContext): void { if (!canTransitionDeal(from, to, context)) throw new Error(`Invalid deal transition: ${from} -> ${to}`); }
export const allowedDealTransitions = (state: DealState): readonly DealState[] => transitions[state];
