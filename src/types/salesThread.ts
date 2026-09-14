export type SalesThreadLeadSource =
  | "LEGACY_LEAD"
  | "INBOUND_REQUEST"
  | "CONSULTATION_LEAD";

export type SalesThreadLeadTarget = "CRM_RECORD" | "SALES_PIPELINE";

export type SalesThreadLead = {
  id: string;
  source: SalesThreadLeadSource;
  target: SalesThreadLeadTarget;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
  erpnextLeadId: string | null;
  consultationLeadId: string | null;
  inboundRequestId: string | null;
};

export type SalesThreadQuotation = {
  id: string;
  documentNo: string;
  status: string;
  erpnextQuotationId: string | null;
};

export type SalesThreadInstallation = {
  id: string;
  source: "WORKFLOW_PROJECT" | "JOB_TICKET" | "LEGACY_PROJECT";
  projectId: string | null;
  projectCode: string | null;
  projectStatus: string | null;
  erpnextProjectId: string | null;
  jobTicketId: string | null;
  jobTicketStatus: string | null;
  legacyProjectId: string | null;
  legacyJobTicketId: string | null;
  legacyJobTicketStatus: string | null;
  proposalId: string | null;
};

export type SalesThread = {
  id: string;
  customerName: string;
  email: string | null;
  phone: string | null;
  createdAt: string;
  lead: SalesThreadLead | null;
  quotation: SalesThreadQuotation | null;
  installation: SalesThreadInstallation | null;
};
