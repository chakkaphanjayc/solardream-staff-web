import "server-only";

/** Keeps deployed databases compatible while the additive product-cache migration rolls out. */
export async function ensureProductSchema(): Promise<void> {
  // Column last_synced_at is already applied in schema and database migration.
  // DDL ALTER TABLE queries must not run inside layout rendering or static page workers.
  return;
}
