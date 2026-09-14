"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { ArrowLeft, RefreshCw, Wrench } from "@/components/ui/icons";

type MaintenanceViewProps = {
  featureName?: string;
  title?: string;
  subtext?: string;
  homeLink?: string;
  locale?: string;
};

export default function MaintenanceView({
  featureName,
  title,
  subtext,
  homeLink = "/",
  locale: propLocale,
}: MaintenanceViewProps) {
  let activeLocale = propLocale;

  try {
    // Attempt to use next-intl context if available
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const contextLocale = useLocale();
    if (!activeLocale && contextLocale) {
      activeLocale = contextLocale;
    }
  } catch {
    // Fall back to window location or default
  }

  if (!activeLocale && typeof window !== "undefined") {
    activeLocale = window.location.pathname.startsWith("/en") ? "en" : "th";
  }
  activeLocale = activeLocale || "th";

  const isEn = activeLocale === "en";

  const displayTitle =
    title ?? (isEn ? "System Under Maintenance" : "ระบบกำลังอยู่ในช่วงปรับปรุง");
  const displaySubtext =
    subtext ??
    (isEn
      ? "Solia and our engineering team are currently upgrading this feature to make it even better. Please check back later."
      : "Solia และทีมวิศวกรกำลังอัปเกรดฟีเจอร์นี้ให้ดียิ่งขึ้น กรุณากลับมาใช้งานใหม่ในภายหลังนะคะ");

  const [imageSrc, setImageSrc] = useState("/asset/solia-construction.webp");

  const handleImageError = () => {
    if (imageSrc === "/asset/solia-construction.webp") {
      setImageSrc("/assets/solia-construction.png");
    } else if (imageSrc === "/assets/solia-construction.png") {
      setImageSrc("/asset/solia-sorry.webp");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8 bg-[#E6E3DC] text-[#2E2C27] rounded-[28px] border border-[#F7F6F3] transition-all duration-300 antialiased selection:bg-[#DCE8F5] selection:text-[#2E2C27]">
      {/* Solia Construction Mascot */}
      <div className="relative mb-8 group">
        {/* Background glow */}
        <div className="absolute inset-0 bg-[#B7D1EA]/15 rounded-full blur-2xl transform scale-75 group-hover:scale-95 transition-transform duration-500" />

        {/* Mascot Image */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageSrc}
          alt="Under Maintenance"
          onError={handleImageError}
          className="relative h-64 w-auto animate-float-soft drop-shadow-xl object-contain"
        />

        {/* Engineering Badge */}
        <div className="absolute -bottom-2 right-4 flex items-center gap-1.5 bg-[#2E2C27] text-[#A5C2DE] px-3 py-1.5 rounded-full text-xs font-bold shadow-lg border border-[#A5C2DE]/20 font-mono">
          <Wrench className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: "8s" }} />
          <span>{isEn ? "System Upgrade" : "ปรับปรุงระบบ (System Upgrade)"}</span>
        </div>
      </div>

      {/* Typography */}
      <h1 className="text-3xl md:text-4xl font-extrabold text-[#2E2C27] tracking-tight font-sans">
        {displayTitle}
      </h1>

      {featureName && (
        <span className="mt-2 inline-block px-3 py-1 bg-[#DCE8F5] text-[#2E2C27] text-xs font-bold rounded-full font-mono">
          [{featureName}]
        </span>
      )}

      <p className="text-[#4E4B44] mt-4 max-w-md text-base leading-relaxed font-sans">
        {displaySubtext}
      </p>

      {/* Action Buttons */}
      <div className="mt-8 flex flex-col sm:flex-row items-center gap-4 font-sans">
        <Link
          href={homeLink}
          className="inline-flex items-center gap-2 rounded-full bg-[#B7D1EA] px-6 py-3 text-sm font-bold text-white shadow-md transition-all hover:bg-[#A5C2DE] hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 focus:outline-none focus:ring-2 focus:ring-[#B7D1EA] focus:ring-offset-2 active:scale-95"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{isEn ? "Back to Home" : "กลับสู่หน้าหลัก (Back to Home)"}</span>
        </Link>

        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 rounded-full bg-[#F0EEE9] border border-[#CBC7BE] px-5 py-3 text-sm font-bold text-[#2E2C27] shadow-sm transition-all hover:bg-[#DCE8F5] cursor-pointer active:scale-95"
        >
          <RefreshCw className="w-4 h-4" />
          <span>{isEn ? "Try Again" : "ลองใหม่อีกครั้ง"}</span>
        </button>
      </div>
    </div>
  );
}
