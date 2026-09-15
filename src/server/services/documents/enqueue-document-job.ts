import "server-only";

import type { DocumentJob } from "@solar-dream/contracts/workers";

import { enqueueIntegrationEvent } from "@/lib/integrationOutbox";

export const DOCUMENT_RENDER_REQUESTED_TOPIC = "documents.render.requested";

type OutboxExecutor = Parameters<typeof enqueueIntegrationEvent>[0];

export async function enqueueDocumentRenderJob(
  executor: OutboxExecutor,
  input: {
    proposalId: string;
    requestedBy?: string | null;
    sourceDocumentId?: string | null;
    dedupeKey?: string;
  },
) {
  const proposalId = input.proposalId.trim();
  if (!proposalId) throw new Error("A proposal ID is required to queue document rendering.");

  const payload: DocumentJob = {
    schemaVersion: 1,
    operation: "render",
    proposalId,
    requestedBy: input.requestedBy?.trim() || null,
    sourceDocumentId: input.sourceDocumentId?.trim() || null,
  };

  return enqueueIntegrationEvent(executor, {
    topic: DOCUMENT_RENDER_REQUESTED_TOPIC,
    eventVersion: payload.schemaVersion,
    aggregateType: "PROPOSAL",
    aggregateId: proposalId,
    payload: payload as unknown as Record<string, unknown>,
    dedupeKey: input.dedupeKey || `${DOCUMENT_RENDER_REQUESTED_TOPIC}:${proposalId}:${payload.sourceDocumentId || "current"}`,
  });
}
