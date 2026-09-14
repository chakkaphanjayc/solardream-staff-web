export const CATALOG_SYNC_REQUESTED_TOPIC = "catalog.sync.requested";
export type CatalogSyncTrigger = "WEBHOOK" | "SCHEDULED" | "MANUAL";
export type CatalogSyncRequest = Readonly<{
  eventId: string;
  trigger: CatalogSyncTrigger;
  requestedAt: string;
}>;
