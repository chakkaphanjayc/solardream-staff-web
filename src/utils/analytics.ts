"use client";

import { getClientConfig } from "@/actions/config";
import type { AnalyticsConfig, AnalyticsFlagKey } from "@/lib/analyticsConfig";

type UmamiWindow = Window & {
  umami?: {
    track?: (eventName: string, properties?: Record<string, unknown>) => void | Promise<void>;
  };
};

const ANALYTICS_CONSENT_UPDATED_EVENT = "solardream_consent_updated";

export function getAnalyticsConsentSnapshot() {
  if (typeof window === "undefined") return "server";

  try {
    return (
      window.localStorage.getItem("solardream_consent_preferences") ||
      window.localStorage.getItem("cookie_consent") ||
      window.localStorage.getItem("solardream_consent") ||
      ""
    );
  } catch {
    return "";
  }
}

export function subscribeAnalyticsConsent(callback: () => void) {
  if (typeof window === "undefined") return () => undefined;

  window.addEventListener("storage", callback);
  window.addEventListener(ANALYTICS_CONSENT_UPDATED_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(ANALYTICS_CONSENT_UPDATED_EVENT, callback);
  };
}

export function isAnalyticsConsentGranted() {
  const snapshot = getAnalyticsConsentSnapshot();
  if (!snapshot || snapshot === "server") return false;
  if (snapshot === "all") return true;
  if (!snapshot.startsWith("{")) return false;

  try {
    const preferences = JSON.parse(snapshot) as { analytics?: unknown };
    return preferences.analytics === true;
  } catch {
    return false;
  }
}

function getUmami() {
  const umami = (window as UmamiWindow).umami;
  return typeof umami?.track === "function" ? umami : null;
}

async function waitForUmami() {
  const immediate = getUmami();
  if (immediate) return immediate;

  return new Promise<ReturnType<typeof getUmami>>((resolve) => {
    const deadline = Date.now() + 3_000;
    const intervalId = window.setInterval(() => {
      const umami = getUmami();
      if (umami || Date.now() >= deadline) {
        window.clearInterval(intervalId);
        resolve(umami);
      }
    }, 100);
  });
}

let configCache: AnalyticsConfig | null = null;
let configPromise: Promise<AnalyticsConfig> | null = null;

export function setAnalyticsConfigCache(config: AnalyticsConfig) {
  configCache = config;
  configPromise = null;
}

async function resolveAnalyticsConfig() {
  if (configCache) return configCache;
  configPromise ??= getClientConfig().then((config) => {
    configCache = config;
    return config;
  });
  return configPromise;
}

export const trackUmamiEvent = async (
  eventName: string,
  featureFlagKey: Exclude<AnalyticsFlagKey, "analytics_enabled">,
  properties: Record<string, unknown> = {},
) => {
  if (typeof window === "undefined") return;
  if (!isAnalyticsConsentGranted()) return;

  try {
    const flags = await resolveAnalyticsConfig();
    if (!flags.analytics_enabled || !flags[featureFlagKey]) return;

    const umami = await waitForUmami();
    if (!umami || !isAnalyticsConsentGranted()) return;
    const track = umami.track;
    if (typeof track !== "function") return;

    await track(eventName, {
      ...properties,
      feature_flag: featureFlagKey,
      tracked_at: new Date().toISOString(),
    });
  } catch (error) {
    console.warn("[Analytics]: Unable to track Umami event", eventName, error);
  }
};

type GtagWindow = Window & {
  gtag?: (...args: unknown[]) => void;
};

export function trackGtagEvent(
  command: string,
  targetId: string,
  params?: Record<string, unknown>,
) {
  if (typeof window === "undefined") return;
  if (!isAnalyticsConsentGranted()) return;
  const gtagWindow = window as GtagWindow;
  if (typeof gtagWindow.gtag === "function") {
    gtagWindow.gtag(command, targetId, params);
  }
}

