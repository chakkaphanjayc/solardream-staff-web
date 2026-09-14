"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { gsap } from "gsap";
import { ShieldCheck } from "@/components/ui/icons";
import { usePathname } from "next/navigation";
import CookiePreferencesModal from "./CookiePreferencesModal";
import { readJsonResponse } from "@/lib/readJsonResponse";
import { trackProductEvent } from "@/lib/productAnalytics";

interface CookieBannerProps {
  cookieTitle: string;
  cookieBannerText: string;
  cookieBannerEnabled: boolean;
  essentialButtonText: string;
  acceptAllButtonText: string;
  managePreferencesText: string;
}

type CookiePreferences = {
  essential: true;
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  policyVersion: string;
};

type ConsentApiResponse = {
  success?: boolean;
  error?: string;
  policyVersion?: string;
  reconsentRequired?: boolean;
  records?: Array<{
    consentType?: string;
    policyVersion?: string;
    granted?: boolean;
    preferences?: unknown;
  }>;
};

const defaultPreferences: CookiePreferences = {
  essential: true,
  necessary: true,
  analytics: false,
  marketing: false,
  policyVersion: "",
};

function parsePreferences(snapshot: string): CookiePreferences | null {
  if (!snapshot || snapshot === "server") return null;
  if (!snapshot.startsWith("{")) {
    return {
      ...defaultPreferences,
      analytics: snapshot === "all",
      marketing: snapshot === "all",
    };
  }
  try {
    const value = JSON.parse(snapshot) as Partial<CookiePreferences>;
    if (typeof value.analytics !== "boolean" || typeof value.marketing !== "boolean") return null;
    return {
      essential: true,
      necessary: true,
      analytics: value.analytics,
      marketing: value.marketing,
      policyVersion: typeof value.policyVersion === "string" ? value.policyVersion : "",
    };
  } catch {
    return null;
  }
}

function getPrivacySessionId() {
  const current = localStorage.getItem("solardream_session_id");
  if (current && current.length >= 16) return current;
  const next = `${crypto.randomUUID()}:${Date.now().toString(36)}`;
  localStorage.setItem("solardream_session_id", next);
  return next;
}

function persistPreferences(preferences: CookiePreferences) {
  const newStr = JSON.stringify(preferences);
  const existingStr = localStorage.getItem("solardream_consent_preferences");
  if (existingStr === newStr) {
    return;
  }
  localStorage.setItem("solardream_consent_preferences", newStr);
  localStorage.setItem("solardream_consent", preferences.analytics && preferences.marketing ? "all" : "essential");
  localStorage.setItem("cookie_consent", preferences.analytics && preferences.marketing ? "all" : "essential");
  const expires = new Date(Date.now() + 365 * 864e5).toUTCString();
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `solardream_consent=${encodeURIComponent(newStr)}; expires=${expires}; path=/; SameSite=Lax${secure}`;
  window.dispatchEvent(new Event("solardream_consent_updated"));
}

function preferencesFromRecord(value: unknown, policyVersion: string): CookiePreferences | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const preferences = value as Record<string, unknown>;
  if (typeof preferences.analytics !== "boolean" || typeof preferences.marketing !== "boolean") return null;
  return {
    essential: true,
    necessary: true,
    analytics: preferences.analytics,
    marketing: preferences.marketing,
    policyVersion,
  };
}

