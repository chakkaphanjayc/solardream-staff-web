const PII_KEYS = /(?:^|_)(?:name|full_?name|email|e_?mail|phone|mobile|telephone|account|bank_?account|tax_?id|national_?id|address|street|location|postal_?code|postcode|latitude|longitude|lat|lng|ip|ip_?address|user_?agent|signature|contact|customer_?notes|notes|remarks)(?:$|_)/i;

function isPersonalDataKey(key: string) {
  const normalized = key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
  return PII_KEYS.test(normalized);
}

export function redactPersonalData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactPersonalData);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, child]) => [
    key,
    isPersonalDataKey(key) ? "[REDACTED]" : redactPersonalData(child),
  ]));
}

export const ACCOUNT_DELETION_CONFIRMATION = "DELETE MY ACCOUNT";

export function isAccountDeletionConfirmed(value: unknown) {
  return value === ACCOUNT_DELETION_CONFIRMATION;
}

const TERMINAL_PROPOSAL_STATUSES = new Set([
  "CANCELLED", "CANCELED", "DEACTIVATED", "EXPIRED",
  "COMPLETED", "COMPLETE", "CLOSED", "DELIVERED",
]);

export function retentionEligibility(input: {
  lastActivityAt: Date;
  newestProposalActivityAt: Date | null;
  cutoff: Date;
  proposalStatuses: string[];
  hasCurrentWarranty: boolean;
  hasLegalHold: boolean;
}) {
  const newestActivity = input.newestProposalActivityAt && input.newestProposalActivityAt > input.lastActivityAt
    ? input.newestProposalActivityAt
    : input.lastActivityAt;
  const inactive = newestActivity < input.cutoff;
  const protectedRecord = input.hasCurrentWarranty
    || input.hasLegalHold
    // Unknown/new workflow statuses fail closed. Only explicitly terminal
    // states may proceed to a retention review.
    || input.proposalStatuses.some((status) => !TERMINAL_PROPOSAL_STATUSES.has(status.toUpperCase()));
  return { inactive, protectedRecord, eligibleForReview: inactive, eligibleForAnonymization: inactive && !protectedRecord };
}
