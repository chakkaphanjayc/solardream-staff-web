"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";

const projectId = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID?.trim();
let initializedProjectId: string | null = null;
let clarityPromise: Promise<typeof import("@microsoft/clarity").default> | null = null;

function loadClarity() {
  clarityPromise ??= import("@microsoft/clarity").then((module) => module.default);
  return clarityPromise;
}

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

export default function ClarityProvider() {
  const consentSnapshot = useSyncExternalStore(
    subscribeConsentStore,
    readConsentSnapshot,
    () => "server",
  );
  const analyticsConsent = useMemo(() => {
    if (!consentSnapshot || consentSnapshot === "server") return false;

    if (consentSnapshot.startsWith("{")) {
      try {
        const preferences: unknown = JSON.parse(consentSnapshot);
        return (
          typeof preferences === "object" &&
          preferences !== null &&
          "analytics" in preferences &&
          preferences.analytics === true
        );
      } catch {
        return false;
      }
    }

    return consentSnapshot === "all";
  }, [consentSnapshot]);

  useEffect(() => {
    if (!projectId) return;

    if (!analyticsConsent) {
      if (initializedProjectId === projectId) {
        void loadClarity().then((clarity) => clarity.consent(false));
      }
      return;
    }

    let active = true;
    void loadClarity().then((clarity) => {
      if (!active) return;
      if (initializedProjectId !== projectId) {
        clarity.init(projectId);
        initializedProjectId = projectId;
      }
      clarity.consent(true);
    });

    return () => {
      active = false;
    };
  }, [analyticsConsent]);

  return null;
}
