import { requireAdmin } from "@/lib/auth-guard";
import { getAnalyticsConfig } from "@/app/actions/systemSettings";
import AnalyticsSettingsClient from "./AnalyticsSettingsClient";


export default async function AdminAnalyticsSettingsPage() {
  await requireAdmin();
  const config = await getAnalyticsConfig();

  return <AnalyticsSettingsClient initialConfig={config} />;
}
