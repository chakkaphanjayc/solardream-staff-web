"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import Script from "next/script";
import {
  getAnalyticsConsentSnapshot,
  subscribeAnalyticsConsent,
} from "@/utils/analytics";

type UmamiConsentScriptProps = {
  baseUrl: string;
  websiteId: string;
  enabled?: boolean;
};

const defaultPreferences = { essential: true, analytics: false, marketing: false };

export default function UmamiConsentScript({
  baseUrl,
  websiteId,
  enabled = true,
}: UmamiConsentScriptProps) {
  const consentSnapshot = useSyncExternalStore(
    subscribeAnalyticsConsent,
    getAnalyticsConsentSnapshot,
    getAnalyticsConsentSnapshot,
  );

  const preferences = useMemo(() => {
    if (!consentSnapshot || consentSnapshot === "server") return defaultPreferences;

    if (consentSnapshot.startsWith("{")) {
      try {
        return { ...defaultPreferences, ...JSON.parse(consentSnapshot) };
      } catch {
        return defaultPreferences;
      }
    }

    return {
      essential: true,
      analytics: consentSnapshot === "all",
      marketing: consentSnapshot === "all",
    };
  }, [consentSnapshot]);

  const normalizedBaseUrl = baseUrl.trim().replace(/\/$/, "");
  const shouldLoad = Boolean(
    enabled && normalizedBaseUrl && websiteId && preferences.analytics,
  );

  useEffect(() => {
    if (shouldLoad) {
      try {
        window.localStorage.removeItem("umami.disabled");
      } catch {}
      return;
    }

    const analyticsWindow = window as Window & { umami?: unknown };
    const scripts = Array.from(
      document.querySelectorAll<HTMLScriptElement>("script[data-website-id]"),
    );
    const trackerWasActive = scripts.length > 0 || Boolean(analyticsWindow.umami);
    if (!trackerWasActive) return;

    try {
      // Umami keeps document listeners after its script element is removed.
      // Disable it before reloading so an opt-out cannot emit another event.
      window.localStorage.setItem("umami.disabled", "1");
    } catch {}
    scripts.forEach((script) => script.remove());
    delete analyticsWindow.umami;
    window.location.reload();
  }, [shouldLoad]);

  if (!shouldLoad) return null;

  return (
    <Script
      src={`${normalizedBaseUrl}/script.js`}
      data-website-id={websiteId}
      strategy="afterInteractive"
    />
  );
}
