"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { Activity, BarChart3, CheckCircle2, FlaskConical, ShieldCheck } from "@/components/ui/icons";
import { toast } from "sonner";
import { updateAnalyticsFlag } from "@/app/actions/systemSettings";
import type { AnalyticsConfig, AnalyticsFlagKey } from "@/lib/analyticsConfig";
import { cn } from "@/lib/utils";
import { AdminBulkActionBar } from "@/components/admin/AdminBulkActionBar";
import { AdminSelectionCheckbox } from "@/components/admin/AdminSelectionCheckbox";
import { useAdminSelection } from "@/hooks/useAdminSelection";

type FlagDefinition = {
  key: AnalyticsFlagKey;
  title: string;
  description: string;
};

const FLAGS: FlagDefinition[] = [
  {
    key: "analytics_enabled",
    title: "Analytics enabled",
    description: "Master switch for loading Umami and allowing any product analytics events.",
  },
  {
    key: "track_acquisition_engagement",
    title: "Acquisition & engagement",
    description: "Track source capture, navigation, landing-page CTAs, forms, and public journey entry points.",
  },
  {
    key: "track_user_registration",
    title: "User registration",
    description: "Collect sign-up events and authentication funnel metadata.",
  },
  {
    key: "track_wizard_engagement",
    title: "Wizard engagement",
    description: "Collect calculator interactions, lead form starts, and quotation request metadata.",
  },
  {
    key: "track_catalog_commerce",
    title: "Catalog & checkout",
    description: "Collect product, cart, quote checkout, and payment interaction metadata.",
  },
  {
    key: "track_proposal_lifecycle",
    title: "Proposal lifecycle",
    description: "Collect proposal portal views and signed-contract conversion events.",
  },
  {
    key: "track_service_commerce",
    title: "Service commerce",
    description: "Collect service selection, quote, booking, and service payment milestones.",
  },
  {
    key: "track_support_engagement",
    title: "Support engagement",
    description: "Collect support entry points and service/support request milestones.",
  },
];

