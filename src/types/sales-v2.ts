export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export const DEAL_STATES = ["NEW", "QUALIFYING", "QUALIFIED", "SOLUTION_DESIGN", "QUOTATION_ISSUED", "ACCEPTED", "PAYMENT_PENDING", "PAID", "HANDOFF_READY", "HANDED_OFF", "LOST", "CANCELLED"] as const;
export type DealState = (typeof DEAL_STATES)[number];
export type ProposalState = "DRAFT" | "ISSUED" | "VIEWED" | "ACCEPTED" | "DECLINED" | "EXPIRED" | "VOIDED";
export type PaymentState = "DRAFT" | "PENDING" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "CANCELLED";
export type HandoffState = "PENDING" | "READY" | "BLOCKED" | "CONSUMED";
export type SalesActor = { userId: string; role: "OWNER" | "SALES" | "MANAGER" | "ADMIN" | "SYSTEM" };
export interface DealTransitionContext { hasQualification?: boolean; hasAcceptedProposal?: boolean; lossReason?: string }
export interface ProposalTransitionContext { hasRevision?: boolean; signatureVerified?: boolean }
export interface PaymentTransitionContext { paidAmount?: number; totalAmount?: number }
export interface HandoffTransitionContext { proposalAccepted?: boolean; paymentReady?: boolean; configurationReady?: boolean }
export interface SalesEvent<T extends JsonValue = JsonValue> { type: string; aggregateId: string; occurredAt: string; actorId?: string; payload: T }
export interface QualificationSnapshot { outcome: string; reason?: string; propertyType?: string; ownership?: string; monthlyElectricityCost?: number; electricalPhase?: string; roofType?: string; budgetMin?: number; budgetMax?: number; timeline?: string; decisionMaker?: string; goal?: string }
export interface SolutionSnapshot { catalogVersion: string; configuration: Record<string, JsonValue>; assumptions?: Record<string, JsonValue> }
export interface CommercialSnapshot { currency: string; subtotal: number; discount: number; tax: number; total: number; terms: Record<string, JsonValue> }
export interface HandoffSnapshot { customer: Record<string, JsonValue>; site: Record<string, JsonValue>; configuration: Record<string, JsonValue>; payment: Record<string, JsonValue>; documents: Array<Record<string, JsonValue>> }
