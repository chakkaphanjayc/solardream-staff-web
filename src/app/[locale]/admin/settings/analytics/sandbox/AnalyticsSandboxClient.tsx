"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Activity,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  FileSignature,
  MousePointer2,
  ShieldCheck,
  Terminal,
  UserPlus,
  WandSparkles,
  XCircle,
} from "@/components/ui/icons";
import { toast } from "sonner";
import { dispatchAnalyticsSandboxEvent } from "@/app/actions/analyticsSandbox";
import {
  ANALYTICS_SANDBOX_EVENTS,
  type AnalyticsSandboxEventName,
} from "@/lib/analyticsSandbox";
import { cn } from "@/lib/utils";
import { GsapPulse, GsapSpinner } from "@/components/ui/GsapMotion";
import { AdminBulkActionBar } from "@/components/admin/AdminBulkActionBar";
import { AdminSelectionCheckbox } from "@/components/admin/AdminSelectionCheckbox";
import { useAdminSelection } from "@/hooks/useAdminSelection";

type SandboxEvent = Readonly<{
  title: string;
  description: string;
  eventName: AnalyticsSandboxEventName;
  icon: typeof UserPlus;
}>;

const SANDBOX_EVENTS: readonly SandboxEvent[] = [
  {
    title: "Simulate Sign-Up",
    description: "Registration success event with mock provider metadata.",
    eventName: "sign_up",
    icon: UserPlus,
  },
  {
    title: "Simulate Wizard Calculation",
    description: "Lead-form start event from a sandbox source.",
    eventName: "lead_form_started",
    icon: WandSparkles,
  },
  {
    title: "Simulate Qtn Request (5kW)",
    description: "Quotation request event with a test 5kW residential payload.",
    eventName: "quotation_requested",
    icon: ClipboardList,
  },
  {
    title: "Simulate Contract Signed",
    description: "Closed-conversion event with mock quotation and revenue data.",
    eventName: "proposal_signed",
    icon: FileSignature,
  },
];

function formatTimestamp() {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());
}

function formatProperties(properties: Readonly<Record<string, unknown>>) {
  return JSON.stringify(properties);
}

type AnalyticsSandboxClientProps = {
  serverReady: boolean;
};

