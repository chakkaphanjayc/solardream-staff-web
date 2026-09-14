"use client";

import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import type { AnalyticsConfig } from "@/lib/analyticsConfig";
import { setAnalyticsConfigCache } from "@/utils/analytics";

type AnalyticsContextValue = AnalyticsConfig;

const AnalyticsContext = createContext<AnalyticsContextValue | null>(null);

export function useAnalyticsConfig() {
  return useContext(AnalyticsContext);
}

export default function AnalyticsProvider({
  config,
  children,
}: {
  config: AnalyticsConfig;
  children: ReactNode;
}) {
  const value = useMemo(() => config, [config]);

  useEffect(() => {
    setAnalyticsConfigCache(value);
  }, [value]);

  return (
    <AnalyticsContext.Provider value={value}>
      {children}
    </AnalyticsContext.Provider>
  );
}
