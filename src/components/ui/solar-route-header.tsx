import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type SolarRouteHeaderProps = Readonly<{
  eyebrow: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
  className?: string;
}>;

/**
 * Shared page-level hierarchy for customer journeys. It keeps the first
 * decision visible, gives the route one clear action group, and leaves the
 * atmospheric shell visible around the content.
 */
export function SolarRouteHeader({
  eyebrow,
  title,
  description,
  actions,
  meta,
  className,
}: SolarRouteHeaderProps) {
  return (
    <header
      data-bagui="section-header"
      className={cn("solar-route-intro mx-auto w-full max-w-7xl", className)}
    >
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 max-w-3xl">
          <p className="solar-route-kicker text-xs font-bold uppercase tracking-wider text-[#4F7FA8]">{eyebrow}</p>
          <h1 className="mt-3 max-w-3xl text-balance text-4xl font-extrabold leading-[1.15] tracking-tight text-[#1C1C1A] sm:text-5xl lg:text-6xl">
            {title}
          </h1>
          {description ? (
            <p className="mt-4 max-w-2xl text-pretty text-sm font-normal leading-7 text-[#4E4B44] sm:text-base">
              {description}
            </p>
          ) : null}
          {meta ? <div className="mt-4">{meta}</div> : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-col gap-3 sm:flex-row lg:flex-col lg:items-stretch">
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}
