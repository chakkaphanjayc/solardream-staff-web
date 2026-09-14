const SIGNABLE_STATUSES = new Set([
  "SENT",
  "DISPATCHED",
  "AWAITING_CLIENT_SIGNATURE",
  "AWAITING_CUSTOMER_SIGNATURE",
  "PENDING_CUSTOMER_SIGNATURE",
]);

const TERMINAL_OR_BLOCKED_STATUSES = new Set([
  "REVISION_REQUESTED",
  "CLIENT_SIGNED_PENDING_REVIEW",
  "SIGNED",
  "FULLY_SIGNED",
  "APPROVED",
  "APPROVED_BY_CUSTOMER",
  "CUSTOMER_APPROVED",
  "CANCELLED",
  "REJECTED",
  "EXPIRED",
]);

function normalizeStatus(value: string | null | undefined): string {
  return value?.trim().toUpperCase() || "";
}

export function getEffectiveQuotationStatus(
  status: string | null | undefined,
  dispatchStatus: string | null | undefined,
): string {
  const normalizedStatus = normalizeStatus(status);
  const normalizedDispatchStatus = normalizeStatus(dispatchStatus);

  if (TERMINAL_OR_BLOCKED_STATUSES.has(normalizedStatus)) return normalizedStatus;
  return normalizedDispatchStatus && normalizedDispatchStatus !== "PENDING_DISPATCH"
    ? normalizedDispatchStatus
    : normalizedStatus;
}

export function isQuotationAvailableForSignature(input: {
  status: string | null | undefined;
  dispatchStatus: string | null | undefined;
}): boolean {
  const status = normalizeStatus(input.status);
  const dispatchStatus = normalizeStatus(input.dispatchStatus);

  if (TERMINAL_OR_BLOCKED_STATUSES.has(status) || TERMINAL_OR_BLOCKED_STATUSES.has(dispatchStatus)) {
    return false;
  }

  return SIGNABLE_STATUSES.has(status) || SIGNABLE_STATUSES.has(dispatchStatus);
}
