import type { CrmRow } from "@/lib/crmRows";

export const SALES_WORKFLOW_STAGES = [
  { id: "lead", label: "Lead", description: "Request and qualification" },
  { id: "design", label: "Design", description: "Site requirements and BOQ" },
  { id: "quote", label: "Quote", description: "Commercial quotation" },
  { id: "sign", label: "Sign", description: "Customer review and signature" },
  { id: "payment", label: "Payment", description: "Payment plan and deposit" },
  { id: "handoff", label: "Handoff", description: "Ready for operations" },
  { id: "installation", label: "Installation", description: "Project delivery" },
] as const;

export type SalesWorkflowStageId = (typeof SALES_WORKFLOW_STAGES)[number]["id"];

export const SALES_WORKSPACE_TABS = [
  "overview",
  "boq",
  "quotation",
  "documents",
  "payment",
  "handoff",
  "activity",
] as const;

export type SalesWorkspaceTabId = (typeof SALES_WORKSPACE_TABS)[number];

export type SalesWorkspaceAction =
  | "convert"
  | "boq"
  | "quotation"
  | "sign"
  | "payment"
  | "handoff"
  | "none";

export type SalesWorkspaceFact = {
  id: string;
  label: string;
  complete: boolean;
  detail?: string;
};

export type SalesWorkspaceFacts = {
  record: CrmRow;
  lineItemCount: number;
  hasSite: boolean;
  hasTechnicalDesign: boolean;
  hasAgreedPrice: boolean;
  hasPortalLink: boolean;
  hasSentToCustomer: boolean;
  hasClientApproval: boolean;
  hasRequiredDocuments: boolean;
  requiredDocumentCount: number;
  approvedDocumentCount: number;
  hasDeposit: boolean;
  hasPaymentComplete: boolean;
  hasInstallationProject: boolean;
  hasCustomerErpBinding: boolean;
};

export type SalesWorkflowStep = {
  id: SalesWorkflowStageId;
  label: string;
  description: string;
  state: "complete" | "current" | "upcoming";
};

export type SalesWorkspaceState = {
  currentStage: SalesWorkflowStageId;
  currentStageIndex: number;
  completedStageCount: number;
  statusLabel: string;
  isTerminal: boolean;
  steps: readonly SalesWorkflowStep[];
  currentAction: {
    action: SalesWorkspaceAction;
    title: string;
    description: string;
    ctaLabel: string;
    facts: readonly SalesWorkspaceFact[];
    blockedReason: string | null;
  };
};

function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function stageIndex(stage: SalesWorkflowStageId) {
  return SALES_WORKFLOW_STAGES.findIndex((item) => item.id === stage);
}

function statusLabel(record: CrmRow, facts: SalesWorkspaceFacts) {
  const status = record.status.trim().toUpperCase();
  if (status === "LOST") return "Lost";
  if (status === "CANCELLED") return "Cancelled";
  if (facts.hasClientApproval) return "Quotation accepted";
  if (facts.hasSentToCustomer) return "Waiting for customer";
  if (facts.hasAgreedPrice) return "Commercial review";
  if (facts.hasTechnicalDesign) return "Technical review";
  return record.type === "LEAD" ? "New request" : "Draft case";
}

