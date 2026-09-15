import type { JsonValue } from "./tech-sync";

export const WORKER_EVENT_SCHEMA_VERSION = 1;

export const DOCUMENT_WORKER_TOPICS = [
  "document.verified",
  "documents.render.requested",
] as const;
export type DocumentWorkerTopic = (typeof DOCUMENT_WORKER_TOPICS)[number];

export const COMMUNICATION_WORKER_TOPICS = [
  "communications.notification.requested",
] as const;
export type CommunicationWorkerTopic = (typeof COMMUNICATION_WORKER_TOPICS)[number];

export const COMMUNICATION_EVENT_TYPES = [
  "REQUEST_RECEIVED",
  "QUOTATION_READY",
  "QUOTATION_ACCEPTED",
  "PROJECT_UPDATE",
  "PROJECT_COMPLETED",
  "WARRANTY_REGISTERED",
  "PAYMENT_VERIFIED",
] as const;
export type CommunicationEventType = (typeof COMMUNICATION_EVENT_TYPES)[number];

export type CommunicationNotificationJob = {
  schemaVersion: typeof WORKER_EVENT_SCHEMA_VERSION;
  eventType: CommunicationEventType;
  payload: { [key: string]: JsonValue };
};

export type DocumentJob = {
  schemaVersion: typeof WORKER_EVENT_SCHEMA_VERSION;
  operation: "render" | "sign";
  proposalId: string;
  requestedBy?: string | null;
  sourceDocumentId?: string | null;
};

export function isWorkerTopic(value: string): value is DocumentWorkerTopic | CommunicationWorkerTopic {
  return (DOCUMENT_WORKER_TOPICS as readonly string[]).includes(value)
    || (COMMUNICATION_WORKER_TOPICS as readonly string[]).includes(value);
}
