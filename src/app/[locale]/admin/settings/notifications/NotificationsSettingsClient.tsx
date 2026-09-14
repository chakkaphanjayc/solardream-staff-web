"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  BellRing,
  Check,
  CircleAlert,
  Clock3,
  Link2,
  Mail,
  MessageCircleMore,
  Save,
  Send,
  ShieldCheck,
  SlidersHorizontal,
} from "@/components/ui/icons";

import {
  saveSalesNotificationConfigAction,
  sendSalesNotificationTestAction,
} from "@/app/actions/settings/salesNotifications";
import {
  SALES_NOTIFICATION_EVENTS,
  SALES_NOTIFICATION_EVENT_META,
  type SalesNotificationConfig,
  type SalesNotificationEvent,
} from "@/lib/salesNotificationConfig";
import type { SalesNotificationChannelStatus } from "@/lib/salesNotificationServer";
import { AdminBulkActionBar } from "@/components/admin/AdminBulkActionBar";
import { AdminSelectionCheckbox } from "@/components/admin/AdminSelectionCheckbox";
import { useAdminSelection } from "@/hooks/useAdminSelection";

type LineRecipient = {
  id: string;
  name: string | null;
  fullName: string;
  email: string;
  lineUserId: string | null;
};

type NotificationsSettingsClientProps = {
  initialConfig: SalesNotificationConfig;
  channelStatus: SalesNotificationChannelStatus;
  lineRecipients: LineRecipient[];
};

function channelSourceLabel(source: SalesNotificationChannelStatus["discordSource"]) {
  if (source === "system_settings") return "Saved in API setup";
  if (source === "environment") return "Environment variable";
  return "Not configured";
}