function buildFacts(facts: SalesWorkspaceFacts): readonly SalesWorkspaceFact[] {
  const customerComplete = hasText(facts.record.customerName) && (
    hasText(facts.record.email) || hasText(facts.record.phone)
  );

  return [
    {
      id: "customer",
      label: "Customer information complete",
      complete: customerComplete,
      detail: customerComplete ? "Name and a contact channel are available." : "Add a name and contact channel before progressing.",
    },
    {
      id: "site",
      label: "Site requirement captured",
      complete: facts.hasSite,
      detail: facts.hasSite ? "A location or installation address is attached." : "Add the installation location or site requirement.",
    },
    {
      id: "boq",
      label: "BOQ configured",
      complete: facts.hasTechnicalDesign,
      detail: facts.hasTechnicalDesign ? `${facts.lineItemCount} technical line item${facts.lineItemCount === 1 ? "" : "s"} staged.` : "Add equipment and quantities in the BOQ.",
    },
    {
      id: "erp-customer",
      label: "ERPNext customer connected",
      complete: facts.hasCustomerErpBinding,
      detail: facts.hasCustomerErpBinding ? "The stable ERPNext customer ID is linked." : "Create or bind the ERPNext customer record.",
    },
    {
      id: "selling-price",
      label: "Selling price confirmed",
      complete: facts.hasAgreedPrice,
      detail: facts.hasAgreedPrice ? "A commercial total is available for review." : "Enter the agreed selling price before issuing a quote.",
    },
    {
      id: "portal",
      label: "Customer portal prepared",
      complete: facts.hasPortalLink,
      detail: facts.hasPortalLink ? "A secure portal link is available." : "Prepare portal access when the quotation is ready.",
    },
    {
      id: "acceptance",
      label: "Quotation accepted",
      complete: facts.hasClientApproval,
      detail: facts.hasClientApproval ? "The current quotation has a customer acceptance event." : "Customer acceptance is required before payment.",
    },
    {
      id: "documents",
      label: "Required documents complete",
      complete: facts.hasRequiredDocuments,
      detail: facts.requiredDocumentCount === 0
        ? "No required customer documents are configured."
        : `${facts.approvedDocumentCount} of ${facts.requiredDocumentCount} required document${facts.requiredDocumentCount === 1 ? "" : "s"} approved.`,
    },
    {
      id: "deposit",
      label: "Deposit received",
      complete: facts.hasDeposit,
      detail: facts.hasDeposit ? "At least one payment milestone is verified." : "Verify the deposit before creating the installation project.",
    },
    {
      id: "design-approved",
      label: "Technical design approved",
      complete: facts.hasTechnicalDesign && facts.hasAgreedPrice,
      detail: facts.hasTechnicalDesign && facts.hasAgreedPrice ? "The staged solution has a commercial total." : "Finish the BOQ and commercial review.",
    },
  ];
}

function firstMissing(facts: readonly SalesWorkspaceFact[]) {
  return facts.find((fact) => !fact.complete) ?? null;
}

