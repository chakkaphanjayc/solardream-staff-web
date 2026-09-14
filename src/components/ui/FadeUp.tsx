"use client";

import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

interface FadeUpProps {
  children: ReactNode;
  className?: string;
  delay?: number;
}

export default function FadeUp({ children, className = "", delay = 0 }: FadeUpProps) {
  const elementRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    if (typeof window !== "undefined") {
      gsap.registerPlugin(ScrollTrigger);
    }

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scroller = element.closest<HTMLElement>("[data-cinematic-scroll-root]") || window;

    const context = gsap.context(() => {
      gsap.fromTo(
        element,
        {
          autoAlpha: 0,
          y: prefersReducedMotion ? 0 : 30,
          scale: prefersReducedMotion ? 1 : 0.98,
        },
        {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          duration: prefersReducedMotion ? 0.35 : 0.72,
          delay,
          ease: "expo.out",
          scrollTrigger: {
            trigger: element,
            scroller,
            start: "top 86%",
            toggleActions: "play none none reverse",
            once: true,
          },
        },
      );
    }, element);

    return () => context.revert();
  }, [delay]);

  return (
    <div ref={elementRef} className={className}>
      {children}
    </div>
  );
}
