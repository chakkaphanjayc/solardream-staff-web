"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { useLocale } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Cloud,
  CloudRain,
  MapPin,
  Moon,
  Search,
  Sparkles,
  SunMedium,
  Zap,
} from "@/components/ui/icons";
import AnimatedNumber from "@/components/ui/AnimatedNumber";
import TrackRequestModal from "@/components/tracking/TrackRequestModal";
import { HOME_MANGA_HERO_WEATHER_ASSETS } from "@/lib/homeMangaAssets";
import { useHomeWeather } from "@/hooks/useHomeWeather";
import SoliaSpeechBubble from "@/components/features/home/SoliaSpeechBubble";
import { WeatherEffectsOverlay } from "@/components/features/home/WeatherHero";
import type { LiveSolarData } from "@/lib/weather";
import type { HomeWeatherId } from "@/types/home";

const subscribeToNothing = () => () => {};
const getClientMountedSnapshot = () => true;
const getServerMountedSnapshot = () => false;

const WEATHER_TABS: Array<{
  id: HomeWeatherId;
  labelEn: string;
  labelTh: string;
  icon: typeof SunMedium;
  color: string;
}> = [
  { id: "sunny", labelEn: "Sunny", labelTh: "แดดจ้า", icon: SunMedium, color: "text-amber-500" },
  { id: "cloudy", labelEn: "Cloudy", labelTh: "มีเมฆ", icon: Cloud, color: "text-sky-500" },
  { id: "rainy", labelEn: "Rainy", labelTh: "ฝนตก", icon: CloudRain, color: "text-blue-500" },
  { id: "night", labelEn: "Night", labelTh: "กลางคืน", icon: Moon, color: "text-indigo-500" },
];

const EXPO_EASE = [0.22, 1, 0.36, 1] as const;

