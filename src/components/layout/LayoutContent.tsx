"use client";

import dynamic from "next/dynamic";
import React, { ReactNode, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { trackUmamiEvent } from "@/utils/analytics";
import { getCustomerRoutePolicy } from "@/lib/customerRoutePolicy";

const AppLoadingScreen = dynamic(() => import("@/components/ui/AppLoadingScreen"), {
  ssr: false,
});
const SmoothScrollBoundary = dynamic(() => import("./SmoothScrollBoundary"));

type LayoutContentProps = {
  children: ReactNode;
};

export default function LayoutContent({ children }: LayoutContentProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [reducedMotion, setReducedMotion] = useState(false);
  const routePolicy = getCustomerRoutePolicy(pathname);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = () => setReducedMotion(media.matches);

    handleChange();
    media.addEventListener("change", handleChange);

    return () => media.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    const legacyLineSignup = searchParams.get("lineSignup") === "1";
    const provider = legacyLineSignup ? "line" : searchParams.get("authProvider");
    const event = legacyLineSignup ? "login" : searchParams.get("authEvent");
    const isNewUser = legacyLineSignup || searchParams.get("authNewUser") === "1";

    if ((provider !== "google" && provider !== "line") || event !== "login") return;

    void trackUmamiEvent("login", "track_user_registration", {
      method: provider,
      role: "client",
    });

    if (isNewUser) {
      void trackUmamiEvent("sign_up", "track_user_registration", {
        method: provider,
        role: "client",
      });
    }

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("lineSignup");
    nextParams.delete("authProvider");
    nextParams.delete("authEvent");
    nextParams.delete("authNewUser");
    const query = nextParams.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
  }, [pathname, router, searchParams]);

  useEffect(() => {
    if (routePolicy.lockViewport) return;

    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    });

    return () => window.cancelAnimationFrame(frame);
  }, [pathname, routePolicy.lockViewport]);

  const content = (
    <>
      {!routePolicy.isAdmin && <AppLoadingScreen />}
      <div
        className={cn(
          "flex w-full min-w-0 max-w-full flex-col",
          routePolicy.isAdmin ? "bg-[#0F172A] text-slate-200" : routePolicy.isTechPortal ? "bagui-page text-[#0F172A]" : "bagui-page",
          routePolicy.lockViewport ? "h-full min-h-0" : "min-h-dvh",
        )}
      >
        {children}
      </div>
    </>
  );

  if (!routePolicy.useSmoothScroll) return content;

  return (
    <SmoothScrollBoundary reducedMotion={reducedMotion}>
      {content}
    </SmoothScrollBoundary>
  );
}
