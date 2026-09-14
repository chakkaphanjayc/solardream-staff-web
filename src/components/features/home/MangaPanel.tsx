import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type MangaTone = "paper" | "blue" | "ink" | "sun" | "blueprint";

export type MangaPanelProps = HTMLAttributes<HTMLDivElement> & Readonly<{
  children?: ReactNode;
  tone?: MangaTone;
  cutCorner?: "none" | "top-right" | "bottom-right" | "both";
  interactive?: boolean;
}>;

const toneClasses: Record<MangaTone, string> = {
  paper: "bg-[#F0EEE9] text-[#0F172A]",
  blue: "bg-[#B7D1EA] text-[#0F172A]",
  ink: "bg-[#0F172A] text-[#F0EEE9]",
  sun: "bg-[#F59E0B] text-[#0F172A]",
  blueprint: "bg-[#0F172A] text-[#B7D1EA] border-[#B7D1EA]",
};

export function MangaPanel({
  children,
  className,
  tone = "paper",
  cutCorner = "none",
  interactive = false,
  ...props
}: MangaPanelProps) {
  return (
    <div
      data-manga-panel
      className={cn(
        "relative overflow-hidden rounded-2xl border-2 border-[#0F172A] shadow-[3px_3px_0_#0F172A] transition-all duration-300",
        interactive && "hover:-translate-y-1 hover:shadow-[4px_4px_0_#0F172A] focus-within:-translate-y-1 focus-within:shadow-[4px_4px_0_#0F172A]",
        cutCorner === "top-right" && "[clip-path:polygon(0_0,calc(100%-1.25rem)_0,100%_1.25rem,100%_100%,0_100%)]",
        cutCorner === "bottom-right" && "[clip-path:polygon(0_0,100%_0,100%_calc(100%-1.25rem),calc(100%-1.25rem)_100%,0_100%)]",
        cutCorner === "both" && "[clip-path:polygon(0_0,calc(100%-1.25rem)_0,100%_1.25rem,100%_calc(100%-1.25rem),calc(100%-1.25rem)_100%,0_100%)]",
        toneClasses[tone],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function MangaCaption({
  children,
  className,
  tone = "paper",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: "paper" | "blue" | "sun" | "ink" }) {
  const captionToneClasses = {
    paper: "bg-[#F0EEE9] text-[#0F172A] border-[#0F172A]",
    blue: "bg-[#B7D1EA] text-[#0F172A] border-[#0F172A]",
    sun: "bg-[#F59E0B] text-[#0F172A] border-[#0F172A]",
    ink: "bg-[#0F172A] text-[#F0EEE9] border-[#F0EEE9]/40",
  };

  return (
    <span
      data-manga-caption
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1 text-[0.68rem] font-black tracking-[0.1em] shadow-[2px_2px_0_#0F172A]",
        captionToneClasses[tone],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
