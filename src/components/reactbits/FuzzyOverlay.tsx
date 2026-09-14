"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

type FuzzyOverlayProps = Readonly<{
  className?: string;
  opacity?: number;
}>;

export default function FuzzyOverlay({
  className,
  opacity = 0.12,
}: FuzzyOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = 128);
    let height = (canvas.height = 128);

    const generateNoise = () => {
      const imgData = ctx.createImageData(width, height);
      const data = imgData.data;
      const len = data.length;

      for (let i = 0; i < len; i += 4) {
        const shade = Math.floor(Math.random() * 255);
        data[i] = shade;     // r
        data[i + 1] = shade; // g
        data[i + 2] = shade; // b
        data[i + 3] = Math.floor(Math.random() * 45); // subtle alpha
      }

      ctx.putImageData(imgData, 0, 0);
    };

    let count = 0;
    const loop = () => {
      count++;
      if (count % 3 === 0) {
        generateNoise();
      }
      animationFrameId = requestAnimationFrame(loop);
    };

    loop();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 z-[1] h-full w-full overflow-hidden select-none",
        className,
      )}
      style={{ opacity }}
    >
      <canvas
        ref={canvasRef}
        className="h-full w-full [image-rendering:pixelated] [background-size:128px_128px] [background-repeat:repeat]"
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />
    </div>
  );
}
