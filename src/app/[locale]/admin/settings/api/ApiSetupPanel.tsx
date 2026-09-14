"use client";

import { FormEvent, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  KeyRound,
  Link2,
  Lock,
  Save,
  Server,
  ShieldCheck,
  Webhook,
} from "@/components/ui/icons";

import { saveSystemSettings } from "@/app/actions/systemSettings";
import { cn } from "@/lib/utils";

export type ApiSetupValues = {
  siteUrl: string;
  erpnextUrl: string;
  erpnextApiKey: string;
  erpnextApiSecret: string;
  erpnextWebhookSecret: string;
  erpnextWebhookEnabled: string;
  discordWebhookUrl: string;
  lineChannelAccessToken: string;
  lineChannelSecret: string;
  lineLiffId: string;
  lineLoginUrl: string;
  lineMemberRichMenuId: string;
  lineLifecycleApiSecret: string;
  cronSecret: string;
  umamiUrl: string;
  umamiWebsiteId: string;
};

export type ApiSetupEnvStatus = Partial<Record<keyof ApiSetupValues, boolean>>;

type ApiSetupPanelProps = {
  initialValues: ApiSetupValues;
  envStatus: ApiSetupEnvStatus;
};

type FieldDefinition = {
  key: keyof ApiSetupValues;
  label: string;
  placeholder: string;
  type?: "text" | "url" | "password";
  help?: string;
};

type FieldGroup = {
  title: string;
  description: string;
  icon: typeof Server;
  fields: FieldDefinition[];
};

const SETTING_KEYS: Record<keyof ApiSetupValues, string> = {
  siteUrl: "site_url",
  erpnextUrl: "erpnext_site_endpoint",
  erpnextApiKey: "erpnext_api_key",
  erpnextApiSecret: "erpnext_api_secret",
  erpnextWebhookSecret: "erpnext_webhook_secret",
  erpnextWebhookEnabled: "erpnext_webhook_enabled",
  discordWebhookUrl: "discord_webhook_url",
  lineChannelAccessToken: "line_channel_access_token",
  lineChannelSecret: "line_channel_secret",
  lineLiffId: "line_liff_id",
  lineLoginUrl: "line_login_url",
  lineMemberRichMenuId: "line_member_rich_menu_id",
  lineLifecycleApiSecret: "line_lifecycle_api_secret",
  cronSecret: "cron_secret",
  umamiUrl: "umami_url",
  umamiWebsiteId: "umami_website_id",
};

const FIELD_GROUPS: FieldGroup[] = [
  {
    title: "Core URLs",
    description: "Public application URL and shared scheduler authentication.",
    icon: Link2,
    fields: [
      {
        key: "siteUrl",
        label: "Public site URL",
        placeholder: "https://solardream.onrender.com",
        type: "url",
        help: "Used when external systems need callback or customer-facing links.",
      },
      {
        key: "cronSecret",
        label: "Cron secret",
        placeholder: "Paste scheduler bearer token",
        type: "password",
      },
    ],
  },
  {
    title: "ERPNext",
    description: "Quotation, catalog, customer, and payment document integration.",
    icon: Server,
    fields: [
      {
        key: "erpnextUrl",
        label: "ERPNext site URL",
        placeholder: "https://solardream.s.frappe.cloud",
        type: "url",
      },
      {
        key: "erpnextApiKey",
        label: "ERPNext API key",
        placeholder: "Paste ERPNext API key",
        type: "password",
      },
      {
        key: "erpnextApiSecret",
        label: "ERPNext API secret",
        placeholder: "Paste ERPNext API secret",
        type: "password",
      },
      {
        key: "erpnextWebhookSecret",
        label: "ERPNext webhook secret",
        placeholder: "Shared secret for inbound finalized quotations",
        type: "password",
      },
      {
        key: "erpnextWebhookEnabled",
        label: "ERPNext webhook enabled",
        placeholder: "true",
        help: "Use true or false.",
      },
    ],
  },
  {
    title: "LINE",
    description: "Messaging API, LIFF login, rich menu, and account lifecycle callbacks.",
    icon: Webhook,
    fields: [
      {
        key: "lineChannelAccessToken",
        label: "Channel access token",
        placeholder: "Paste LINE channel access token",
        type: "password",
      },
      {
        key: "lineChannelSecret",
        label: "Channel secret",
        placeholder: "Paste LINE channel secret",
        type: "password",
      },
      {
        key: "lineLiffId",
        label: "LIFF ID",
        placeholder: "2000000000-AbCdEfGh",
      },
      {
        key: "lineLoginUrl",
        label: "LINE login URL",
        placeholder: "https://liff.line.me/...",
        type: "url",
      },
      {
        key: "lineMemberRichMenuId",
        label: "Member rich menu ID",
        placeholder: "richmenu-...",
      },
      {
        key: "lineLifecycleApiSecret",
        label: "Lifecycle API secret",
        placeholder: "Shared secret for account link and unlink APIs",
        type: "password",
      },
    ],
  },
  {
    title: "Umami",
    description: "Self-hosted privacy-focused analytics script configuration.",
    icon: ShieldCheck,
    fields: [
      {
        key: "umamiUrl",
        label: "Umami instance URL",
        placeholder: "https://umami.solar-dream.org",
        type: "url",
        help: "Changing this URL updates the admin analytics link and the consent-gated tracking script host after save.",
      },
      {
        key: "umamiWebsiteId",
        label: "Umami website ID",
        placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      },
    ],
  },
];

