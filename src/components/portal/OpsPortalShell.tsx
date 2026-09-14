"use client";

import Link from "next/link";
import { useLocale } from "next-intl";
import type { ReactNode } from "react";

import { ArrowRight, LifeBuoy, ShieldCheck, Sun } from "@/components/ui/icons";

type OpsPortalShellProps = {
  title: string;
  description: string;
  enabled: boolean;
  children: ReactNode;
};

export function OpsPortalShell({ title, description, enabled, children }: OpsPortalShellProps) {
  const locale = useLocale();
  const prefix = "/" + locale + "/portal";

  return (
    <main
      data-bagui="customer-operations-portal"
      data-solar-surface="atelier"
      className="solar-portal-surface relative min-h-dvh overflow-hidden bg-transparent px-4 py-6 text-[#1C1C1A] sm:px-6 md:py-10"
    >
      <div className="pointer-events-none absolute -top-40 -right-40 h-96 w-96 rounded-full bg-[#B7D1EA]/20 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute top-1/2 -left-40 h-80 w-80 rounded-full bg-[#F1D6B8]/18 blur-3xl" aria-hidden="true" />

      <div className="relative mx-auto max-w-6xl space-y-6">
        <header data-liquid-glass="surface" className="solar-portal-header flex flex-col gap-5 rounded-[28px] p-5 sm:p-7 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link href={"/" + locale} className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[#4F7FA8]">
              <Sun className="h-4 w-4" aria-hidden="true" />
              SolarDream customer care
            </Link>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-[#1C1C1A] sm:text-4xl">{title}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#4E4B44] font-medium">{description}</p>
          </div>
          <nav aria-label="Customer portal" className="flex flex-wrap gap-2">
            <Link data-liquid-glass="control" href={prefix + "/projects"} className="solar-portal-control rounded-full px-4 py-2 text-xs font-bold transition-all active:scale-95">Projects</Link>
            <Link data-liquid-glass="control" href={prefix + "/warranties"} className="solar-portal-control rounded-full px-4 py-2 text-xs font-bold transition-all active:scale-95">Warranties</Link>
            <Link href={prefix + "/service"} className="solar-route-primary inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition-all active:scale-95"><LifeBuoy className="h-4 w-4" aria-hidden="true" /> Get help</Link>
          </nav>
        </header>

        {!enabled ? (
          <section data-liquid-glass="surface" className="rounded-[28px] p-7 sm:p-10">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#B7D1EA] text-[#1C1C1A] shadow-sm">
              <ShieldCheck className="h-6 w-6" aria-hidden="true" />
            </div>
            <h2 className="mt-5 text-2xl font-bold text-[#1C1C1A]">Your operations portal is being prepared</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-[#4E4B44] font-medium">
              Your existing SolarDream portal remains available. This workspace will appear here when the new delivery and after-sales experience is enabled for your account.
            </p>
            <Link href={"/" + locale + "/portal/warranty"} className="solar-route-primary mt-6 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs font-bold transition-all active:scale-95">
              Open current warranty portal <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </section>
        ) : children}
      </div>
    </main>
  );
}
