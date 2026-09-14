"use client";

import { animate, motionValue, useMotionValueEvent, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type AnimatedNumberProps = Readonly<{
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  locale?: string;
  className?: string;
}>;

export function AnimatedNumber({
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
  locale = "en-US",
  className,
}: AnimatedNumberProps) {
  const prefersReducedMotion = useReducedMotion();
  const [valueMotion] = useState(() => motionValue(value));
  const [displayValue, setDisplayValue] = useState(value);

  useMotionValueEvent(valueMotion, "change", (latest) => {
    setDisplayValue(latest);
  });

  useEffect(() => {
    const controls = animate(valueMotion, value, {
      type: prefersReducedMotion ? "tween" : "spring",
      duration: prefersReducedMotion ? 0 : undefined,
      stiffness: 150,
      damping: 24,
      mass: 0.7,
    });

    return () => controls.stop();
  }, [prefersReducedMotion, value, valueMotion]);

  const formatted = Number.isFinite(displayValue)
    ? displayValue.toLocaleString(locale, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })
    : "0";

  return (
    <span className={cn("tabular-nums", className)}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
