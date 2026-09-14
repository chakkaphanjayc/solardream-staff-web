"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "@/components/ui/icons";

type NotFoundViewProps = {
  homeUrl?: string;
  autoRedirectSeconds?: number;
};

export default function NotFoundView({
  homeUrl = "/",
  autoRedirectSeconds = 5,
}: NotFoundViewProps) {
  const [seconds, setSeconds] = useState(autoRedirectSeconds);
  const [imageSrc, setImageSrc] = useState("/asset/solia-sorry.webp");
  const [resolvedHomeUrl, setResolvedHomeUrl] = useState(homeUrl);

  const handleImageError = () => {
    if (imageSrc === "/asset/solia-sorry.webp") {
      setImageSrc("/assets/solia-sorry.png");
    }
  };

  useEffect(() => {
    let targetUrl = homeUrl;
    if (typeof window !== "undefined" && homeUrl === "/") {
      if (window.location.pathname.startsWith("/en")) {
        targetUrl = "/en";
      } else if (window.location.pathname.startsWith("/th")) {
        targetUrl = "/th";
      }
    }
    setResolvedHomeUrl(targetUrl);

    const countdownInterval = setInterval(() => {
      setSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    const redirectTimer = setTimeout(() => {
      window.location.href = targetUrl;
    }, autoRedirectSeconds * 1000);

    return () => {
      clearInterval(countdownInterval);
      clearTimeout(redirectTimer);
    };
  }, [homeUrl, autoRedirectSeconds]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#F0EEE9] p-6 text-center antialiased selection:bg-[#DCE8F5] selection:text-[#2E2C27]">
      <div className="max-w-lg mx-auto flex flex-col items-center">
        {/* Constrained Mascot Image Container */}
        <div className="relative w-56 h-56 md:w-64 md:h-64 mb-8 drop-shadow-xl animate-float-soft">
          <Image
            src={imageSrc}
            alt="Page Not Found"
            fill
            sizes="(max-width: 768px) 224px, 256px"
            onError={handleImageError}
            className="object-contain"
            priority
          />
        </div>

        {/* 404 Header & Typography */}
        <h1 className="text-7xl md:text-8xl font-black text-[#2E2C27] tracking-tighter mb-2 font-sans">
          404
        </h1>

        <h2 className="text-2xl md:text-3xl font-extrabold text-[#2E2C27] mb-4 font-sans">
          ขออภัยค่ะ ไม่พบหน้านี้
        </h2>

        <p className="text-[#4E4B44] mb-8 max-w-md text-base leading-relaxed font-sans">
          เส้นทางที่คุณกำลังค้นหาไม่มีอยู่ในระบบ Solia กำลังพากลับสู่หน้าหลักใน{" "}
          <span className="bg-[#DCE8F5] text-[#2E2C27] font-bold px-2 py-0.5 mx-1 rounded-full font-mono">
            {seconds}
          </span>{" "}
          วินาที...
        </p>

        {/* Manual Escape Hatch CTA Button */}
        <a
          href={resolvedHomeUrl}
          className="bg-[#B7D1EA] hover:bg-[#A5C2DE] text-white font-bold py-3.5 px-8 rounded-full transition-all duration-300 shadow-md flex items-center gap-2 group font-sans focus:outline-none focus:ring-2 focus:ring-[#B7D1EA] focus:ring-offset-2 cursor-pointer active:scale-95"
        >
          <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          <span>กลับสู่หน้าหลักทันที (Go to Homepage)</span>
        </a>
      </div>
    </div>
  );
}
