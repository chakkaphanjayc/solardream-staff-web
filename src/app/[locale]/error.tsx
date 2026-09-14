"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { RefreshCcw, Home, AlertCircle } from "@/components/ui/icons";

export default function Error({
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
    console.error("Locale route error caught:", error);
  }, [error]);

  const handleImageError = () => {
    if (imageSrc === "/asset/solia-sorry.webp") {
      setImageSrc("/assets/solia-sorry.png");
    }
  };

  const handleGoHome = () => {
    let targetUrl = "/";
    if (typeof window !== "undefined") {
      if (window.location.pathname.startsWith("/en")) targetUrl = "/en";
      else if (window.location.pathname.startsWith("/th")) targetUrl = "/th";
    }
    window.location.href = targetUrl;
  };

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 py-16 text-center antialiased selection:bg-[#DCE8F5] selection:text-[#2E2C27]">
      <div className="max-w-lg mx-auto flex flex-col items-center">
        {/* Mascot Image Container */}
        <div className="relative w-44 h-44 sm:w-52 sm:h-52 mb-6 drop-shadow-xl animate-float-soft">
          <Image
            src={imageSrc}
            alt="Page Error"
            fill
            sizes="(max-width: 768px) 176px, 208px"
            onError={handleImageError}
            className="object-contain"
            priority
          />
        </div>

        {/* Error Badge */}
        <div className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3.5 py-1 text-xs font-bold text-rose-700 mb-3 border border-rose-200">
          <AlertCircle className="h-3.5 w-3.5 text-rose-600" />
          <span>เกิดข้อผิดพลาดขึ้นชั่วคราว (Page Error)</span>
        </div>

        <h2 className="text-2xl sm:text-3xl font-extrabold text-[#2E2C27] tracking-tight mb-2">
          ไม่สามารถโหลดข้อมูลในหน้านี้ได้
        </h2>
        <p className="text-[#4E4B44] mb-8 max-w-md text-sm sm:text-base leading-relaxed">
          ระบบขัดข้องชั่วคราวขณะประมวลผลข้อมูล กรุณาลองใหม่อีกครั้ง หรือกลับสู่หน้าหลัก
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full max-w-md">
          <button
            type="button"
            onClick={() => reset()}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full bg-[#B7D1EA] px-6 py-3.5 text-xs font-bold text-white shadow-md hover:bg-[#A5C2DE] active:scale-95 transition cursor-pointer"
          >
            <RefreshCcw className="h-4 w-4 text-white" />
            <span>ลองใหม่อีกครั้ง (Try Again)</span>
          </button>

          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full border border-[#CBC7BE] bg-[#F0EEE9] px-6 py-3.5 text-xs font-bold text-[#2E2C27] shadow-sm hover:bg-[#E6E3DC] active:scale-95 transition cursor-pointer"
          >
            <span>รีเฟรชเบราว์เซอร์</span>
          </button>

          <button
            type="button"
            onClick={handleGoHome}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full bg-[#DCE8F5] px-6 py-3.5 text-xs font-bold text-[#2E2C27] shadow-sm hover:bg-[#DBCDEE] active:scale-95 transition cursor-pointer"
          >
            <Home className="h-4 w-4 text-[#2E2C27]" />
            <span>หน้าหลัก</span>
          </button>
        </div>
      </div>
    </div>
  );
}
