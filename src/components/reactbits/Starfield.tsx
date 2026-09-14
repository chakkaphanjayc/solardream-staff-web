"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

type StarfieldProps = Readonly<{
  className?: string;
  count?: number;
  starColor?: string;
  speed?: number;
}>;

interface Star {
  x: number;
  y: number;
  size: number;
  alpha: number;
  alphaSpeed: number;
  twinklePhase: number;
}

export default function Starfield({
  className,
  count = 80,
  starColor = "255, 255, 255",
  speed = 0.5,
}: StarfieldProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let width = 0;
    let height = 0;

    const handleResize = () => {
      const rect = canvas.getBoundingClientRect();
      width = canvas.width = rect.width * (window.devicePixelRatio || 1);
      height = canvas.height = rect.height * (window.devicePixelRatio || 1);
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    // Initialize stars
    const stars: Star[] = Array.from({ length: count }, () => ({
      x: Math.random() * (width || 800),
      y: Math.random() * (height || 600),
      size: Math.random() * 2 + 0.8,
      alpha: Math.random(),
      alphaSpeed: (Math.random() * 0.02 + 0.008) * speed,
      twinklePhase: Math.random() * Math.PI * 2,
    }));

    const render = () => {
      if (!ctx || width === 0 || height === 0) return;

      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < stars.length; i++) {
        const star = stars[i];
        star.twinklePhase += star.alphaSpeed;
        const currentAlpha = 0.25 + 0.75 * Math.abs(Math.sin(star.twinklePhase));

        ctx.fillStyle = `rgba(${starColor}, ${currentAlpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();

        // Optional cross flare for larger stars
        if (star.size > 2.0 && currentAlpha > 0.7) {
          ctx.strokeStyle = `rgba(${starColor}, ${(currentAlpha * 0.35).toFixed(3)})`;
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(star.x - star.size * 2, star.y);
          ctx.lineTo(star.x + star.size * 2, star.y);
          ctx.moveTo(star.x, star.y - star.size * 2);
          ctx.lineTo(star.x, star.y + star.size * 2);
          ctx.stroke();
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [count, speed, starColor]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-0 z-10 h-full w-full select-none", className)}
    />
  );
}
