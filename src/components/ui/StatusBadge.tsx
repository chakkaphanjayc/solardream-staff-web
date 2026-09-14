import type { HTMLAttributes, ReactNode } from "react";

import { Badge, type BadgeProps } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type StatusBadgeTone = "neutral" | "success" | "warning" | "danger" | "info" | "slate";

const toneVariant: Record<StatusBadgeTone, NonNullable<BadgeProps["variant"]>> = {
  neutral: "neutral",
  success: "success",
  warning: "warning",
  danger: "danger",
  info: "info",
  slate: "dark",
};

type StatusBadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: StatusBadgeTone;
  children: ReactNode;
};

export default function StatusBadge({
  tone = "neutral",
  children,
  className,
  ...props
}: StatusBadgeProps) {
  return (
    <Badge
      variant={toneVariant[tone]}
      className={cn("min-h-7 text-[11px]", className)}
      {...props}
    >
      {children}
    </Badge>
  );
}
