"use client";

import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

type SectionRevealProps = Readonly<{
  children: ReactNode;
  className?: string;
  delay?: number;
  id?: string;
  disableReveal?: boolean;
}>;

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

export default function SectionReveal({ children, className, delay = 0, id, disableReveal = false }: SectionRevealProps) {
  const sectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || disableReveal) return;

    if (typeof window !== "undefined") {
      gsap.registerPlugin(ScrollTrigger);
    }

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) return;

    const scroller = section.closest<HTMLElement>("[data-cinematic-scroll-root]") || window;

    const context = gsap.context(() => {
      gsap.fromTo(
        section,
        {
          autoAlpha: 0,
          y: 40,
          scale: 0.985,
          filter: "blur(10px)",
        },
        {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          filter: "blur(0px)",
          duration: 0.82,
          delay,
          ease: prefersReducedMotion ? "none" : "expo.out",
          scrollTrigger: {
            trigger: section,
            scroller,
            start: "top 85%",
            toggleActions: "play none none reverse",
            once: true,
          },
        },
      );
    }, section);

    return () => context.revert();
  }, [delay, disableReveal]);

  return (
    <section
      ref={sectionRef}
      id={id}
      className={className}
    >
      {children}
    </section>
  );
}
