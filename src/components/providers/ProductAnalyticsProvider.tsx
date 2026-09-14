"use client";

import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import {
  getFunnelStage,
  isProductAnalyticsEventName,
  normalizeAnalyticsPath,
  trackProductEvent,
  type ProductAnalyticsProperties,
} from "@/lib/productAnalytics";
import { isAnalyticsExcludedRoute } from "@/lib/customerRoutePolicy";
import {
  isAnalyticsConsentGranted,
  subscribeAnalyticsConsent,
} from "@/utils/analytics";

function isPublicJourney(pathname: string) {
  return !pathname.includes("/admin") && !pathname.includes("/installer");
}

function dataKeyToProperty(key: string) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase();
}

function readAnalyticsData(element: HTMLElement) {
  const properties: ProductAnalyticsProperties = {};
  for (const [key, value] of Object.entries(element.dataset)) {
    if (!key.startsWith("analytics") || ["analyticsEvent", "analyticsForm", "analyticsOnce", "analyticsIgnore", "analyticsSubmitEvent"].includes(key)) continue;
    const propertyName = dataKeyToProperty(key.slice("analytics".length).replace(/^./, (character) => character.toLowerCase()));
    if (propertyName && value) properties[propertyName] = value;
  }
  return properties;
}

function getTrackableElement(target: EventTarget | null) {
  return target instanceof Element ? target.closest<HTMLElement>("[data-analytics-event]") : null;
}

function getAnalyticsContainer(target: EventTarget | null) {
  return target instanceof Element ? target.closest<HTMLElement>("[data-analytics-form]") : null;
}

export default function ProductAnalyticsProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const enabled = isPublicJourney(pathname) && !isAnalyticsExcludedRoute(pathname);
  const hasAnalyticsConsent = useSyncExternalStore(
    subscribeAnalyticsConsent,
    isAnalyticsConsentGranted,
    () => false,
  );

  useEffect(() => {
    if (!enabled || !hasAnalyticsConsent) return;
    void trackProductEvent("funnel_page_viewed", {
      funnel_stage: getFunnelStage(pathname),
      route: normalizeAnalyticsPath(pathname),
    });
  }, [enabled, hasAnalyticsConsent, pathname]);

  useEffect(() => {
    if (!enabled) return;

    const handleClick = (event: MouseEvent) => {
      const target = getTrackableElement(event.target);
      if (target && !target.closest("[data-analytics-ignore]")) {
        const eventName = target.dataset.analyticsEvent;
        if (eventName && isProductAnalyticsEventName(eventName)) {
          if (target.dataset.analyticsOnce === "true" && target.dataset.analyticsTracked === "true") return;
          if (target.dataset.analyticsOnce === "true") target.dataset.analyticsTracked = "true";
          void trackProductEvent(eventName, readAnalyticsData(target));
        }
        return;
      }

      const anchor = event.target instanceof Element
        ? event.target.closest<HTMLAnchorElement>("a[href]")
        : null;
      if (!anchor || anchor.closest("[data-analytics-ignore]") || anchor.target === "_blank") return;

      let targetUrl: URL;
      try {
        targetUrl = new URL(anchor.href, window.location.origin);
      } catch {
        return;
      }

      if (targetUrl.pathname.includes("/admin") || targetUrl.pathname.includes("/installer") || targetUrl.pathname.includes("/track/")) return;
      void trackProductEvent("navigation_clicked", {
        target_type: targetUrl.origin === window.location.origin ? "internal" : "external",
        target_path: targetUrl.origin === window.location.origin ? normalizeAnalyticsPath(targetUrl.pathname) : targetUrl.hostname,
      });
    };

    const handleFocus = (event: FocusEvent) => {
      const field = event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-analytics-field]")
        : null;
      const container = getAnalyticsContainer(event.target);
      if (!container) return;
      if (container.dataset.analyticsStarted !== "true") {
        container.dataset.analyticsStarted = "true";
        void trackProductEvent("form_started", {
          form_id: container.dataset.analyticsForm,
        });
      }
      if (!field || field.dataset.analyticsStarted === "true") return;
      field.dataset.analyticsStarted = "true";
      void trackProductEvent("form_field_started", {
        form_id: container.dataset.analyticsForm,
        field: field.dataset.analyticsField,
      });
    };

    const handleSubmit = (event: SubmitEvent) => {
      const form = event.target instanceof HTMLFormElement ? event.target : null;
      const container = getAnalyticsContainer(form);
      if (!container) return;
      void trackProductEvent("form_submitted", {
        form_id: container.dataset.analyticsForm,
        submit_event: container.dataset.analyticsSubmitEvent,
      });
    };

    document.addEventListener("click", handleClick, true);
    document.addEventListener("focusin", handleFocus, true);
    document.addEventListener("submit", handleSubmit, true);
    return () => {
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("focusin", handleFocus, true);
      document.removeEventListener("submit", handleSubmit, true);
    };
  }, [enabled]);

  return <>{children}</>;
}
