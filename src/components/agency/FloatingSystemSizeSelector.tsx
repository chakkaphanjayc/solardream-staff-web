"use client";

import { Zap } from "@/components/ui/icons";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

const SOLAR_SIZE_OPTIONS = [3, 5, 8, 10] as const;
type FloatingSystemSizeSelectorProps = Readonly<{
  solarSizeKw: number;
  onSolarSizeChange: (value: number) => void;
  activeSection?: number;
  progress?: number;
}>;

const STORY_DOTS = ["sky", "data", "tech", "earth", "next"] as const;

export default function FloatingSystemSizeSelector({
  solarSizeKw,
  onSolarSizeChange,
  activeSection = 0,
  progress = 0,
}: FloatingSystemSizeSelectorProps) {
  const t = useTranslations("FloatingSystemSizeSelector");
  const activeIndex = Math.max(0, SOLAR_SIZE_OPTIONS.findIndex((size) => size === solarSizeKw));
  const isPastMainContent = activeSection >= 5 && progress > 0.95;

  return (
    <>
      {/* Desktop & Tablet Floating Sidebar (Vertical) */}
      <aside
        aria-label={t("systemKw")}
        className={cn(
          "pointer-events-none fixed right-2.5 sm:right-3.5 xl:right-6 top-1/2 -translate-y-1/2 z-40 hidden md:flex flex-col items-end transition-all duration-300",
          isPastMainContent && "opacity-0 pointer-events-none translate-x-4",
        )}
        aria-hidden={isPastMainContent}
      >
        <div
          className={cn(
            "pointer-events-auto flex flex-col items-center gap-1.5 lg:gap-2 rounded-full border border-white/15 bg-[#0F172A]/92 p-1.5 lg:p-2 shadow-2xl shadow-slate-950/60 backdrop-blur-xl transition-all duration-500 ease-expo-out",
            isPastMainContent && "pointer-events-none",
          )}
        >
          <div className="flex h-8 w-8 lg:h-9 lg:w-9 items-center justify-center rounded-full bg-[#0B1121] border border-white/10 text-[#B7D1EA]">
            <Zap className="h-3.5 w-3.5 lg:h-4 lg:w-4" />
            <span className="sr-only">{t("systemKw")}</span>
          </div>

          <div className="relative grid grid-cols-1 grid-rows-4 gap-1 lg:gap-1.5">
            <span
              aria-hidden="true"
              className="absolute left-0 top-0 h-9 w-9 lg:h-10 lg:w-10 rounded-full bg-[#B7D1EA] shadow-md shadow-[#B7D1EA]/35 transition-all duration-500 ease-expo-out"
              style={{
                transform: `translateY(calc(${activeIndex} * (var(--kw-btn-size, 2.25rem) + var(--kw-btn-gap, 0.25rem))))`,
              }}
            />
            {SOLAR_SIZE_OPTIONS.map((size) => (
              <div key={size} className="group relative [--kw-btn-size:2.25rem] [--kw-btn-gap:0.25rem] lg:[--kw-btn-size:2.5rem] lg:[--kw-btn-gap:0.375rem]">
                <button
                  type="button"
                  onClick={() => onSolarSizeChange(size)}
                  data-analytics-event="home_size_selected"
                  data-analytics-size-kw={size}
                  aria-pressed={solarSizeKw === size}
                  aria-label={t(`sizes.${size}`)}
                  className={cn(
                    "relative z-10 flex h-9 w-9 lg:h-10 lg:w-10 cursor-pointer items-center justify-center rounded-full text-[11px] lg:text-xs font-black tabular-nums outline-none transition-all duration-300 ease-expo-out focus-visible:ring-2 focus-visible:ring-[#B7D1EA]",
                    solarSizeKw === size
                      ? "text-[#0F172A]"
                      : "text-slate-300 hover:bg-white/10 hover:text-white",
                  )}
                >
                  {size}K
                </button>
                <div className="pointer-events-none absolute right-full top-1/2 mr-3 -translate-y-1/2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-all duration-200 ease-expo-out">
                  <span className="inline-flex items-center whitespace-nowrap rounded-full border border-white/20 bg-[#0F172A]/95 px-3 py-1.5 text-[11px] font-black text-[#B7D1EA] shadow-xl shadow-slate-950/60 backdrop-blur-xl">
                    {t(`sizes.${size}`)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-0.5 flex w-full flex-col items-center justify-center gap-1.5 border-t border-white/10 pt-1.5 lg:pt-2">
            <div className="relative h-12 lg:h-14 w-1 overflow-hidden rounded-full bg-slate-800">
              <span
                className="absolute left-0 top-0 block w-full bg-[#B7D1EA] transition-all duration-500 ease-expo-out"
                style={{ height: `${Math.max(4, Math.min(100, progress * 100))}%` }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              {STORY_DOTS.map((label, index) => (
                <span
                  key={label}
                  aria-label={t(`sections.${label}`)}
                  className={cn(
                    "h-1.5 w-1.5 rounded-full transition-all duration-500 ease-expo-out",
                    activeSection === index ? "scale-125 bg-[#B7D1EA]" : "bg-slate-700",
                  )}
                />
              ))}
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile Floating Bottom Dock (Horizontal Pill) */}
      <aside
        aria-label={t("systemKw")}
        className={cn(
          "pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4 transition-all duration-300 md:hidden",
          isPastMainContent && "opacity-0 pointer-events-none translate-y-6",
        )}
        style={{ bottom: "max(0.75rem, env(safe-area-inset-bottom, 0.75rem))" }}
        aria-hidden={isPastMainContent}
      >
        <div
          className={cn(
            "pointer-events-auto flex items-center gap-1 rounded-full border border-white/20 bg-[#0F172A]/95 p-1 shadow-2xl shadow-slate-950/80 backdrop-blur-2xl transition-all duration-500 ease-expo-out",
            isPastMainContent && "pointer-events-none",
          )}
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0B1121] border border-white/10 text-[#B7D1EA]">
            <Zap className="h-3 w-3" />
            <span className="sr-only">{t("systemKw")}</span>
          </div>

          <div className="relative flex items-center gap-1">
            <span
              aria-hidden="true"
              className="absolute top-0 h-7.5 w-11 rounded-full bg-[#B7D1EA] shadow-md shadow-[#B7D1EA]/35 transition-all duration-500 ease-expo-out"
              style={{
                transform: `translateX(calc(${activeIndex} * (2.75rem + 0.25rem)))`,
              }}
            />
            {SOLAR_SIZE_OPTIONS.map((size) => (
              <button
                key={`mobile-${size}`}
                type="button"
                onClick={() => onSolarSizeChange(size)}
                data-analytics-event="home_size_selected"
                data-analytics-size-kw={size}
                aria-pressed={solarSizeKw === size}
                aria-label={t(`sizes.${size}`)}
                className={cn(
                  "relative z-10 flex h-7.5 w-11 cursor-pointer items-center justify-center rounded-full text-xs font-black tabular-nums outline-none transition-all duration-300 ease-expo-out focus-visible:ring-2 focus-visible:ring-[#B7D1EA]",
                  solarSizeKw === size
                    ? "text-[#0F172A]"
                    : "text-slate-300 hover:text-white",
                )}
              >
                {size}K
              </button>
            ))}
          </div>
        </div>
      </aside>
    </>
  );
}
