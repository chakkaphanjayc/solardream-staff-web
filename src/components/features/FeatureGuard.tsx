"use client";

import React, { useEffect, useState } from "react";
import { useFeatureFlagStore } from "@/store/useFeatureFlagStore";
import MaintenanceView from "@/components/ui/MaintenanceView";

type FeatureGuardProps = {
  featureKey: string;
  featureName?: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

export default function FeatureGuard({
  featureKey,
  featureName,
  children,
  fallback,
}: FeatureGuardProps) {
  const { flags, loaded, fetchFlags, isEnabled } = useFeatureFlagStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (!loaded) {
      fetchFlags();
    }
  }, [loaded, fetchFlags]);

  // Prevent SSR / hydration mismatch by matching initial render
  if (!mounted) {
    return <>{children}</>;
  }

  const active = isEnabled(featureKey);

  if (!active) {
    if (fallback) {
      return <>{fallback}</>;
    }
    return <MaintenanceView featureName={featureName ?? featureKey} />;
  }

  return <>{children}</>;
}
