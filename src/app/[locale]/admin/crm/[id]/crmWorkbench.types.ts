export type ErpnextCustomerBindingState =
  | "IDLE"
  | "LOOKING_UP"
  | "LINKED"
  | "NO_MATCH"
  | "CONFLICT"
  | "ERROR";

export type ErpnextCustomerCandidate = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
};

export type ErpnextIntegrationData = {
  erpCustomerId: string | null;
  erpQuotationId: string | null;
  customerUrl: string | null;
  quotationUrl: string | null;
  syncState: string;
  syncUpdatedAt: string | null;
  syncError: string | null;
  isSynced: boolean;
  customerBindingState: ErpnextCustomerBindingState;
  customerBindingMessage: string | null;
  customerCandidates: ErpnextCustomerCandidate[];
};

export type ErpnextIntegrationActions = {
  onLookupCustomer: () => void;
  onCreateCustomer: () => void;
  onBindCustomer: (candidate: ErpnextCustomerCandidate) => void;
  onClearCustomerLookup: () => void;
  onCreateQuotation: () => void;
};
