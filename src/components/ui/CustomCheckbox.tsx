"use client";

import React, { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { Check } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

interface CustomCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string | React.ReactNode;
  className?: string;
  disabled?: boolean;
}

export default function CustomCheckbox({
  checked,
  onChange,
  label,
  className = "",
  disabled = false,
}: CustomCheckboxProps) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const checkRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const context = gsap.context(() => {
      gsap.to(box, {
        backgroundColor: checked ? "#B7D1EA" : "#F7F6F3",
        borderColor: checked ? "#B7D1EA" : "#8E8B83",
        duration: prefersReducedMotion ? 0.01 : 0.24,
        ease: "power2.out",
      });

      if (checkRef.current && checked) {
        gsap.fromTo(
          checkRef.current,
          { autoAlpha: 0, scale: 0, rotate: -20 },
          {
            autoAlpha: 1,
            scale: 1,
            rotate: 0,
            duration: prefersReducedMotion ? 0.01 : 0.28,
            ease: "back.out(1.7)",
          },
        );
      }
    }, box);

    return () => context.revert();
  }, [checked]);

  return (
    <label
      className={cn(
        "flex items-center gap-3 cursor-pointer select-none py-1 text-xs font-semibold text-[#1C1C1A] hover:text-[#3E6685] transition-colors",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
    >
      <div className="relative flex items-center justify-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => !disabled && onChange(e.target.checked)}
          disabled={disabled}
          className="sr-only"
        />
        <div
          ref={boxRef}
          className="flex h-5 w-5 items-center justify-center overflow-hidden rounded-[6px] border-2 border-[#8E8B83]"
        >
          {checked && (
            <div ref={checkRef}>
              <Check className="w-3.5 h-3.5 text-white stroke-[3.5px]" />
            </div>
          )}
        </div>
      </div>
      {label && <span className="truncate">{label}</span>}
    </label>
  );
}
