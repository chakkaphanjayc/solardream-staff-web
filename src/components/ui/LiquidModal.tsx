"use client";

/**
 * LiquidModal — Mobile OS-style Liquid Glass modal system.
 *
 * Features:
 *  - Background viewport scale(0.96) + border-radius: 24px when open (iOS style)
 *  - Dynamic Island morphing via GSAP Flip Plugin
 *  - Floating Glass Capsule for loading/sofia states
 *  - Bottom Sheet on tablet/touch devices
 *  - Drag-to-dismiss via pointer events (no Draggable license needed)
 *
 * Usage:
 *   <LiquidModal open={open} onClose={() => setOpen(false)} title="Hello">
 *     content
 *   </LiquidModal>
 */

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { gsap } from "gsap";
import { cn } from "@/lib/utils";

export interface LiquidModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children?: ReactNode;
  className?: string;
  /** Show as bottom sheet on mobile (default true) */
  bottomSheet?: boolean;
  /** Aria role (default "dialog") */
  role?: "dialog" | "alertdialog";
  /** aria-label override */
  ariaLabel?: string;
}

export default function LiquidModal({
  open,
  onClose,
  title,
  children,
  className,
  bottomSheet = true,
  role = "dialog",
  ariaLabel,
}: LiquidModalProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const viewportScaleRef = useRef<HTMLDivElement | null>(null);

  // Drag-to-dismiss state
  const dragStartY = useRef<number>(0);
  const dragCurrentY = useRef<number>(0);
  const isDragging = useRef(false);

  const prefersReducedMotion =
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;

  // ─── open / close animation ───────────────────────────────────────────────
  useEffect(() => {
    const overlay = overlayRef.current;
    const panel = panelRef.current;
    if (!overlay || !panel) return;

    if (open) {
      // Prevent body scroll
      document.body.style.overflow = "hidden";

      // Scale down background viewport (iOS-like window layering)
      const bg = document.getElementById("liquid-modal-bg-target") ?? document.body;
      if (!prefersReducedMotion) {
        gsap.to(bg, {
          scale: 0.96,
          borderRadius: "24px",
          duration: 0.38,
          ease: "power3.out",
        });
      }

      // Fade in overlay
      gsap.fromTo(
        overlay,
        { autoAlpha: 0 },
        { autoAlpha: 1, duration: prefersReducedMotion ? 0.01 : 0.22, ease: "power2.out" },
      );

      // Slide up panel
      gsap.fromTo(
        panel,
        { y: prefersReducedMotion ? 0 : "100%", autoAlpha: 0 },
        {
          y: 0,
          autoAlpha: 1,
          duration: prefersReducedMotion ? 0.01 : 0.42,
          ease: "expo.out",
          delay: 0.05,
        },
      );
    } else {
      // Restore background
      const bg = document.getElementById("liquid-modal-bg-target") ?? document.body;
      gsap.to(bg, {
        scale: 1,
        borderRadius: "0px",
        duration: prefersReducedMotion ? 0.01 : 0.30,
        ease: "power2.inOut",
      });

      // Slide down panel
      gsap.to(panel, {
        y: "100%",
        autoAlpha: 0,
        duration: prefersReducedMotion ? 0.01 : 0.28,
        ease: "power3.in",
        onComplete: () => {
          gsap.set(overlay, { autoAlpha: 0 });
        },
      });

      document.body.style.overflow = "";
    }
  }, [open, prefersReducedMotion]);

  // ─── drag-to-dismiss (touch) ──────────────────────────────────────────────
  const handlePointerDown = (e: React.PointerEvent) => {
    isDragging.current = true;
    dragStartY.current = e.clientY;
    dragCurrentY.current = 0;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const dy = Math.max(0, e.clientY - dragStartY.current);
    dragCurrentY.current = dy;
    if (panelRef.current) {
      gsap.set(panelRef.current, { y: dy });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);

    const threshold = 160;
    if (dragCurrentY.current > threshold) {
      onClose();
    } else {
      // Snap back with spring
      gsap.to(panelRef.current, {
        y: 0,
        duration: 0.45,
        ease: "elastic.out(1, 0.75)",
      });
    }
  };

  // Close on overlay click
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const isTouch =
    typeof window !== "undefined" &&
    (("ontouchstart" in window) || window.matchMedia("(pointer: coarse)").matches);

  const useBottomSheet = bottomSheet && isTouch;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[var(--layer-dialog)] flex items-end justify-center sm:items-center"
      style={{ visibility: open ? "visible" : "hidden", opacity: 0 }}
      onClick={handleOverlayClick}
      aria-hidden={!open}
    >
      {/* Scrim */}
      <div className="absolute inset-0 bg-black/25 backdrop-blur-[2px]" />

      {/* Glass Panel */}
      <div
        ref={panelRef}
        role={role}
        aria-modal={open}
        aria-label={ariaLabel ?? title}
        className={cn(
          "relative z-10 mx-auto w-full max-w-lg",
          useBottomSheet
            ? "rounded-t-[20px] rounded-b-none"
            : "rounded-[20px] mx-4",
          "lg-panel",
          className,
        )}
        style={{
          maxHeight: useBottomSheet ? "90dvh" : "85dvh",
          overflowY: "auto",
        }}
        onPointerDown={useBottomSheet ? handlePointerDown : undefined}
        onPointerMove={useBottomSheet ? handlePointerMove : undefined}
        onPointerUp={useBottomSheet ? handlePointerUp : undefined}
      >
        {/* Handle bar (bottom sheet) */}
        {useBottomSheet && (
          <div className="mx-auto mt-3 mb-1 h-1 w-10 rounded-full bg-[#1C1C1A]/15" />
        )}

        {title && (
          <div className="flex items-center justify-between px-5 pb-3 pt-4">
            <h2 className="text-base font-semibold text-[#1C1C1A]">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1.5 text-[#475569] hover:bg-[#F0EEE9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#5089bf]"
              aria-label="ปิด"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        )}

        <div className={cn("px-5 pb-6", !title && "pt-5")}>{children}</div>
      </div>
    </div>
  );
}

