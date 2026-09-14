"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { cn } from "@/lib/utils";

export interface GsapSliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (newValue: number) => void;
  formatValue?: (val: number) => string;
  ticks?: number[];
  className?: string;
  disabled?: boolean;
  unit?: string;
}

export default function GsapSlider({
  value,
  min,
  max,
  step = 0.5,
  onChange,
  formatValue,
  ticks = [5, 10, 15, 20, 30],
  className,
  disabled = false,
  unit = "kWp",
}: GsapSliderProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const fillRef = useRef<HTMLDivElement | null>(null);
  const thumbRef = useRef<HTMLDivElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const percentage = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));

  // Animate fill width and thumb position using GSAP
  useEffect(() => {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = prefersReducedMotion ? 0 : isDragging ? 0.05 : 0.2;

    if (fillRef.current) {
      gsap.to(fillRef.current, {
        width: `${percentage}%`,
        duration,
        ease: "power2.out",
        overwrite: "auto",
      });
    }

    if (thumbRef.current) {
      gsap.to(thumbRef.current, {
        left: `${percentage}%`,
        duration,
        ease: "power2.out",
        overwrite: "auto",
      });
    }
  }, [percentage, isDragging]);

  // Animate thumb scale and tooltip on hover/drag
  useEffect(() => {
    const thumb = thumbRef.current;
    const tooltip = tooltipRef.current;
    if (!thumb || !tooltip) return;

    const isActive = isDragging || isHovered;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    gsap.to(thumb, {
      scale: isActive ? 1.25 : 1,
      boxShadow: isActive
        ? "0 0 0 6px rgba(183, 209, 234, 0.45), 0 8px 20px rgba(80, 137, 191, 0.25)"
        : "0 0 0 0px rgba(0, 0, 0, 0), 0 2px 8px rgba(0, 0, 0, 0.12)",
      duration: prefersReducedMotion ? 0 : 0.18,
      ease: "expo.out",
    });

    gsap.to(tooltip, {
      autoAlpha: isActive ? 1 : 0,
      y: isActive ? -6 : 0,
      scale: isActive ? 1 : 0.85,
      duration: prefersReducedMotion ? 0 : 0.18,
      ease: "expo.out",
    });
  }, [isDragging, isHovered]);

  const getValueFromX = (clientX: number) => {
    const track = trackRef.current;
    if (!track) return value;
    const rect = track.getBoundingClientRect();
    const offsetX = Math.min(Math.max(0, clientX - rect.left), rect.width);
    const rawRatio = offsetX / rect.width;
    const rawValue = min + rawRatio * (max - min);

    // Snap to step
    const stepped = Math.round((rawValue - min) / step) * step + min;
    const clamped = Math.min(max, Math.max(min, Number(stepped.toFixed(2))));
    return clamped;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.preventDefault();
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);

    const newValue = getValueFromX(e.clientX);
    if (newValue !== value) {
      onChange(newValue);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || disabled) return;
    const newValue = getValueFromX(e.clientX);
    if (newValue !== value) {
      onChange(newValue);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setIsDragging(false);
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

  const formattedDisplay = formatValue ? formatValue(value) : `${value} ${unit}`;

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative w-full select-none pt-7 pb-2 touch-none",
        disabled && "opacity-50 pointer-events-none",
        className
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Clickable Track & Drag Handle Area */}
      <div
        ref={trackRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="relative flex items-center h-6 w-full cursor-pointer"
      >
        {/* Track Line (Overflow-hidden ensures fill never overflows track radius) */}
        <div className="relative h-2.5 w-full rounded-full bg-[#F0EBE5] border border-[#DED8CF]/60 shadow-inner overflow-hidden">
          {/* Filled Progress Bar */}
          <div
            ref={fillRef}
            className="absolute inset-y-0 left-0 rounded-full bg-[#B7D1EA] shadow-xs"
            style={{ width: `${percentage}%` }}
          />

          {/* In-track Milestone Tick Dots */}
          {ticks && ticks.length > 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center">
              {ticks.map((tick) => {
                const tickPct = Math.min(100, Math.max(0, ((tick - min) / (max - min)) * 100));
                const isPassed = value >= tick;
                return (
                  <div
                    key={tick}
                    className="absolute -translate-x-1/2 top-1/2 -translate-y-1/2"
                    style={{ left: `${tickPct}%` }}
                  >
                    <div
                      className={cn(
                        "h-1.5 w-1 rounded-full transition-colors duration-200",
                        isPassed ? "bg-white/90" : "bg-[#94A3B8]/50"
                      )}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Floating Tooltip */}
        <div
          ref={tooltipRef}
          className="pointer-events-none absolute bottom-full left-0 mb-3 -translate-x-1/2 opacity-0 z-20"
          style={{ left: `${percentage}%` }}
        >
          <div className="relative rounded-lg bg-[#0F172A] px-2.5 py-1 text-[11px] font-black text-[#F7F6F3] shadow-xl whitespace-nowrap">
            {formattedDisplay}
            {/* Tooltip Arrow */}
            <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-[#1C1C1A]" />
          </div>
        </div>

        {/* Custom Thumb Knob */}
        <div
          ref={thumbRef}
          className="absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#5089bf] bg-white shadow-md flex items-center justify-center cursor-grab active:cursor-grabbing z-10 transition-shadow hover:ring-4 hover:ring-[#B7D1EA]/50"
          style={{ left: `${percentage}%` }}
        >
          <div className="h-2.5 w-2.5 rounded-full bg-[#5089bf] shadow-xs" />
        </div>
      </div>

      {/* Accessible Hidden Native Range Input */}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={formattedDisplay}
        className="sr-only"
      />

      {/* Tick Labels below slider */}
      {(() => {
        if (!ticks || ticks.length === 0) return null;
        
        // Sort and filter ticks within valid range [min, max]
        const validTicks = Array.from(new Set(ticks.filter((t) => t >= min && t <= max))).sort((a, b) => a - b);
        if (validTicks.length === 0) return null;

        // Filter out overlapping labels (must be at least 12% distance apart)
        const visibleTicks: { tick: number; pct: number }[] = [];
        let lastPct: number | null = null;

        validTicks.forEach((tick, idx) => {
          const pct = Math.min(100, Math.max(0, ((tick - min) / (max - min)) * 100));
          const isFirstOrLast = idx === 0 || idx === validTicks.length - 1;
          
          if (lastPct === null || pct - lastPct >= 12 || isFirstOrLast) {
            visibleTicks.push({ tick, pct });
            lastPct = pct;
          }
        });

        return (
          <div className="relative mt-2 h-5 w-full text-[11px] font-bold text-[#475569]">
            {visibleTicks.map(({ tick, pct }) => {
              const isSelected = Math.abs(value - tick) < 0.1;
              const isStart = pct <= 3;
              const isEnd = pct >= 97;

              return (
                <button
                  key={tick}
                  type="button"
                  onClick={() => onChange(tick)}
                  className={cn(
                    "absolute transition-all hover:text-[#5089bf] cursor-pointer whitespace-nowrap",
                    isSelected ? "font-black text-[#5089bf] scale-105" : "text-[#475569] font-semibold"
                  )}
                  style={{
                    left: isStart ? "0%" : isEnd ? "100%" : `${pct}%`,
                    transform: isStart ? "none" : isEnd ? "translateX(-100%)" : "translateX(-50%)",
                  }}
                >
                  {tick}{unit ? ` ${unit}` : ""}
                </button>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}
