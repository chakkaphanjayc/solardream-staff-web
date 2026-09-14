"use client";

import type { HomeChapterId } from "@/types/home";
import { cn } from "@/lib/utils";

type HomeChapterRailProps = Readonly<{
  activeChapter: number;
  locale: string;
}>;

const CHAPTERS: readonly {
  id: HomeChapterId;
  th: string;
  en: string;
}[] = [
  { id: "sunlight", th: "แสงแดด", en: "Sunlight" },
  { id: "sizing", th: "ขนาดระบบ", en: "System size" },
  { id: "technology", th: "เทคโนโลยี", en: "Technology" },
  { id: "impact", th: "ผลลัพธ์", en: "Impact" },
  { id: "works", th: "หน้างานจริง", en: "Real homes" },
  { id: "next-step", th: "เริ่มต้น", en: "Next step" },
];

export default function HomeChapterRail({ activeChapter, locale }: HomeChapterRailProps) {
  const isTh = locale === "th";

  return (
    <div className="pointer-events-none fixed inset-y-0 right-3 z-[var(--layer-chrome)] hidden items-center xl:flex">
      <nav
        aria-label={isTh ? "นำทางแต่ละบท" : "Chapter navigation"}
        className="pointer-events-auto flex flex-col items-center gap-1 rounded-2xl border-2 border-[#0F172A] bg-[#F0EEE9]/95 p-2 shadow-[3px_3px_0_#0F172A] backdrop-blur-sm"
      >
        <span className="px-1 pb-1 text-[9px] font-black tracking-[0.16em] text-[#0F172A]/50">
          CH.
        </span>

        {CHAPTERS.map((chapter, index) => {
          const label = isTh ? chapter.th : chapter.en;
          const isActive = activeChapter === index;

          return (
            <a
              key={chapter.id}
              href={`#chapter-${chapter.id}`}
              aria-current={isActive ? "step" : undefined}
              aria-label={`${String(index + 1).padStart(2, "0")}. ${label}`}
              title={label}
              className={cn(
                "inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl border-2 px-2 text-xs font-black tabular-nums transition-colors",
                isActive
                  ? "border-[#0F172A] bg-[#0F172A] text-[#F59E0B]"
                  : "border-transparent text-[#0F172A]/55 hover:border-[#0F172A]/25 hover:bg-white hover:text-[#0F172A]"
              )}
            >
              <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              <span className="sr-only">{label}</span>
            </a>
          );
        })}
      </nav>
    </div>
  );
}
