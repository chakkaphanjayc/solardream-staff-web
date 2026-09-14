"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/utils/supabase/client";
import { getSafeInternalPath } from "@/lib/safeRedirect";
import { getCurrentAccountSetupState } from "@/app/actions/profile";

function getAccountSetupPath(locale: string, nextPath: string) {
  const safeNext = nextPath.startsWith(`/${locale}/account/setup`) ? `/${locale}` : nextPath;
  return `/${locale}/account/setup?next=${encodeURIComponent(safeNext)}`;
}

export default function OAuthCodeBridge() {
  const hasExchangedRef = useRef(false);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const code = searchParams.get("code");

    if (!code || hasExchangedRef.current) {
      return;
    }

    hasExchangedRef.current = true;

    const exchangeOAuthCode = async () => {
      const supabase = createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      const cleanParams = new URLSearchParams(searchParams.toString());
      cleanParams.delete("code");
      cleanParams.delete("state");
      cleanParams.delete("error");
      cleanParams.delete("error_code");
      cleanParams.delete("error_description");

      const cleanQuery = cleanParams.toString();
      const cleanUrl = cleanQuery ? `${pathname}?${cleanQuery}` : pathname;

      if (error) {
        toast.error(error.message || "Unable to complete Google sign in.");
        router.replace(cleanUrl, { scroll: false });
        return;
      }

      await fetch("/api/auth/sync-user", { method: "POST" }).catch((syncError: unknown) => {
        console.warn("[OAuth Bridge]: User profile sync failed after OAuth login", syncError);
      });

      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("solardream:auth-changed"));
      }

      const lineLinkToken = document.cookie
        .split("; ")
        .find((cookie) => cookie.startsWith("line_link_token="))
        ?.split("=")[1];

      if (lineLinkToken) {
        document.cookie = "line_link_token=; path=/; max-age=0; SameSite=Lax; Secure";
        router.replace(`${pathname}?linkToken=${encodeURIComponent(decodeURIComponent(lineLinkToken))}`, { scroll: false });
        router.refresh();
        return;
      }

      const locale = pathname.split("/")[1] || "th";
      const defaultSignedInPath = pathname.includes("/login") || pathname.includes("/register")
        ? `/${locale}`
        : cleanUrl;
      const nextPath = getSafeInternalPath(searchParams.get("next"), defaultSignedInPath);
      const setupState = await getCurrentAccountSetupState();

      router.replace(setupState.authenticated && !setupState.complete
        ? getAccountSetupPath(locale, nextPath)
        : nextPath, {
        scroll: false,
      });
      router.refresh();
    };

    void exchangeOAuthCode();
  }, [pathname, router, searchParams]);

  return null;
}
