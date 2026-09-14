"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import { motion, type Variants } from "framer-motion";
import {
  Car,
  Globe2,
  Leaf,
  Trees,
  Zap,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import AnimatedNumber from "@/components/ui/AnimatedNumber";
import { useHomeSolar } from "@/components/features/home/HomeSolarStateProvider";
import { MangaCaption } from "@/components/features/home/MangaPanel";
import { MangaChapter } from "@/components/features/home/MangaChapter";

type Timeframe = "monthly" | "annual" | "lifetime";

const bentoContainerVariants: Variants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const bentoCardVariants: Variants = {
  hidden: { y: 50, opacity: 0, rotate: -2 },
  show: {
    y: 0,
    opacity: 1,
    rotate: 0,
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 22,
    },
  },
};

export default function EcoImpactSection({
  isActive = false,
}: {
  isActive?: boolean;
}) {
  void isActive;
  const locale = useLocale();
  const { solarSizeKw, calculations } = useHomeSolar();
  const [timeframe, setTimeframe] = useState<Timeframe>("annual");

  // Multipliers based on timeframe
  const multiplier = timeframe === "monthly" ? 1 / 12 : timeframe === "lifetime" ? 25 : 1;

  const displayKwh = Math.round(calculations.annualOutputKwh * multiplier);
  const displayCo2Kg = Math.round(calculations.avoidedCo2Kg * multiplier);
  const displayTrees = Math.max(1, Math.round(calculations.treeEquivalent * multiplier));
  // 1 kg CO2 avoided is roughly equivalent to ~5.2 km driven by a typical gasoline car
  const displayCarKm = Math.round(displayCo2Kg * 5.2);

  return (
    <MangaChapter
      chapter="impact"
      chapterNumber={4}
      chapterTitle={locale === "th" ? "ผลกระทบต่อสิ่งแวดล้อม" : "Environmental Impact"}
      variant="sun"
      className="py-16 sm:py-20 lg:py-24"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        {/* Section Header & Timeframe Switcher */}
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <MangaCaption tone="ink" className="mb-3">
              <Leaf className="h-3.5 w-3.5 text-[#10B981]" />
              <span>{locale === "th" ? "พลังงานสะอาดเพื่อโลกและบ้านคุณ" : "Clean Energy For Earth"}</span>
            </MangaCaption>
            <h2 className="text-balance text-[clamp(1.85rem,3.8vw,3.4rem)] font-black leading-tight tracking-tight text-[#0F172A]">
              {locale === "th" ? "ตัวเลขผลกระทบสิ่งแวดล้อมที่จับต้องได้" : "Tangible Environmental Impact"}
            </h2>
            <p className="mt-2 text-sm font-semibold leading-relaxed text-[#0F172A]/85 sm:text-base">
              {locale === "th"
                ? `ทุกกิโลวัตต์ชั่วโมงที่ผลิตได้จากระบบ ${solarSizeKw} kWp ช่วยลดการพึ่งพาโรงไฟฟ้าถ่านหินและฟื้นฟูธรรมชาติอย่างยั่งยืน`
                : `Every clean kWh from your ${solarSizeKw} kWp system directly offsets fossil fuels and builds a greener tomorrow.`}
            </p>
          </div>

          {/* Timeframe Selector Pill Tabs */}
          <div className="inline-flex rounded-xl border-2 border-[#0F172A] bg-white p-1 shadow-[3px_3px_0_#0F172A]">
            <button
              type="button"
              onClick={() => setTimeframe("monthly")}
              className={cn(
                "rounded-lg px-3.5 py-1.5 text-xs font-black transition-all cursor-pointer",
                timeframe === "monthly"
                  ? "bg-[#0F172A] text-white"
                  : "text-slate-600 hover:text-[#0F172A] hover:bg-slate-100"
              )}
            >
              {locale === "th" ? "รายเดือน" : "Monthly"}
            </button>
            <button
              type="button"
              onClick={() => setTimeframe("annual")}
              className={cn(
                "rounded-lg px-3.5 py-1.5 text-xs font-black transition-all cursor-pointer",
                timeframe === "annual"
                  ? "bg-[#0F172A] text-white"
                  : "text-slate-600 hover:text-[#0F172A] hover:bg-slate-100"
              )}
            >
              {locale === "th" ? "รายปี" : "Annual"}
            </button>
            <button
              type="button"
              onClick={() => setTimeframe("lifetime")}
              className={cn(
                "rounded-lg px-3.5 py-1.5 text-xs font-black transition-all cursor-pointer",
                timeframe === "lifetime"
                  ? "bg-[#0F172A] text-white"
                  : "text-slate-600 hover:text-[#0F172A] hover:bg-slate-100"
              )}
            >
              {locale === "th" ? "25 ปี (ตลอดอายุ)" : "25-Yr Lifetime"}
            </button>
          </div>
        </div>

        {/* 4 Interactive Tangible Impact Cards with whileInView scroll reveal */}
        <motion.div
          variants={bentoContainerVariants}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-50px" }}
          className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4"
        >
          {/* 1. Tree Equivalent */}
          <motion.div
            variants={bentoCardVariants}
            className="group flex flex-col justify-between rounded-3xl border-2 border-[#0F172A] bg-white p-6 shadow-[3px_3px_0_#0F172A] transition-all duration-200 hover:-translate-y-1.5 hover:shadow-[4px_4px_0_#0F172A]"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                  {locale === "th" ? "เทียบเท่าปลูกต้นไม้" : "Trees Planted"}
                </span>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-[#0F172A] bg-[#10B981] text-white shadow-[2px_2px_0_#0F172A]">
                  <Trees className="h-5 w-5" />
                </div>
              </div>

              <div className="mt-4">
                <div className="flex items-baseline gap-1.5 text-4xl font-black text-emerald-600 sm:text-5xl">
                  ~<AnimatedNumber value={displayTrees} />
                  <span className="text-sm font-extrabold text-slate-500">{locale === "th" ? "ต้น" : "trees"}</span>
                </div>
                <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-600">
                  {locale === "th"
                    ? `ช่วยดูดซับก๊าซคาร์บอนไดออกไซด์ เสมือนปลูกป่าขนาดย่อมในบ้านคุณ`
                    : `Absorbing CO₂ equivalent to a thriving mini-forest.`}
                </p>
              </div>
            </div>

            <div className="mt-5 border-t-2 border-slate-100 pt-3 text-[11px] font-bold text-emerald-700">
              🌱 {locale === "th" ? "สร้างพื้นที่สีเขียวให้ชุมชน" : "Greening local community"}
            </div>
          </motion.div>

          {/* 2. Car Kilometers Offset */}
          <motion.div
            variants={bentoCardVariants}
            className="group flex flex-col justify-between rounded-3xl border-2 border-[#0F172A] bg-white p-6 shadow-[3px_3px_0_#0F172A] transition-all duration-200 hover:-translate-y-1.5 hover:shadow-[4px_4px_0_#0F172A]"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                  {locale === "th" ? "ลดการขับรถยนต์สันดาป" : "Gasoline Car KM"}
                </span>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-[#0F172A] bg-[#B7D1EA] text-[#0F172A] shadow-[2px_2px_0_#0F172A]">
                  <Car className="h-5 w-5" />
                </div>
              </div>

              <div className="mt-4">
                <div className="flex items-baseline gap-1 text-3xl font-black text-[#0284c7] sm:text-4xl">
                  ~<AnimatedNumber value={displayCarKm} />
                  <span className="text-sm font-extrabold text-slate-500">{locale === "th" ? "กม." : "km"}</span>
                </div>
                <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-600">
                  {locale === "th"
                    ? `ลดมลพิษทางอากาศเทียบเท่าการงดขับรถยนต์สันดาปหลายหมื่นกิโลเมตร`
                    : `Zero tailpipe emissions equivalent to thousands of driving km.`}
                </p>
              </div>
            </div>

            <div className="mt-5 border-t-2 border-slate-100 pt-3 text-[11px] font-bold text-sky-700">
              🚗 {locale === "th" ? `ประหยัดน้ำมันเชื้อเพลิงฟอสซิล` : `Fossil fuel conservation`}
            </div>
          </motion.div>

          {/* 3. CO2 Emissions Prevented */}
          <motion.div
            variants={bentoCardVariants}
            className="group flex flex-col justify-between rounded-3xl border-2 border-[#0F172A] bg-white p-6 shadow-[3px_3px_0_#0F172A] transition-all duration-200 hover:-translate-y-1.5 hover:shadow-[4px_4px_0_#0F172A]"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                  {locale === "th" ? "ลดก๊าซเรือนกระจก CO₂" : "CO₂ Avoided"}
                </span>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-[#0F172A] bg-[#F59E0B] text-[#0F172A] shadow-[2px_2px_0_#0F172A]">
                  <Globe2 className="h-5 w-5" />
                </div>
              </div>

              <div className="mt-4">
                <div className="flex items-baseline gap-1 text-3xl font-black text-[#E11D48] sm:text-4xl">
                  {timeframe === "lifetime" ? (
                    <>
                      <AnimatedNumber value={Number((displayCo2Kg / 1000).toFixed(1))} decimals={1} />
                      <span className="text-sm font-extrabold text-slate-500">ตัน (tons)</span>
                    </>
                  ) : (
                    <>
                      <AnimatedNumber value={displayCo2Kg} />
                      <span className="text-sm font-extrabold text-slate-500">kg</span>
                    </>
                  )}
                </div>
                <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-600">
                  {locale === "th"
                    ? `ป้องกันการปล่อยก๊าซคาร์บอนไดออกไซด์สู่ชั้นบรรยากาศโดยตรง`
                    : `Direct carbon dioxide emission mitigation at the rooftop level.`}
                </p>
              </div>
            </div>

            <div className="mt-5 border-t-2 border-slate-100 pt-3 text-[11px] font-bold text-amber-700">
              🌍 {locale === "th" ? `ลดภาระโรงไฟฟ้าถ่านหิน` : `Direct grid decarbonization`}
            </div>
          </motion.div>

          {/* 4. Total Clean Energy Generated */}
          <motion.div
            variants={bentoCardVariants}
            className="group flex flex-col justify-between rounded-3xl border-2 border-[#0F172A] bg-white p-6 shadow-[3px_3px_0_#0F172A] transition-all duration-200 hover:-translate-y-1.5 hover:shadow-[4px_4px_0_#0F172A]"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                  {locale === "th" ? "พลังงานสะอาดสะสม" : "Clean Energy"}
                </span>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-[#0F172A] bg-[#B7D1EA] text-[#0F172A] shadow-[2px_2px_0_#0F172A]">
                  <Zap className="h-5 w-5" />
                </div>
              </div>

              <div className="mt-4">
                <div className="flex items-baseline gap-1 text-3xl font-black text-[#2563EB] sm:text-4xl">
                  {timeframe === "lifetime" ? (
                    <>
                      <AnimatedNumber value={Number((displayKwh / 1000).toFixed(1))} decimals={1} />
                      <span className="text-sm font-extrabold text-slate-500">MWh</span>
                    </>
                  ) : (
                    <>
                      <AnimatedNumber value={displayKwh} />
                      <span className="text-sm font-extrabold text-slate-500">kWh</span>
                    </>
                  )}
                </div>
                <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-600">
                  {locale === "th"
                    ? `กระแสไฟฟ้าจากแสงอาทิตย์ 100% บริสุทธิ์ ปลอดมลพิษ`
                    : `100% pure green electricity harvested on your rooftop.`}
                </p>
              </div>
            </div>

            <div className="mt-5 border-t-2 border-slate-100 pt-3 text-[11px] font-bold text-slate-600">
              ⚡ {locale === "th" ? `พลังงานอิสระที่พึ่งพาตัวเองได้` : `Self-reliant green power`}
            </div>
          </motion.div>
        </motion.div>

      </div>
    </MangaChapter>
  );
}

