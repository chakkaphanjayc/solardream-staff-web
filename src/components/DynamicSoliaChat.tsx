"use client";
// SofiaCapsule from LiquidModal available for Dynamic Island loading state

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { gsap } from "gsap";
import { cn } from "@/lib/utils";

export type DynamicSoliaChatType = "loading_calc" | "empty_cart" | "knowledge";

type DynamicSoliaChatProps = {
  type: DynamicSoliaChatType;
  pose?: string;
  className?: string;
};

const messagesByType: Record<DynamicSoliaChatType, string[]> = {
  loading_calc: [
    "กำลังคำนวณทิศทางแสงแดดที่ดีที่สุดให้บ้านคุณอยู่ค่ะ ☀️...",
    "รู้หรือไม่? แผง Jinko 1 แผง ลดคาร์บอนได้เท่ากับการปลูกต้นไม้ 10 ต้นเลยนะ! 🌳",
    "ขอ Solia จิบกาแฟแป๊บนะคะ... ล้อเล่นค่ะ! ใกล้เสร็จแล้ว ☕",
    "กำลังเช็คสเปก Inverter ให้แมตช์กับพฤติกรรมการใช้ไฟของคุณอยู่ค่ะ ⚡",
  ],
  empty_cart: [
    "ตระกร้ายังว่างอยู่เลย ให้ Solia ช่วยแนะนำสินค้าให้ไหมคะ?",
  ],
  knowledge: [
    "Solia พร้อมช่วยอธิบายข้อมูลพลังงานแสงอาทิตย์ให้เข้าใจง่ายขึ้นค่ะ",
    "เริ่มจากพฤติกรรมการใช้ไฟของบ้านคุณ แล้วค่อยเลือกขนาดระบบที่พอดีที่สุดนะคะ",
    "หลังคาที่ดีไม่จำเป็นต้องใหญ่ที่สุด แต่ต้องรับแดดได้สม่ำเสมอค่ะ",
  ],
};

const assetAliases: Record<string, string> = {
  "/solia-greeting.webp": "/asset/solia-greeting.webp",
  "/solia-pointing.webp": "/asset/solia-pointing.webp",
  "/solia-presenting.webp": "/asset/solia-presenting.webp",
  "/solia-blueprint.webp": "/asset/solia-blueprint.webp",
  "/solia-thinking.webp": "/asset/solia-thinking.webp",
  "/solia-miffed.webp": "/asset/solia-miffed.webp",
  "solia-greeting.png": "/asset/solia-greeting.webp",
  "solia-pointing.png": "/asset/solia-pointing.webp",
  "solia-presenting.png": "/asset/solia-presenting.webp",
  "solia-blueprint.png": "/asset/solia-blueprint.webp",
  "solia-thinking.png": "/asset/solia-thinking.webp",
  "solia-miffed.png": "/asset/solia-miffed.webp",
};

function resolvePosePath(pose: string) {
  if (assetAliases[pose]) {
    return assetAliases[pose];
  }

  if (pose.startsWith("/")) {
    return pose;
  }

  return `/asset/${pose}`;
}

export default function DynamicSoliaChat({
  type,
  pose = "/solia-thinking.webp",
  className,
}: DynamicSoliaChatProps) {
  const [messageIndex, setMessageIndex] = useState(0);
  const mascotRef = useRef<HTMLDivElement | null>(null);
  const imageLayerRef = useRef<HTMLDivElement | null>(null);
  const messageRef = useRef<HTMLParagraphElement | null>(null);
  const messages = messagesByType[type];
  const activeMessageIndex = messageIndex % messages.length;
  const posePath = useMemo(() => resolvePosePath(pose), [pose]);

  useEffect(() => {
    const mascot = mascotRef.current;
    if (!mascot) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) return;

    const context = gsap.context(() => {
      gsap.to(mascot, {
        y: -4,
        duration: 1.5,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      });
    }, mascot);

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

  useEffect(() => {
    const message = messageRef.current;
    if (!message) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const context = gsap.context(() => {
      gsap.fromTo(
        message,
        {
          autoAlpha: prefersReducedMotion ? 1 : 0,
          y: prefersReducedMotion ? 0 : 10,
        },
        {
          autoAlpha: 1,
          y: 0,
          duration: prefersReducedMotion ? 0.08 : 0.28,
          ease: "power2.out",
        },
      );
    }, message);

    return () => context.revert();
  }, [activeMessageIndex, type]);

  useEffect(() => {
    if (messages.length <= 1) return;

    const intervalId = window.setInterval(() => {
      setMessageIndex((current) => (current + 1) % messages.length);
    }, 3500);

    return () => window.clearInterval(intervalId);
  }, [messages.length, type]);

  return (
    <div className={cn("flex flex-col items-center gap-4 text-center", className)}>
      <div
        ref={mascotRef}
        className="relative h-[120px] w-[120px] lg:h-[160px] lg:w-[160px]"
      >
        <div
          ref={imageLayerRef}
          key={posePath}
          className="absolute inset-0"
        >
          <Image
            src={posePath}
            alt="Solia smart assistant"
            fill
            sizes="(max-width: 1024px) 120px, 160px"
            className="object-contain drop-shadow-[0_16px_22px_rgba(15,23,42,0.14)]"
            priority={type === "loading_calc"}
          />
        </div>
      </div>

      <div className="relative max-w-sm rounded-[24px] border border-[#F7F6F3] bg-[#F0EEE9] p-4 text-xs font-bold leading-relaxed text-[#2E2C27] shadow-md sm:max-w-md sm:p-5 sm:text-sm">
        <div className="absolute -top-2 left-1/2 size-3.5 -translate-x-1/2 rotate-45 border-l border-t border-[#F7F6F3] bg-[#F0EEE9]" />
        <p ref={messageRef} key={`${type}-${activeMessageIndex}`}>
          {messages[activeMessageIndex]}
        </p>
      </div>
    </div>
  );
}
