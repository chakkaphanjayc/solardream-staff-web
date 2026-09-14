"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { cn } from "@/lib/utils";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

type SoliaGuideProps = {
  message: string;
  pose?: string;
  position?: "left" | "right";
  className?: string;
};

const SOLIA_ASSET_ALIASES: Record<string, string> = {
  "solia-greeting.png": "solia-greeting.webp",
  "solia-pointing.png": "solia-pointing.webp",
  "solia-presenting.png": "solia-presenting.webp",
  "solia-thinking.png": "solia-thinking.webp",
  "solia-blueprint.png": "solia-blueprint.webp",
  "solia-miffed.png": "solia-miffed.webp",
  "solia-greeting.webp": "solia-greeting.webp",
  "solia-pointing.webp": "solia-pointing.webp",
  "solia-presenting.webp": "solia-presenting.webp",
  "solia-thinking.webp": "solia-thinking.webp",
  "solia-blueprint.webp": "solia-blueprint.webp",
  "solia-miffed.webp": "solia-miffed.webp",
};

function resolvePosePath(pose: string) {
  if (pose.startsWith("/")) {
    return pose;
  }

  return `/asset/${SOLIA_ASSET_ALIASES[pose] ?? pose}`;
}

export default function SoliaGuide({
  message,
  pose = "solia-presenting.png",
  position = "left",
  className,
}: SoliaGuideProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const mascotRef = useRef<HTMLDivElement | null>(null);
  const imageLayerRef = useRef<HTMLDivElement | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const mascotFirst = position === "left";
  const posePath = resolvePosePath(pose);

  useEffect(() => {
    const root = rootRef.current;
    const mascot = mascotRef.current;
    const bubble = bubbleRef.current;
    if (!root || !mascot || !bubble) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const context = gsap.context(() => {
      gsap.fromTo(
        root,
        {
          autoAlpha: 0,
          y: prefersReducedMotion ? 0 : 20,
        },
        {
          autoAlpha: 1,
          y: 0,
          duration: prefersReducedMotion ? 0.18 : 0.45,
          ease: "power3.out",
          scrollTrigger: {
            trigger: root,
            start: "top 88%",
            toggleActions: "play none none reverse",
            once: true,
          },
        },
      );

      gsap.fromTo(
        bubble,
        {
          autoAlpha: 0,
          y: prefersReducedMotion ? 0 : 6,
        },
        {
          autoAlpha: 1,
          y: 0,
          duration: prefersReducedMotion ? 0.18 : 0.35,
          delay: prefersReducedMotion ? 0 : 0.2,
          ease: "power2.out",
          scrollTrigger: {
            trigger: root,
            start: "top 88%",
            toggleActions: "play none none reverse",
            once: true,
          },
        },
      );

      if (!prefersReducedMotion) {
        gsap.to(mascot, {
          y: -5,
          duration: 1.6,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
        });
      }
    }, root);

    return () => context.revert();
  }, []);

  useEffect(() => {
    const imageLayer = imageLayerRef.current;
    if (!imageLayer) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const context = gsap.context(() => {
      gsap.fromTo(
        imageLayer,
        { autoAlpha: prefersReducedMotion ? 1 : 0 },
        {
          autoAlpha: 1,
          duration: prefersReducedMotion ? 0.08 : 0.22,
          ease: "power2.out",
        },
      );
    }, imageLayer);

    return () => context.revert();
  }, [posePath]);

  return (
    <div
      ref={rootRef}
      className={cn(
        "flex items-end gap-3",
        mascotFirst ? "flex-row" : "flex-row-reverse",
        className
      )}
    >
      <div
        ref={mascotRef}
        className="relative h-28 w-28 shrink-0"
      >
        <div ref={imageLayerRef} key={posePath} className="absolute inset-0">
          <Image
            src={posePath}
            alt="Solia smart assistant"
            fill
            sizes="112px"
            className="object-contain drop-shadow-[0_14px_18px_rgba(15,23,42,0.12)]"
            priority={false}
          />
        </div>
      </div>

      <div
        ref={bubbleRef}
        className="relative bg-[#F0EEE9] border border-[#F7F6F3] shadow-md rounded-[20px] p-4 text-sm text-[#2E2C27] font-medium max-w-[260px]"
      >
        <span
          aria-hidden="true"
          className={cn(
            "absolute bottom-6 h-3 w-3 rotate-45 bg-[#F0EEE9] border-[#F7F6F3]",
            mascotFirst
              ? "-left-1.5 border-b border-l"
              : "-right-1.5 border-t border-r"
          )}
        />
        <p className="relative leading-6">{message}</p>
      </div>
    </div>
  );
}
