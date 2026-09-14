"use client";
import GlassSwitch from "@/components/ui/GlassSwitch";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { BellRing, LockKeyhole } from "@/components/ui/icons";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { readJsonResponse } from "@/lib/readJsonResponse";
import type {
  CommunicationPreferenceKey,
  CommunicationPreferences as Preferences,
  CommunicationPreferencesResponse as PreferencesResponse,
} from "@/types/profile";

function isPreferences(value: unknown): value is Preferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const preferences = value as Partial<Preferences>;
  return typeof preferences.news === "boolean"
    && typeof preferences.promotions === "boolean"
    && preferences.systemUpdates === true
    && typeof preferences.revision === "number";
}

function PreferenceSwitch({
  checked,
  disabled,
  busy = false,
  label,
  onToggle,
}: {
  checked: boolean;
  disabled: boolean;
  busy?: boolean;
  label: string;
  onToggle?: () => void;
}) {
  return (
    <GlassSwitch
      checked={checked}
      disabled={disabled || busy}
      label={label}
      onChange={() => onToggle?.()}
    />
  );
}

export default function CommunicationPreferences() {
  const t = useTranslations("ProfileLayout.communication");
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<CommunicationPreferenceKey | null>(null);
  const requestSequence = useRef(0);
  const patchController = useRef<AbortController | null>(null);
  const activeToastId = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const loadPreferences = async () => {
      try {
        const response = await fetch("/api/users/preferences", {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await readJsonResponse<PreferencesResponse>(response);
        if (!response.ok || !payload?.success || !isPreferences(payload.preferences)) {
          throw new Error(payload?.error || t("loadError"));
        }
        setPreferences(payload.preferences);
      } catch (error) {
        if (!controller.signal.aborted) {
          toast.error(error instanceof Error ? error.message : t("loadError"));
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void loadPreferences();
    return () => controller.abort();
  }, [t]);

  useEffect(() => () => {
    requestSequence.current += 1;
    patchController.current?.abort();
    if (activeToastId.current) toast.dismiss(activeToastId.current);
  }, []);

  const updatePreference = async (key: CommunicationPreferenceKey) => {
    if (!preferences || busyKey || patchController.current) return;

    const previous = preferences;
    const optimistic = { ...previous, [key]: !previous[key] };
    const sequence = ++requestSequence.current;
    const controller = new AbortController();
    patchController.current = controller;
    setPreferences(optimistic);
    setBusyKey(key);
    const toastId = `communication-preference-${key}`;
    activeToastId.current = toastId;
    toast.loading(t("saving"), { id: toastId });

    try {
      const response = await fetch("/api/users/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          news: optimistic.news,
          promotions: optimistic.promotions,
        }),
        signal: controller.signal,
      });
      const payload = await readJsonResponse<PreferencesResponse>(response);
      if (!response.ok || !payload?.success || !isPreferences(payload.preferences)) {
        throw new Error(payload?.error || t("saveError"));
      }
      if (requestSequence.current !== sequence) return;
      setPreferences(payload.preferences);
      toast.success(t("saved"), { id: toastId });
    } catch (error) {
      if (controller.signal.aborted || requestSequence.current !== sequence) return;
      setPreferences(previous);
      toast.error(error instanceof Error ? error.message : t("saveError"), { id: toastId });
    } finally {
      if (requestSequence.current === sequence) {
        patchController.current = null;
        activeToastId.current = null;
        setBusyKey(null);
      }
    }
  };

  return (
    <section
      className="mt-10 border-t border-border pt-8"
      aria-labelledby="communication-preferences-title"
      aria-busy={loading || undefined}
    >
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-secondary text-foreground">
          <BellRing className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 id="communication-preferences-title" className="text-lg font-bold tracking-tight text-foreground">
            {t("title")}
          </h2>
          <p className="mt-1 max-w-2xl text-pretty text-sm leading-6 text-muted-foreground">
            {t("description")}
          </p>
        </div>
      </div>

      <div className="mt-5 divide-y divide-border border-y border-border">
        <PreferenceRow
          title={t("systemUpdates.title")}
          description={t("systemUpdates.description")}
          suffix={<LockKeyhole className="h-4 w-4 text-slate-500" aria-hidden="true" />}
          switchControl={<PreferenceSwitch checked disabled label={t("systemUpdates.title")} />}
        />
        <PreferenceRow
          title={t("news.title")}
          description={t("news.description")}
          switchControl={(
            <PreferenceSwitch
              checked={preferences?.news ?? false}
              disabled={loading || busyKey !== null || !preferences}
              busy={busyKey === "news"}
              label={t("news.title")}
              onToggle={() => void updatePreference("news")}
            />
          )}
        />
        <PreferenceRow
          title={t("promotions.title")}
          description={t("promotions.description")}
          switchControl={(
            <PreferenceSwitch
              checked={preferences?.promotions ?? false}
              disabled={loading || busyKey !== null || !preferences}
              busy={busyKey === "promotions"}
              label={t("promotions.title")}
              onToggle={() => void updatePreference("promotions")}
            />
          )}
        />
      </div>
    </section>
  );
}

function PreferenceRow({
  title,
  description,
  suffix,
  switchControl,
}: {
  title: string;
  description: string;
  suffix?: ReactNode;
  switchControl: ReactNode;
}) {
  return (
    <div className="flex min-h-20 items-center justify-between gap-4 py-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {suffix}
        </div>
        <p className="mt-1 max-w-xl text-sm leading-5 text-muted-foreground">{description}</p>
      </div>
      {switchControl}
    </div>
  );
}
