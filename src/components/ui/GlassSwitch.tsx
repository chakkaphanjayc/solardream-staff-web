"use client";

/**
 * GlassSwitch — Liquid Glass toggle capsule.
 *
 * Replaces plain checkbox toggles for LINE Connection and Communication
 * Preference settings. Shows an emerald glow ring when active.
 */

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { cn } from "@/lib/utils";

export interface GlassSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
}

export default function GlassSwitch({
  checked,
  onChange,
  label,
  id,
  disabled = false,
  className,
}: GlassSwitchProps) {
  const thumbRef = useRef<HTMLSpanElement | null>(null);
  const trackRef = useRef<HTMLButtonElement | null>(null);
  const glowRef = useRef<HTMLSpanElement | null>(null);

  const prefersReducedMotion =
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;

  useEffect(() => {
    const thumb = thumbRef.current;
    const track = trackRef.current;
    const glow = glowRef.current;
    if (!thumb || !track || !glow) return;

    const dur = prefersReducedMotion ? 0 : 0.28;

    gsap.to(thumb, {
      x: checked ? "calc(100% + 2px)" : "0%",
      duration: dur,
      ease: "elastic.out(1, 0.65)",
    });

    gsap.to(track, {
      backgroundColor: checked ? "rgba(52, 211, 153, 0.35)" : "rgba(255,255,255,0.40)",
      borderColor: checked ? "rgba(52, 211, 153, 0.60)" : "rgba(255,255,255,0.70)",
      duration: dur,
      ease: "power2.out",
    });

    gsap.to(glow, {
      opacity: checked ? 1 : 0,
      scale: checked ? 1 : 0.7,
      duration: dur * 1.2,
      ease: "expo.out",
    });
  }, [checked, prefersReducedMotion]);

  return (
    <label
      className={cn("inline-flex items-center gap-3 cursor-pointer select-none", className)}
      htmlFor={id}
    >
      <span className="relative inline-flex items-center">
        {/* Glow ring overlay */}
        <span
          ref={glowRef}
          aria-hidden="true"
          className="lg-emerald-pulse pointer-events-none absolute inset-0 rounded-full opacity-0"
          style={{ boxShadow: "var(--lg-emerald-glow)" }}
        />

        {/* Track */}
        <button
          ref={trackRef}
          type="button"
          role="switch"
          id={id}
          aria-checked={checked}
          aria-label={label}
          disabled={disabled}
          onClick={() => !disabled && onChange(!checked)}
          className="relative flex h-7 w-12 items-center rounded-full border px-0.5 transition-shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5089bf] disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            backgroundColor: "rgba(255,255,255,0.40)",
            borderColor: "rgba(255,255,255,0.70)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            boxShadow: "var(--lg-inner-glow)",
          }}
        >
          {/* Thumb */}
          <span
            ref={thumbRef}
            aria-hidden="true"
            className="block h-5 w-5 rounded-full bg-white shadow-md"
            style={{
              boxShadow: "0 1px 4px rgba(0,0,0,0.18)",
            }}
          />
        </button>
      </span>

      {label && (
        <span className="text-sm font-medium text-[#1C1C1A]">{label}</span>
      )}
    </label>
  );
}
