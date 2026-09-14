import { requireAdmin } from "@/lib/auth-guard";
import { getCachedAnalyticsConfig } from "@/lib/public-content-cache";
import AnalyticsSandboxClient from "./AnalyticsSandboxClient";

export default async function AdminAnalyticsSandboxPage() {
  await requireAdmin();
  const config = await getCachedAnalyticsConfig();

  return (
    <AnalyticsSandboxClient
      serverReady={config.analytics_enabled && Boolean(config.umamiUrl && config.umamiWebsiteId)}
    />
  );
}
