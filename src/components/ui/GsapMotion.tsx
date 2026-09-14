"use client";

import { useEffect, useRef, type HTMLAttributes, type ReactNode } from "react";
import { gsap } from "gsap";
import { Loader2 } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function GsapSpinner({ className }: { className?: string }) {
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    if (prefersReducedMotion()) {
      gsap.set(element, { rotate: 0 });
      return;
    }

    const context = gsap.context(() => {
      gsap.to(element, {
        rotate: 360,
        duration: 0.86,
        ease: "none",
        repeat: -1,
        transformOrigin: "50% 50%",
      });
    }, element);

    return () => context.revert();
  }, []);

  return (
    <span ref={ref} className="inline-flex" aria-hidden="true">
      <Loader2 className={cn("h-4 w-4", className)} />
    </span>
  );
}
export function GsapPulse({
  children,
  className,
  scale = 1.04,
}: {
  children: ReactNode;
  className?: string;
  scale?: number;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    if (prefersReducedMotion()) {
      gsap.set(element, { autoAlpha: 1, scale: 1 });
      return;
    }

    const context = gsap.context(() => {
      gsap.to(element, {
        autoAlpha: 0.58,
        scale,
        duration: 0.78,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
      });
    }, element);

    return () => context.revert();
  }, [scale]);

  return (
    <span ref={ref} className={cn("inline-flex", className)}>
      {children}
    </span>
  );
}

export function GsapTypingDots({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    if (prefersReducedMotion()) {
      gsap.set(element.children, { y: 0, autoAlpha: 1 });
      return;
    }

    const context = gsap.context(() => {
      gsap.to(element.children, {
        y: -3,
        autoAlpha: 0.55,
        duration: 0.42,
        ease: "sine.inOut",
        stagger: 0.12,
        yoyo: true,
        repeat: -1,
      });
    }, element);

    return () => context.revert();
  }, []);

  return (
    <div ref={ref} className={cn("flex items-center gap-0.5", className)} aria-hidden="true">
      <span className="h-1 w-1 rounded-full bg-current" />
      <span className="h-1 w-1 rounded-full bg-current" />
      <span className="h-1 w-1 rounded-full bg-current" />
    </div>
  );
}

export function GsapReveal({
  as: Component = "div",
  children,
  className,
  from = "bottom",
  ...props
}: {
  as?: "div" | "form";
  children?: ReactNode;
  className?: string;
  from?: "bottom" | "right" | "none";
} & Omit<HTMLAttributes<HTMLElement>, "children" | "className">) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const reduce = prefersReducedMotion();
    const x = from === "right" && !reduce ? 18 : 0;
    const y = from === "bottom" && !reduce ? 10 : 0;
    const context = gsap.context(() => {
      gsap.fromTo(
        element,
        { autoAlpha: 0, x, y },
        {
          autoAlpha: 1,
          x: 0,
          y: 0,
          duration: reduce ? 0.01 : 0.22,
          ease: "expo.out",
        },
      );
    }, element);

    return () => context.revert();
  }, [from]);

  return (
    <Component ref={ref as never} className={className} {...props}>
      {children}
    </Component>
  );
}

export function GsapStagger({
  children,
  className,
  stagger = 0.07,
  y = 28,
  duration = 0.65,
  delay = 0,
  as: Component = "div",
  ...props
}: {
  children?: ReactNode;
  className?: string;
  stagger?: number;
  y?: number;
  duration?: number;
  delay?: number;
  as?: "div" | "section" | "ul" | "ol";
} & Omit<HTMLAttributes<HTMLElement>, "children" | "className">) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const reduce = prefersReducedMotion();
    const children = Array.from(element.children) as HTMLElement[];
    if (children.length === 0) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        children,
        { autoAlpha: 0, y: reduce ? 0 : y },
        {
          autoAlpha: 1,
          y: 0,
          duration: reduce ? 0.01 : duration,
          ease: "power3.out",
          stagger: reduce ? 0 : stagger,
          delay: reduce ? 0 : delay,
        },
      );
    }, element);

    return () => ctx.revert();
  }, [stagger, y, duration, delay]);

  return (
    <Component ref={ref as never} className={className} {...props}>
      {children}
    </Component>
  );
}

export function GsapCounter({
  value,
  prefix = "",
  suffix = "",
  duration = 1.2,
  ease = "power2.out",
  className,
  decimals = 0,
  formatter,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  ease?: string;
  className?: string;
  decimals?: number;
  formatter?: (value: number) => string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const prevRef = useRef<number>(0);

  const formatValue = (v: number) => {
    if (formatter) return formatter(v);
    return prefix + v.toFixed(decimals) + suffix;
  };

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const reduce = prefersReducedMotion();
    const from = prevRef.current;
    prevRef.current = value;

    if (reduce) {
      element.textContent = formatValue(value);
      return;
    }

    const obj = { val: from };
    const ctx = gsap.context(() => {
      gsap.to(obj, {
        val: value,
        duration,
        ease,
        onUpdate: () => {
          element.textContent = formatValue(obj.val);
          element.classList.add("lg-counter-shimmer");
          void element.offsetHeight; // force reflow to restart animation
        },
        onComplete: () => {
          element.classList.remove("lg-counter-shimmer");
        },
      });
    });

    return () => ctx.revert();
  }, [value, prefix, suffix, duration, ease, decimals, formatter]);

  return (
    <span ref={ref} className={className} aria-live="polite">
      {formatValue(value)}
    </span>
  );
}
