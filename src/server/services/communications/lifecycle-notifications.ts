import "server-only";

import { createHash } from "node:crypto";

import type { CommunicationEventType, CommunicationNotificationJob } from "@solar-dream/contracts/workers";

import type { LifecyclePayload } from "@/lib/customerLifecycle";
import { enqueueIntegrationEvent } from "@/lib/integrationOutbox";

const COMMUNICATION_NOTIFICATION_TOPIC = "communications.notification.requested";

type OutboxExecutor = Parameters<typeof enqueueIntegrationEvent>[0];

function text(value: string | null | undefined) {
  return value?.trim() || "";
}

function payloadDigest(payload: LifecyclePayload) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 48);
}

function defaultAggregateId(payload: LifecyclePayload) {
  return text(payload.projectId) || text(payload.quotationId) || text(payload.leadId) || payloadDigest(payload);
}

export async function enqueueLifecycleNotification(
  executor: OutboxExecutor,
  input: {
    eventType: CommunicationEventType;
    payload: LifecyclePayload;
    aggregateId?: string | null;
    correlationId?: string | null;
    dedupeKey?: string;
  },
) {
  const payload: CommunicationNotificationJob = {
    schemaVersion: 1,
    eventType: input.eventType,
    payload: input.payload as unknown as CommunicationNotificationJob["payload"],
  };
  const aggregateId = text(input.aggregateId) || defaultAggregateId(input.payload);
  const dedupeKey = input.dedupeKey
    || `${COMMUNICATION_NOTIFICATION_TOPIC}:${input.eventType}:${aggregateId}:${payloadDigest(input.payload)}`;

  return enqueueIntegrationEvent(executor, {
    topic: COMMUNICATION_NOTIFICATION_TOPIC,
    eventVersion: payload.schemaVersion,
    aggregateType: "COMMUNICATION_NOTIFICATION",
    aggregateId,
    correlationId: text(input.correlationId) || undefined,
    payload: payload as unknown as Record<string, unknown>,
    dedupeKey,
  });
}

export { COMMUNICATION_NOTIFICATION_TOPIC };
