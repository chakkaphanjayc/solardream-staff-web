"use client";
// GsapSpinner imported for morphing save-button feedback

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  MessageSquare,
  QrCode,
} from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ProgressiveImage from "@/components/ui/progressive-image";
import { disconnectLineAccount, initiateLineLinking, updateProfile } from "@/app/actions/profile";
import { cn } from "@/lib/utils";
import type { GeneralInfoUser } from "@/types/profile";

export type { GeneralInfoUser } from "@/types/profile";

export default function GeneralInfo({ user }: { user: GeneralInfoUser }) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("ProfileGeneralInfo");
  const searchParams = useSearchParams();
  const linkToken = searchParams.get("linkToken");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [lineLoading, setLineLoading] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  async function handleDisconnect() {
    setLineLoading(true);
    try {
      const res = await disconnectLineAccount();
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(t("feedback.lineDisconnected"));
        router.refresh();
      }
    } catch {
      toast.error(t("feedback.lineDisconnectFailed"));
    } finally {
      setLineLoading(false);
      setConfirmDisconnect(false);
    }
  }

  async function handleInitiateLink(token: string) {
    setLineLoading(true);
    try {
      const res = await initiateLineLinking(token, locale);
      if (res.error) {
        toast.error(res.error);
      } else if (res.redirectUrl) {
        toast.success(t("feedback.lineRedirect"));
        window.location.href = res.redirectUrl;
      }
    } catch {
      toast.error(t("feedback.lineLinkFailed"));
    } finally {
      setLineLoading(false);
    }
  }

  async function handleProfileUpdate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    const result = await updateProfile(new FormData(event.currentTarget));
    if (result.error) {
      setError(result.error);
    } else {
      setSuccess(t("feedback.profileUpdated"));
    }
    setLoading(false);
  }

  return (
    <div className="max-w-3xl">
      <header>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">{t("title")}</h2>
        <p className="mt-2 max-w-2xl text-pretty text-sm leading-6 text-muted-foreground">
          {t("description")}
        </p>
      </header>

      <form onSubmit={handleProfileUpdate} className="mt-7 space-y-6">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="profile-full-name">{t("fullName")}</Label>
            <Input
              id="profile-full-name"
              name="name"
              type="text"
              defaultValue={user.name || ""}
              placeholder={t("namePlaceholder")}
              autoComplete="name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-phone-number">{t("phone")}</Label>
            <Input
              id="profile-phone-number"
              name="phoneNumber"
              type="tel"
              defaultValue={user.phoneNumber || ""}
              autoComplete="tel"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="profile-email">{t("emailReadonly")}</Label>
          <Input
            id="profile-email"
            type="email"
            value={user.email || ""}
            readOnly
            aria-readonly="true"
            className="cursor-not-allowed bg-muted text-muted-foreground"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="preferredLanguage">{t("emailLanguage")}</Label>
          <select
            id="preferredLanguage"
            name="preferredLanguage"
            defaultValue={user.preferredLanguage === "en" ? "en" : "th"}
            className="min-h-11 w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm text-foreground outline-none transition-[border-color,box-shadow] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/35"
          >
            <option value="th">ไทย</option>
            <option value="en">English</option>
          </select>
        </div>

        {(error || success) && (
          <div
            role={error ? "alert" : "status"}
            aria-live={error ? "assertive" : "polite"}
            className={cn(
              "flex items-start gap-3 border-l-2 px-4 py-3 text-sm",
              error
                ? "border-rose-600 bg-rose-50 text-rose-800"
                : "border-sky-700 bg-secondary text-foreground",
            )}
          >
            {error ? (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" aria-hidden="true" />
            )}
            <span>{error || success}</span>
          </div>
        )}

        <Button type="submit" disabled={loading} aria-busy={loading || undefined}>
          {loading && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
          {t("saveChanges")}
        </Button>
      </form>

      <section className="mt-10 border-t border-border pt-8" aria-labelledby="line-connection-title">
        <header>
          <h2 id="line-connection-title" className="text-lg font-bold tracking-tight text-foreground">
            {t("lineConnection.title")}
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            {t("lineConnection.description")}
          </p>
        </header>

        {user.lineUserId ? (
          <div className="mt-5 flex flex-col gap-4 border-y border-border py-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
                <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-foreground">{t("accountLinks.linked")}</h3>
                <p className="mt-1 break-all text-xs text-muted-foreground">
                  LINE User ID:{" "}
                  <span className="font-mono text-foreground">
                    {user.lineUserId.slice(0, 8)}...{user.lineUserId.slice(-8)}
                  </span>
                </p>
                {user.lineBotInfo?.displayName && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Linked to: {user.lineBotInfo.displayName} ({user.lineBotInfo.basicId || "@solardream"})
                  </p>
                )}
              </div>
            </div>

            <Button
              type="button"
              variant={confirmDisconnect ? "destructive" : "outline"}
              disabled={lineLoading}
              aria-busy={lineLoading || undefined}
              onClick={() => {
                if (confirmDisconnect) {
                  void handleDisconnect();
                } else {
                  setConfirmDisconnect(true);
                  window.setTimeout(() => setConfirmDisconnect(false), 3000);
                }
              }}
              className={!confirmDisconnect ? "text-rose-700 hover:bg-rose-50 hover:text-rose-800" : undefined}
            >
              {lineLoading && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
              {lineLoading
                ? t("accountLinks.disconnecting")
                : confirmDisconnect
                  ? "Confirm Disconnect"
                  : t("accountLinks.disconnect")}
            </Button>
          </div>
        ) : (
          <div className="mt-5 space-y-5">
            {linkToken ? (
              <div className="flex flex-col gap-4 border-y border-sky-200 bg-secondary/60 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-4">
                <div className="flex items-start gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-sky-100 text-sky-800">
                    <MessageSquare className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Authorize Account Linking</h3>
                    <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
                      We detected a linking request from your LINE App. Bind this web profile to your LINE account now.
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  disabled={lineLoading}
                  aria-busy={lineLoading || undefined}
                  onClick={() => void handleInitiateLink(linkToken)}
                  className="shrink-0"
                >
                  {lineLoading && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                  Link Account Now
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-4 border-y border-border py-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
                    <MessageSquare className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{t("accountLinks.notLinked")}</h3>
                    <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
                      Link your LINE account to check order status and view quotations on the go.
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  aria-expanded={showInstructions}
                  aria-controls="line-linking-instructions"
                  onClick={() => setShowInstructions((visible) => !visible)}
                  className="shrink-0"
                >
                  {showInstructions ? "Hide Instructions" : "Link LINE Account"}
                </Button>
              </div>
            )}

            {showInstructions && !linkToken && (
              <div id="line-linking-instructions" className="border-l-2 border-sky-300 pl-4 sm:pl-6">
                <h3 className="text-sm font-semibold text-foreground">How to link your LINE account</h3>

                <ol className="mt-5 grid grid-cols-1 gap-6 sm:grid-cols-3">
                  <li className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-secondary text-xs font-bold text-foreground">1</span>
                      <h4 className="text-sm font-semibold text-foreground">Add Friend on LINE</h4>
                    </div>
                    <p className="text-sm leading-6 text-muted-foreground">
                      Scan the QR code or open LINE to add our official bot account.
                    </p>

                    {user.lineBotInfo?.basicId ? (
                      <div className="space-y-2">
                        <div className="relative flex h-32 w-32 items-center justify-center overflow-hidden rounded-lg border border-border bg-white p-2">
                          <ProgressiveImage
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(`https://line.me/R/ti/p/${user.lineBotInfo.basicId}`)}`}
                            alt="LINE QR Code"
                            width={120}
                            height={120}
                            className="h-full w-full object-contain"
                          />
                        </div>
                        <a
                          href={`https://line.me/R/ti/p/${user.lineBotInfo.basicId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex min-h-11 items-center gap-2 rounded-lg px-1 text-sm font-semibold text-sky-800 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <QrCode className="h-4 w-4" aria-hidden="true" />
                          Open LINE App
                        </a>
                      </div>
                    ) : (
                      <p className="border-l-2 border-amber-500 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                        Admin connection check required to fetch official QR code link.
                      </p>
                    )}
                  </li>

                  <li className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-secondary text-xs font-bold text-foreground">2</span>
                      <h4 className="text-sm font-semibold text-foreground">Send &quot;ผูกบัญชี&quot;</h4>
                    </div>
                    <p className="text-sm leading-6 text-muted-foreground">
                      In the chatbot, tap <span className="font-semibold text-foreground">&quot;ผูกบัญชีสมาชิก&quot; (Link Account)</span> or send <span className="font-semibold text-foreground">&quot;ผูกบัญชี&quot;</span>.
                    </p>
                  </li>

                  <li className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-secondary text-xs font-bold text-foreground">3</span>
                      <h4 className="text-sm font-semibold text-foreground">Complete Authorization</h4>
                    </div>
                    <p className="text-sm leading-6 text-muted-foreground">
                      Open the link sent by the bot, then confirm the verification request on this website.
                    </p>
                  </li>
                </ol>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
