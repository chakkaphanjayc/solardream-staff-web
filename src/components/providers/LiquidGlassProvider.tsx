"use client";

/**
 * LiquidGlassProvider
 *
 * Client-side bootstrap for the Liquid Glass design system:
 *   1. Registers GSAP plugins (ScrollTrigger, ScrollToPlugin, Flip)
 *   2. Tracks mouse pointer → updates --lg-mouse-x / --lg-mouse-y CSS vars
 *      (used by .lg-panel::after for pointer-tracking glass glow)
 *   3. Installs global scroll-interruption guard for GSAP auto-scroll tweens
 *
 * Mount once in the [locale] layout. The admin route family is explicitly
 * skipped so the public-only bootstrap does not affect the operations shell.
 */

import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { getCustomerRoutePolicy } from "@/lib/customerRoutePolicy";

type Props = { children: ReactNode };

export default function LiquidGlassProvider({ children }: Props) {
  const pathname = usePathname();
  const isAdmin = getCustomerRoutePolicy(pathname).isAdmin;

  useEffect(() => {
    if (isAdmin) return;

    let active = true;
    let cleanupGuard: (() => void) | null = null;

    // Load the public-only animation registry after the route is known. Admin
    // pages do not use the glass pointer effect or GSAP scroll plugins.
    void import("@/lib/gsap-registry").then(({ registerGsapPlugins, setupScrollInterruptionGuard }) => {
      if (!active) return;
      registerGsapPlugins();
      cleanupGuard = setupScrollInterruptionGuard();
    });

    // Track pointer for glass glow (coalesced via rAF).
    let rafId: number | null = null;
    let lastX = -1;
    let lastY = -1;

    const onMouseMove = (e: MouseEvent) => {
      if (e.clientX === lastX && e.clientY === lastY) return;
      lastX = e.clientX;
      lastY = e.clientY;
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        document.documentElement.style.setProperty("--lg-mouse-x", `${lastX}px`);
        document.documentElement.style.setProperty("--lg-mouse-y", `${lastY}px`);
      });
    };

    window.addEventListener("mousemove", onMouseMove, { passive: true });

    return () => {
      active = false;
      window.removeEventListener("mousemove", onMouseMove);
      if (rafId !== null) cancelAnimationFrame(rafId);
      cleanupGuard?.();
    };
  }, [isAdmin]);

  return <>{children}</>;
}
