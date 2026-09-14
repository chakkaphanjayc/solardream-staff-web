import "server-only";

import { EventEmitter } from "node:events";

export type AdminSseEventType =
  | "NEW_LEAD"
  | "LEAD_STATUS_CHANGED"
  | "INBOUND_REQUEST_DELETED"
  | "QUOTATION_UPDATED"
  | "PROJECT_CREATED"
  | "PROJECT_STATUS_CHANGED";

export type AdminSseEventPayload = {
  id: string;
  projectId?: string;
  name?: string;
  source?: string;
  status?: string;
  title?: string;
};

export type AdminSseEvent = {
  eventType: AdminSseEventType;
  payload: AdminSseEventPayload;
  occurredAt: string;
};

const ADMIN_EVENT_NAME = "admin-update";

type SseGlobal = typeof globalThis & {
  __solarDreamAdminSseBus?: EventEmitter;
};

function getSseBus() {
  const runtime = globalThis as SseGlobal;
  if (!runtime.__solarDreamAdminSseBus) {
    runtime.__solarDreamAdminSseBus = new EventEmitter();
    runtime.__solarDreamAdminSseBus.setMaxListeners(0);
  }
  return runtime.__solarDreamAdminSseBus;
}

/**
 * Broadcasts a compact admin refresh hint to every connected SSE stream in
 * this standalone Node.js process. It deliberately carries no sensitive data.
 */
export function broadcastEvent(
  eventType: AdminSseEventType,
  payload: AdminSseEventPayload,
): void {
  getSseBus().emit(ADMIN_EVENT_NAME, {
    eventType,
    payload,
    occurredAt: new Date().toISOString(),
  } satisfies AdminSseEvent);
}

export function broadcastAdminEvent(
  eventType: "PROJECT_CREATED",
  payload: { projectId: string },
): void {
  broadcastEvent(eventType, {
    id: payload.projectId,
    projectId: payload.projectId,
  });
}

export function subscribeToAdminEvents(listener: (event: AdminSseEvent) => void): () => void {
  const bus = getSseBus();
  bus.on(ADMIN_EVENT_NAME, listener);
  return () => bus.off(ADMIN_EVENT_NAME, listener);
}
