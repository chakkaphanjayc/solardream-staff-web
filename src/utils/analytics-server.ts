import { getAnalyticsConfig, getSystemSetting } from "@/app/actions/systemSettings";
import type { AnalyticsFlagKey } from "@/lib/analyticsConfig";

type ServerEventInput = {
  eventName: string;
  featureFlagKey: Exclude<AnalyticsFlagKey, "analytics_enabled">;
  url: string;
  title?: string;
  properties?: Record<string, unknown>;
};

export type TrackUmamiServerEventResult =
  | { ok: true }
  | { ok: false; message: string };

const UMAMI_TRACK_TIMEOUT_MS = 5_000;
const MAX_UMAMI_RESPONSE_TEXT_CHARS = 2_000;
const UMAMI_SERVER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isUmamiBotRejection(value: unknown): boolean {
  return isRecord(value) && value.beep === "boop";
}

async function getSiteUrl() {
  const storedSiteUrl = (await getSystemSetting("site_url"))?.trim();
  return (storedSiteUrl || process.env.NEXT_PUBLIC_SITE_URL || "https://solar-dream.org").replace(/\/$/, "");
}

export async function trackUmamiServerEvent({
  eventName,
  featureFlagKey,
  url,
  title = eventName,
  properties = {},
}: ServerEventInput): Promise<TrackUmamiServerEventResult> {
  try {
    const [config, siteUrl] = await Promise.all([
      getAnalyticsConfig(),
      getSiteUrl(),
    ]);

    if (!config.analytics_enabled || !config[featureFlagKey]) {
      return { ok: false, message: "Analytics tracking is disabled by configuration." };
    }

    if (!config.umamiUrl || !config.umamiWebsiteId) {
      return { ok: false, message: "Umami URL or website ID is not configured." };
    }

    const hostname = (() => {
      try {
        return new URL(siteUrl).hostname;
      } catch {
        return "solar-dream.org";
      }
    })();

    const payload = {
      type: "event",
      payload: {
        hostname,
        language: "th-TH",
        referrer: "",
        screen: "1920x1080",
        title,
        url,
        website: config.umamiWebsiteId,
        name: eventName,
        data: {
          ...properties,
          feature_flag: featureFlagKey,
          tracked_at: new Date().toISOString(),
        },
      },
    };

    const response = await fetch(`${config.umamiUrl}/api/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": UMAMI_SERVER_USER_AGENT,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(UMAMI_TRACK_TIMEOUT_MS),
    });

    const responseText = (await response.text().catch(() => ""))
      .slice(0, MAX_UMAMI_RESPONSE_TEXT_CHARS);
    let responseBody: unknown = { raw: responseText };
    try {
      if (responseText) responseBody = JSON.parse(responseText);
    } catch {}

    const botRejected = isUmamiBotRejection(responseBody);
    const deliveryError = !response.ok
      ? responseText || `Umami returned ${response.status}`
      : botRejected
        ? "Umami rejected the server event as bot traffic."
        : null;

    const { queueApiLog } = await import("@/utils/logger");
    queueApiLog({
      direction: "OUTBOUND",
      sourceSystem: "SOLARDREAM_INTERNAL",
      endpoint: "/api/send",
      method: "POST",
      statusCode: response.status,
      requestHeaders: {
        "Content-Type": "application/json",
        "User-Agent": UMAMI_SERVER_USER_AGENT,
      },
      requestBody: payload,
      responseBody,
      errorMessage: deliveryError,
    });

    if (!response.ok) {
      return { ok: false, message: deliveryError || `Umami returned ${response.status}` };
    }

    if (botRejected) {
      return { ok: false, message: deliveryError || "Umami rejected the server event." };
    }

    return { ok: true };
  } catch (error) {
    console.error("[Analytics]: Server Umami event failed", error);
    try {
      const { queueApiLog, serializeError } = await import("@/utils/logger");
      const serialized = serializeError(error);
      queueApiLog({
        direction: "OUTBOUND",
        sourceSystem: "SOLARDREAM_INTERNAL",
        endpoint: "/api/send",
        method: "POST",
        statusCode: 500,
        requestBody: { eventName, featureFlagKey, properties },
        responseBody: serialized,
        errorMessage: serialized.stack || serialized.message,
      });
    } catch {}
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Unable to track server analytics event.",
    };
  }
}
