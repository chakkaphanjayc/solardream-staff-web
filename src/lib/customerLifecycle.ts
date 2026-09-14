export type CustomerLifecyclePhase = "REQUEST" | "QUOTATION" | "PROJECT" | "AFTER_SALE";

export type LifecycleEventType =
  | "REQUEST_RECEIVED"
  | "QUOTATION_READY"
  | "QUOTATION_ACCEPTED"
  | "PROJECT_UPDATE"
  | "PROJECT_COMPLETED"
  | "WARRANTY_REGISTERED"
  | "PAYMENT_VERIFIED";

export type ProjectMilestone =
  | "SURVEY_PENDING"
  | "MATERIAL_DELIVERY"
  | "INSTALLING"
  | "INSPECTION"
  | "COMPLETED";

export interface LifecyclePayload {
  customerName: string;
  phone: string;
  email?: string | null;
  lineUserId?: string | null;
  leadId?: string | null;
  quotationId?: string | null;
  projectId?: string | null;
  proposalUrl?: string | null;
  pdfUrl?: string | null;
  warrantyCardUrl?: string | null;
  warrantySubject?: string | null;
  warrantyDaysRemaining?: number | null;
  milestone?: ProjectMilestone | null;
  milestoneDetails?: string | null;
  systemSizeKwp?: number | null;
  warrantyYears?: number | null;
  paymentAmount?: number | null;
  paymentMilestoneName?: string | null;
  paymentBankAccount?: string | null;
  paymentTransRef?: string | null;
  projectProgressUrl?: string | null;
  paymentActionUrl?: string | null;
}

export const LIFECYCLE_PHASES: Record<CustomerLifecyclePhase, { label: string; description: string }> = {
  REQUEST: {
    label: "1. Request (Lead Generation)",
    description: "Customer submits Wizard/Build/Service form. ERPNext Lead entity created.",
  },
  QUOTATION: {
    label: "2. Quotation (Sales & Approval)",
    description: "Quotation generated & dispatched. Customer views proposal and e-signs.",
  },
  PROJECT: {
    label: "3. Project (Fulfillment)",
    description: "Sales Order & Project active. Milestone progress tracked via Kanban.",
  },
  AFTER_SALE: {
    label: "4. After Sale (Warranty & Support)",
    description: "100% completed. LINE Rich Menu swapped to After-Sales & Warranty Card issued.",
  },
};