// ─── Sofia Dynamic Island Loading Capsule ────────────────────────────────────

export function SofiaCapsule({
  visible,
  message,
}: {
  visible: boolean;
  message?: string;
}) {
  const capsuleRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = capsuleRef.current;
    if (!el) return;
    const reduce =
      typeof window !== "undefined"
        ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
        : false;

    if (visible) {
      gsap.fromTo(
        el,
        { autoAlpha: 0, scale: 0.7, y: 20 },
        {
          autoAlpha: 1,
          scale: 1,
          y: 0,
          duration: reduce ? 0.01 : 0.45,
          ease: "elastic.out(1, 0.6)",
        },
      );
    } else {
      gsap.to(el, {
        autoAlpha: 0,
        scale: 0.85,
        y: 12,
        duration: reduce ? 0.01 : 0.22,
        ease: "power3.in",
      });
    }
  }, [visible]);

  return (
    <div
      ref={capsuleRef}
      aria-live="assertive"
      aria-atomic="true"
      className={cn(
        "pointer-events-none fixed left-1/2 top-8 z-[var(--layer-immersive)] -translate-x-1/2",
        "lg-pill flex items-center gap-3 px-5 py-3",
        "min-w-[200px] justify-center",
      )}
      style={{ opacity: 0, visibility: "hidden" }}
    >
      {/* Sofia floating avatar */}
      <span className="lg-sofia-float relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-white/60">
        <span className="absolute inset-0 bg-gradient-to-br from-[#B7D1EA] to-[#5089bf]" />
        <span className="absolute inset-0 flex items-center justify-center text-base">
          ☀️
        </span>
      </span>

      {/* Message + waveform */}
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-semibold text-[#1C1C1A]">
          {message ?? "กำลังคำนวณ..."}
        </span>
        <WaveformBars />
      </div>
    </div>
  );
}

function WaveformBars() {
  return (
    <span className="flex items-end gap-[2px] h-4" aria-hidden="true">
      {[0.4, 0.7, 1, 0.65, 0.45, 0.8, 0.5].map((h, i) => (
        <span
          key={i}
          className="w-[3px] rounded-full bg-[#5089bf]"
          style={{
            height: `${h * 100}%`,
            animation: `lg-waveform ${0.6 + i * 0.07}s ease-in-out ${i * 0.06}s infinite alternate`,
          }}
        />
      ))}
    </span>
  );
}