function buildCurrentAction(
  facts: SalesWorkspaceFacts,
  currentStage: SalesWorkflowStageId,
): SalesWorkspaceState["currentAction"] {
  const allFacts = buildFacts(facts);
  const byId = new Map(allFacts.map((fact) => [fact.id, fact]));
  const pick = (...ids: string[]) => ids.map((id) => byId.get(id)).filter((fact): fact is SalesWorkspaceFact => Boolean(fact));

  if (facts.record.status.trim().toUpperCase() === "LOST" || facts.record.status.trim().toUpperCase() === "CANCELLED") {
    return {
      action: "none",
      title: "Case is closed",
      description: "This case is retained for reporting. Reopen it through the approved sales process if the customer returns.",
      ctaLabel: "Case closed",
      facts: allFacts.slice(0, 3),
      blockedReason: null,
    };
  }

  switch (currentStage) {
    case "lead": {
      const required = pick("customer", "site");
      const missing = firstMissing(required);
      return {
        action: facts.record.type === "LEAD" ? "convert" : "boq",
        title: facts.record.type === "LEAD" ? "Qualify this request" : "Confirm the request scope",
        description: facts.record.type === "LEAD"
          ? "Turn the request into a sales case once the customer and site context are ready."
          : "Capture the customer context and site requirement before technical design begins.",
        ctaLabel: facts.record.type === "LEAD" ? "Convert to sales case" : "Review request",
        facts: required,
        blockedReason: missing ? `Complete “${missing.label.toLowerCase()}” before continuing.` : null,
      };
    }
    case "design": {
      const required = pick("customer", "site", "boq");
      const missing = firstMissing(required);
      return {
        action: "boq",
        title: "Complete the technical design",
        description: "Confirm the site requirement, equipment, and quantities in the internal BOQ before commercial pricing.",
        ctaLabel: "Open BOQ",
        facts: required,
        blockedReason: missing ? `Complete “${missing.label.toLowerCase()}” before issuing a quotation.` : null,
      };
    }
    case "quote": {
      const required = pick("customer", "erp-customer", "boq", "selling-price");
      const missing = firstMissing(required);
      return {
        action: "quotation",
        title: "Prepare the quotation",
        description: "Review the customer-facing price separately from the internal BOQ cost, then save the commercial snapshot.",
        ctaLabel: "Continue quotation",
        facts: required,
        blockedReason: missing ? `Complete “${missing.label.toLowerCase()}” before sending the quotation.` : null,
      };
    }
    case "sign": {
      const required = pick("selling-price", "portal");
      const missing = firstMissing(required);
      return {
        action: "sign",
        title: "Send the current quotation for signature",
        description: "The customer should see one clear next step: review the proposal, consent, and sign the preserved quotation version.",
        ctaLabel: "Open quotation",
        facts: required,
        blockedReason: missing ? `Complete “${missing.label.toLowerCase()}” before dispatching for signature.` : null,
      };
    }
    case "payment": {
      const required = pick("acceptance");
      const missing = firstMissing(required);
      return {
        action: "payment",
        title: "Set up the payment plan",
        description: "Create installments against the agreed quotation total and make the customer’s remaining balance easy to understand.",
        ctaLabel: "Open payment",
        facts: required,
        blockedReason: missing ? `Complete “${missing.label.toLowerCase()}” before requesting payment.` : null,
      };
    }
    case "handoff": {
      const required = pick("acceptance", "documents", "deposit", "erp-customer", "design-approved");
      const missing = firstMissing(required);
      return {
        action: "handoff",
        title: "Prepare the project handoff",
        description: "Operations receives a focused installation package only after the commercial and readiness checks are complete.",
        ctaLabel: "Create installation project",
        facts: required,
        blockedReason: missing ? `Resolve “${missing.label.toLowerCase()}” before creating the installation project.` : null,
      };
    }
    case "installation":
      return {
        action: "none",
        title: "Installation is in progress",
        description: "The sales case has been handed to operations. Continue delivery from the installation project workspace.",
        ctaLabel: "Project created",
        facts: pick("acceptance", "documents", "deposit", "design-approved"),
        blockedReason: null,
      };
  }
}

export function deriveSalesWorkspaceState(facts: SalesWorkspaceFacts): SalesWorkspaceState {
  const status = facts.record.status.trim().toUpperCase();
  const isTerminal = status === "LOST" || status === "CANCELLED";

  let currentStage: SalesWorkflowStageId = "lead";
  if (facts.hasInstallationProject) currentStage = "installation";
  else if (facts.hasPaymentComplete) currentStage = "handoff";
  else if (facts.hasClientApproval) currentStage = "payment";
  else if (facts.hasSentToCustomer) currentStage = "sign";
  else if (facts.hasCustomerErpBinding && facts.hasTechnicalDesign) currentStage = "quote";
  else if (facts.hasTechnicalDesign) currentStage = "design";

  const currentIndex = stageIndex(currentStage);
  const steps = SALES_WORKFLOW_STAGES.map((stage, index) => ({
    ...stage,
    state: index < currentIndex ? "complete" : index === currentIndex ? "current" : "upcoming",
  })) as readonly SalesWorkflowStep[];

  return {
    currentStage,
    currentStageIndex: currentIndex,
    completedStageCount: Math.max(0, currentIndex),
    statusLabel: statusLabel(facts.record, facts),
    isTerminal,
    steps,
    currentAction: buildCurrentAction(facts, currentStage),
  };
}