const CALLBACKS = [
  {
    label: "ERPNext finalized quotation sync",
    path: "/api/quotations/erpnext-sync",
    method: "POST",
    note: "Requires x-solardream-webhook-secret.",
  },
  {
    label: "LINE Messaging webhook",
    path: "/api/webhook",
    method: "POST",
    note: "Requires x-line-signature.",
  },
  {
    label: "ERPNext catalog scheduler",
    path: "/api/catalog/sync",
    method: "POST",
    note: "Requires Authorization bearer token.",
  },
  {
    label: "Rich menu scheduler",
    path: "/api/cron/richmenu-scheduler",
    method: "GET",
    note: "Requires cron secret.",
  },
];

function countReady(values: ApiSetupValues, envStatus: ApiSetupEnvStatus, keys: (keyof ApiSetupValues)[]) {
  return keys.filter((key) => values[key].trim() || envStatus[key]).length;
}

function maskSecret(value: string) {
  if (!value) return "";
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

export default function ApiSetupPanel({ initialValues, envStatus }: ApiSetupPanelProps) {
  const router = useRouter();
  const [values, setValues] = useState<ApiSetupValues>(initialValues);
  const [revealed, setRevealed] = useState<Partial<Record<keyof ApiSetupValues, boolean>>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const readiness = useMemo(() => {
    const total = Object.keys(SETTING_KEYS).length;
    const ready = countReady(values, envStatus, Object.keys(SETTING_KEYS) as (keyof ApiSetupValues)[]);
    return { ready, total };
  }, [envStatus, values]);

  const updateValue = (key: keyof ApiSetupValues, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  const copyText = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    window.setTimeout(() => setCopiedId(null), 1800);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    startTransition(async () => {
      try {
        const entries = (Object.keys(SETTING_KEYS) as (keyof ApiSetupValues)[]).map((key) => ({
          key: SETTING_KEYS[key],
          value: values[key].trim(),
        }));

        const result = await saveSystemSettings(entries);
        if (result.success) {
          toast.success("API setup saved.");
          router.refresh();
        } else {
          toast.error(result.error || "Failed to save API setup.");
        }
      } catch (error) {
        console.error("API setup save error:", error);
        toast.error("Failed to save API setup. Please try again.");
      }
    });
  };

  const baseUrl = values.siteUrl.trim().replace(/\/$/, "") || "https://solardream.onrender.com";
  const umamiUrl = values.umamiUrl.trim().replace(/\/$/, "") || "https://umami.solar-dream.org";

  return (
    <form onSubmit={handleSubmit} className="space-y-6 text-[#F8FAFC]">
      <div className="rounded-xl border border-slate-800 bg-[#0F172A] p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-800 bg-[#B7D1EA]/10 text-[#B7D1EA]">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[#F8FAFC]">API Setup</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-[#94A3B8]">
                Store endpoints, API tokens, webhook secrets, and callback references in one operator workspace.
              </p>
            </div>
          </div>
          <div className="w-fit rounded-lg border border-slate-800 bg-[#0B1121] px-3 py-2 text-xs font-semibold text-slate-300">
            {readiness.ready}/{readiness.total} configured
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {FIELD_GROUPS.map((group) => {
          const Icon = group.icon;
          const ready = countReady(values, envStatus, group.fields.map((field) => field.key));

          return (
            <section key={group.title} className="overflow-hidden rounded-xl border border-slate-800 bg-[#0F172A]">
              <div className="flex flex-col gap-3 border-b border-slate-800 bg-[#0B1121] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-800 bg-[#B7D1EA]/10 text-[#B7D1EA]">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-[#F8FAFC]">{group.title}</h3>
                    <p className="mt-1 text-xs leading-5 text-[#94A3B8]">{group.description}</p>
                  </div>
                </div>
                <span className="w-fit shrink-0 rounded-md border border-slate-800 bg-[#0F172A] px-2.5 py-1 text-xs font-semibold text-[#94A3B8]">
                  {ready}/{group.fields.length} configured
                </span>
              </div>

              <div className="divide-y divide-slate-800">
                {group.fields.map((field) => {
                  const storedValue = values[field.key];
                  const isSecret = field.type === "password";
                  const isRevealed = revealed[field.key];
                  const configuredByEnv = Boolean(envStatus[field.key]);
                  const displayedValue = isSecret && storedValue && !isRevealed ? maskSecret(storedValue) : storedValue;

                  return (
                    <div
                      key={field.key}
                      className="flex flex-col items-start justify-between gap-3 px-5 py-4 md:flex-row md:items-center"
                    >
                      <div className="min-w-0 md:max-w-[42%]">
                        <label className="text-sm font-medium text-slate-200" htmlFor={field.key}>
                          {field.label}
                        </label>
                        <p className="mt-1 text-xs leading-5 text-[#94A3B8]">
                          {field.help || field.placeholder}
                        </p>
                      </div>

                      <div className="flex w-full flex-col gap-2 md:w-auto md:items-end">
                        <div className="flex flex-wrap items-center gap-2 md:justify-end">
                          {configuredByEnv ? (
                            <span className="inline-flex items-center gap-1 rounded border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400">
                              <Check className="h-3 w-3" />
                              Env ready
                            </span>
                          ) : null}
                          {storedValue.trim() ? (
                            <span className="rounded border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-400">
                              Saved
                            </span>
                          ) : null}
                        </div>
                        <div className="relative w-full md:w-96">
                          <input
                            id={field.key}
                            type={isSecret && !isRevealed ? "password" : field.type || "text"}
                            value={displayedValue}
                            onFocus={() => {
                              if (isSecret && storedValue && !isRevealed) {
                                setRevealed((current) => ({ ...current, [field.key]: true }));
                              }
                            }}
                            onChange={(event) => updateValue(field.key, event.target.value)}
                            placeholder={field.placeholder}
                            className={cn(
                              "w-full rounded-md border border-slate-800 bg-[#0B1121] px-3 py-2 text-sm font-medium text-[#F8FAFC] outline-none transition placeholder:text-slate-500 focus:ring-2 focus:ring-[#B7D1EA] focus:border-transparent",
                              isSecret ? "pr-10" : "",
                            )}
                          />
                          {isSecret ? (
                            <button
                              type="button"
                              onClick={() =>
                                setRevealed((current) => ({ ...current, [field.key]: !current[field.key] }))
                              }
                              className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-[#94A3B8] transition hover:bg-slate-800 hover:text-[#F8FAFC]"
                              aria-label={isRevealed ? `Hide ${field.label}` : `Reveal ${field.label}`}
                            >
                              {isRevealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-800 bg-[#0F172A]">
        <div className="flex flex-col gap-3 border-b border-slate-800 bg-[#0B1121] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-800 bg-[#B7D1EA]/10 text-[#B7D1EA]">
              <Lock className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#F8FAFC]">Callback URLs</h3>
              <p className="mt-1 text-xs leading-5 text-[#94A3B8]">
                Copy these into ERPNext, LINE, cron runners, or automation tools after saving the public site URL.
              </p>
            </div>
          </div>
          <span className="rounded-md border border-slate-800 bg-[#0F172A] px-2.5 py-1 text-xs font-semibold text-[#94A3B8]">
            {CALLBACKS.length} routes
          </span>
        </div>

        <div className="divide-y divide-slate-800">
          {CALLBACKS.map((callback) => {
            const url = `${baseUrl}${callback.path}`;
            return (
              <div key={callback.path} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-slate-200">{callback.label}</p>
                    <span className="rounded border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-blue-400">
                      {callback.method}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[#94A3B8]">{callback.note}</p>
                </div>
                <div className="flex min-w-0 items-center gap-2 rounded-md border border-slate-800 bg-[#0B1121] px-3 py-2 lg:w-[560px]">
                  <code className="min-w-0 flex-1 break-all font-mono text-xs text-[#94A3B8]">{url}</code>
                  <button
                    type="button"
                    onClick={() => copyText(url, callback.path)}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#B7D1EA] transition hover:bg-[#B7D1EA]/10"
                    aria-label={`Copy ${callback.label} URL`}
                  >
                    {copiedId === callback.path ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-800 bg-[#0F172A]">
        <div className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-800 bg-[#B7D1EA]/10 text-[#B7D1EA]">
              <ExternalLink className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-[#F8FAFC]">Umami support link</h3>
              <p className="mt-1 text-xs leading-5 text-[#94A3B8]">
                Save the new URL above when the self-hosted analytics backend changes domain, then verify access here.
              </p>
              <p className="mt-3 break-all rounded-md border border-slate-800 bg-[#0B1121] px-3 py-2 font-mono text-xs text-[#94A3B8]">
                {umamiUrl}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => copyText(umamiUrl, "umami-url")}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-800 bg-[#0B1121] px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-slate-800 hover:text-[#F8FAFC]"
            >
              {copiedId === "umami-url" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copiedId === "umami-url" ? "Copied" : "Copy URL"}
            </button>
            <a
              href={umamiUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#B7D1EA]/30 bg-[#B7D1EA]/10 px-3 py-2 text-xs font-semibold text-[#B7D1EA] transition hover:bg-[#B7D1EA]/20"
            >
              Open Umami
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </div>
      </section>

      <div className="sticky bottom-4 z-10 flex justify-end">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#B7D1EA] hover:bg-[#99BFE3] px-5 py-2 text-sm font-black text-[#0F172A] transition cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {isPending ? "Saving setup..." : "Save API setup"}
        </button>
      </div>
    </form>
  );
}
