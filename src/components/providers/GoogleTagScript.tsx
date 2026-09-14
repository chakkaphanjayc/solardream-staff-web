"use client";

import { useMemo, useSyncExternalStore } from "react";
import Script from "next/script";

type GoogleTagScriptProps = {
  tagId?: string;
  enabled?: boolean;
};

const defaultPreferences = { essential: true, analytics: false, marketing: false };

function readConsentSnapshot() {
  if (typeof window === "undefined") return "server";
  return (
    localStorage.getItem("solardream_consent_preferences") ||
    localStorage.getItem("solardream_consent") ||
    ""
  );
}

function subscribeConsentStore(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("solardream_consent_updated", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("solardream_consent_updated", callback);
  };
}

export default function GoogleTagScript({
  tagId = process.env.NEXT_PUBLIC_GOOGLE_TAG_ID || "AW-10847225645",
  enabled = true,
}: GoogleTagScriptProps) {
  const consentSnapshot = useSyncExternalStore(
    subscribeConsentStore,
    readConsentSnapshot,
    () => "server",
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

  const cleanTagId = tagId.trim();
  const consentGranted = Boolean(preferences.analytics || preferences.marketing);

  if (!enabled || !cleanTagId || !consentGranted) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${cleanTagId}`}
        strategy="afterInteractive"
      />
      <Script id="google-gtag" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${cleanTagId}');
        `}
      </Script>
    </>
  );
}
