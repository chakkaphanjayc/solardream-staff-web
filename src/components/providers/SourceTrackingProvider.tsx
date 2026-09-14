"use client";

import { useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useSourceTrackingStore } from "@/store/useSourceTrackingStore";
import { parseTrafficSource } from "@/lib/acquisition";
import { trackProductEvent } from "@/lib/productAnalytics";

const ACQUISITION_CAPTURE_KEY = "solardream_acquisition_captured";

function setFirstTouchCookie(name: string, value: string | null) {
  if (!value || typeof document === "undefined" || document.cookie.includes(`${name}=`)) return;
  document.cookie = `${name}=${encodeURIComponent(value.slice(0, 120))}; path=/; max-age=${60 * 60 * 24 * 90}; SameSite=Lax`;
}

function SourceTracker() {
  const searchParams = useSearchParams();
  const setSource = useSourceTrackingStore((state) => state.setSource);

  useEffect(() => {
    if (!searchParams) return;
    if (/\/admin(?:\/|$)|\/installer(?:\/|$)/i.test(window.location.pathname)) return;
    const utmSource = searchParams.get("utm_source")?.trim() || null;
    const utmMedium = searchParams.get("utm_medium")?.trim() || null;
    const utmCampaign = searchParams.get("utm_campaign")?.trim() || null;
    const urlSource = searchParams.get("source")?.trim() || utmSource;
    const normalizedSource = urlSource || parseTrafficSource(document.referrer, utmSource).toLowerCase();
    if (!normalizedSource) return;

    setSource(normalizedSource);
    setFirstTouchCookie("utm_source", utmSource || normalizedSource);
    setFirstTouchCookie("utm_medium", utmMedium);
    setFirstTouchCookie("utm_campaign", utmCampaign);

    try {
      if (sessionStorage.getItem(ACQUISITION_CAPTURE_KEY) === normalizedSource) return;
      sessionStorage.setItem(ACQUISITION_CAPTURE_KEY, normalizedSource);
    } catch {
      // Analytics should remain best-effort when browser storage is blocked.
    }

    void trackProductEvent("source_captured", {
      source: normalizedSource,
      medium: utmMedium,
      campaign: utmCampaign,
    });
  }, [searchParams, setSource]);

  return null;
}

export default function SourceTrackingProvider() {
  return (
    <Suspense fallback={null}>
      <SourceTracker />
    </Suspense>
  );
}
