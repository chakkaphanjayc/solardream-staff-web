"use client";

import { useRef, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type SpotlightCardProps = Readonly<{
  children: ReactNode;
  className?: string;
  spotlightColor?: string;
  onClick?: () => void;
}>;

export default function SpotlightCard({
  children,
  className,
  spotlightColor = "rgba(183, 209, 234, 0.25)",
  onClick,
}: SpotlightCardProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch" || !cardRef.current) return;

    const rect = cardRef.current.getBoundingClientRect();
    cardRef.current.style.setProperty("--spotlight-x", `${event.clientX - rect.left}px`);
    cardRef.current.style.setProperty("--spotlight-y", `${event.clientY - rect.top}px`);
  };

  const handlePointerLeave = () => {
    cardRef.current?.style.setProperty("--spotlight-x", "50%");
    cardRef.current?.style.setProperty("--spotlight-y", "50%");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onClick || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    onClick();
  };

  return (
    <div
      ref={cardRef}
      data-bagui="card"
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      style={{
        "--spotlight-color": spotlightColor,
        "--spotlight-x": "50%",
        "--spotlight-y": "50%",
      } as CSSProperties}
      className={cn(
        "group relative overflow-hidden",
        onClick && "cursor-pointer",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-within:opacity-100"
        style={{
          background: "radial-gradient(400px circle at var(--spotlight-x) var(--spotlight-y), var(--spotlight-color), transparent 72%)",
        }}
      />
      <div className="relative z-10 h-full w-full">{children}</div>
    </div>
  );
}
