"use client";

import React, { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { cn } from "@/lib/utils";

interface CustomToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string | React.ReactNode;
  className?: string;
  disabled?: boolean;
}

export default function CustomToggle({
  checked,
  onChange,
  label,
  className = "",
  disabled = false,
}: CustomToggleProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const thumbRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const track = trackRef.current;
    const thumb = thumbRef.current;
    if (!track || !thumb) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const context = gsap.context(() => {
      gsap.to(track, {
        backgroundColor: checked ? "#D8A87B" : "#E2E8F0",
        duration: prefersReducedMotion ? 0.01 : 0.2,
        ease: "power2.out",
      });
      gsap.to(thumb, {
        x: checked ? 20 : 0,
        backgroundColor: "#FFFFFF",
        duration: prefersReducedMotion ? 0.01 : 0.25,
        ease: "power2.out",
      });
    }, track);

    return () => context.revert();
  }, [checked]);

  return (
    <label
      className={cn(
        "flex items-center gap-3 cursor-pointer select-none py-1 text-xs font-semibold text-slate-800 hover:text-[#D8A87B] transition-colors",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
    >
      <div className="relative flex items-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => !disabled && onChange(e.target.checked)}
          disabled={disabled}
          className="sr-only"
        />
        <div
          ref={trackRef}
          className="flex h-7 w-12 cursor-pointer items-center rounded-full border-2 border-slate-400/70 bg-slate-200 p-0.5 transition-colors"
        >
          <div
            ref={thumbRef}
            className="h-5 w-5 rounded-full border-2 border-slate-300 bg-white shadow-[2px_2px_0_rgba(15,23,42,0.18)]"
          />
        </div>
      </div>
      {label && <span className="truncate">{label}</span>}
    </label>
  );
}
