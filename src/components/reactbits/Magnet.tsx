"use client";

import { useRef, useState, MouseEvent } from "react";
import { cn } from "@/lib/utils";

type MagnetProps = Readonly<{
  children: React.ReactNode;
  className?: string;
  strength?: number;
}>;

export default function Magnet({
  children,
  className,
  strength = 0.3,
}: MagnetProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return;
    const { left, top, width, height } = ref.current.getBoundingClientRect();
    const x = (e.clientX - (left + width / 2)) * strength;
    const y = (e.clientY - (top + height / 2)) * strength;
    setPosition({ x, y });
  };

  const handleMouseLeave = () => {
    setPosition({ x: 0, y: 0 });
  };

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
        transition: position.x === 0 && position.y === 0 ? "transform 0.45s cubic-bezier(0.16, 1, 0.3, 1)" : "transform 0.1s ease-out",
      }}
      className={cn("inline-block", className)}
    >
      {children}
    </div>
  );
}
