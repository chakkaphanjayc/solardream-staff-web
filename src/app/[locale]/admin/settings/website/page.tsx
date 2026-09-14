import { getSystemSetting } from "@/app/actions/systemSettings";
import { getCachedWebsiteSettings, WEBSITE_SETTINGS_KEY } from "@/lib/websiteSettings";
import { DEFAULT_WEBSITE_SETTINGS } from "@/lib/websiteSettingsTypes";
import WebsiteSettingsClient from "./WebsiteSettingsClient";


export default async function WebsiteSettingsPage() {
  const [activeSettings, storedJson] = await Promise.all([
    getCachedWebsiteSettings(),
    getSystemSetting(WEBSITE_SETTINGS_KEY),
  ]);

  return (
    <WebsiteSettingsClient
      activeSettings={activeSettings}
      initialJson={storedJson || JSON.stringify(DEFAULT_WEBSITE_SETTINGS, null, 2)}
    />
  );
}
