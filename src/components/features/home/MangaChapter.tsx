import type { ReactNode } from "react";
import { motion, type HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";
import type { HomeChapterId } from "@/types/home";

export type MangaChapterVariant = "light" | "blue" | "ink" | "sun" | "blueprint";

type MangaChapterProps = HTMLMotionProps<"div"> & Readonly<{
  children?: ReactNode;
  chapter: HomeChapterId;
  chapterNumber?: number;
  chapterTitle?: string;
  variant?: MangaChapterVariant;
}>;

const variantClasses: Record<MangaChapterVariant, string> = {
  light: "bg-[#F0EEE9] text-[#0F172A]",
  blue: "bg-[#B7D1EA] text-[#0F172A]",
  ink: "bg-[#0F172A] text-[#F0EEE9]",
  sun: "bg-[#F59E0B] text-[#0F172A]",
  blueprint: "bg-[#0F172A] text-[#F0EEE9]",
};

const labelVariantClasses: Record<MangaChapterVariant, string> = {
  light: "bg-white text-[#0F172A] border-[#0F172A] shadow-[2px_2px_0_#0F172A]",
  blue: "bg-[#0F172A] text-[#F0EEE9] border-[#0F172A] shadow-[2px_2px_0_#0F172A]",
  ink: "bg-[#F0EEE9] text-[#0F172A] border-[#F0EEE9] shadow-[2px_2px_0_rgb(240_238_233_/_0.28)]",
  sun: "bg-[#0F172A] text-[#F0EEE9] border-[#0F172A] shadow-[2px_2px_0_rgb(15_23_42_/_0.25)]",
  blueprint: "bg-[#B7D1EA]/20 text-[#B7D1EA] border-[#B7D1EA]/50 shadow-[2px_2px_0_rgb(183_209_234_/_0.2)]",
};

const chapterNumClasses: Record<MangaChapterVariant, string> = {
  light: "text-[#F59E0B]",
  blue: "text-[#F59E0B]",
  ink: "text-[#F59E0B]",
  sun: "text-[#F59E0B]",
  blueprint: "text-[#B7D1EA]",
};

export function MangaChapter({
  children,
  chapter,
  chapterNumber,
  chapterTitle,
  className,
  id,
  variant = "light",
  ...props
}: MangaChapterProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      id={id ?? `chapter-${chapter}`}
      data-manga-chapter={chapter}
      className={cn(
        "relative isolate w-full scroll-mt-24 overflow-hidden border-t-2 border-[#0F172A]",
        variantClasses[variant],
        className
      )}
      {...props}
    >
      {/* Manga Screentone Halftone Background */}
      <div aria-hidden="true" className="manga-chapter-halftone pointer-events-none absolute inset-0 opacity-25" />

      {/* Subtle speed-lines for ink variant */}
      {variant === "ink" && (
        <div aria-hidden="true" className="manga-chapter-speedlines pointer-events-none absolute inset-0" />
      )}

      {chapterNumber && chapterTitle ? (
        <div className="relative z-20 mx-auto max-w-7xl px-4 pt-10 sm:px-6 lg:px-8">
          <div
            className={cn(
              "inline-flex items-center gap-2 rounded-xl border-2 px-3.5 py-1.5 text-[0.68rem] font-black tracking-[0.08em]",
              labelVariantClasses[variant]
            )}
          >
            <span className={cn("tabular-nums", chapterNumClasses[variant])}>
              CH.0{chapterNumber}
            </span>
            <span className="opacity-40">/</span>
            <span className="font-extrabold tracking-wide">{chapterTitle}</span>
          </div>
        </div>
      ) : null}

      <div className="relative z-10">{children}</div>
    </motion.div>
  );
}
