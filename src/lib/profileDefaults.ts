export interface QuotationProfileDefaults {
  fullLegalName: string;
  contactPhoneNumber: string;
  email: string;
  primaryAddress: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function mapUserToQuotationProfileDefaults(user: {
  email?: string | null;
  name?: string | null;
  phoneNumber?: string | null;
  lastEstimateDraft?: unknown;
}): QuotationProfileDefaults {
  const draft = asRecord(user.lastEstimateDraft);
  const primaryAddress = [
    draft.primaryAddress,
    draft.installationAddress,
    draft.shippingAddress,
    draft.location,
    draft.address,
  ].find((value) => typeof value === "string" && value.trim());

  return {
    fullLegalName: user.name || "",
    contactPhoneNumber: user.phoneNumber || "",
    email: user.email || "",
    primaryAddress: typeof primaryAddress === "string" ? primaryAddress : "",
  };
}
