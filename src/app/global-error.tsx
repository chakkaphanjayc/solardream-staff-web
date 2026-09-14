"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import { RefreshCcw, Home, AlertTriangle } from "@/components/ui/icons";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [imageSrc, setImageSrc] = useState("/asset/solia-sorry.webp");

  useEffect(() => {
    // If a deployment update invalidated the client's Server Action hash, reload the browser to get the latest bundle.
    if (
      error.message?.includes("Failed to find Server Action") ||
      error.message?.includes("older or newer deployment")
    ) {
      window.location.reload();
      return;
    }
    console.error("Global application error caught:", error);
  }, [error]);

  const handleImageError = () => {
    if (imageSrc === "/asset/solia-sorry.webp") {
      setImageSrc("/assets/solia-sorry.png");
    }
  };

  const handleGoHome = () => {
    window.location.href = "/";
  };

  const handleReload = () => {
    window.location.reload();
  };

  return (
    <html lang="th">
      <body data-solar-ui="customer" className="min-h-screen bg-[#F0EEE9] text-slate-900 antialiased selection:bg-[#B7D1EA] selection:text-[#0F172A] [font-family:'Sarabun','Inter',sans-serif]">
        <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
          <div className="max-w-lg mx-auto flex flex-col items-center">
            {/* Solia Mascot Image Container */}
            <div className="relative w-48 h-48 sm:w-56 sm:h-56 mb-6 drop-shadow-xl">
              <Image
                src={imageSrc}
                alt="Page couldn't load"
                fill
                sizes="(max-width: 768px) 192px, 224px"
                onError={handleImageError}
                className="object-contain"
                priority
              />
            </div>

            {/* Error Status Badge */}
            <div className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-3.5 py-1 text-xs font-black text-rose-800 mb-4 border border-rose-200">
              <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
              <span>Application Error</span>
            </div>

            {/* Main Typography Header */}
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0F172A] tracking-tight mb-3">
              เกิดข้อผิดพลาดชั่วคราวในการโหลดหน้าเว็บ
            </h1>

            <p className="text-slate-600 mb-8 max-w-md text-sm sm:text-base leading-relaxed">
              ขออภัยในความไม่สะดวกค่ะ ระบบเกิดปัญหาในการโหลดข้อมูล Solia แนะนำให้ลองรีเฟรชหน้าเว็บใหม่หรือกลับสู่หน้าหลัก
            </p>

            {/* Action Buttons Group */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full max-w-md">
              <button
                type="button"
                onClick={() => reset()}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full bg-[#0F172A] px-6 py-3.5 text-xs font-extrabold text-white shadow-md hover:bg-slate-800 active:scale-95 transition-all cursor-pointer"
              >
                <RefreshCcw className="h-4 w-4 text-[#B7D1EA]" />
                <span>ลองใหม่อีกครั้ง (Try Again)</span>
              </button>

              <button
                type="button"
                onClick={handleReload}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-6 py-3.5 text-xs font-extrabold text-slate-800 shadow-2xs hover:bg-slate-50 active:scale-95 transition-all cursor-pointer"
              >
                <span>รีเฟรชหน้าเว็บ (Reload Page)</span>
              </button>

              <button
                type="button"
                onClick={handleGoHome}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full bg-[#B7D1EA] px-6 py-3.5 text-xs font-extrabold text-[#0F172A] shadow-2xs hover:bg-[#99BFE3] active:scale-95 transition-all cursor-pointer"
              >
                <Home className="h-4 w-4 text-[#0F172A]" />
                <span>หน้าหลัก (Homepage)</span>
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
