"use client";

import { useState, useTransition, type ReactNode } from "react";
import {
  Activity,
  Bot,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  Globe2,
  RefreshCw,
  Send,
  ShieldCheck,
  Users,
} from "@/components/ui/icons";
import { toast } from "sonner";

import {
  checkLineConnection,
  getLineUsageSnapshot,
  getLineWebhookSettings,
  setLineWebhookEndpoint,
  testLineWebhookEndpoint,
  type LineBotInfo,
  type LineEnvStatus,
  type LineUsageSnapshot,
  type LineWebhookSettings,
} from "@/app/actions/settings/lineSettings";
import { cn } from "@/lib/utils";
import type { LineConversationOwner } from "@/lib/lineAutomationConfig";

type LineOperationsPanelProps = {
  envStatus: LineEnvStatus;
  defaultWebhookEndpoint: string;
  conversationOwner: LineConversationOwner;
};

type BusyAction = "connection" | "webhook" | "test" | "usage" | null;

function sourceLabel(source: LineEnvStatus["LINE_CHANNEL_ACCESS_TOKEN_SOURCE"]) {
  if (source === "system_settings") return "Admin settings";
  if (source === "environment") return ".env fallback";
  return "Not configured";
}

function formatNumber(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : new Intl.NumberFormat("en-US").format(value);
}

function StatusPill({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold",
        active
          ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
          : "border-slate-700 bg-slate-900/70 text-slate-400",
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", active ? "bg-emerald-400" : "bg-slate-600")} />
      {children}
    </span>
  );
}

function DataValue({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="min-w-0 border-t border-slate-800 pt-3">
      <p className="text-[10px] font-medium text-slate-500">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-slate-100">{value}</p>
      {note ? <p className="mt-1 text-[10px] text-slate-500">{note}</p> : null}
    </div>
  );
}

