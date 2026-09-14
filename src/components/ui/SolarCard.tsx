"use client";

import type { HTMLAttributes } from "react";
import { usePathname } from "next/navigation";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type SolarCardProps = HTMLAttributes<HTMLDivElement> & {
  interactive?: boolean;
};

export default function SolarCard({
  children,
  className,
  interactive = false,
  ...props
}: SolarCardProps) {
  const pathname = usePathname();
  const isAdminPage = pathname?.includes("/admin");

  return (
    <Card
      tone={isAdminPage ? "dark" : "default"}
      interactive={interactive}
      data-solar-card
      className={cn(
        isAdminPage ? "rounded-xl border-white/10 bg-[#141B2D] text-slate-100" : "rounded-[24px]",
        className,
      )}
      {...props}
    >
      {children}
    </Card>
  );
}
