"use client";

import { cn } from "@/lib/utils";

type AnimatedTextChangeProps = {
  value: string | number;
  className?: string;
};

export default function AnimatedTextChange({ value, className }: AnimatedTextChangeProps) {
  return (
    <span key={String(value)} className={cn("text-change", className)}>
      {value}
    </span>
  );
}
