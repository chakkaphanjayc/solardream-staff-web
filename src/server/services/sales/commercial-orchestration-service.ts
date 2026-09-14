export type CommercialOperation = "QUOTATION" | "SALES_ORDER" | "PAYMENT_REQUEST";
export type ProviderConfirmation = { providerId: string; status?: string | null };
export interface CommercialProvider { create(operation: CommercialOperation, idempotencyKey: string): Promise<ProviderConfirmation>; }
export interface CommercialRecorder { recordConfirmed(operation: CommercialOperation, confirmation: ProviderConfirmation): Promise<void>; }

export async function createCommercialDocument(
  provider: CommercialProvider,
  recorder: CommercialRecorder,
  operation: CommercialOperation,
  idempotencyKey: string,
): Promise<ProviderConfirmation> {
  if (!idempotencyKey.trim()) throw new Error("A provider idempotency key is required.");
  const confirmation = await provider.create(operation, idempotencyKey);
  const providerId = confirmation.providerId.trim();
  if (!providerId) throw new Error("ERPNext did not confirm a document identifier.");
  const normalized = { ...confirmation, providerId };
  await recorder.recordConfirmed(operation, normalized);
  return normalized;
}