export default function AnalyticsSandboxClient({ serverReady }: AnalyticsSandboxClientProps) {
  const [logs, setLogs] = useState<string[]>([
    `[${formatTimestamp()}] Analytics sandbox mounted. Waiting for test event dispatch.`,
  ]);
  const [transportState, setTransportState] = useState<"ready" | "unavailable" | "failed">(
    serverReady ? "ready" : "unavailable",
  );
  const [pendingEventName, setPendingEventName] = useState<AnalyticsSandboxEventName | null>(null);
  const [isPending, startTransition] = useTransition();
  const eventSelection = useAdminSelection(SANDBOX_EVENTS.map((event) => event.eventName));

  const latestLog = logs[0] ?? "";
  const statusCopy = transportState === "ready"
    ? "UMAMI SERVER READY"
    : transportState === "failed"
      ? "UMAMI DELIVERY FAILED"
      : "UMAMI CONFIGURATION INCOMPLETE";
  const statusIsActive = transportState === "ready";

  const dispatchEvent = (event: SandboxEvent) => {
    const props = formatProperties(ANALYTICS_SANDBOX_EVENTS[event.eventName].properties);
    setPendingEventName(event.eventName);
    setLogs((current) => [
      `[${formatTimestamp()}] Dispatching event: ${event.eventName} with props ${props}`,
      ...current,
    ]);

    startTransition(async () => {
      try {
        const result = await dispatchAnalyticsSandboxEvent(event.eventName);
        if (!result.ok) {
          setTransportState("failed");
          setLogs((current) => [
            `[${formatTimestamp()}] Failed dispatch: ${event.eventName}. ${result.message}`,
            ...current,
          ]);
          toast.error(`Failed to dispatch ${event.eventName}`);
          return;
        }

        setTransportState("ready");
        setLogs((current) => [
          `[${formatTimestamp()}] Sent ${event.eventName} to Umami. Check the Real-Time panel.`,
          ...current,
        ]);
        toast.success(`Sent ${event.eventName} to Umami`);
      } catch (error) {
        setTransportState("failed");
        const message = error instanceof Error ? error.message : "Unknown tracking error";
        setLogs((current) => [
          `[${formatTimestamp()}] Failed dispatch: ${event.eventName}. ${message}`,
          ...current,
        ]);
        toast.error(`Failed to dispatch ${event.eventName}`);
      } finally {
        setPendingEventName(null);
      }
    });
  };

  const dispatchSelectedEvents = () => {
    const selected = SANDBOX_EVENTS.filter((event) => eventSelection.selectedIds.includes(event.eventName));
    if (selected.length === 0) return;

    startTransition(async () => {
      try {
        setLogs((current) => [
          `[${formatTimestamp()}] Dispatching ${selected.length} selected sandbox event${selected.length === 1 ? "" : "s"}.`,
          ...current,
        ]);
        const settled = await Promise.allSettled(
          selected.map(async (event) => ({
            event,
            result: await dispatchAnalyticsSandboxEvent(event.eventName),
          })),
        );
        const failed = settled.filter((item) =>
          item.status === "rejected" || (item.status === "fulfilled" && !item.value.result.ok),
        );
        const successful = settled.length - failed.length;
        setTransportState(failed.length > 0 ? "failed" : "ready");
        setLogs((current) => [
          `[${formatTimestamp()}] Bulk dispatch complete: ${successful} sent, ${failed.length} failed.`,
          ...current,
        ]);
        if (successful > 0) toast.success(`Sent ${successful} sandbox event${successful === 1 ? "" : "s"} to Umami`);
        if (failed.length > 0) toast.error(`${failed.length} sandbox event${failed.length === 1 ? "" : "s"} failed`);
      } catch (error) {
        console.error("Bulk analytics sandbox dispatch error:", error);
        setTransportState("failed");
        toast.error("Could not dispatch the selected sandbox events. Please try again.");
      } finally {
        eventSelection.clear();
      }
    });
  };

  const commandSummary = useMemo(
    () => SANDBOX_EVENTS.map((event) => event.eventName).join(" · "),
    [],
  );

  return (
    <div className="space-y-6 text-gray-200">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#1E293B] bg-[#0B1121]/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-300">
            <BarChart3 className="h-4 w-4" />
            Analytics Sandbox
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-[-0.02em] text-gray-100 sm:text-3xl">
            Umami Event Simulator
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-400">
            Test product analytics broadcasts from the Admin Console without creating proposals, users, payments, or other business records.
          </p>
        </div>

        <div
          className={cn(
            "inline-flex w-fit items-center gap-2 rounded-full border px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em]",
            statusIsActive
              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
              : "border-rose-400/30 bg-rose-400/10 text-rose-300",
          )}
        >
          {statusIsActive ? (
            <GsapPulse className="items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              {statusCopy}
            </GsapPulse>
          ) : (
            <>
              <XCircle className="h-4 w-4" />
              {statusCopy}
            </>
          )}
        </div>
      </div>

      <section className="grid gap-5 xl:grid-cols-[1fr_0.78fr]">
        <article className="overflow-hidden rounded-xl border border-[#1E293B] bg-[#0B1121]">
          <div className="flex flex-col gap-4 border-b border-[#1E293B] px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#1E293B] bg-[#0B1121]/60 text-blue-300">
                <Activity className="h-5 w-5" />
              </div>
              <h2 className="mt-4 text-base font-semibold tracking-[-0.01em] text-gray-100">
                Mock funnel actions
              </h2>
              <p className="mt-1.5 max-w-2xl text-xs leading-5 text-gray-400">
                Each button sends a predefined test event through the authenticated server transport and current analytics flags.
              </p>
            </div>
            <div className="rounded-lg border border-[#1E293B] bg-[#0F172A] px-3 py-2 text-xs leading-5 text-gray-400">
              <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500">
                Events
              </span>
              {commandSummary}
            </div>
          </div>

          <div className="divide-y divide-[#1E293B]">
            <AdminBulkActionBar
              selectedCount={eventSelection.selectedCount}
              visibleCount={SANDBOX_EVENTS.length}
              allVisibleSelected={eventSelection.allVisibleSelected}
              someVisibleSelected={eventSelection.someVisibleSelected}
              onToggleVisible={eventSelection.toggleVisible}
              onClear={eventSelection.clear}
              isPending={isPending}
              actions={[
                { id: "run", label: "Run selected", icon: MousePointer2, tone: "success", onClick: dispatchSelectedEvents },
              ]}
            />
            {SANDBOX_EVENTS.map((event) => {
              const Icon = event.icon;
              const isThisPending = isPending && pendingEventName === event.eventName;
              return (
                <div
                  key={event.eventName}
                  className="flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-[#0B1121] sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <AdminSelectionCheckbox
                      checked={eventSelection.isSelected(event.eventName)}
                      onChange={() => eventSelection.toggle(event.eventName)}
                      label={`Select ${event.title}`}
                      className="mt-1 shrink-0"
                    />
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#1E293B] bg-[#0F172A] text-blue-300">
                      {isThisPending ? <GsapSpinner className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-200">{event.title}</p>
                      <p className="mt-1 text-xs leading-5 text-gray-400">
                        {event.description}
                      </p>
                      <p className="mt-2 break-all font-mono text-[11px] text-gray-500">
                        {event.eventName}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => dispatchEvent(event)}
                    disabled={isPending}
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-blue-400/20 bg-blue-500/10 px-3.5 py-2 text-xs font-semibold text-blue-300 transition-colors hover:border-blue-300/40 hover:bg-blue-500/20 disabled:cursor-wait disabled:opacity-60"
                  >
                    {isThisPending ? <GsapSpinner className="h-3.5 w-3.5" /> : <MousePointer2 className="h-3.5 w-3.5" />}
                    Run Simulation
                  </button>
                </div>
              );
            })}
          </div>

          <div className="border-t border-[#1E293B] bg-amber-400/[0.08] px-5 py-3 text-xs leading-5 text-amber-200">
            All events fired on this screen will broadcast live metrics into your Umami Dashboard instance. Check your Real-Time panel to confirm incoming data flow.
          </div>
        </article>

        <article className="rounded-xl border border-[#1E293B] bg-[#0B1121] p-5 text-emerald-200">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div className="flex items-center gap-2">
              <Terminal className="h-5 w-5 text-emerald-300" />
              <h2 className="font-mono text-sm font-bold text-emerald-100">Live Console Output</h2>
            </div>
            <span className="rounded-full border border-white/10 px-2.5 py-1 font-mono text-[10px] text-emerald-300">
              {logs.length} lines
            </span>
          </div>

          <div className="mt-4 rounded-xl border border-[#1E293B] bg-[#151720] p-4">
            <p className="mb-3 flex items-center gap-2 font-mono text-[11px] text-emerald-300">
              <MousePointer2 className="h-3.5 w-3.5" />
              Latest: {latestLog}
            </p>
            <div className="max-h-[420px] min-h-[300px] space-y-2 overflow-y-auto pr-1 font-mono text-xs leading-6 text-emerald-200">
              {logs.map((line, index) => (
                <p key={`${line}-${index}`} className={index === 0 ? "text-emerald-100" : "text-emerald-300/76"}>
                  {line}
                </p>
              ))}
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <StatusTile
              label="Dispatch state"
              value={statusCopy}
              active={statusIsActive}
            />
            <StatusTile
              label="Database safety"
              value="No business writes"
              active
              icon="shield"
            />
          </div>
        </article>
      </section>
    </div>
  );
}

function StatusTile({
  label,
  value,
  active,
  icon,
}: {
  label: string;
  value: string;
  active: boolean;
  icon?: "shield";
}) {
  const Icon = icon === "shield" ? ShieldCheck : active ? CheckCircle2 : XCircle;

  return (
    <div className="rounded-xl border border-[#1E293B] bg-[#0F172A] p-3">
      <div className="flex items-center gap-2">
        <Icon className={cn("h-4 w-4", active ? "text-emerald-300" : "text-rose-300")} />
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-300/80">
          {label}
        </p>
      </div>
      <p className="mt-2 font-mono text-xs font-bold text-emerald-100">{value}</p>
    </div>
  );
}
