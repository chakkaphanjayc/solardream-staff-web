export const proposalRevisionStatuses = ["DRAFT", "SENT", "VIEWED", "ACCEPTED", "SUPERSEDED", "VOID"] as const;
export type ProposalRevisionStatus = (typeof proposalRevisionStatuses)[number];

export type CommercialSnapshots = {
  pricing: Record<string, unknown>;
  configuration: Record<string, unknown>;
  terms: Record<string, unknown>;
  payment: Record<string, unknown>;
};

export type ProposalRevisionItemInput = {
  lineNumber: number;
  itemCode: string;
  pricing: Record<string, unknown>;
  configuration?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export type SignatureAuditMetadata = {
  requestId?: string;
  verificationMethod?: "AUTHENTICATED_USER" | "PORTAL_TOKEN" | "VERIFIED_EMAIL";
  userAgentHash?: string;
  ipAddressHash?: string;
  sourceDocumentId?: string;
  verificationUrl?: string;
  signedDocumentHash?: string;
};
