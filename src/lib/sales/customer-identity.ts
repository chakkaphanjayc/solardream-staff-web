import { createHash } from "node:crypto";

export const SALES_IDENTITY_MAPPING_VERSION = 1;
export const SYSTEM_GUEST_USER_ID = "system-guest-user";
export const SYSTEM_GUEST_EMAIL = "system-guest@solar-dream.org";

export function normalizeSalesEmail(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLocaleLowerCase("en-US") ?? "";
  return normalized || null;
}

/** Version 1: E.164-like Thai normalization; ambiguous foreign domestic numbers remain digits-only. */
export function normalizeSalesPhone(value: string | null | undefined): string | null {
  const input = value?.trim() ?? "";
  if (!input) return null;
  const hasInternationalPrefix = input.startsWith("+");
  const digits = input.replace(/\D/g, "");
  if (!digits || digits.length < 7 || digits.length > 15) return null;
  if (hasInternationalPrefix) return `+${digits}`;
  if (digits.startsWith("66") && digits.length >= 9) return `+${digits}`;
  if (digits.startsWith("0") && digits.length >= 9 && digits.length <= 10) return `+66${digits.slice(1)}`;
  return digits;
}

export function salesCustomerLegacyKey(userId: string, erpnextCustomerId: string | null): string {
  const erpId = erpnextCustomerId?.trim();
  return erpId ? `ERP:${erpId}` : `USER:${userId}`;
}

export function salesIdentityChecksum(input: {
  userId: string; erpnextCustomerId: string | null; name: string; email: string | null; phone: string | null;
}): string {
  return createHash("sha256").update(JSON.stringify({ version: SALES_IDENTITY_MAPPING_VERSION, ...input })).digest("hex");
}