export default function HeroMangaSection({
  showAdminSimulator = false,
  liveSolarData,
}: {
  showAdminSimulator?: boolean;
  liveSolarData?: LiveSolarData | null;
} = {}) {
  void showAdminSimulator;
  const locale = useLocale();
  const isTh = locale === "th";
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const mounted = useSyncExternalStore(
    subscribeToNothing,
    getClientMountedSnapshot,
    getServerMountedSnapshot
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = () => setPrefersReducedMotion(media.matches);

    handleChange();
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  const {
    weatherId,
    locationName,
    isLocating,
    isOverride,
    liveOutputKw,
    sunlightIntensityPct,
    dailyForecastKwh,
    setWeatherOverride,
  } = useHomeWeather(liveSolarData);

  const activeWeatherAsset =
    HOME_MANGA_HERO_WEATHER_ASSETS[weatherId] || HOME_MANGA_HERO_WEATHER_ASSETS.sunny;

  return (
    <section
      id="chapter-sunlight"
      data-home-snap-section
      data-manga-chapter="sunlight"
      className="relative isolate w-full scroll-mt-24 overflow-hidden bg-[#F0EEE9] text-[#0F172A]"
    >
      {/* Background paper texture feel */}
      <div aria-hidden="true" className="absolute inset-0 bg-[#F0EEE9]" />

      <div className="relative z-20 mx-auto max-w-[96rem] px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-14 xl:px-12">
        <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12 lg:gap-12 xl:gap-16">

          {/* LEFT COLUMN: Editorial & Value Proposition */}
          <motion.div
            initial={{ opacity: prefersReducedMotion ? 1 : 0, y: prefersReducedMotion ? 0 : 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.6, ease: EXPO_EASE }}
            className="flex flex-col justify-center lg:col-span-6 xl:col-span-5"
          >
            {/* 1. Location & Weather Preview Control Strip */}
            <div className="mb-6 flex flex-wrap items-center gap-2 sm:gap-3">
              {/* Location Pill */}
              <div className="inline-flex min-h-10 items-center gap-2 rounded-full border-2 border-[#0F172A] bg-white px-3.5 py-1.5 text-xs font-bold text-[#0F172A] shadow-[3px_3px_0_#0F172A]">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-[#F59E0B]" aria-hidden="true" />
                <span className="max-w-[12rem] truncate">
                  {isLocating
                    ? isTh
                      ? "กำลังค้นหาตำแหน่ง..."
                      : "Locating..."
                    : locationName || "Nong Kaeo, Chiang Mai"}
                </span>
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
              </div>

              {/* Weather Switcher Tabs */}
              <div
                className="inline-flex min-h-10 items-center gap-0.5 rounded-full border-2 border-[#0F172A] bg-white p-1 shadow-[3px_3px_0_#0F172A]"
                aria-label={isTh ? "เลือกสภาพอากาศจำลอง" : "Choose weather preview"}
              >
                {WEATHER_TABS.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = weatherId === tab.id;

                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setWeatherOverride(tab.id)}
                      title={isTh ? tab.labelTh : tab.labelEn}
                      aria-label={`${isTh ? "เปลี่ยนเป็น" : "Switch to"} ${isTh ? tab.labelTh : tab.labelEn}`}
                      aria-pressed={isActive}
                      className={`inline-flex min-h-8 items-center gap-1 rounded-full px-2.5 text-xs font-black transition-all cursor-pointer ${
                        isActive
                          ? "bg-[#0F172A] text-white shadow-xs"
                          : "text-[#0F172A]/70 hover:bg-[#B7D1EA]/50 hover:text-[#0F172A]"
                      }`}
                    >
                      <Icon
                        className={`h-3.5 w-3.5 shrink-0 ${isActive ? "text-[#F59E0B]" : tab.color}`}
                        aria-hidden="true"
                      />
                      <span className="hidden sm:inline">{isTh ? tab.labelTh : tab.labelEn}</span>
                    </button>
                  );
                })}
              </div>

              {isOverride && (
                <span className="inline-flex min-h-8 items-center rounded-full border-2 border-[#0F172A] bg-[#F59E0B] px-2.5 py-0.5 text-[10px] font-black text-[#0F172A] shadow-[2px_2px_0_#0F172A]">
                  {isTh ? "โหมดตัวอย่าง" : "Preview"}
                </span>
              )}
            </div>

            {/* 2. Brand Chapter Badge */}
            <div className="mb-4 flex items-center gap-3">
              <div className="relative h-6 w-28 sm:h-7 sm:w-32">
                <Image
                  src="/asset/sd-text.png"
                  alt="SolarDream"
                  fill
                  sizes="128px"
                  priority
                  className="object-contain object-left"
                />
              </div>
              <span className="h-4 w-0.5 bg-[#0F172A]/30" aria-hidden="true" />
              <span className="rounded-md border border-[#0F172A]/25 bg-[#B7D1EA]/40 px-2 py-0.5 text-[10px] font-black tracking-wider text-[#0F172A]">
                01 / SUNLIGHT
              </span>
            </div>

            {/* 3. Main Headline */}
            <h1 className="text-balance text-[clamp(2.2rem,4.5vw,4.25rem)] font-black leading-[1.08] tracking-[-0.03em] text-[#0F172A]">
              {isTh ? (
                <>
                  เปลี่ยนแสงแดด
                  <span className="block text-[#0284c7]">เป็นพลังงานสะอาดเพื่อบ้านคุณ</span>
                </>
              ) : (
                <>
                  Clean solar power,
                  <span className="block text-[#0284c7]">designed for your home.</span>
                </>
              )}
            </h1>

            {/* 4. Subtitle Body */}
            <p className="mt-4 max-w-xl text-pretty text-base font-semibold leading-relaxed text-slate-700 sm:text-lg">
              {isTh
                ? "คำนวณความคุ้มค่า ออกแบบระบบที่เหมาะกับการใช้ไฟ และติดตามสถานะคำขอได้ทันทีในที่เดียว พร้อมมาตรฐาน Tier-1 และทีมวิศวกรดูแลครบวงจร"
                : "Calculate savings, tailor your system to your household demand, and track installation status all in one place with Tier-1 engineering."}
            </p>

            {/* 5. Primary & Secondary CTA Buttons */}
            <div className="mt-8 flex flex-col items-stretch gap-3.5 sm:flex-row sm:items-center">
              <motion.div
                whileHover={prefersReducedMotion ? undefined : { y: -2 }}
                whileTap={prefersReducedMotion ? undefined : { y: 0 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
              >
                <Link
                  href={`/${locale}/wizard`}
                  id="hero-start-wizard-btn"
                  data-analytics-event="primary_cta_clicked"
                  data-analytics-cta="hero_start_wizard"
                  className="group inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border-[2.5px] border-[#0F172A] bg-[#F59E0B] px-6 py-3.5 text-sm font-black text-[#0F172A] shadow-[4px_4px_0_#0F172A] transition-all hover:bg-[#ffb72b] hover:shadow-[6px_6px_0_#0F172A] sm:w-auto sm:text-base cursor-pointer"
                >
                  <span>{isTh ? "เริ่มคำนวณแพ็กเกจ" : "Calculate package"}</span>
                  <ArrowRight className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-1" aria-hidden="true" />
                </Link>
              </motion.div>

              <TrackRequestModal
                surface="home"
                trigger={
                  <motion.button
                    type="button"
                    id="hero-track-request-btn"
                    data-analytics-event="secondary_cta_clicked"
                    data-analytics-cta="hero_track_request"
                    whileHover={prefersReducedMotion ? undefined : { y: -2 }}
                    whileTap={prefersReducedMotion ? undefined : { y: 0 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    className="group inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border-[2.5px] border-[#0F172A] bg-white px-6 py-3.5 text-sm font-black text-[#0F172A] shadow-[4px_4px_0_#0F172A] transition-all hover:bg-[#F0EEE9] hover:shadow-[6px_6px_0_#0F172A] sm:w-auto sm:text-base cursor-pointer"
                  >
                    <Search className="h-4 w-4 text-[#0284c7] transition-transform duration-150 group-hover:scale-110" aria-hidden="true" />
                    <span>{isTh ? "ติดตามคำขอ" : "Track request"}</span>
                  </motion.button>
                }
              />
            </div>

            {/* 6. Trust Badges Row */}
            <div className="mt-8 flex flex-wrap items-center gap-2.5 text-xs font-black text-[#0F172A]">
              <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#0F172A] bg-white px-3.5 py-1 text-[11px] font-bold shadow-[2px_2px_0_#0F172A]">
                <Zap className="h-3.5 w-3.5 text-[#F59E0B]" aria-hidden="true" />
                <span>{isTh ? "Tier-1 N-Type TOPCon" : "Tier-1 N-Type TOPCon"}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#0F172A] bg-[#B7D1EA] px-3.5 py-1 text-[11px] font-bold shadow-[2px_2px_0_#0F172A]">
                <SunMedium className="h-3.5 w-3.5 text-[#0284c7]" aria-hidden="true" />
                <span>{isTh ? "จำลองสภาพอากาศจริง" : "Live Sky Simulator"}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#0F172A] bg-white px-3.5 py-1 text-[11px] font-bold shadow-[2px_2px_0_#0F172A]">
                <Sparkles className="h-3.5 w-3.5 text-[#F59E0B]" aria-hidden="true" />
                <span>{isTh ? "รับประกันระบบ 25 ปี" : "25-year warranty"}</span>
              </span>
            </div>
          </motion.div>

          {/* RIGHT COLUMN: Interactive Architectural Showcase Stage */}
          <motion.div
            initial={{ opacity: prefersReducedMotion ? 1 : 0, scale: prefersReducedMotion ? 1 : 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.7, ease: EXPO_EASE, delay: 0.15 }}
            className="flex flex-col lg:col-span-6 xl:col-span-7"
          >
            {/* Framed Neo-brutalist Showcase Card */}
            <div className="relative overflow-hidden rounded-3xl border-[3px] border-[#0F172A] bg-[#0F172A] shadow-[6px_6px_0_#0F172A]">

              {/* Dynamic Artwork Canvas */}
              <div className="relative aspect-[16/10] w-full overflow-hidden bg-[#0F172A] sm:aspect-[16/9] lg:aspect-[16/10]">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={weatherId}
                    data-home-hero-art
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{
                      duration: prefersReducedMotion ? 0 : 0.5,
                      ease: EXPO_EASE,
                    }}
                    className="absolute inset-0 origin-center"
                  >
                    <Image
                      src={activeWeatherAsset.src}
                      alt={activeWeatherAsset.alt}
                      fill
                      priority
                      sizes="(max-width: 1024px) 100vw, 55vw"
                      className="object-cover object-center"
                    />
                  </motion.div>
                </AnimatePresence>

                {/* Weather Overlay Effects (flares, clouds, rain, stars) */}
                <WeatherEffectsOverlay activeWeather={weatherId} />

                {/* Live Signal Badge (Top Left of Showcase) */}
                <div className="absolute left-4 top-4 z-30 flex items-center gap-2 rounded-full border-2 border-[#0F172A] bg-[#F0EEE9]/95 px-3 py-1.5 text-[10px] font-black tracking-wider text-[#0F172A] shadow-[3px_3px_0_#0F172A] backdrop-blur-md">
                  <span className="h-2 w-2 rounded-full bg-[#F59E0B] animate-ping" aria-hidden="true" />
                  <span>{isTh ? "สัญญาณแดดสด" : "LIVE SKY SIGNAL"}</span>
                </div>

                {/* Solia Mascot Speech Bubble (Top Right of Showcase) */}
                <div className="absolute right-4 top-4 z-30">
                  <SoliaSpeechBubble weatherId={weatherId} locale={locale} />
                </div>
              </div>

              {/* Live Solar Telemetry Bottom Bar */}
              <div
                data-manga-panel
                className="border-t-[3px] border-[#0F172A] bg-[#F0EEE9] p-4 sm:p-5"
                role="region"
                aria-label={isTh ? "ข้อมูลพลังงานสด" : "Live solar telemetry"}
              >
                <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-6">

                  {/* Home Signal Label */}
                  <div className="inline-flex items-center gap-2 rounded-lg border-2 border-[#0F172A] bg-white px-2.5 py-1 text-[10px] font-black tracking-wider text-[#0F172A] shadow-[2px_2px_0_#0F172A]">
                    <span className="h-2 w-2 rounded-full bg-[#F59E0B]" aria-hidden="true" />
                    <span>{isTh ? "สัญญาณพลังงานสด" : "LIVE TELEMETRY"}</span>
                  </div>

                  {/* Metric 1: Live Output */}
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-[#0F172A] bg-[#FFFBEB] text-[#F59E0B] shadow-[2px_2px_0_#0F172A]">
                      <Zap className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="flex items-baseline gap-1 text-base font-black text-[#0F172A] sm:text-lg">
                        {mounted ? <AnimatedNumber value={liveOutputKw} decimals={2} /> : liveOutputKw}
                        <span className="text-xs font-bold text-slate-500">kW</span>
                      </div>
                      <span className="text-[10px] font-bold text-slate-600 block">
                        {isTh ? "กำลังผลิตขณะนี้" : "Current output"}
                      </span>
                    </div>
                  </div>

                  {/* Metric 2: Sunlight Intensity */}
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-[#0F172A] bg-[#F0F9FF] text-[#0284c7] shadow-[2px_2px_0_#0F172A]">
                      <SunMedium className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="flex items-baseline gap-1 text-base font-black text-[#0F172A] sm:text-lg">
                        {mounted ? <AnimatedNumber value={sunlightIntensityPct} /> : sunlightIntensityPct}
                        <span className="text-xs font-bold text-slate-500">%</span>
                      </div>
                      <span className="text-[10px] font-bold text-slate-600 block">
                        {isTh ? "ความเข้มแสงแดด" : "Sun intensity"}
                      </span>
                    </div>
                  </div>

                  {/* Metric 3: Daily Generation Forecast */}
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-[#0F172A] bg-[#F0FDF4] text-emerald-600 shadow-[2px_2px_0_#0F172A]">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="flex items-baseline gap-1 text-base font-black text-[#0F172A] sm:text-lg">
                        ≈{mounted ? <AnimatedNumber value={dailyForecastKwh} decimals={1} /> : dailyForecastKwh}
                        <span className="text-xs font-bold text-slate-500">kWh</span>
                      </div>
                      <span className="text-[10px] font-bold text-slate-600 block">
                        {isTh ? "คาดการณ์วันนี้" : "Daily forecast"}
                      </span>
                    </div>
                  </div>

                </div>
              </div>

            </div>
          </motion.div>

        </div>
      </div>
    </section>
  );
}