export default function NotificationsSettingsClient({
  initialConfig,
  channelStatus,
  lineRecipients,
}: NotificationsSettingsClientProps) {
  const [config, setConfig] = useState<SalesNotificationConfig>(initialConfig);
  const [selectedLineUserId, setSelectedLineUserId] = useState(lineRecipients[0]?.lineUserId || "");
  const [isPending, startTransition] = useTransition();
  const [testingChannel, setTestingChannel] = useState<"line" | "discord" | null>(null);
  const eventSelection = useAdminSelection([...SALES_NOTIFICATION_EVENTS]);
  const initialFingerprint = useMemo(() => JSON.stringify(initialConfig), [initialConfig]);
  const isDirty = JSON.stringify(config) !== initialFingerprint;

  const enabledEventCount = SALES_NOTIFICATION_EVENTS.filter((event) => {
    const rule = config.rules[event];
    return rule.line || rule.discord;
  }).length;

  const updateChannel = (
    event: SalesNotificationEvent,
    channel: "line" | "discord",
    enabled: boolean,
  ) => {
    setConfig((current) => ({
      ...current,
      rules: {
        ...current.rules,
        [event]: {
          ...current.rules[event],
          [channel]: enabled,
        },
      },
    }));
  };

  const updateSelectedChannel = (channel: "line" | "discord", enabled: boolean) => {
    const selectedEvents = eventSelection.selectedIds.filter((event): event is SalesNotificationEvent =>
      SALES_NOTIFICATION_EVENTS.includes(event as SalesNotificationEvent),
    );
    if (selectedEvents.length === 0) return;

    setConfig((current) => {
      const rules = { ...current.rules };
      selectedEvents.forEach((event) => {
        rules[event] = { ...rules[event], [channel]: enabled };
      });
      return { ...current, rules };
    });
    eventSelection.clear();
    toast.success(`${enabled ? "Enabled" : "Disabled"} ${channel} for ${selectedEvents.length} event${selectedEvents.length === 1 ? "" : "s"}. Save routing to publish.`);
  };

  const handleSave = () => {
    startTransition(async () => {
      try {
        const result = await saveSalesNotificationConfigAction(config);
        if (result.success) {
          toast.success("Sales notification settings saved.");
        } else {
          toast.error(result.error || "Failed to save notification settings.");
        }
      } catch (error) {
        console.error("Sales notification settings save error:", error);
        toast.error("Failed to save notification settings. Please try again.");
      }
    });
  };

  const handleTest = (channel: "line" | "discord") => {
    setTestingChannel(channel);
    startTransition(async () => {
      try {
        const result = await sendSalesNotificationTestAction({
          channel,
          lineUserId: channel === "line" ? selectedLineUserId : undefined,
        });
        if (result.success) {
          toast.success(result.message || "Notification sent.");
        } else {
          toast.error(result.error || "Notification test failed.");
        }
      } catch (error) {
        console.error("Sales notification test error:", error);
        toast.error("Notification test failed. Please try again.");
      } finally {
        setTestingChannel(null);
      }
    });
  };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-800 bg-[#0F172A] p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#B7D1EA]/20 bg-[#B7D1EA]/10 text-[#B7D1EA]">
              <SlidersHorizontal className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-[#F8FAFC]">Lead → quotation → payment</h2>
              <div className="mt-1 max-w-3xl text-sm leading-6 text-[#94A3B8]">
                Control the operational Discord alert and the customer LINE message at every sales transition. Delivery runs through the integration outbox, so a channel outage does not roll back a lead, quotation, or payment.
              </div>
            </div>
          </div>

          <label className="inline-flex cursor-pointer items-center gap-3 rounded-xl border border-slate-800 bg-[#0B1121] px-3 py-2 text-xs font-bold text-slate-200">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(event) => setConfig((current) => ({ ...current, enabled: event.target.checked }))}
              className="h-4 w-4 accent-[#B7D1EA]"
            />
            Automation enabled
          </label>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <StatusCard
            icon={<MessageCircleMore className="h-4 w-4" />}
            label="LINE customer notices"
            configured={channelStatus.lineConfigured}
            enabled={config.lineEnabled}
            source={channelSourceLabel(channelStatus.lineSource)}
            onToggle={(enabled) => setConfig((current) => ({ ...current, lineEnabled: enabled }))}
          />
          <StatusCard
            icon={<BellRing className="h-4 w-4" />}
            label="Discord team notices"
            configured={channelStatus.discordConfigured}
            enabled={config.discordEnabled}
            source={channelSourceLabel(channelStatus.discordSource)}
            onToggle={(enabled) => setConfig((current) => ({ ...current, discordEnabled: enabled }))}
          />
          <div className="rounded-xl border border-slate-800 bg-[#0B1121] px-4 py-3">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-[#B7D1EA]">
              <ShieldCheck className="h-4 w-4" />
              Delivery coverage
            </div>
            <div className="mt-2 text-2xl font-black text-[#F8FAFC]">{enabledEventCount}/{SALES_NOTIFICATION_EVENTS.length}</div>
            <div className="mt-1 text-xs text-[#94A3B8]">Pipeline events have at least one channel enabled.</div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-xs text-[#94A3B8]">
          <Link
            href="/admin/settings/api?tab=setup"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-800 px-3 py-2 font-semibold transition hover:border-[#B7D1EA]/40 hover:text-[#B7D1EA]"
          >
            <Link2 className="h-3.5 w-3.5" />
            Configure Discord webhook
          </Link>
          <Link
            href="/admin/settings/api?tab=line"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-800 px-3 py-2 font-semibold transition hover:border-[#B7D1EA]/40 hover:text-[#B7D1EA]"
          >
            <Link2 className="h-3.5 w-3.5" />
            Configure LINE Messaging API
          </Link>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-800 bg-[#0F172A]">
        <div className="flex flex-col gap-2 border-b border-slate-800 bg-[#0B1121] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-black uppercase tracking-wider text-[#F8FAFC]">Event routing</h2>
            <div className="mt-1 text-xs leading-5 text-[#94A3B8]">LINE is sent only to a customer with a linked LINE account and active system-update consent.</div>
          </div>
          <span className="w-fit rounded-md border border-slate-800 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-[#94A3B8]">Per event / per channel</span>
        </div>

        <div className="divide-y divide-slate-800">
          <AdminBulkActionBar
            selectedCount={eventSelection.selectedCount}
            visibleCount={SALES_NOTIFICATION_EVENTS.length}
            allVisibleSelected={eventSelection.allVisibleSelected}
            someVisibleSelected={eventSelection.someVisibleSelected}
            onToggleVisible={eventSelection.toggleVisible}
            onClear={eventSelection.clear}
            isPending={isPending}
            actions={[
              { id: "line-on", label: "Enable LINE", icon: MessageCircleMore, tone: "success", onClick: () => updateSelectedChannel("line", true) },
              { id: "line-off", label: "Disable LINE", icon: MessageCircleMore, tone: "warning", onClick: () => updateSelectedChannel("line", false) },
              { id: "discord-on", label: "Enable Discord", icon: BellRing, tone: "success", onClick: () => updateSelectedChannel("discord", true) },
              { id: "discord-off", label: "Disable Discord", icon: BellRing, tone: "warning", onClick: () => updateSelectedChannel("discord", false) },
            ]}
          />
          {SALES_NOTIFICATION_EVENTS.map((event) => {
            const rule = config.rules[event];
            const meta = SALES_NOTIFICATION_EVENT_META[event];
            return (
              <div key={event} className="flex flex-col gap-4 px-5 py-4 md:flex-row md:items-center md:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <AdminSelectionCheckbox
                    checked={eventSelection.isSelected(event)}
                    onChange={() => eventSelection.toggle(event)}
                    label={`Select notification event ${meta.label}`}
                    className="mt-1 shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-200">{meta.label}</div>
                    <div className="mt-1 text-xs leading-5 text-[#94A3B8]">{meta.description}</div>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <ChannelToggle
                    label="LINE"
                    checked={rule.line}
                    disabled={!config.lineEnabled}
                    onChange={(enabled) => updateChannel(event, "line", enabled)}
                    tone="line"
                  />
                  <ChannelToggle
                    label="Discord"
                    checked={rule.discord}
                    disabled={!config.discordEnabled}
                    onChange={(enabled) => updateChannel(event, "discord", enabled)}
                    tone="discord"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-800 bg-[#0F172A] p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-xl border border-slate-800 bg-[#0B1121] p-2 text-[#B7D1EA]"><Send className="h-4 w-4" /></div>
            <div>
              <h2 className="text-sm font-black uppercase tracking-wider text-[#F8FAFC]">Test Discord</h2>
              <div className="mt-1 text-xs leading-5 text-[#94A3B8]">Uses the saved webhook in API Setup, with the same sales lifecycle card used in production.</div>
            </div>
          </div>
          <div className={`mt-4 flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${channelStatus.discordConfigured ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : "border-amber-500/20 bg-amber-500/10 text-amber-300"}`}>
            {channelStatus.discordConfigured ? <Check className="h-4 w-4" /> : <CircleAlert className="h-4 w-4" />}
            {channelStatus.discordConfigured ? channelSourceLabel(channelStatus.discordSource) : "Add a Discord webhook before testing."}
          </div>
          <button
            type="button"
            onClick={() => handleTest("discord")}
            disabled={testingChannel !== null || !channelStatus.discordConfigured}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#B7D1EA] px-4 py-3 text-xs font-black uppercase tracking-wider text-[#0F172A] transition hover:bg-[#99BFE3] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            {testingChannel === "discord" ? "Sending..." : "Send Discord test"}
          </button>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-[#0F172A] p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-xl border border-slate-800 bg-[#0B1121] p-2 text-[#B7D1EA]"><MessageCircleMore className="h-4 w-4" /></div>
            <div>
              <h2 className="text-sm font-black uppercase tracking-wider text-[#F8FAFC]">Test customer LINE</h2>
              <div className="mt-1 text-xs leading-5 text-[#94A3B8]">Select a linked customer. The test never broadcasts to all LINE users.</div>
            </div>
          </div>
          <select
            value={selectedLineUserId}
            onChange={(event) => setSelectedLineUserId(event.target.value)}
            className="mt-4 w-full rounded-xl border border-slate-800 bg-[#0B1121] px-3 py-3 text-sm text-slate-200 outline-none focus:border-[#B7D1EA]"
          >
            <option value="">Select linked LINE customer</option>
            {lineRecipients.map((recipient) => (
              <option key={recipient.id} value={recipient.lineUserId || ""}>
                {recipient.fullName || recipient.name || recipient.email} — {recipient.email}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => handleTest("line")}
            disabled={testingChannel !== null || !channelStatus.lineConfigured || !selectedLineUserId}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#B7D1EA]/30 bg-[#B7D1EA]/10 px-4 py-3 text-xs font-black uppercase tracking-wider text-[#B7D1EA] transition hover:bg-[#B7D1EA]/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <MessageCircleMore className="h-4 w-4" />
            {testingChannel === "line" ? "Sending..." : "Send LINE test"}
          </button>
        </section>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-[#0F172A] p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-xl border border-slate-800 bg-[#0B1121] p-2 text-[#B7D1EA]"><Clock3 className="h-4 w-4" /></div>
            <div>
              <h2 className="text-sm font-black uppercase tracking-wider text-[#F8FAFC]">Operational behavior</h2>
              <div className="mt-1 text-xs leading-5 text-[#94A3B8]">Failed deliveries remain visible in outbox logs for retry. Customer LINE is skipped when the account is unlinked, blocked, or opted out.</div>
            </div>
          </div>
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#94A3B8]"><Mail className="h-4 w-4" />Email remains managed by Listmonk</div>
        </div>
      </section>

      <div className="sticky bottom-4 z-10 flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending || !isDirty}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#B7D1EA] px-5 py-3 text-xs font-black uppercase tracking-wider text-[#0F172A] transition hover:bg-[#99BFE3] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {isPending ? "Saving..." : isDirty ? "Save routing" : "Routing saved"}
        </button>
      </div>
    </div>
  );
}

function StatusCard({
  icon,
  label,
  configured,
  enabled,
  source,
  onToggle,
}: {
  icon: ReactNode;
  label: string;
  configured: boolean;
  enabled: boolean;
  source: string;
  onToggle: (enabled: boolean) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-[#0B1121] px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-[#B7D1EA]">{icon}{label}</div>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => onToggle(event.target.checked)}
          className="h-4 w-4 accent-[#B7D1EA]"
          aria-label={`Enable ${label}`}
        />
      </div>
      <div className={`mt-3 inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-bold ${configured ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : "border-amber-500/20 bg-amber-500/10 text-amber-300"}`}>
        {configured ? <Check className="h-3 w-3" /> : <CircleAlert className="h-3 w-3" />}
        {configured ? source : "Not configured"}
      </div>
    </div>
  );
}

function ChannelToggle({
  label,
  checked,
  disabled,
  onChange,
  tone,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
  tone: "line" | "discord";
}) {
  return (
    <label className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[10px] font-black uppercase tracking-wider transition ${disabled ? "cursor-not-allowed border-slate-800 bg-slate-900/50 text-slate-600" : checked ? tone === "line" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-indigo-400/30 bg-indigo-400/10 text-indigo-200" : "border-slate-800 bg-[#0B1121] text-slate-500"}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-3.5 w-3.5 accent-[#B7D1EA]"
      />
      {label}
    </label>
  );
}
