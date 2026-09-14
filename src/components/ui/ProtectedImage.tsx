"use client";

import React from "react";
import ProgressiveImage from "@/components/ui/progressive-image";
import { cn } from "@/lib/utils";

export function formatDriveImageUrl(url: string | null | undefined): string {
  if (!url) return "";
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/) || url.match(/[?&]id=([a-zA-Z0-9-_]+)/);
  if (match?.[1] && (url.includes("drive.google.com") || url.includes("googleusercontent.com"))) {
    return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w1000`;
  }
  return url;
}

interface ProtectedImageProps {
  src: string;
  alt: string;
  className?: string;
  fill?: boolean;
  sizes?: string;
  showWatermarkBadge?: boolean;
  watermarkText?: string;
  children?: React.ReactNode;
}

export function ProtectedImage({
  src,
  alt,
  className,
  fill = true,
  sizes = "100vw",
  showWatermarkBadge = true,
  watermarkText = "SOLARDREAM",
  children,
}: ProtectedImageProps) {
  const formattedSrc = formatDriveImageUrl(src);

  const handlePreventSave = (e: React.SyntheticEvent) => {
    e.preventDefault();
    return false;
  };

  return (
    <div
      onContextMenu={handlePreventSave}
      onDragStart={handlePreventSave}
      className={cn("relative overflow-hidden select-none pointer-events-auto", className)}
    >
      <ProgressiveImage
        src={formattedSrc}
        alt={alt}
        fill={fill}
        sizes={sizes}
        className="w-full h-full object-cover pointer-events-none select-none"
      />

      {/* Invisible protective overlay shield against drag/right-click */}
      <div
        onContextMenu={handlePreventSave}
        onDragStart={handlePreventSave}
        className="absolute inset-0 z-10 select-none bg-transparent"
        aria-hidden="true"
      />

      {/* Visual Watermark Overlay */}
      {showWatermarkBadge && (
        <>
          {/* Subtle Diagonal Central Watermark */}
          <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none opacity-20 select-none">
            <span className="text-white text-xs sm:text-sm font-black uppercase tracking-[0.25em] -rotate-12 drop-shadow-md">
              {watermarkText} PROTECTED
            </span>
          </div>

          {/* Bottom Right Watermark Badge */}
          <div className="absolute bottom-2 right-2 z-20 px-2 py-0.5 bg-slate-950/70 border border-white/20 text-white rounded text-[8px] sm:text-[9px] font-black uppercase tracking-wider backdrop-blur-xs pointer-events-none select-none shadow-xs">
            ⚡ {watermarkText}
          </div>
        </>
      )}

      {children}
    </div>
  );
}

export default ProtectedImage;
