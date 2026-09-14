"use client";

import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

type HomeSnapScrollerProps = Readonly<{
  children: ReactNode;
  onActiveSectionChange?: (index: number) => void;
  onProgressChange?: (progress: number) => void;
}>;

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

export default function HomeSnapScroller({
  children,
  onActiveSectionChange,
  onProgressChange,
}: HomeSnapScrollerProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    if (typeof window !== "undefined") {
      gsap.registerPlugin(ScrollTrigger);
    }

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const sections = Array.from(scroller.querySelectorAll<HTMLElement>("[data-home-snap-section]"));

    if (prefersReducedMotion) {
      onActiveSectionChange?.(0);
      onProgressChange?.(0);
      return;
    }

    const context = gsap.context(() => {
      gsap.set(sections, { position: "relative", zIndex: 1, isolation: "isolate" });

      // Global Scroll Progress Tracker
      ScrollTrigger.create({
        trigger: sections[0] ?? scroller,
        endTrigger: sections[sections.length - 1] ?? scroller,
        start: "top top",
        end: "bottom bottom",
        scrub: 0.5,
        onUpdate: (self) => {
          onProgressChange?.(self.progress);
        },
      });

      sections.forEach((section, index) => {
        const isCinematicShowcase = Boolean(section.querySelector("[data-cinematic-showcase]")) || Boolean(section.closest("[data-cinematic-showcase]"));
        const content = section.querySelector<HTMLElement>(".tabletScaleContent") || section.firstElementChild as HTMLElement || section;
        const headings = Array.from(section.querySelectorAll<HTMLElement>("h1, h2, [data-snap-heading]")).filter((element) => !element.closest("[data-cinematic-showcase]"));
        const cards = Array.from(section.querySelectorAll<HTMLElement>("article, [data-snap-card], a.motion-lift, .motion-lift")).filter((element) => !element.closest("[data-cinematic-showcase]"));
        const parallaxItems = Array.from(section.querySelectorAll<HTMLElement>("[data-parallax]")).filter((element) => !element.closest("[data-cinematic-showcase]"));

        // Active Section Detection (handles both scroll down and scroll up smoothly)
        ScrollTrigger.create({
          trigger: section,
          start: "top 50%",
          end: "bottom 50%",
          onEnter: () => onActiveSectionChange?.(index),
          onEnterBack: () => onActiveSectionChange?.(index),
        });

        // Polished Staggered Entrance Reveal for non-cinematic sections
        if (!isCinematicShowcase && index > 0) {
          const targets = [content, ...headings, ...cards].filter(Boolean);
          
          if (content) {
            gsap.set(content, {
              transformOrigin: "center center",
              willChange: "transform, opacity",
              force3D: true,
            });

            // Smooth entrance reveal that restores perfectly on scroll up
            gsap.fromTo(
              content,
              {
                opacity: 0,
                y: 32,
                scale: 0.98,
              },
              {
                opacity: 1,
                y: 0,
                scale: 1,
                duration: 0.7,
                ease: "power3.out",
                scrollTrigger: {
                  trigger: section,
                  start: "top 88%",
                  end: "top 35%",
                  toggleActions: "play none none none",
                  invalidateOnRefresh: true,
                },
              },
            );
          }

          // Subtle stagger for card items
          if (cards.length > 0) {
            gsap.fromTo(
              cards,
              {
                opacity: 0,
                y: 24,
              },
              {
                opacity: 1,
                y: 0,
                duration: 0.6,
                stagger: 0.08,
                ease: "power3.out",
                scrollTrigger: {
                  trigger: section,
                  start: "top 80%",
                  toggleActions: "play none none none",
                  invalidateOnRefresh: true,
                },
              },
            );
          }
        }

        // Parallax Items: gentle depth float without clipping
        parallaxItems.forEach((item) => {
          const speed = Number(item.dataset.parallax) || 12;
          gsap.fromTo(
            item,
            { y: speed * -1.5 },
            {
              y: speed * 1.5,
              ease: "none",
              scrollTrigger: {
                trigger: section,
                start: "top bottom",
                end: "bottom top",
                scrub: 0.6,
                invalidateOnRefresh: true,
              },
            },
          );
        });
      });
    }, scroller);

    const refreshFrame = window.requestAnimationFrame(() => ScrollTrigger.refresh());
    const refreshTimeout = window.setTimeout(() => ScrollTrigger.refresh(), 350);

    return () => {
      window.cancelAnimationFrame(refreshFrame);
      window.clearTimeout(refreshTimeout);
      context.revert();
    };
  }, [onActiveSectionChange, onProgressChange]);

  return (
    <div
      ref={scrollerRef}
      data-cinematic-scroll-root
      className="relative w-full bg-[#F0EEE9]"
    >
      {children}
    </div>
  );
}
