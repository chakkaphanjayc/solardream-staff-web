"use client";

import loadingJs from "loading.js";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// Keep loading.js as the progress source, but let next/image preload only the
// weather variant that is actually rendered. Preloading every weather scene
// here downloaded more than 11 MB of PNGs before the page could appear.
const PRELOAD_ASSETS: readonly string[] = [];

const MIN_INITIAL_LOADING_TIME_MS = 240;
const MAX_INITIAL_LOADING_TIME_MS = 1_800;

type LoadingProgressProps = Readonly<{
  mode?: "initial" | "route";
  className?: string;
}>;

export default function LoadingProgress({
  mode = "initial",
  className,
}: LoadingProgressProps) {
  const isInitial = mode === "initial";
  const [isMounted, setIsMounted] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isEntered, setIsEntered] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [progress, setProgress] = useState(isInitial ? 0 : 12);
  const [isReady, setIsReady] = useState(false);
  const targetProgressRef = useRef(isInitial ? 0 : 12);
  const startedAtRef = useRef<number | null>(null);
  const readyRef = useRef(false);
  const exitStartedRef = useRef(false);

  useEffect(() => {
    let enterFrame = 0;
    const frame = window.requestAnimationFrame(() => {
      setIsMounted(true);
      setIsVisible(true);
      enterFrame = window.requestAnimationFrame(() => setIsEntered(true));
    });

    return () => {
      window.cancelAnimationFrame(frame);
      if (enterFrame) window.cancelAnimationFrame(enterFrame);
    };
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = () => setPrefersReducedMotion(media.matches);

    handleChange();
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    if (!isVisible) return;

    targetProgressRef.current = isInitial ? 4 : 18;
    const progressTicker = window.setInterval(() => {
      setProgress((current) => {
        const target = targetProgressRef.current;
        const distance = target - current;
        if (Math.abs(distance) < 0.25) return target;
        return Number((current + distance * 0.14).toFixed(2));
      });
    }, 32);

    if (!isInitial) {
      const routeTicker = window.setInterval(() => {
        targetProgressRef.current = Math.min(
          88,
          targetProgressRef.current + 1.2,
        );
      }, 140);

      return () => {
        window.clearInterval(progressTicker);
        window.clearInterval(routeTicker);
      };
    }

    return () => window.clearInterval(progressTicker);
  }, [isInitial, isVisible]);

  useEffect(() => {
    if (!isInitial || !isMounted || !isVisible) return;

    startedAtRef.current = performance.now();
    let imagesReady = false;
    let readyTimer: number | null = null;

    const setTargetProgress = (value: number) => {
      targetProgressRef.current = Math.max(
        targetProgressRef.current,
        Math.min(94, Math.max(4, value)),
      );
    };

    const markReady = () => {
      if (!imagesReady || readyRef.current) return;

      readyRef.current = true;
      const elapsed =
        performance.now() - (startedAtRef.current ?? performance.now());
      const remaining = Math.max(0, MIN_INITIAL_LOADING_TIME_MS - elapsed);
      readyTimer = window.setTimeout(() => {
        targetProgressRef.current = 100;
        setIsReady(true);
      }, remaining);
    };

    try {
      loadingJs(PRELOAD_ASSETS, (percent, done) => {
        setTargetProgress(percent);
        if (!done) return;
        imagesReady = true;
        markReady();
      });
    } catch {
      imagesReady = true;
      markReady();
    }

    const fallbackTimer = window.setTimeout(() => {
      imagesReady = true;
      setTargetProgress(94);
      markReady();
    }, MAX_INITIAL_LOADING_TIME_MS);

    return () => {
      window.clearTimeout(fallbackTimer);
      if (readyTimer !== null) window.clearTimeout(readyTimer);
    };
  }, [isInitial, isMounted, isVisible]);

  useEffect(() => {
    if (
      !isInitial ||
      !isMounted ||
      !isVisible ||
      !isReady ||
      exitStartedRef.current
    ) {
      return;
    }

    exitStartedRef.current = true;
    let hideTimer: number | null = null;
    const exitTimer = window.setTimeout(
      () => {
        setIsEntered(false);
        if (prefersReducedMotion) {
          setIsVisible(false);
          return;
        }

        hideTimer = window.setTimeout(() => setIsVisible(false), 320);
      },
      prefersReducedMotion ? 40 : 80,
    );

    return () => {
      window.clearTimeout(exitTimer);
      if (hideTimer !== null) window.clearTimeout(hideTimer);
      exitStartedRef.current = false;
    };
  }, [isInitial, isMounted, isReady, isVisible, prefersReducedMotion]);

  if (!isMounted || !isVisible) return null;

  return (
    <div
      data-bagui="loading-progress"
      data-loading-mode={mode}
      className={cn(
        `${isInitial
          ? "fixed inset-0 z-[var(--layer-immersive)] flex items-center justify-center bg-[#F0EEE9] px-6"
          : "relative flex min-h-[min(80dvh,40rem)] items-center justify-center bg-transparent px-6"} transform-gpu transition-[opacity,transform] duration-300 ease-out motion-reduce:transform-none motion-reduce:transition-none ${isEntered ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`,
        className,
      )}
      role="status"
      aria-live="polite"
      aria-busy={isInitial ? !isReady : true}
    >
      <div
        className="w-full max-w-sm"
        role="progressbar"
        aria-label="Loading progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress)}
      >
        <div className="h-1.5 overflow-hidden rounded-full bg-[#0F172A]/10">
          <div
            className="h-full origin-left scale-x-0 rounded-full bg-[#B7D1EA] transition-transform duration-100 ease-out motion-reduce:transition-none"
            style={{ transform: `scaleX(${progress / 100})` }}
          />
        </div>
        <div className="mt-3 flex justify-end">
          <span className="font-mono text-[11px] font-semibold tracking-[0.16em] text-[#0F172A]/55">
            {Math.round(progress)}%
          </span>
        </div>
      </div>
    </div>
  );
}
