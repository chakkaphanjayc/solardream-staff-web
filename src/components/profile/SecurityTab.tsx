"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { PasskeyListItem, UserIdentity } from "@supabase/auth-js";
import { toast } from "sonner";

import { changePassword } from "@/app/actions/profile";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Fingerprint,
  KeyRound,
  Link2,
  Loader2,
  Mail,
  ShieldAlert,
  Trash2,
} from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Skeleton from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getPasskeyErrorMessage, getPasskeyPreflightError } from "@/lib/passkeyFeedback";
import { readJsonResponse } from "@/lib/readJsonResponse";
import { createClient } from "@/utils/supabase/client";

const ACCOUNT_DELETION_CONFIRMATION = "DELETE MY ACCOUNT";

function identityLabel(identity: UserIdentity): string {
  if (identity.provider === "email") return "Email & password";
  return identity.provider.charAt(0).toUpperCase() + identity.provider.slice(1);
}

function LoadingIcon() {
  return <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />;
}

export default function SecurityTab() {
  const t = useTranslations("SecurityTab");
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [identities, setIdentities] = useState<UserIdentity[]>([]);
  const [passkeys, setPasskeys] = useState<PasskeyListItem[]>([]);
  const [connectionsLoading, setConnectionsLoading] = useState(true);
  const [passkeysAvailable, setPasskeysAvailable] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  const loadConnections = useCallback(async () => {
    setConnectionsLoading(true);
    const supabase = createClient();
    const [
      { data: identityData, error: identityError },
      { data: passkeyData, error: passkeyError },
    ] = await Promise.all([
      supabase.auth.getUserIdentities(),
      supabase.auth.passkey.list(),
    ]);

    if (identityError) {
      setError(identityError.message);
    } else {
      setIdentities(identityData.identities);
    }

    if (passkeyError) {
      setPasskeysAvailable(false);
      setPasskeys([]);
    } else {
      setPasskeysAvailable(true);
      setPasskeys(passkeyData);
    }
    setConnectionsLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    void Promise.all([
      supabase.auth.getUserIdentities(),
      supabase.auth.passkey.list(),
    ]).then(([
      { data: identityData, error: identityError },
      { data: passkeyData, error: passkeyError },
    ]) => {
      if (cancelled) return;

      if (identityError) {
        setError(identityError.message);
      } else {
        setIdentities(identityData.identities);
      }

      if (passkeyError) {
        setPasskeysAvailable(false);
        setPasskeys([]);
      } else {
        setPasskeysAvailable(true);
        setPasskeys(passkeyData);
      }
      setConnectionsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleGoogleLink() {
    setActionId("google-link");
    const supabase = createClient();
    const { error: linkError } = await supabase.auth.linkIdentity({
      provider: "google",
      options: { redirectTo: `${window.location.origin}${window.location.pathname}` },
    });
    if (linkError) {
      toast.error(linkError.message);
      setActionId(null);
    }
  }

  async function handleUnlink(identity: UserIdentity) {
    if (identities.length <= 1) {
      toast.error(t("connections.keepOneMethod"));
      return;
    }
    setActionId(identity.id);
    const supabase = createClient();
    const { error: unlinkError } = await supabase.auth.unlinkIdentity(identity);
    if (unlinkError) {
      toast.error(unlinkError.message);
    } else {
      toast.success(t("connections.unlinked"));
      await loadConnections();
    }
    setActionId(null);
  }

  async function handlePasskeyEnrollment() {
    const preflightError = getPasskeyPreflightError({
      insecureContext: t("connections.passkeyInsecureContext"),
      unsupported: t("connections.passkeyUnsupported"),
      disabled: t("connections.passkeySetupRequired"),
      invalidRpId: t("connections.passkeyInvalidRpId"),
      failed: t("connections.passkeyFailed"),
    });
    if (preflightError) {
      toast.error(preflightError);
      return;
    }

    setActionId("passkey-add");
    const supabase = createClient();
    const { error: passkeyError } = await supabase.auth.registerPasskey();
    if (passkeyError) {
      toast.error(getPasskeyErrorMessage(passkeyError, {
        insecureContext: t("connections.passkeyInsecureContext"),
        unsupported: t("connections.passkeyUnsupported"),
        disabled: t("connections.passkeySetupRequired"),
        invalidRpId: t("connections.passkeyInvalidRpId"),
        failed: t("connections.passkeyFailed"),
      }));
    } else {
      toast.success(t("connections.passkeyAdded"));
      await loadConnections();
    }
    setActionId(null);
  }

  async function handlePasskeyDelete(passkeyId: string) {
    setActionId(passkeyId);
    const supabase = createClient();
    const { error: passkeyError } = await supabase.auth.passkey.delete({ passkeyId });
    if (passkeyError) {
      toast.error(passkeyError.message);
    } else {
      toast.success(t("connections.passkeyRemoved"));
      await loadConnections();
    }
    setActionId(null);
  }

  async function handlePasswordChange(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    const result = await changePassword(new FormData(event.currentTarget));
    if (result.error) {
      setError(result.error);
    } else {
      setSuccess(t("passwordSuccess"));
      event.currentTarget.reset();
      await loadConnections();
    }
    setLoading(false);
  }

  async function handleDeleteAccount() {
    if (deleteConfirm !== ACCOUNT_DELETION_CONFIRMATION || deleting) return;
    setDeleting(true);
    setError(null);
    try {
      const response = await fetch("/api/privacy/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: ACCOUNT_DELETION_CONFIRMATION }),
      });
      const payload = await readJsonResponse<{ success?: boolean; error?: string }>(response);
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || t("privacy.deleteError"));
      }
      toast.success(t("privacy.deleteSuccess"));
      router.replace("/");
      router.refresh();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : t("privacy.deleteError");
      setError(message);
      toast.error(message);
      setDeleting(false);
    }
  }

  async function handleDataExport() {
    if (exporting) return;
    setExporting(true);
    try {
      const response = await fetch("/api/privacy/export", { cache: "no-store" });
      if (!response.ok) {
        const payload = await readJsonResponse<{ error?: string }>(response);
        throw new Error(payload?.error || t("privacy.exportError"));
      }
      const blob = await response.blob();
      const fileName = response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1]
        || "solardream-privacy-export.json";
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      toast.success(t("privacy.exportSuccess"));
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : t("privacy.exportError"));
    } finally {
      setExporting(false);
    }
  }

  const hasGoogle = identities.some((identity) => identity.provider === "google");
  const hasEmail = identities.some((identity) => identity.provider === "email");

  return (
    <div className="max-w-4xl">
      <header>
        <p className="text-xs font-black uppercase tracking-[0.14em] text-[#D8A87B]">{t("eyebrow")}</p>
        <h2 className="mt-1.5 text-2xl font-black tracking-tight text-[#000000]">{t("title")}</h2>
        <p className="mt-2 max-w-2xl text-sm font-bold leading-6 text-slate-700">
          {t("description")}
        </p>
      </header>

      {(error || success) && (
        <div
          role={error ? "alert" : "status"}
          aria-live={error ? "assertive" : "polite"}
          className={cn(
            "mt-6 flex items-start gap-3 rounded-[20px] border px-4 py-3 text-sm font-semibold shadow-sm",
            error
              ? "border-rose-200 bg-rose-50 text-rose-900"
              : "border-emerald-200 bg-emerald-50 text-emerald-900",
          )}
        >
          {error ? (
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" aria-hidden="true" />
          )}
          <span>{error || success}</span>
        </div>
      )}

      <section className="mt-8 border-t border-[#F7F6F3] pt-8" aria-labelledby="sign-in-methods-title">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#DCE8F5] text-[#4F7FA8]">
            <Link2 className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h3 id="sign-in-methods-title" className="text-lg font-bold tracking-tight text-[#2E2C27]">
              {t("connections.title")}
            </h3>
            <p className="mt-1 max-w-2xl text-xs font-medium leading-5 text-[#4E4B44]">
              {t("connections.description")}
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {connectionsLoading ? (
            <div role="status" aria-live="polite" className="space-y-3 py-5">
              <span className="sr-only">{t("connections.loading")}</span>
              <Skeleton className="h-14 w-full rounded-[20px] border border-[#F7F6F3]" />
              <Skeleton className="h-14 w-4/5 rounded-[20px] border border-[#F7F6F3]" />
            </div>
          ) : (
            identities.map((identity) => (
              <div key={identity.id} className="flex flex-col gap-4 rounded-[20px] border border-[#F7F6F3] bg-[#E6E3DC] p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-[#2E2C27] shadow-sm">
                    {identity.provider === "email" ? (
                      <Mail className="h-5 w-5" aria-hidden="true" />
                    ) : (
                      <span className="text-base font-bold" aria-hidden="true">G</span>
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[#2E2C27]">{identityLabel(identity)}</p>
                    <p className="mt-0.5 text-xs font-medium text-[#4E4B44]">
                      {identity.provider === "email"
                        ? t("connections.emailDescription")
                        : t("connections.googleDescription")}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={identities.length <= 1 || actionId === identity.id}
                  aria-busy={actionId === identity.id || undefined}
                  onClick={() => void handleUnlink(identity)}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-rose-200 bg-[#F0EEE9] px-4 py-2 text-xs font-bold text-rose-600 shadow-sm transition-all hover:bg-rose-50 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {actionId === identity.id && <LoadingIcon />}
                  {identities.length <= 1 ? t("connections.lastMethod") : t("connections.unlink")}
                </button>
              </div>
            ))
          )}

          {!connectionsLoading && !hasGoogle && (
            <div className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-muted text-base font-bold text-foreground" aria-hidden="true">
                  G
                </span>
                <div>
                  <p className="text-sm font-semibold text-foreground">Google</p>
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">
                    {t("connections.googleAddDescription")}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                disabled={actionId === "google-link"}
                aria-busy={actionId === "google-link" || undefined}
                onClick={() => void handleGoogleLink()}
              >
                {actionId === "google-link" && <LoadingIcon />}
                {t("connections.linkGoogle")}
              </Button>
            </div>
          )}

          {!connectionsLoading && !hasEmail && (
            <div className="py-5">
              <p className="text-sm font-semibold text-foreground">{t("connections.emailAddTitle")}</p>
              <p className="mt-1 max-w-xl text-sm leading-5 text-muted-foreground">
                {t("connections.emailAddDescription")}
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="mt-8 border-t border-border pt-8" aria-labelledby="passkeys-title">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-secondary text-foreground">
              <Fingerprint className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h3 id="passkeys-title" className="text-lg font-bold tracking-tight text-foreground">
                {t("securityPasskeys")}
              </h3>
              <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">{t("passkeysDesc")}</p>
            </div>
          </div>
          <Button
            type="button"
            disabled={connectionsLoading || !passkeysAvailable || actionId === "passkey-add"}
            aria-busy={actionId === "passkey-add" || undefined}
            onClick={() => void handlePasskeyEnrollment()}
            className="shrink-0"
          >
            {actionId === "passkey-add" && <LoadingIcon />}
            {t("enrollPasskey")}
          </Button>
        </div>

        {!passkeysAvailable ? (
          <p role="status" className="mt-5 border-l-2 border-amber-500 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
            {t("connections.passkeySetupRequired")}
          </p>
        ) : passkeys.length > 0 ? (
          <div className="mt-5 divide-y divide-border border-y border-border">
            {passkeys.map((passkey) => (
              <div key={passkey.id} className="flex items-center justify-between gap-4 py-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {passkey.friendly_name || t("connections.unnamedPasskey")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("connections.passkeyAdded", {
                      date: new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(passkey.created_at)),
                    })}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="quiet"
                  disabled={actionId === passkey.id}
                  aria-busy={actionId === passkey.id || undefined}
                  onClick={() => void handlePasskeyDelete(passkey.id)}
                  className="shrink-0 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                >
                  {actionId === passkey.id && <LoadingIcon />}
                  {t("connections.remove")}
                </Button>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section
        className="mt-8 border-t border-border pt-8"
        aria-labelledby={connectionsLoading ? undefined : "password-title"}
      >
        {connectionsLoading ? (
          <div role="status" aria-live="polite" className="space-y-3">
            <span className="sr-only">{t("connections.loading")}</span>
            <Skeleton className="h-6 w-44" />
            <Skeleton className="h-4 w-full max-w-xl" />
            <Skeleton className="h-11 w-full max-w-md" />
          </div>
        ) : (
          <>
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-secondary text-foreground">
                <KeyRound className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h3 id="password-title" className="text-lg font-bold tracking-tight text-foreground">
                  {hasEmail ? t("changePassword") : t("connections.addPassword")}
                </h3>
                <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
                  {hasEmail ? t("connections.passwordDescription") : t("connections.addPasswordDescription")}
                </p>
              </div>
            </div>

            <form onSubmit={handlePasswordChange} className="mt-5 max-w-md space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-account-password">{t("newPassword")}</Label>
                <Input
                  id="new-account-password"
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </div>
              <Button type="submit" disabled={loading} aria-busy={loading || undefined}>
                {loading && <LoadingIcon />}
                {hasEmail ? t("updatePassword") : t("connections.addPassword")}
              </Button>
            </form>
          </>
        )}
      </section>

      <section className="mt-8 border-t border-border pt-8" aria-labelledby="privacy-rights-title">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-secondary text-foreground">
            <ShieldAlert className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h3 id="privacy-rights-title" className="text-lg font-bold tracking-tight text-foreground">
              {t("privacy.title")}
            </h3>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              {t("privacy.description")}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void handleDataExport()}
          disabled={exporting}
          aria-busy={exporting || undefined}
          className="mt-5"
        >
          {exporting ? <LoadingIcon /> : <Download aria-hidden="true" />}
          {exporting ? t("privacy.exporting") : t("privacy.exportAction")}
        </Button>
      </section>

      <section className="mt-8 border-t border-rose-200 pt-8" aria-labelledby="danger-zone-title">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-rose-50 text-rose-700">
            <AlertCircle className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h3 id="danger-zone-title" className="text-lg font-bold tracking-tight text-rose-800">
              {t("dangerZone")}
            </h3>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              {t("privacy.deleteDescription")}
            </p>
          </div>
        </div>

        <div className="mt-5 flex max-w-2xl items-start gap-3 border-l-2 border-rose-300 bg-rose-50 px-4 py-3 text-sm leading-6 text-slate-700">
          <Trash2 className="mt-1 h-4 w-4 shrink-0 text-rose-700" aria-hidden="true" />
          <span>{t("privacy.maskingHelper")}</span>
        </div>

        <div className="mt-5 max-w-md space-y-4">
          <div className="space-y-2">
            <Label htmlFor="delete-account-confirmation" className="leading-5 text-rose-800">
              {t("privacy.confirmationLabel", { phrase: ACCOUNT_DELETION_CONFIRMATION })}
            </Label>
            <Input
              id="delete-account-confirmation"
              type="text"
              value={deleteConfirm}
              onChange={(event) => setDeleteConfirm(event.target.value)}
              placeholder={ACCOUNT_DELETION_CONFIRMATION}
              autoComplete="off"
              spellCheck={false}
              className="border-rose-200 text-rose-800 focus-visible:border-rose-500 focus-visible:ring-rose-500/30"
            />
          </div>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void handleDeleteAccount()}
            disabled={deleting || deleteConfirm !== ACCOUNT_DELETION_CONFIRMATION}
            aria-busy={deleting || undefined}
            className="w-full"
          >
            {deleting && <LoadingIcon />}
            {deleting ? t("privacy.deleting") : t("deletePermanently")}
          </Button>
        </div>
      </section>
    </div>
  );
}
