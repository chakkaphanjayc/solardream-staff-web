"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "@/components/ui/icons";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { setAuthNextPathCookie } from "@/lib/authRedirect";
import { trackProductEvent } from "@/lib/productAnalytics";

type LineLoginButtonProps = Readonly<{
  locale: string;
  nextPath: string;
  linkToken?: string | null;
  disabled?: boolean;
  onLoadingChange?: (loading: boolean) => void;
  className?: string;
}>;

function LineIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="currentColor"
      aria-hidden="true"
      {...props}
    >
      <path d="M24 10.3c0-4.7-5.4-8.5-12-8.5S0 5.6 0 10.3c0 4.2 4.3 7.7 10.1 8.4.4.1.9.3 1 .7.1.3.1.8.0 1.2 0 0-.2 1.3-.3 1.5-.1.4-.4 1.7 1.6.9 2-.8 11.1-6.5 11.1-12.2.5-.2.5-.5.5-.5z" />
    </svg>
  );
}

export default function LineLoginButton({
  locale,
  nextPath,
  linkToken,
  disabled = false,
  onLoadingChange,
  className,
}: LineLoginButtonProps) {
  const t = useTranslations("AuthPage");
  const [loading, setLoading] = useState(false);
  const inactive = disabled || loading;

  const setActiveLoading = (value: boolean) => {
    setLoading(value);
    onLoadingChange?.(value);
  };

  const handleLineLogin = () => {
    setActiveLoading(true);
    void trackProductEvent("auth_provider_selected", { method: "line", mode: "login" });

    const clientId = process.env.NEXT_PUBLIC_LINE_CLIENT_ID?.trim();
    if (!clientId) {
      toast.error(t("lineConfigMissing"));
      setActiveLoading(false);
      return;
    }

    const state = crypto.randomUUID();
    const normalizedLocale = locale === "en" ? "en" : "th";
    const secureAttribute = window.location.protocol === "https:" ? "; Secure" : "";
    setAuthNextPathCookie(nextPath);
    document.cookie = `solardream_preferred_language=${normalizedLocale}; Path=/; Max-Age=600; SameSite=Lax${secureAttribute}`;
    window.sessionStorage.setItem(
      `solardream:line-oauth:${state}`,
      JSON.stringify({
        createdAt: Date.now(),
        locale: normalizedLocale,
        nextPath,
        linkToken,
      }),
    );

    const lineAuthUrl = new URL("https://access.line.me/oauth2/v2.1/authorize");
    lineAuthUrl.searchParams.set("response_type", "code");
    lineAuthUrl.searchParams.set("client_id", clientId);
    lineAuthUrl.searchParams.set("redirect_uri", `${window.location.origin}/api/auth/line/callback`);
    lineAuthUrl.searchParams.set("state", state);
    lineAuthUrl.searchParams.set("scope", "profile openid email");
    lineAuthUrl.searchParams.set("bot_prompt", "normal");
    lineAuthUrl.searchParams.set("prompt", "consent");

    window.location.assign(lineAuthUrl.toString());
  };

  return (
    <Button
      type="button"
      variant="outline"
      onClick={handleLineLogin}
      disabled={inactive}
      aria-busy={loading}
      className={cn(
        "min-h-12 w-full border-border bg-white px-4 text-sm font-semibold text-foreground hover:bg-muted focus-visible:ring-[#048F3D]",
        className,
      )}
    >
      {loading ? (
        <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
      ) : (
        <LineIcon className="h-4 w-4 text-[#06A947]" />
      )}
      {loading ? t("lineConnecting") : t("lineContinue")}
    </Button>
  );
}
