"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import type { AnalyticsConfig } from "@/lib/analyticsConfig";
import { isAnalyticsExcludedRoute } from "@/lib/customerRoutePolicy";

const AnalyticsProvider = dynamic(() => import("./AnalyticsProvider"));
const UmamiConsentScript = dynamic(() => import("./UmamiConsentScript"));
const GoogleTagScript = dynamic(() => import("./GoogleTagScript"));
const ProductAnalyticsProvider = dynamic(() => import("./ProductAnalyticsProvider"));

export default function RouteAwareAnalytics({
  config,
  children,
}: {
  config: AnalyticsConfig;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const isExcludedRoute = isAnalyticsExcludedRoute(pathname);
  useEffect(() => {
    if (!isExcludedRoute) return;
    const analyticsWindow = window as Window & { umami?: unknown };
    const scripts = Array.from(
      document.querySelectorAll<HTMLScriptElement>("script[data-website-id]"),
    );
    const trackerWasActive =
      scripts.length > 0 || Boolean(analyticsWindow.umami);
    scripts.forEach((script) => script.remove());
    delete analyticsWindow.umami;
    // A hard reload clears event listeners held by a tracker mounted on the prior SPA route.
    // Direct excluded-route loads never mount it, so this runs at most once on
    // client navigation.
    if (trackerWasActive) window.location.reload();
  }, [config, isExcludedRoute]);
  if (isExcludedRoute) return <>{children}</>;
  return (
    <AnalyticsProvider config={config}>
      <UmamiConsentScript
        baseUrl={config.umamiUrl}
        websiteId={config.umamiWebsiteId}
        enabled={config.analytics_enabled}
      />
      <GoogleTagScript enabled={config.analytics_enabled} />
      <ProductAnalyticsProvider>{children}</ProductAnalyticsProvider>
    </AnalyticsProvider>
  );
}
