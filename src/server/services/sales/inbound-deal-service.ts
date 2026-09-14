import { createHash } from "node:crypto";

export type InboundDealInput = { source: string; externalRequestId: string; customerId?: string; payload: Readonly<Record<string, unknown>> };
export type InboundDealResult = { dealId: string; replayed: boolean };
export type StoredInboundDeal = { dealId: string; payloadHash: string };
export interface InboundDealRepository {
  find(key: string): Promise<StoredInboundDeal | null>;
  create(key: string, payloadHash: string, input: InboundDealInput): Promise<StoredInboundDeal>;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => `${JSON.stringify(key)}:${stable(nested)}`).join(",")}}`;
  return JSON.stringify(value);
}

export class InboundIdempotencyConflict extends Error {}

export async function ingestInboundDeal(repository: InboundDealRepository, input: InboundDealInput): Promise<InboundDealResult> {
  const key = `${input.source.trim()}:${input.externalRequestId.trim()}`;
  if (key === ":") throw new Error("Inbound source and external request ID are required.");
  const hash = createHash("sha256").update(stable(input)).digest("hex");
  const existing = await repository.find(key);
  if (existing) {
    if (existing.payloadHash !== hash) throw new InboundIdempotencyConflict("The inbound request key was reused with a different payload.");
    return { dealId: existing.dealId, replayed: true };
  }
  try {
    const created = await repository.create(key, hash, input);
    return { dealId: created.dealId, replayed: false };
  } catch (error: unknown) {
    const raced = await repository.find(key);
    if (!raced) throw error;
    if (raced.payloadHash !== hash) throw new InboundIdempotencyConflict("The inbound request key was reused with a different payload.");
    return { dealId: raced.dealId, replayed: true };
  }
}
