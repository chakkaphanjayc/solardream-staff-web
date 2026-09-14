export const QUOTATION_WORKFLOW_STEPS = [
  "TECHNICAL_CONFIGURATION",
  "QUOTATION",
  "FINANCIAL_PAYMENT",
  "PROJECT_DOCUMENTATION",
  "REGISTRATION_WARRANTY",
] as const;

export type QuotationWorkflowStep = typeof QUOTATION_WORKFLOW_STEPS[number];

export type QuotationWorkflowFacts = {
  erpQuotationId: string | null;
  technicalReviewedAt: Date | null;
  completedQuotationAttached: boolean;
  quotationDispatchedAt: Date | null;
  clientApprovedAt: Date | null;
  paymentConfirmedAt: Date | null;
  fieldProjectId: string | null;
  fieldProjectFinished: boolean;
  projectDocumentationComplete: boolean;
  warrantyRegisteredAt: Date | null;
};

export type QuotationWorkflowState = {
  currentStep: number;
  unlockedThroughStep: number;
  lockedReasons: Readonly<Record<number, string | null>>;
};

export function deriveQuotationWorkflowState(facts: QuotationWorkflowFacts): QuotationWorkflowState {
  const technicalReady = Boolean(facts.erpQuotationId && facts.technicalReviewedAt);
  const quotationReady = technicalReady && facts.completedQuotationAttached;
  const clientApproved = quotationReady && Boolean(facts.quotationDispatchedAt && facts.clientApprovedAt);
  const paymentReady = clientApproved && Boolean(facts.paymentConfirmedAt && facts.fieldProjectId);
  const documentationReady = paymentReady && facts.fieldProjectFinished && facts.projectDocumentationComplete;
  const warrantyReady = documentationReady && Boolean(facts.warrantyRegisteredAt);
  const unlockedThroughStep = warrantyReady ? 5 : documentationReady ? 5 : paymentReady ? 4 : clientApproved ? 3 : technicalReady ? 2 : 1;
  const currentStep = warrantyReady ? 5 : documentationReady ? 5 : paymentReady ? 4 : clientApproved ? 3 : technicalReady ? 2 : 1;

  return {
    currentStep,
    unlockedThroughStep,
    lockedReasons: {
      1: null,
      2: technicalReady ? null : "Create and verify the ERPNext quotation first.",
      3: clientApproved ? null : "Wait for the client to approve the dispatched completed quotation.",
      4: paymentReady ? null : "Confirm payment and link the Field Project first.",
      5: documentationReady ? null : "Finish the Field Project and complete project documentation first.",
    },
  };
}

export function requireWorkflowStep(state: QuotationWorkflowState, step: number) {
  if (step < 1 || step > 5 || state.unlockedThroughStep < step) {
    throw new Error(state.lockedReasons[step] || "This workflow step is locked.");
  }
}
