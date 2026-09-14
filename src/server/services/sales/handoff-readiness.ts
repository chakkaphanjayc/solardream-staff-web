import "server-only";

import type { SalesHandoff } from "./sales-handoff";

export type HandoffRequirement =
  | "ACCEPTED_REVISION"
  | "CUSTOMER"
  | "SITE"
  | "ERP_SALES_ORDER"
  | "PAYMENT_FULLY_PAID"
  | "CONFIGURATION"
  | "DOCUMENTS"
  | "OPERATIONAL_NOTE"
  | "READY_STATUS";

export type ReadinessPolicy = {
  version: string;
  requirements: readonly HandoffRequirement[];
  requiredDocumentKinds?: readonly string[];
};

export type UnmetHandoffCondition = { code: HandoffRequirement | "UNKNOWN_POLICY"; field: string; message: string };
export type HandoffReadinessResult = { ready: boolean; policyVersion: string; unmetConditions: UnmetHandoffCondition[] };

export const DEFAULT_HANDOFF_READINESS_POLICIES: Readonly<Record<string, ReadinessPolicy>> = {
  "SD-HANDOFF-2026-V1": {
    version: "SD-HANDOFF-2026-V1",
    requirements: ["ACCEPTED_REVISION", "CUSTOMER", "SITE", "ERP_SALES_ORDER", "PAYMENT_FULLY_PAID", "CONFIGURATION", "DOCUMENTS", "READY_STATUS"],
    requiredDocumentKinds: ["ACCEPTED_PROPOSAL"],
  },
  "PAYMENT-COMPAT-2026-V1": {
    version: "PAYMENT-COMPAT-2026-V1",
    requirements: ["ACCEPTED_REVISION", "CUSTOMER", "SITE", "PAYMENT_FULLY_PAID", "CONFIGURATION", "READY_STATUS"],
  },
};

export function evaluateHandoffReadiness(
  handoff: SalesHandoff,
  policies: Readonly<Record<string, ReadinessPolicy>> = DEFAULT_HANDOFF_READINESS_POLICIES,
): HandoffReadinessResult {
  const policy = policies[handoff.readinessPolicyVersion];
  if (!policy) return { ready: false, policyVersion: handoff.readinessPolicyVersion, unmetConditions: [{ code: "UNKNOWN_POLICY", field: "readinessPolicyVersion", message: `Unsupported readiness policy: ${handoff.readinessPolicyVersion}` }] };
  const unmet: UnmetHandoffCondition[] = [];
  const add = (code: HandoffRequirement, field: string, message: string) => unmet.push({ code, field, message });
  for (const requirement of policy.requirements) {
    if (requirement === "ACCEPTED_REVISION" && handoff.acceptedProposalRevision.revisionNumber < 1) add(requirement, "acceptedProposalRevision", "An accepted proposal revision is required.");
    if (requirement === "CUSTOMER" && (!handoff.customer.userId || !handoff.customer.name)) add(requirement, "customer", "Customer identity is incomplete.");
    if (requirement === "SITE" && (!handoff.site.label || !handoff.site.addressLine1)) add(requirement, "site", "Installation site details are incomplete.");
    if (requirement === "ERP_SALES_ORDER" && !handoff.erpSalesOrderReference) add(requirement, "erpSalesOrderReference", "ERP sales order reference is required.");
    if (requirement === "PAYMENT_FULLY_PAID" && handoff.paymentSnapshot.status !== "FULLY_PAID") add(requirement, "paymentSnapshot.status", "Payment must be fully paid.");
    if (requirement === "CONFIGURATION" && Object.keys(handoff.configurationSnapshot).length === 0) add(requirement, "configurationSnapshot", "Installation configuration is required.");
    if (requirement === "DOCUMENTS") {
      const present = new Set(handoff.documentManifest.map((document) => document.kind));
      const missing = (policy.requiredDocumentKinds ?? []).filter((kind) => !present.has(kind));
      if (missing.length) add(requirement, "documentManifest", `Required documents are missing: ${missing.join(", ")}.`);
    }
    if (requirement === "OPERATIONAL_NOTE" && !handoff.operationalNote) add(requirement, "operationalNote", "An operational note is required.");
    if (requirement === "READY_STATUS" && handoff.status !== "READY") add(requirement, "status", "Handoff status must be READY.");
  }
  return { ready: unmet.length === 0, policyVersion: policy.version, unmetConditions: unmet };
}