export default function LineOperationsPanel({ envStatus, defaultWebhookEndpoint, conversationOwner }: LineOperationsPanelProps) {
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [isPending, startTransition] = useTransition();
  const [botInfo, setBotInfo] = useState<LineBotInfo | null>(null);
  const [connectionChecked, setConnectionChecked] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [endpoint, setEndpoint] = useState(defaultWebhookEndpoint);
  const [webhook, setWebhook] = useState<LineWebhookSettings | null>(null);
  const [usage, setUsage] = useState<LineUsageSnapshot | null>(null);

  const run = (action: Exclude<BusyAction, null>, operation: () => Promise<void>) => {
    setBusyAction(action);
    startTransition(async () => {
      try {
        await operation();
      } catch (error: unknown) {
        console.error("[LINE settings] Operation failed:", error);
        toast.error("LINE operation failed. Check the server log and try again.");
      } finally {
        setBusyAction(null);
      }
    });
  };

  const refreshConnection = () => {
    run("connection", async () => {
      const [connectionResult, webhookResult] = await Promise.all([
        checkLineConnection(),
        getLineWebhookSettings(),
      ]);

      setConnectionChecked(true);
      if (connectionResult.success) {
        setBotInfo(connectionResult.botInfo);
        setConnectionError(null);
      } else {
        setBotInfo(null);
        setConnectionError(connectionResult.error);
      }

      if (webhookResult.success) {
        setWebhook(webhookResult.webhook);
        setEndpoint(webhookResult.webhook.endpoint);
      } else if (webhookResult.status === 404) {
        setWebhook(null);
      }

      if (connectionResult.success) {
        toast.success("LINE connection verified.");
      } else {
        toast.error(connectionResult.error);
      }
    });
  };

  const saveWebhook = () => {
    run("webhook", async () => {
      const result = await setLineWebhookEndpoint(endpoint);
      if (!result.success) {
        toast.error(result.error);
        return;
      }

      setWebhook((current) => ({ endpoint: result.endpoint || endpoint, active: current?.active ?? false }));
      toast.success("Webhook URL saved to LINE.");
    });
  };

  const testWebhook = () => {
    run("test", async () => {
      const result = await testLineWebhookEndpoint(endpoint || undefined);
      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success("LINE accepted the webhook test request.");
    });
  };

  const refreshUsage = () => {
    run("usage", async () => {
      const result = await getLineUsageSnapshot();
      if (!result.success || !result.usage) {
        toast.error(result.error || "LINE usage data could not be loaded.");
        return;
      }

      setUsage(result.usage);
      if (result.usage.errors.length > 0) {
        toast.warning("Some LINE usage metrics are unavailable right now.");
      } else {
        toast.success("LINE usage refreshed.");
      }
    });
  };

  const configuredCount = [envStatus.LINE_CHANNEL_ACCESS_TOKEN, envStatus.LINE_CHANNEL_SECRET].filter(Boolean).length;

  return (
    <section className="space-y-5 rounded-2xl border border-slate-800 bg-[#0F172A] p-5 text-left sm:p-6">
      <div className="flex flex-col gap-4 border-b border-slate-800 pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#B7D1EA]/20 bg-[#B7D1EA]/10 text-[#B7D1EA]">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#B7D1EA]">LINE operations</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-50">Connection, webhook, and usage</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-400">
              Manage the controls LINE exposes through the Messaging API. Credentials saved in API Setup are used first, with .env as a fallback.
            </p>
            <div className="mt-3">
              <StatusPill active={conversationOwner === "chatwoot"}>
                {conversationOwner === "chatwoot" ? "Chatwoot owns replies" : "SolarDream owns replies"}
              </StatusPill>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={refreshConnection}
          disabled={isPending || !envStatus.LINE_CHANNEL_ACCESS_TOKEN}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#B7D1EA] px-4 text-xs font-semibold text-[#0F172A] transition hover:bg-[#c7def1] disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
        >
          <RefreshCw className={cn("h-4 w-4", busyAction === "connection" && "animate-spin")} />
          {busyAction === "connection" ? "Checking…" : "Refresh connection"}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-800 bg-[#0B1121] p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-slate-400">Access token</p>
            <StatusPill active={envStatus.LINE_CHANNEL_ACCESS_TOKEN}>Ready</StatusPill>
          </div>
          <p className="mt-3 truncate font-mono text-xs text-slate-200">{envStatus.LINE_CHANNEL_ACCESS_TOKEN_PREVIEW || "Not configured"}</p>
          <p className="mt-1 text-[10px] text-slate-500">{sourceLabel(envStatus.LINE_CHANNEL_ACCESS_TOKEN_SOURCE)}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-[#0B1121] p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-slate-400">Channel secret</p>
            <StatusPill active={envStatus.LINE_CHANNEL_SECRET}>Ready</StatusPill>
          </div>
          <p className="mt-3 truncate font-mono text-xs text-slate-200">{envStatus.LINE_CHANNEL_SECRET_PREVIEW || "Not configured"}</p>
          <p className="mt-1 text-[10px] text-slate-500">{sourceLabel(envStatus.LINE_CHANNEL_SECRET_SOURCE)}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-[#0B1121] p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-slate-400">Bot status</p>
            <StatusPill active={Boolean(botInfo)}>Verified</StatusPill>
          </div>
          <p className="mt-3 truncate text-xs font-semibold text-slate-200">{botInfo?.displayName || "Not checked"}</p>
          <p className="mt-1 truncate text-[10px] text-slate-500">{botInfo?.basicId || `${configuredCount}/2 credentials ready`}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-[#0B1121] p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-slate-400">Webhook</p>
            <StatusPill active={Boolean(webhook?.active)}> {webhook?.active ? "Active" : "Not verified"}</StatusPill>
          </div>
          <p className="mt-3 truncate text-xs font-semibold text-slate-200">{webhook?.endpoint || "Not loaded"}</p>
          <p className="mt-1 text-[10px] text-slate-500">LINE controls delivery separately from this app.</p>
        </div>
      </div>

      {connectionChecked && connectionError ? (
        <div className="flex items-start gap-3 rounded-xl border border-rose-400/25 bg-rose-400/10 p-4 text-xs text-rose-100">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
          <div>
            <p className="font-semibold">LINE connection needs attention</p>
            <p className="mt-1 leading-5 text-rose-200/80">{connectionError}</p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-xl border border-slate-800 bg-[#0B1121] p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-slate-100">
                <Globe2 className="h-4 w-4 text-[#B7D1EA]" />
                <h3 className="text-sm font-semibold">Webhook endpoint</h3>
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500">Set and test the HTTPS URL that receives LINE events.</p>
            </div>
            <a
              href="https://developers.line.biz/console/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#B7D1EA] hover:underline"
            >
              LINE Console <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          {conversationOwner === "chatwoot" ? (
            <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-amber-400/25 bg-amber-400/10 p-3 text-[10px] leading-4 text-amber-100">
              <Bot className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
              <p>
                Chatwoot owns this LINE conversation. Register the webhook URL generated by the Chatwoot LINE channel in LINE Developers, then use this card only to verify what LINE currently has registered.
              </p>
            </div>
          ) : null}

          <label className="mt-4 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500" htmlFor="line-webhook-endpoint">
            Public HTTPS URL
          </label>
          <input
            id="line-webhook-endpoint"
            type="url"
            value={endpoint}
            onChange={(event) => setEndpoint(event.target.value)}
            placeholder="https://your-domain.com/api/webhook"
            className="mt-2 min-h-11 w-full rounded-lg border border-slate-700 bg-[#0F172A] px-3 text-xs text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-[#B7D1EA]"
          />
          <p className="mt-2 text-[10px] leading-4 text-slate-500">LINE accepts HTTPS URLs up to 500 characters. Localhost URLs cannot be registered with LINE.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={saveWebhook}
              disabled={isPending || !endpoint.trim() || conversationOwner === "chatwoot"}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#B7D1EA] px-4 text-xs font-semibold text-[#0F172A] transition hover:bg-[#c7def1] disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
            >
              <ShieldCheck className="h-4 w-4" />
              {conversationOwner === "chatwoot" ? "Managed in Chatwoot" : busyAction === "webhook" ? "Saving…" : "Save webhook URL"}
            </button>
            <button
              type="button"
              onClick={testWebhook}
              disabled={isPending || conversationOwner === "chatwoot"}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-700 px-4 text-xs font-semibold text-slate-200 transition hover:border-[#B7D1EA]/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {busyAction === "test" ? "Testing…" : "Send LINE test"}
            </button>
          </div>
          {conversationOwner === "native" && defaultWebhookEndpoint && endpoint !== defaultWebhookEndpoint ? (
            <button
              type="button"
              onClick={() => setEndpoint(defaultWebhookEndpoint)}
              className="mt-3 text-[10px] font-semibold text-[#B7D1EA] hover:underline"
            >
              Use this app’s default: {defaultWebhookEndpoint}
            </button>
          ) : null}
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#0B1121] p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-slate-100">
                <Users className="h-4 w-4 text-[#B7D1EA]" />
                <h3 className="text-sm font-semibold">Messaging usage</h3>
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500">Read monthly message usage and follower insight from LINE.</p>
            </div>
            <button
              type="button"
              onClick={refreshUsage}
              disabled={isPending || !envStatus.LINE_CHANNEL_ACCESS_TOKEN}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 text-slate-300 transition hover:border-[#B7D1EA]/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Refresh LINE messaging usage"
            >
              <RefreshCw className={cn("h-4 w-4", busyAction === "usage" && "animate-spin")} />
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4">
            <DataValue
              label="Used this month"
              value={formatNumber(usage?.consumption)}
              note={usage ? `Approximate, ${usage.date}` : "Refresh to load"}
            />
            <DataValue
              label="Monthly target"
              value={usage?.quota?.type === "none" ? "No limit set" : formatNumber(usage?.quota?.value)}
              note={usage?.quota?.type === "limited" ? "Configured in LINE" : "LINE account plan"}
            />
            <DataValue label="Followers" value={formatNumber(usage?.followers?.followers)} note={usage?.followers?.status || "Not loaded"} />
            <DataValue label="Targeted reaches" value={formatNumber(usage?.followers?.targetedReaches)} note="Follower insight" />
          </div>
          {usage?.errors.length ? (
            <p className="mt-4 text-[10px] leading-4 text-amber-200/80">Some metrics were unavailable: {usage.errors.join("; ")}</p>
          ) : null}
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-slate-800 bg-[#0B1121] p-4">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#B7D1EA]" />
        <p className="text-xs leading-5 text-slate-400">
          Rich Menu artwork belongs in the Rich Menu editor. LINE’s Messaging API can upload Rich Menu images, but it cannot change a chat-room wallpaper, so this console does not expose a misleading background setting.
        </p>
      </div>

    </section>
  );
}