export default function AnalyticsSettingsClient({
  initialConfig,
}: {
  initialConfig: AnalyticsConfig;
}) {
  const locale = useLocale();
  const [config, setConfig] = useState(initialConfig);
  const [pendingKey, setPendingKey] = useState<AnalyticsFlagKey | null>(null);
  const [isPending, startTransition] = useTransition();
  const flagSelection = useAdminSelection(FLAGS.map((flag) => flag.key));

  const scriptUrl = useMemo(
    () => config.umamiUrl ? `${config.umamiUrl.replace(/\/$/, "")}/script.js` : "",
    [config.umamiUrl],
  );
  const isBroadcastReady = config.analytics_enabled && Boolean(config.umamiUrl && config.umamiWebsiteId);

  const handleToggle = (key: AnalyticsFlagKey) => {
    const nextValue = !config[key];
    setConfig((current) => ({ ...current, [key]: nextValue }));
    setPendingKey(key);

    startTransition(async () => {
      try {
        const result = await updateAnalyticsFlag(key, nextValue);
        if (!result.success) {
          setConfig((current) => ({ ...current, [key]: !nextValue }));
          toast.error(result.error || "Failed to update analytics flag.");
          return;
        }

        toast.success("Analytics setting updated.");
      } catch (error) {
        console.error("Analytics flag update error:", error);
        setConfig((current) => ({ ...current, [key]: !nextValue }));
        toast.error("Failed to update analytics flag. Please try again.");
      } finally {
        setPendingKey(null);
      }
    });
  };

  const handleBulkToggle = (nextValue: boolean) => {
    const selectedKeys = flagSelection.selectedIds.filter((key): key is AnalyticsFlagKey =>
      FLAGS.some((flag) => flag.key === key),
    );
    if (selectedKeys.length === 0) return;

    setConfig((current) => {
      const next = { ...current };
      selectedKeys.forEach((key) => {
        next[key] = nextValue;
      });
      return next;
    });

    startTransition(async () => {
      try {
        const settled = await Promise.allSettled(
          selectedKeys.map(async (key) => ({ key, result: await updateAnalyticsFlag(key, nextValue) })),
        );
        const failedKeys = settled.flatMap((item, index) => {
          if (item.status === "fulfilled" && item.value.result.success) return [];
          return [selectedKeys[index]];
        });
        if (failedKeys.length > 0) {
          setConfig((current) => {
            const next = { ...current };
            failedKeys.forEach((key) => {
              next[key] = !nextValue;
            });
            return next;
          });
          toast.error(`${failedKeys.length} analytics setting${failedKeys.length === 1 ? "" : "s"} could not be updated.`);
        }
        const updatedCount = selectedKeys.length - failedKeys.length;
        if (updatedCount > 0) {
          toast.success(`${updatedCount} analytics setting${updatedCount === 1 ? "" : "s"} updated.`);
        }
      } catch (error) {
        console.error("Bulk analytics flag update error:", error);
        setConfig((current) => {
          const next = { ...current };
          selectedKeys.forEach((key) => {
            next[key] = !nextValue;
          });
          return next;
        });
        toast.error("Could not update the selected analytics settings. Please try again.");
      } finally {
        flagSelection.clear();
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-[#B7D1EA]/15 border border-[#B7D1EA]/30 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-[#B7D1EA]">
            <BarChart3 className="h-4 w-4" />
            Product Analytics
          </div>
          <h1 className="mt-3 text-3xl font-black tracking-[-0.03em] text-[#F8FAFC]">
            Umami Analytics Controls
          </h1>
          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#94A3B8]">
            Toggle product analytics by journey without redeploying. New page loads and event cycles read these flags from the database.
          </p>
        </div>
        <Link
          href={`/${locale}/admin/settings/analytics/sandbox`}
          className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-800 bg-[#0F172A] px-4 py-2.5 text-xs font-black text-[#F8FAFC] transition-colors hover:bg-slate-800"
        >
          <FlaskConical className="h-4 w-4 text-[#B7D1EA]" />
          Open Sandbox
        </Link>
      </div>

      <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-2xl border border-slate-800 bg-[#0F172A] p-5 shadow-none">
          <div className="flex items-start gap-4">
            <div className={cn(
              "flex h-12 w-12 items-center justify-center rounded-2xl",
              isBroadcastReady ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400",
            )}>
              {isBroadcastReady ? <CheckCircle2 className="h-6 w-6" /> : <Activity className="h-6 w-6" />}
            </div>
            <div>
              <h2 className="text-lg font-black text-[#F8FAFC]">
                {isBroadcastReady ? "Broadcast ready" : "Broadcast paused"}
              </h2>
              <p className="mt-1 text-sm font-semibold leading-6 text-[#94A3B8]">
                {isBroadcastReady
                  ? "The master flag is enabled and Umami has a script URL plus website ID."
                  : "Tracking is disabled or Umami URL/website ID is missing."}
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-3 rounded-2xl bg-[#0B1121] border border-slate-800 p-4">
            <StatusRow label="Script URL" value={scriptUrl || "Not configured"} />
            <StatusRow label="Website ID" value={config.umamiWebsiteId || "Not configured"} />
          </div>
        </div>

        <div className="grid gap-3">
          <AdminBulkActionBar
            selectedCount={flagSelection.selectedCount}
            visibleCount={FLAGS.length}
            allVisibleSelected={flagSelection.allVisibleSelected}
            someVisibleSelected={flagSelection.someVisibleSelected}
            onToggleVisible={flagSelection.toggleVisible}
            onClear={flagSelection.clear}
            isPending={isPending}
            actions={[
              { id: "enable", label: "Enable selected", icon: CheckCircle2, tone: "success", onClick: () => handleBulkToggle(true) },
              { id: "disable", label: "Disable selected", icon: ShieldCheck, tone: "warning", onClick: () => handleBulkToggle(false) },
            ]}
          />
          {FLAGS.map((flag) => (
            <div
              key={flag.key}
              className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-[#0F172A] p-4 shadow-none transition hover:border-[#B7D1EA]"
            >
              <div onClick={(event) => event.stopPropagation()}>
                <AdminSelectionCheckbox
                  checked={flagSelection.isSelected(flag.key)}
                  onChange={() => flagSelection.toggle(flag.key)}
                  label={`Select ${flag.title}`}
                  disabled={isPending}
                />
              </div>
              <button
                type="button"
                onClick={() => handleToggle(flag.key)}
                disabled={isPending && pendingKey === flag.key}
                className="group flex min-w-0 flex-1 items-center justify-between gap-4 text-left"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-[#B7D1EA]/15 text-[#B7D1EA]">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-[#F8FAFC]">{flag.title}</p>
                    <p className="mt-1 text-xs font-semibold leading-5 text-[#94A3B8]">{flag.description}</p>
                  </div>
                </div>
                <span
                  className={cn(
                    "relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200",
                    config[flag.key] ? "bg-[#B7D1EA]" : "bg-slate-800",
                  )}
                  aria-hidden="true"
                >
                  <span
                    className={cn(
                      "absolute top-1 h-5 w-5 rounded-full bg-[#0F172A] shadow-none transition-all duration-200",
                      config[flag.key] ? "left-6" : "left-1",
                    )}
                  />
                </span>
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-xs font-black text-[#94A3B8]">{label}</span>
      <span className="max-w-[260px] break-all text-right text-xs font-bold text-[#F8FAFC]">{value}</span>
    </div>
  );
}
