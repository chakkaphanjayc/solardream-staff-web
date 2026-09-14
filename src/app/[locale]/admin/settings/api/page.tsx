import { connection } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";
import { getSystemSetting } from "@/app/actions/systemSettings";
import { getLineEnvStatus } from "@/app/actions/settings/lineSettings";
import { db } from "@/db";
import ApiClient from "./ApiClient";
import type { ApiSetupEnvStatus, ApiSetupValues } from "./ApiSetupPanel";
import { listCatalogProducts } from "@/lib/erpnextCatalog";
import { getLineAutomationConfig } from "@/lib/lineAutomationServer";

export const instant = false;

const apiSetupKeys = [
  "site_url",
  "erpnext_site_endpoint",
  "erpnext_api_key",
  "erpnext_api_secret",
  "erpnext_webhook_secret",
  "erpnext_webhook_enabled",
  "discord_webhook_url",
  "line_channel_access_token",
  "line_channel_secret",
  "line_liff_id",
  "line_login_url",
  "line_member_rich_menu_id",
  "line_lifecycle_api_secret",
  "cron_secret",
  "umami_url",
  "umami_website_id",
] as const;

type ApiSetupSettingKey = (typeof apiSetupKeys)[number];

function valueFrom(settings: Record<ApiSetupSettingKey, string | null>, key: ApiSetupSettingKey, fallback = "") {
  return settings[key]?.trim() || fallback;
}

