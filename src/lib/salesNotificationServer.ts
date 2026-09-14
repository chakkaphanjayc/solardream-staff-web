import "server-only";

import { getSystemSetting } from "@/app/actions/systemSettings";
import { getLineIntegrationConfig } from "@/lib/lineApi";
import {
  DEFAULT_SALES_NOTIFICATION_CONFIG,
  normalizeSalesNotificationConfig,
  SALES_NOTIFICATION_CONFIG_KEY,
  type SalesNotificationConfig,
} from "@/lib/salesNotificationConfig";

export type SalesNotificationChannelStatus = {
  discordConfigured: boolean;
  discordSource: "system_settings" | "environment" | "missing";
  lineConfigured: boolean;
  lineSource: "system_settings" | "environment" | "missing";
};

export async function getSalesNotificationConfig(): Promise<SalesNotificationConfig> {
  const raw = await getSystemSetting(SALES_NOTIFICATION_CONFIG_KEY);
  if (!raw) return DEFAULT_SALES_NOTIFICATION_CONFIG;

  try {
    return normalizeSalesNotificationConfig(JSON.parse(raw) as unknown);
  } catch {
    return DEFAULT_SALES_NOTIFICATION_CONFIG;
  }
}

export async function getSalesNotificationChannelStatus(): Promise<SalesNotificationChannelStatus> {
  const [storedDiscordWebhookUrl, lineConfig] = await Promise.all([
    getSystemSetting("discord_webhook_url"),
    getLineIntegrationConfig(),
  ]);

  const discordStored = Boolean(storedDiscordWebhookUrl?.trim());
  const discordEnvironment = Boolean(process.env.DISCORD_WEBHOOK_URL?.trim());

  return {
    discordConfigured: discordStored || discordEnvironment,
    discordSource: discordStored
      ? "system_settings"
      : discordEnvironment
        ? "environment"
        : "missing",
    lineConfigured: Boolean(lineConfig.accessToken),
    lineSource: lineConfig.accessTokenSource,
  };
}
