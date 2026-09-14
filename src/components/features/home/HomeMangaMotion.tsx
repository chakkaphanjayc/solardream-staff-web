"use client";

import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

type HomeMangaMotionProps = Readonly<{
  children: ReactNode;
  onActiveSectionChange?: (index: number) => void;
  onProgressChange?: (progress: number) => void;
}>;

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

export default function HomeMangaMotion({
  children,
  onActiveSectionChange,
  onProgressChange,
}: HomeMangaMotionProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    gsap.registerPlugin(ScrollTrigger);
    const sections = Array.from(root.querySelectorAll<HTMLElement>("[data-home-snap-section], [data-manga-chapter]"));
    const chapters = Array.from(root.querySelectorAll<HTMLElement>("[data-manga-chapter]"));

    const context = gsap.context(() => {
      const media = gsap.matchMedia();

      // 1. Reduced Motion: clear all animations immediately
      media.add("(prefers-reduced-motion: reduce)", () => {
        onActiveSectionChange?.(0);
        onProgressChange?.(0);
        gsap.set(chapters, { clearProps: "all" });
      });

      // 2. Normal Motion: smooth expo animations & chapter triggers
      media.add("(prefers-reduced-motion: no-preference)", () => {
        // Overall page scroll progress
        ScrollTrigger.create({
          trigger: root,
          start: "top top",
          end: "bottom bottom",
          scrub: 0.4,
          onUpdate: (self) => onProgressChange?.(self.progress),
        });

        // Chapter active index tracking
        sections.forEach((section, index) => {
          ScrollTrigger.create({
            trigger: section,
            start: "top 60%",
            end: "bottom 40%",
            onEnter: () => onActiveSectionChange?.(index),
            onEnterBack: () => onActiveSectionChange?.(index),
          });
        });

        // Chapters 2-6 Scroll-triggered reveals. Keep the motion short and
        // directional so the artwork remains the focus during fast scrolling.
        chapters.slice(1).forEach((chapter) => {
          const panels = Array.from(
            chapter.querySelectorAll<HTMLElement>(
              "[data-manga-panel], [data-manga-caption], [data-manga-card], article, h2"
            )
          );
          if (panels.length === 0) return;

          gsap.fromTo(
            panels,
            { y: 14, opacity: 0.98, force3D: true },
            {
              y: 0,
              opacity: 1,
              duration: 0.45,
              stagger: 0.03,
              ease: "expo.out",
              clearProps: "will-change,transform",
              scrollTrigger: {
                trigger: chapter,
                start: "top 85%",
                toggleActions: "play none none none",
                once: true,
                fastScrollEnd: true,
                invalidateOnRefresh: true,
              },
            }
          );
        });
      });

      const refreshFrame = window.requestAnimationFrame(() => ScrollTrigger.refresh());
      return () => {
        window.cancelAnimationFrame(refreshFrame);
        media.revert();
      };
    }, root);

    return () => context.revert();
  }, [onActiveSectionChange, onProgressChange]);

  return (
    <div ref={rootRef} data-manga-scroll-root className="relative w-full">
      {children}
    </div>
  );
}
