"use server";

import { requireAdmin } from "@/lib/auth-guard";
import {
  ANALYTICS_SANDBOX_EVENTS,
  type AnalyticsSandboxEventName,
} from "@/lib/analyticsSandbox";
import {
  trackUmamiServerEvent,
  type TrackUmamiServerEventResult,
} from "@/utils/analytics-server";

export type AnalyticsSandboxDispatchResult = TrackUmamiServerEventResult;

function isAnalyticsSandboxEventName(value: string): value is AnalyticsSandboxEventName {
  return Object.prototype.hasOwnProperty.call(ANALYTICS_SANDBOX_EVENTS, value);
}

export async function dispatchAnalyticsSandboxEvent(
  eventName: string,
): Promise<AnalyticsSandboxDispatchResult> {
  await requireAdmin();

  if (!isAnalyticsSandboxEventName(eventName)) {
    return { ok: false, message: "Unsupported analytics sandbox event." };
  }

  const event = ANALYTICS_SANDBOX_EVENTS[eventName];

  return trackUmamiServerEvent({
    eventName,
    featureFlagKey: event.flagKey,
    title: `SolarDream analytics sandbox: ${eventName}`,
    url: "/admin/settings/analytics/sandbox",
    properties: {
      ...event.properties,
      sandbox_test: true,
    },
  });
}