export default async function AdminApiSettingsPage() {
  await connection();
  // Enforce administrator access
  await requireAdmin();

  // Load ERPNext configurations
  const apiSetupSettingsList = await Promise.all(apiSetupKeys.map((key) => getSystemSetting(key)));
  const apiSetupSettings = apiSetupKeys.reduce<Record<ApiSetupSettingKey, string | null>>((accumulator, key, index) => {
    accumulator[key] = apiSetupSettingsList[index];
    return accumulator;
  }, {} as Record<ApiSetupSettingKey, string | null>);

  const initialEndpoint = valueFrom(apiSetupSettings, "erpnext_site_endpoint", process.env.ERPNEXT_BASE_URL?.trim() || "");
  const webhookEnabledValue = valueFrom(apiSetupSettings, "erpnext_webhook_enabled");

  const apiSetupValues: ApiSetupValues = {
    siteUrl: valueFrom(apiSetupSettings, "site_url", process.env.NEXT_PUBLIC_SITE_URL?.trim() || ""),
    erpnextUrl: initialEndpoint,
    erpnextApiKey: valueFrom(apiSetupSettings, "erpnext_api_key"),
    erpnextApiSecret: valueFrom(apiSetupSettings, "erpnext_api_secret"),
    erpnextWebhookSecret: valueFrom(apiSetupSettings, "erpnext_webhook_secret"),
    erpnextWebhookEnabled: webhookEnabledValue || "false",
    discordWebhookUrl: valueFrom(apiSetupSettings, "discord_webhook_url", process.env.DISCORD_WEBHOOK_URL?.trim() || ""),
    lineChannelAccessToken: valueFrom(apiSetupSettings, "line_channel_access_token"),
    lineChannelSecret: valueFrom(apiSetupSettings, "line_channel_secret"),
    lineLiffId: valueFrom(apiSetupSettings, "line_liff_id", process.env.NEXT_PUBLIC_LINE_LIFF_ID?.trim() || process.env.LINE_LIFF_ID?.trim() || ""),
    lineLoginUrl: valueFrom(apiSetupSettings, "line_login_url"),
    lineMemberRichMenuId: valueFrom(
      apiSetupSettings,
      "line_member_rich_menu_id",
      process.env.NEXT_PUBLIC_RICH_MENU_MEMBER_ID?.trim() || process.env.LINE_RICH_MENU_MEMBER_ID?.trim() || process.env.LINE_MEMBER_RICH_MENU_ID?.trim() || "",
    ),
    lineLifecycleApiSecret: valueFrom(apiSetupSettings, "line_lifecycle_api_secret"),
    cronSecret: valueFrom(apiSetupSettings, "cron_secret"),
    umamiUrl: valueFrom(
      apiSetupSettings,
      "umami_url",
      process.env.NEXT_PUBLIC_UMAMI_URL?.trim() || process.env.UMAMI_URL?.trim() || "https://umami.solar-dream.org",
    ),
    umamiWebsiteId: valueFrom(apiSetupSettings, "umami_website_id", process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID?.trim() || process.env.UMAMI_WEBSITE_ID?.trim() || ""),
  };

  const apiSetupEnvStatus: ApiSetupEnvStatus = {
    siteUrl: Boolean(process.env.NEXT_PUBLIC_SITE_URL),
    erpnextUrl: Boolean(process.env.ERPNEXT_BASE_URL),
    erpnextApiKey: Boolean(process.env.ERPNEXT_API_KEY),
    erpnextApiSecret: Boolean(process.env.ERPNEXT_API_SECRET),
    erpnextWebhookSecret: Boolean(process.env.ERPNEXT_WEBHOOK_SECRET),
    discordWebhookUrl: Boolean(process.env.DISCORD_WEBHOOK_URL),
    lineChannelAccessToken: Boolean(process.env.LINE_CHANNEL_ACCESS_TOKEN),
    lineChannelSecret: Boolean(process.env.LINE_CHANNEL_SECRET),
    lineLiffId: Boolean(process.env.NEXT_PUBLIC_LINE_LIFF_ID || process.env.LINE_LIFF_ID),
    lineMemberRichMenuId: Boolean(process.env.NEXT_PUBLIC_RICH_MENU_MEMBER_ID || process.env.LINE_RICH_MENU_MEMBER_ID || process.env.LINE_MEMBER_RICH_MENU_ID),
    lineLifecycleApiSecret: Boolean(process.env.LINE_LIFECYCLE_API_SECRET),
    cronSecret: Boolean(process.env.CRON_SECRET),
    umamiUrl: Boolean(process.env.NEXT_PUBLIC_UMAMI_URL || process.env.UMAMI_URL),
    umamiWebsiteId: Boolean(process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID || process.env.UMAMI_WEBSITE_ID),
  };

  // Load LINE API configurations and environment status
  const envStatus = await getLineEnvStatus();
  const configuredSiteUrl = valueFrom(
    apiSetupSettings,
    "site_url",
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || "",
  ).replace(/\/$/, "");
  const defaultWebhookEndpoint = configuredSiteUrl ? `${configuredSiteUrl}/api/webhook` : "";

  // Load list of users, products, and proposals in parallel to support LINE Messaging API testing
  const [systemUsers, catalogResult, proposalsList, lineAutomation] = await Promise.all([
    db.query.users.findMany({
      columns: {
        id: true,
        name: true,
        fullName: true,
        email: true,
        lineUserId: true,
      },
      orderBy: (users, { desc }) => [desc(users.createdAt)],
      limit: 100,
    }),
    listCatalogProducts({ sort: "newest", take: 10 }),
    db.query.proposals.findMany({
      columns: {
        id: true,
        userId: true,
        shippingTrackingNumber: true,
        status: true,
      },
      limit: 10,
    }),
    getLineAutomationConfig(),
  ]);
  const productsList = catalogResult.products;

  return (
    <ApiClient
      apiSetupValues={apiSetupValues}
      apiSetupEnvStatus={apiSetupEnvStatus}
      // ERPNext Integration Props
      initialEndpoint={initialEndpoint}
      webhookEnabled={webhookEnabledValue === "true"}
      // LINE Messaging API Props
      initialEnvStatus={envStatus}
      defaultWebhookEndpoint={defaultWebhookEndpoint}
      systemUsers={systemUsers}
      initialTriggerConfigs={lineAutomation.triggers}
      initialQuickButtons={lineAutomation.quickButtons}
      initialLoginUrl={lineAutomation.loginUrl}
      initialConversation={lineAutomation.conversation}
      productsList={productsList}
      proposalsList={proposalsList}
    />
  );
}
