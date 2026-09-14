import "server-only";
import { db } from "@/db";
import { integrationOutbox } from "@/db/schema";
import {
  CATALOG_SYNC_REQUESTED_TOPIC,
  type CatalogSyncRequest,
} from "./catalog-sync-contracts";
export async function enqueueCatalogSync(
  request: CatalogSyncRequest,
): Promise<boolean> {
  const rows = await db
    .insert(integrationOutbox)
    .values({
      aggregateType: "catalog",
      aggregateId: "ERPNEXT",
      topic: CATALOG_SYNC_REQUESTED_TOPIC,
      payload: request,
      eventVersion: 1,
      correlationId: request.eventId,
      dedupeKey: `catalog-sync:${request.eventId}`,
    })
    .onConflictDoNothing({ target: integrationOutbox.dedupeKey })
    .returning({ id: integrationOutbox.id });
  return rows.length === 1;
}
