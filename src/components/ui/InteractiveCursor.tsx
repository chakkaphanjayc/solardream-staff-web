"use client";

import React, { useState, useEffect, useRef } from "react";
import { gsap } from "gsap";

interface InteractiveCursorProps {
  children: React.ReactNode;
  label: string; // "Drag" or "View"
  className?: string;
}

export default function InteractiveCursor({
  children,
  label,
  className = "",
}: InteractiveCursorProps) {
  const [isHovered, setIsHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cursor = cursorRef.current;
    if (!cursor) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    gsap.set(cursor, { x: -100, y: -100, xPercent: -50, yPercent: -50 });
    const xTo = gsap.quickTo(cursor, "x", {
      duration: prefersReducedMotion ? 0.01 : 0.28,
      ease: "power3.out",
    });
    const yTo = gsap.quickTo(cursor, "y", {
      duration: prefersReducedMotion ? 0.01 : 0.28,
      ease: "power3.out",
    });

    const handleMouseMove = (e: MouseEvent) => {
      xTo(e.clientX);
      yTo(e.clientY);
    };

    if (isHovered) {
      window.addEventListener("mousemove", handleMouseMove, { passive: true });
      gsap.fromTo(
        cursor,
        { autoAlpha: 0, scale: 0 },
        {
          autoAlpha: 1,
          scale: 1,
          duration: prefersReducedMotion ? 0.08 : 0.22,
          ease: "power3.out",
        },
      );
    } else {
      gsap.to(cursor, {
        autoAlpha: 0,
        scale: 0,
        duration: prefersReducedMotion ? 0.08 : 0.18,
        ease: "power2.in",
      });
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, [isHovered]);

  return (
    <div
      ref={containerRef}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`relative ${isHovered ? "lg:cursor-none" : ""} ${className}`}
    >
      {children}
      <div
        ref={cursorRef}
        style={{
          position: "fixed",
          left: 0,
          top: 0,
          pointerEvents: "none",
          zIndex: 9999,
          opacity: 0,
        }}
        className="hidden lg:flex h-14 w-14 items-center justify-center rounded-full bg-[#B7D1EA] border border-[#1e3a8a]/20 shadow-[0_12px_30px_-5px_rgba(30,58,138,0.22)]"
      >
        <span className="text-[10px] font-black uppercase tracking-wider text-[#1e3a8a] select-none">
          {label}
        </span>
      </div>
    </div>
  );
}
