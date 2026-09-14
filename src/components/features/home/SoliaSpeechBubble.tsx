"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { gsap } from "gsap";
import { cn } from "@/lib/utils";
import type { HomeWeatherId } from "@/types/home";

const SPEECH_TEXT: Record<HomeWeatherId, { th: string; en: string }> = {
  sunny: { th: "☀️ แดดดีมาก!", en: "☀️ Great sun today!" },
  cloudy: { th: "☁️ มีเมฆมาแล้ว", en: "☁️ Cloudy skies!" },
  rainy: { th: "🌧️ ฝนตกนะ", en: "🌧️ It's raining!" },
  night: { th: "🌙 กลางคืนแล้ว", en: "🌙 Night mode!" },
};

type SoliaSpeechBubbleProps = {
  weatherId: HomeWeatherId;
  locale?: string;
  className?: string;
};

export default function SoliaSpeechBubble({
  weatherId,
  locale = "th",
  className,
}: SoliaSpeechBubbleProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLSpanElement | null>(null);
  const speech = SPEECH_TEXT[weatherId] ?? SPEECH_TEXT.sunny;
  const label = locale === "th" ? speech.th : speech.en;

  useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof window === "undefined") return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      gsap.set(element, { opacity: 1, scale: 1, y: 0 });
      return;
    }

    gsap.fromTo(
      element,
      { scale: 0.92, opacity: 0, y: 12 },
      { scale: 1, opacity: 1, y: 0, duration: 0.55, ease: "expo.out", delay: 0.7 }
    );

    const timeline = gsap.timeline({ repeat: -1, yoyo: true });
    timeline.to(element, { y: -4, duration: 1.6, ease: "sine.inOut" });

    return () => {
      timeline.kill();
    };
  }, []);

  useEffect(() => {
    const text = textRef.current;
    if (!text || typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    gsap.fromTo(
      text,
      { scale: 0.94, opacity: 0.4 },
      { scale: 1, opacity: 1, duration: 0.3, ease: "expo.out" }
    );
  }, [weatherId]);

  return (
    <div
      ref={containerRef}
      className={cn("flex flex-col items-center gap-1 opacity-0", className)}
      aria-label={label}
      role="note"
    >
      <div className="relative rounded-xl border-2 border-[#0F172A] bg-[#F0EEE9] px-3 py-2 shadow-[2px_2px_0_#0F172A]">
        <span ref={textRef} className="block whitespace-nowrap text-[11px] font-black leading-none text-[#0F172A]">
          {label}
        </span>
        <span
          aria-hidden="true"
          className="absolute -bottom-[9px] left-1/2 h-0 w-0 -translate-x-1/2"
          style={{
            borderLeft: "6px solid transparent",
            borderRight: "6px solid transparent",
            borderTop: "7px solid #0F172A",
          }}
        />
        <span
          aria-hidden="true"
          className="absolute -bottom-[6px] left-1/2 h-0 w-0 -translate-x-1/2"
          style={{
            borderLeft: "4px solid transparent",
            borderRight: "4px solid transparent",
            borderTop: "6px solid #F0EEE9",
          }}
        />
      </div>

      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full border-2 border-[#0F172A] bg-white shadow-[2px_2px_0_#0F172A]">
        <Image
          src="/asset/solia-sunglasses.webp"
          alt="Solia SolarDream mascot"
          fill
          sizes="56px"
          className="scale-125 object-cover object-top"
        />
      </div>
    </div>
  );
}
