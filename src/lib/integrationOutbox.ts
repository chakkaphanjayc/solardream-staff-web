import { integrationOutbox } from "@/db/schema";
import { db } from "@/db";

type OutboxExecutor = Pick<typeof db, "insert">;

export async function enqueueIntegrationEvent(
  executor: OutboxExecutor,
  input: {
    topic: string;
    eventVersion?: number;
    aggregateType: string;
    aggregateId: string;
    correlationId?: string;
    payload?: Record<string, unknown>;
    dedupeKey?: string;
  },
) {
  await executor.insert(integrationOutbox)
    .values({
      topic: input.topic,
      eventVersion: input.eventVersion || 1,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      correlationId: input.correlationId || null,
      payload: input.payload || {},
      dedupeKey: input.dedupeKey || null,
    })
    .onConflictDoNothing({ target: integrationOutbox.dedupeKey });
}
