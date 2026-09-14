import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type PageShellProps = {
  children: ReactNode;
  className?: string;
  as?: "main" | "div" | "section";
  surface?: "atelier" | "dark";
};

export function PageShell({ children, className, as = "div", surface = "atelier" }: PageShellProps) {
  const Component = as;
  const isDark = surface === "dark";

  return (
    <Component
      data-bagui="page"
      data-solar-surface={surface}
      className={cn(
        "bagui-page sd-page-shell solar-route-page min-h-dvh",
        isDark ? "bg-[#0F172A] text-white" : "bg-transparent text-[#1C1C1A]",
        className,
      )}
    >
      {children}
    </Component>
  );
}

type PageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({ title, description, eyebrow, actions, className }: PageHeaderProps) {
  return (
    <header className={cn("sd-page-header flex min-w-0 flex-col gap-6 lg:flex-row lg:items-end lg:justify-between", className)}>
      <div className="min-w-0 max-w-3xl space-y-3">
        {eyebrow ? <p className="text-xs font-bold uppercase tracking-wider text-[#4F7FA8]">{eyebrow}</p> : null}
        <h1 className="text-balance text-3xl font-bold leading-[1.12] tracking-tight text-[#1C1C1A] sm:text-4xl lg:text-5xl">
          {title}
        </h1>
        {description ? <p className="sd-readable text-pretty text-base leading-7 text-[#4E4B44]">{description}</p> : null}
      </div>
      {actions ? <div className="sd-stack-actions w-full shrink-0 lg:w-auto">{actions}</div> : null}
    </header>
  );
}

export function PageSection({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("bagui-section solar-page-section", className)}>{children}</section>;
}
