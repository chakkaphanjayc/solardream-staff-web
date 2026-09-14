import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type SolarRouteShellProps = {
  children: ReactNode;
  className?: string;
  as?: "div" | "main" | "section";
};

/**
 * Shared customer-page ground for the Solar Atelier visual system.
 * Decorative layers are intentionally CSS-only so route shells stay cheap to
 * render and remain available when backdrop filters are unsupported.
 */
export function SolarRouteShell({
  children,
  className,
  as = "div",
}: SolarRouteShellProps) {
  const Component = as;

  return (
    <Component
      data-bagui="page"
      data-solar-surface="atelier"
      className={cn(
        "solar-route-shell sd-page-shell relative isolate min-h-dvh overflow-x-clip bg-transparent text-[#1C1C1A]",
        className,
      )}
    >
      <div className="solar-route-atmosphere pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="pointer-events-none absolute -top-32 -left-20 h-[38rem] w-[38rem] rounded-full bg-[#B7D1EA]/20 blur-3xl" />
        <div className="pointer-events-none absolute top-1/4 -right-24 h-[34rem] w-[34rem] rounded-full bg-[#F1D6B8]/24 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/4 h-[30rem] w-[30rem] rounded-full bg-[#B7D1EA]/12 blur-3xl" />
        <span className="solar-route-glow solar-route-glow--sky" />
        <span className="solar-route-glow solar-route-glow--sun" />
        <span className="solar-route-horizon" />
      </div>
      <div className="solar-route-content relative z-[1] pt-20 sm:pt-24 lg:pt-28">
        {children}
      </div>
    </Component>
  );
}