function readConsentSnapshot() {
  if (typeof window === "undefined") return "server";
  return (
    localStorage.getItem("solardream_consent_preferences") ||
    localStorage.getItem("cookie_consent") ||
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

const subscribeMounted = () => () => undefined;
const getMountedSnapshot = () => true;
const getMountedServerSnapshot = () => false;

export default function CookieBanner({
  cookieTitle = "Cookie Preferences",
  cookieBannerText = "We use cookies to improve your experience and analyze site traffic.",
  cookieBannerEnabled = true,
  essentialButtonText,
  acceptAllButtonText,
  managePreferencesText,
}: CookieBannerProps) {
  const mounted = useSyncExternalStore(subscribeMounted, getMountedSnapshot, getMountedServerSnapshot);
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [policyVersion, setPolicyVersion] = useState("");
  const [forceReconsent, setForceReconsent] = useState(false);
  const hasSyncedRef = useRef(false);
  const bannerRef = useRef<HTMLDivElement | null>(null);
  const pathname = usePathname();
  const consentSnapshot = useSyncExternalStore(
    subscribeConsentStore,
    readConsentSnapshot,
    () => "server",
  );

  const preferences = useMemo(() => {
    return parsePreferences(consentSnapshot) || defaultPreferences;
  }, [consentSnapshot]);

  const hasExplicitConsent = Boolean(
    consentSnapshot &&
    consentSnapshot !== "server" &&
    parsePreferences(consentSnapshot) !== null
  );

  useEffect(() => {
    if (!mounted || hasSyncedRef.current) return;
    hasSyncedRef.current = true;

    let isMounted = true;
    const sessionId = getPrivacySessionId();

    async function syncRemotePreferences() {
      try {
        const response = await fetch(`/api/privacy/consent?sessionId=${encodeURIComponent(sessionId)}`, {
          headers: { Accept: "application/json" },
        });
        const payload = await readJsonResponse<ConsentApiResponse>(response);
        if (!isMounted || !response.ok || !payload?.success) return;

        const serverVersion = payload.policyVersion || "";
        if (serverVersion) {
          setPolicyVersion(serverVersion);
        }

        if (payload.reconsentRequired) {
          setForceReconsent(true);
          return;
        }

        const latestRecord = payload.records?.[0];
        const remotePreferences = preferencesFromRecord(
          latestRecord?.preferences,
          latestRecord?.policyVersion || serverVersion
        );

        if (remotePreferences) {
          persistPreferences(remotePreferences);
        }
      } catch {
        // Fail-open for client-side storage
      } finally {
        if (isMounted) setIsSyncing(false);
      }
    }

    void syncRemotePreferences();
    return () => {
      isMounted = false;
    };
  }, [mounted]);

  const isOpen =
    mounted &&
    cookieBannerEnabled &&
    !isSyncing &&
    (!hasExplicitConsent || forceReconsent) &&
    !pathname.includes("/admin");

  useEffect(() => {
    if (!isOpen || !bannerRef.current) return;
    const bannerEl = bannerRef.current;
    gsap.fromTo(
      bannerEl,
      { y: 32, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.5, ease: "power3.out" }
    );
  }, [isOpen]);

  const saveConsent = async (
    prefs: { essential: boolean; analytics: boolean; marketing: boolean },
    source: "banner" | "settings"
  ) => {
    setIsSaving(true);
    const sessionId = getPrivacySessionId();
    let savedVersion = policyVersion;

    try {
      const records = [
        {
          consentType: "essential",
          granted: true,
          purposes: ["Security", "Session Management"],
          preferences: { essential: true, analytics: prefs.analytics, marketing: prefs.marketing },
        },
        {
          consentType: "analytics",
          granted: prefs.analytics,
          purposes: ["Performance", "Traffic Analysis"],
          preferences: { essential: true, analytics: prefs.analytics, marketing: prefs.marketing },
        },
        {
          consentType: "marketing",
          granted: prefs.marketing,
          purposes: ["Targeting", "Campaign Tracking"],
          preferences: { essential: true, analytics: prefs.analytics, marketing: prefs.marketing },
        },
      ];

      const responses = await Promise.all(
        records.map((record) =>
          fetch("/api/privacy/consent", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              sessionId,
              consentType: record.consentType,
              granted: record.granted,
              policyVersion: savedVersion || undefined,
              purposes: record.purposes,
              preferences: record.preferences,
            }),
          }).then(async (response) => ({
            response,
            payload: await readJsonResponse<ConsentApiResponse>(response),
          }))
        )
      );

      const confirmedVersion = responses.find(({ response, payload }) => (
        response.ok && payload?.success && payload.policyVersion
      ))?.payload?.policyVersion;
      if (confirmedVersion) savedVersion = confirmedVersion;
    } catch {
      // The local choice remains authoritative for client-side tracking when sync is unavailable.
    } finally {
      const nextPreferences: CookiePreferences = {
        essential: true,
        necessary: true,
        analytics: prefs.analytics,
        marketing: prefs.marketing,
        policyVersion: savedVersion || "unverified",
      };
      persistPreferences(nextPreferences);
      void trackProductEvent("consent_updated", {
        analytics_enabled: nextPreferences.analytics,
        marketing_enabled: nextPreferences.marketing,
        consent_surface: source,
      });
      setPolicyVersion(savedVersion);
      setForceReconsent(false);
      setIsSaving(false);
      setIsPreferencesOpen(false);
    }
  };

  const handleAcceptAll = () => {
    void saveConsent({ essential: true, analytics: true, marketing: true }, "banner");
  };

  const handleDeclineAll = () => {
    void saveConsent({ essential: true, analytics: false, marketing: false }, "banner");
  };

  return (
    <>
      {isOpen && (
        <div
          ref={bannerRef}
          role="region"
          aria-label={cookieTitle}
          data-bagui="cookie-banner"
          data-solar-surface="atelier"
          className="solar-cookie-banner sd-safe-bottom-3-add layer-floating fixed inset-x-3 max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-[24px] border border-[#F7F6F3] bg-[#F0EEE9] p-5 shadow-xl sm:inset-x-6 sm:p-6 md:bottom-6 md:left-auto md:right-6 md:max-w-md lg:max-w-lg"
        >
          <div className="flex items-start gap-3.5">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-[#CBC7BE] bg-[#DCE8F5] text-[#4F7FA8]">
              <ShieldCheck className="size-5 text-[#4F7FA8]" />
            </div>
            <div className="space-y-1">
              <h4 className="font-sans text-sm font-bold text-[#2E2C27]">
                {cookieTitle}
              </h4>
              <p className="font-sans text-xs font-normal leading-relaxed text-[#4E4B44]">
                {cookieBannerText}
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3.5 border-t border-[#F7F6F3] pt-3.5">
            <div className="flex min-w-0 flex-col gap-2 text-xs font-semibold sm:grid sm:grid-cols-2 sm:items-center">
              <Link
                href="/privacy"
                className="min-w-0 truncate font-sans text-[#4E4B44] underline underline-offset-4 transition-colors hover:text-[#3E6685]"
              >
                Privacy Policy
              </Link>
              <button
                type="button"
                onClick={() => setIsPreferencesOpen(true)}
                className="min-w-0 cursor-pointer truncate border-none bg-transparent p-0 text-left font-sans text-[#4E4B44] underline underline-offset-4 transition-colors hover:text-[#3E6685] sm:text-right"
              >
                {managePreferencesText}
              </button>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
              <button
                type="button"
                onClick={handleDeclineAll}
                disabled={isSaving}
                className="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-full border border-[#CBC7BE] bg-[#E6E3DC] px-4 py-2 text-xs font-bold text-[#2E2C27] transition-colors hover:bg-[#DCE8F5] active:scale-95 disabled:opacity-50"
              >
                {essentialButtonText}
              </button>
              <button
                type="button"
                onClick={handleAcceptAll}
                disabled={isSaving}
                className="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-full bg-[#B7D1EA] px-5 py-2 text-xs font-bold text-white shadow-sm transition-all hover:bg-[#A5C2DE] hover:shadow active:scale-95 disabled:opacity-50"
              >
                {acceptAllButtonText}
              </button>
            </div>
          </div>
        </div>
      )}

      <CookiePreferencesModal
        key={`${isPreferencesOpen}:${preferences.analytics}:${preferences.marketing}`}
        isOpen={isPreferencesOpen}
        onClose={() => setIsPreferencesOpen(false)}
        onSave={(nextPreferences) => saveConsent(nextPreferences, "settings")}
        initialPreferences={preferences}
        isSaving={isSaving}
      />
    </>
  );
}
