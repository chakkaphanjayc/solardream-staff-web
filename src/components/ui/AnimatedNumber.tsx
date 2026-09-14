"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

type FormatNumberOptions = {
  decimals: number;
  prefix: string;
  suffix: string;
};

export interface AnimatedNumberProps {
  value: number;
  decimals?: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  formatter?: (value: number) => string;
}

const easeExpoOut = (progress: number) =>
  progress >= 1 ? 1 : 1 - Math.pow(2, -10 * progress);

function formatAnimatedNumber(
  value: number,
  { decimals, prefix, suffix }: FormatNumberOptions,
) {
  return `${prefix}${value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}${suffix}`;
}

export function useCountUp(value: number, duration = 800) {
  const [displayValue, setDisplayValue] = useState(value);
  const previousValueRef = useRef(value);
  const displayValueRef = useRef(value);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const commitValue = (nextValue: number) => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
      frameRef.current = requestAnimationFrame(() => {
        displayValueRef.current = nextValue;
        previousValueRef.current = nextValue;
        setDisplayValue(nextValue);
        frameRef.current = null;
      });
    };

    if (!Number.isFinite(value)) {
      commitValue(value);
      return () => {
        if (frameRef.current !== null) {
          cancelAnimationFrame(frameRef.current);
          frameRef.current = null;
        }
      };
    }

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const startValue = Number.isFinite(displayValueRef.current)
      ? displayValueRef.current
      : previousValueRef.current;
    const delta = value - startValue;

    if (prefersReducedMotion || duration <= 0 || Math.abs(delta) < 0.0001) {
      commitValue(value);
      return () => {
        if (frameRef.current !== null) {
          cancelAnimationFrame(frameRef.current);
          frameRef.current = null;
        }
      };
    }

    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
    }

    const startTime = performance.now();

    const tick = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const nextValue = startValue + delta * easeExpoOut(progress);
      displayValueRef.current = nextValue;
      setDisplayValue(nextValue);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
        return;
      }

      previousValueRef.current = value;
      frameRef.current = null;
    };

    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [duration, value]);

  return displayValue;
}

export default function AnimatedNumber({
  value,
  decimals = 0,
  duration = 800,
  prefix = "",
  suffix = "",
  className,
  formatter,
}: AnimatedNumberProps) {
  const displayValue = useCountUp(value, duration);
  const isUpdating =
    Number.isFinite(value) &&
    Math.abs(displayValue - value) > Math.max(0.001, 1 / 10 ** (decimals + 1));
  const formatted = formatter
    ? formatter(displayValue)
    : formatAnimatedNumber(displayValue, { decimals, prefix, suffix });

  return (
    <span
      className={cn(
        "tabular-nums transition-[color,text-shadow] duration-500 ease-expo-out",
        isUpdating && "number-updating",
        className,
      )}
    >
      {formatted}
    </span>
  );
}
