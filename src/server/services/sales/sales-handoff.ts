import "server-only";

import { z } from "zod";

const nonBlank = z.string().trim().min(1);
const safeObject = z.record(z.string(), z.unknown());

export const salesHandoffSchema = z.object({
  dealId: nonBlank,
  acceptedProposalRevision: z.object({
    id: nonBlank,
    proposalId: nonBlank,
    revisionNumber: z.number().int().positive(),
  }).strict(),
  customer: z.object({
    userId: nonBlank,
    name: nonBlank,
    email: z.string().email().optional(),
    phone: nonBlank.optional(),
  }).strict(),
  site: z.object({
    id: z.string().uuid().optional(),
    label: nonBlank,
    addressLine1: nonBlank,
    city: nonBlank.optional(),
    province: nonBlank.optional(),
    postalCode: nonBlank.optional(),
    country: nonBlank.default("Thailand"),
    latitude: z.number().finite().optional(),
    longitude: z.number().finite().optional(),
    accessNote: nonBlank.optional(),
  }).strict(),
  erpSalesOrderReference: nonBlank.optional(),
  paymentSnapshot: z.object({
    status: z.enum(["UNPAID", "PARTIALLY_PAID", "FULLY_PAID"]),
    paymentId: nonBlank.optional(),
    paidAt: z.string().datetime().optional(),
  }).strict(),
  configurationSnapshot: safeObject,
  documentManifest: z.array(z.object({
    kind: nonBlank,
    reference: nonBlank,
    revision: nonBlank.optional(),
    checksum: nonBlank.optional(),
  }).strict()).default([]),
  operationalNote: nonBlank.optional(),
  readinessPolicyVersion: nonBlank,
  status: z.enum(["PENDING", "READY", "BLOCKED", "CONSUMED"]),
  idempotencyKey: nonBlank.max(255),
}).strict();

export type SalesHandoff = z.infer<typeof salesHandoffSchema>;
declare const validatedHandoff: unique symbol;
export type ValidatedSalesHandoff = SalesHandoff & { readonly [validatedHandoff]: true };

const forbiddenKey = /(^|_)(margin|cost|discount|negotiation|internal_notes?|sales_internal|internal_sales|token|secret|signature_bytes?|signer_ip|user_agent|raw_erpnext|provider_payload)(_|$)|negotiationhistory|salesinternalnotes?/i;

function findForbiddenPath(value: unknown, path = "handoff"): string | null {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findForbiddenPath(value[index], `${path}[${index}]`);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  for (const [key, nested] of Object.entries(value)) {
    if (forbiddenKey.test(key.replace(/([a-z])([A-Z])/g, "$1_$2"))) return `${path}.${key}`;
    const found = findForbiddenPath(nested, `${path}.${key}`);
    if (found) return found;
  }
  return null;
}

export function validateSalesHandoff(input: unknown): ValidatedSalesHandoff {
  const handoff = salesHandoffSchema.parse(input);
  const forbiddenPath = findForbiddenPath(handoff);
  if (forbiddenPath) {
    throw new z.ZodError([{
      code: "custom",
      path: forbiddenPath.split(".").slice(1),
      message: "Sales-only commercial data is not permitted in an installation handoff.",
    }]);
  }
  return handoff as ValidatedSalesHandoff;
}
