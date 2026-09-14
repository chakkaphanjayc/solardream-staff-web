import type { Metadata } from "next";

import TechnicianPortalClient from "@/components/tech-portal/TechnicianPortalClient";
import { isLocale } from "@/i18n/locales";
import { isOpsV2FeatureEnabled } from "@/lib/featureFlags";

export const metadata: Metadata = {
  title: "Technician Portal",
  description: "Mobile installation workflow for SolarDream technicians.",
  robots: {
    index: false,
    follow: false,
  },
};

export const instant = false;

export default async function TechnicianPortalPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const [fieldEnabled, assetsEnabled] = await Promise.all([
    isOpsV2FeatureEnabled("OPS_V2_FIELD"),
    isOpsV2FeatureEnabled("OPS_V2_ASSETS"),
  ]);
  return (
    <TechnicianPortalClient
      locale={isLocale(locale) ? locale : "en"}
      assetCaptureEnabled={fieldEnabled && assetsEnabled}
    />
  );
}
