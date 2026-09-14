import "server-only";

/** Ensures additive payment-request columns exist while deployments catch up. */
export async function ensurePaymentRequestSchema(): Promise<void> {
  // Columns are already applied in schema and database migration.
  // DDL ALTER TABLE queries must not run during request execution.
  return;
}
