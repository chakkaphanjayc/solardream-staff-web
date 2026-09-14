"use client";

import Link from "next/link";
import { useLocale } from "next-intl";
import { motion, type Variants } from "framer-motion";
import {
  ArrowRight,
  Gauge,
  SunMedium,
  Zap,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import AnimatedNumber from "@/components/ui/AnimatedNumber";
import { useHomeSolar } from "@/components/features/home/HomeSolarStateProvider";
import { MangaCaption } from "@/components/features/home/MangaPanel";
import { MangaChapter } from "@/components/features/home/MangaChapter";
import VisxHourlyGenerationChart from "@/components/charts/VisxHourlyGenerationChart";
import { HOME_SOLAR_SIZE_OPTIONS, type HomeSolarSizeKw } from "@/types/home";

const SIZE_DESCRIPTIONS: Record<
  HomeSolarSizeKw,
  {
    tagTh: string;
    tagEn: string;
    fitTh: string;
    fitEn: string;
    monthlyBillTh: string;
    monthlyBillEn: string;
  }
> = {
  3: {
    tagTh: "ขนาดกะทัดรัด (Compact Starter)",
    tagEn: "Compact Starter",
    fitTh: "เหมาะสำหรับบ้านเดี่ยวขนาดเล็ก ค่าไฟ 2,500 - 4,000 บาท/เดือน มีแอร์ 1-2 เครื่อง",
    fitEn: "Ideal for small homes with monthly bill ฿2,500 - ฿4,000, 1-2 air conditioners.",
    monthlyBillTh: "฿2,500 - ฿4,000",
    monthlyBillEn: "฿2,500 - ฿4,000",
  },
  5: {
    tagTh: "ขนาดยอดนิยม (Popular Choice)",
    tagEn: "Most Popular",
    fitTh: "เหมาะสำหรับครอบครัว 3-4 คน ค่าไฟ 4,000 - 7,500 บาท/เดือน มีแอร์ 2-4 เครื่องและทำงานที่บ้าน",
    fitEn: "Perfect for 3-4 member families, monthly bill ฿4,000 - ฿7,500, daytime home office.",
    monthlyBillTh: "฿4,000 - ฿7,500",
    monthlyBillEn: "฿4,000 - ฿7,500",
  },
  8: {
    tagTh: "ขนาดครอบครัวใหญ่ (Family Pro)",
    tagEn: "Large Family Pro",
    fitTh: "เหมาะสำหรับบ้านขนาดใหญ่ ค่าไฟ 7,500 - 13,000 บาท/เดือน หรือมีรถยนต์ไฟฟ้า (EV)",
    fitEn: "Suitable for larger residences, bill ฿7,500 - ฿13,000/mo, or EV charging needs.",
    monthlyBillTh: "฿7,500 - ฿13,000",
    monthlyBillEn: "฿7,500 - ฿13,000",
  },
  10: {
    tagTh: "กำลังผลิตสูงสุด (Max Power)",
    tagEn: "Maximum Output",
    fitTh: "เหมาะสำหรับบ้านหรู โฮมออฟฟิศ ค่าไฟ 13,000+ บาท/เดือน ชาร์จ EV หลายคัน",
    fitEn: "Designed for luxury homes, home offices, bill ฿13,000+/mo, multiple EV chargers.",
    monthlyBillTh: "฿13,000+",
    monthlyBillEn: "฿13,000+",
  },
};

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

export default function SolarSizingSection({
  isActive = false,
}: {
  isActive?: boolean;
}) {
  void isActive;
  const locale = useLocale();
  const { solarSizeKw, setSolarSizeKw, calculations } = useHomeSolar();

  const currentDesc = SIZE_DESCRIPTIONS[solarSizeKw];

  return (
    <MangaChapter
      chapter="sizing"
      chapterNumber={2}
      chapterTitle={locale === "th" ? "เลือกขนาดระบบที่ตอบโจทย์" : "Choose System Size"}
      variant="blue"
      className="py-16 sm:py-20 lg:py-24"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="max-w-3xl">
          <MangaCaption tone="ink" className="mb-3">
            <Gauge className="h-3.5 w-3.5 text-[#F59E0B]" />
            <span>{locale === "th" ? "คำนวณและจำลองขนาดระบบ" : "Interactive Sizing Simulator"}</span>
          </MangaCaption>
          <h2 className="text-balance text-[clamp(1.85rem,3.8vw,3.4rem)] font-black leading-tight tracking-tight text-[#0F172A]">
            {locale === "th" ? "ตัวเลขสำคัญที่เจ้าของบ้านเข้าใจได้ทันที" : "Solar Numbers Every Homeowner Can Understand"}
          </h2>
          <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-700 sm:text-base">
            {locale === "th"
              ? "คลิกเลือกขนาดกิโลวัตต์ (kW) ด้านล่าง เพื่อดูประมาณการจำนวนแผง ผลผลิตจริงต่อวัน และยอดประหยัดค่าไฟรายเดือน"
              : "Select a system capacity (kW) to simulate estimated panels, daily kWh generation, and monthly bill savings."}
          </p>
        </div>

        {/* Sequential Capacity Control Strip (3 / 5 / 8 / 10 kW) */}
        <div className="mt-10">
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between text-xs font-black uppercase tracking-wider text-[#0F172A]">
              <span>{locale === "th" ? "เลือกขนาดกำลังติดตั้งที่สนใจ" : "System Capacity Options (kW)"}</span>
              <span className="font-bold text-slate-600">
                {locale === "th" ? "💡 คลิกเพื่อเปลี่ยนขนาดระบบ" : "Click to switch system size"}
              </span>
            </div>

            <div className="flex overflow-x-auto snap-x snap-mandatory gap-4 pb-4 md:grid md:grid-cols-4 md:overflow-visible md:snap-none md:pb-0 scrollbar-none">
              {HOME_SOLAR_SIZE_OPTIONS.map((size, index) => {
                const selected = solarSizeKw === size;
                const info = SIZE_DESCRIPTIONS[size];
                return (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setSolarSizeKw(size)}
                    aria-pressed={selected}
                    className={cn(
                      "group relative flex min-w-[80%] snap-center flex-shrink-0 md:min-w-0 md:flex-shrink flex-col justify-between rounded-2xl border-2 p-4 text-left transition-all duration-200 sm:p-5 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F172A]",
                      selected
                        ? "border-[#0F172A] bg-[#0F172A] text-white shadow-[4px_4px_0_#0F172A] -translate-y-1.5"
                        : "border-[#0F172A] bg-white text-[#0F172A] shadow-[3px_3px_0_#0F172A] hover:-translate-y-1 hover:bg-[#F7F6F3] hover:shadow-[4px_4px_0_#0F172A]"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={cn(
                          "rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wider",
                          selected ? "bg-[#F59E0B] text-[#0F172A]" : "bg-[#B7D1EA] text-[#0F172A]"
                        )}
                      >
                        OPTION 0{index + 1}
                      </span>
                      <span
                        className={cn(
                          "text-xs font-bold",
                          selected ? "text-slate-300" : "text-slate-500"
                        )}
                      >
                        {size * 1000} Wp
                      </span>
                    </div>

                    <div className="mt-4">
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-black tracking-tight sm:text-4xl">
                          {size}
                        </span>
                        <span className="text-sm font-extrabold uppercase">kW</span>
                      </div>
                      <p
                        className={cn(
                          "mt-1 text-xs font-bold",
                          selected ? "text-[#B7D1EA]" : "text-[#0F172A]"
                        )}
                      >
                        {locale === "th" ? info.tagTh : info.tagEn}
                      </p>
                    </div>

                    <div className="mt-3 border-t border-current/20 pt-2 text-[11px] font-medium opacity-90">
                      <span>{locale === "th" ? "ค่าไฟเดิม" : "Avg. Bill"}: {locale === "th" ? info.monthlyBillTh : info.monthlyBillEn}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Selected System Calculation Bento Grid with whileInView scroll reveal */}
        <motion.div
          variants={bentoContainerVariants}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-50px" }}
          className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-12"
        >
          {/* Main Sizing Metric Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-8">
            
            {/* Card 1: Estimated Panels */}
            <motion.div
              variants={bentoCardVariants}
              className="relative overflow-hidden rounded-2xl border-2 border-[#0F172A] bg-white p-5 shadow-[3px_3px_0_#0F172A] transition-all duration-300 hover:-translate-y-0.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-slate-500">
                  {locale === "th" ? "ประมาณการจำนวนแผง" : "Estimated Solar Panels"}
                </span>
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border-2 border-[#0F172A] bg-[#FFFBEB]">
                  <SunMedium className="h-5 w-5 text-[#F59E0B]" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-black text-[#D97706] sm:text-4xl">
                  <AnimatedNumber value={calculations.panelCount550w} /> - <AnimatedNumber value={calculations.panelCount450w} />
                </span>
                <span className="text-sm font-bold text-slate-600">
                  {locale === "th" ? "แผง" : "panels"}
                </span>
              </div>
              <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-600">
                {locale === "th"
                  ? `คำนวณจากแผงมาตรฐาน Tier-1 ขนาด 450W - 550W ใช้พื้นที่หลังคาประมาณ ${(solarSizeKw * 5.5).toFixed(0)} - ${(solarSizeKw * 6.5).toFixed(0)} ตร.ม.`
                  : `Calculated with 450W-550W panels. Required roof area approx. ${(solarSizeKw * 5.5).toFixed(0)} - ${(solarSizeKw * 6.5).toFixed(0)} sq.m.`}
              </p>
            </motion.div>

            {/* Card 2: Daily Practical Output */}
            <motion.div
              variants={bentoCardVariants}
              className="relative overflow-hidden rounded-2xl border-2 border-[#0F172A] bg-white p-5 shadow-[3px_3px_0_#0F172A] transition-all duration-300 hover:-translate-y-0.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-slate-500">
                  {locale === "th" ? "พลังงานผลิตได้จริงต่อวัน" : "Daily Practical Output"}
                </span>
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border-2 border-[#0F172A] bg-[#F0F9FF]">
                  <Zap className="h-5 w-5 text-[#0284c7]" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-black text-[#0284c7] sm:text-4xl">
                  <AnimatedNumber value={calculations.dailyOutputKwh} decimals={1} />
                </span>
                <span className="text-sm font-bold text-slate-600">
                  kWh / {locale === "th" ? "วัน" : "day"}
                </span>
              </div>
              <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-600">
                {locale === "th"
                  ? `คิดจากค่าเฉลี่ยแดดเมืองไทย 4.2 ชม.พีค/วัน ประสิทธิภาพระบบ 85%`
                  : `Based on Thailand's average 4.2 peak sun hours/day with 85% system performance ratio.`}
              </p>
            </motion.div>

            {/* Card 3: Monthly Savings (Dominant Conversion Card) */}
            <motion.div
              variants={bentoCardVariants}
              className="relative overflow-hidden rounded-2xl border-2 border-[#0F172A] bg-[#F59E0B] p-5 shadow-[3px_3px_0_#0F172A] transition-all duration-300 hover:-translate-y-0.5 sm:col-span-2"
            >
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                  <span className="text-xs font-black uppercase tracking-wider text-[#0F172A]">
                    {locale === "th" ? "ประหยัดค่าไฟรายเดือนโดยประมาณ" : "Estimated Monthly Bill Savings"}
                  </span>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-3xl font-black text-[#0F172A] sm:text-5xl">
                      ฿<AnimatedNumber value={calculations.monthlySavingsThb} />
                    </span>
                    <span className="text-sm font-bold text-[#0F172A]">
                      / {locale === "th" ? "เดือน" : "month"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs font-bold text-[#0F172A]/85">
                    {locale === "th"
                      ? `ลดค่าไฟได้กว่า ฿${(calculations.monthlySavingsThb * 12).toLocaleString("th-TH")} ต่อปี คืนทุนใน ~4.5 ปี`
                      : `Saves over ฿${(calculations.monthlySavingsThb * 12).toLocaleString("th-TH")} per year with ~4.5 years payback.`}
                  </p>
                </div>

                <Link
                  href={`/${locale}/build?kw=${solarSizeKw}`}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 border-[#0F172A] bg-[#0F172A] px-6 py-3 text-xs font-black text-white shadow-[4px_4px_0_#0F172A] transition-all hover:-translate-y-0.5 hover:bg-slate-800 cursor-pointer"
                >
                  <span>{locale === "th" ? `ปรับแต่งแพ็กเกจ ${solarSizeKw} kW` : `Customize ${solarSizeKw} kW`}</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </motion.div>
          </div>

          {/* Diurnal Energy Curve / Visx Chart */}
          <motion.div variants={bentoCardVariants} className="lg:col-span-4">
            <div className="flex h-full flex-col justify-between rounded-2xl border-2 border-[#0F172A] bg-white p-5 shadow-[3px_3px_0_#0F172A]">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-[#0F172A]">
                    {locale === "th" ? "กราฟการผลิตรายชั่วโมง" : "Hourly Generation"}
                  </span>
                  <span className="rounded-lg border-2 border-[#0F172A] bg-[#B7D1EA] px-2 py-0.5 text-[10px] font-black text-[#0F172A]">
                    06:00–18:00
                  </span>
                </div>
                <p className="mt-1 text-xs font-semibold text-slate-600">
                  {locale === "th"
                    ? "ผลิตไฟฟ้าสูงสุดช่วงแดดจัด 10:00 - 14:00 น."
                    : "Peak solar conversion between 10:00 – 14:00."}
                </p>

                {/* Visx Interactive Area Chart with Halftone and Tooltips */}
                <div className="mt-3 h-44 w-full overflow-visible rounded-xl border-2 border-[#0F172A] bg-[#F7F6F3]/60 p-2 shadow-[2px_2px_0_#0F172A]">
                  <VisxHourlyGenerationChart
                    solarSizeKw={solarSizeKw}
                    locale={locale}
                    className="h-full w-full"
                  />
                </div>
              </div>

              <div className="mt-4 rounded-xl border-2 border-[#0F172A] bg-[#FFFBEB] p-3 text-xs font-bold text-[#0F172A] shadow-[2px_2px_0_#0F172A]">
                <span className="font-black text-[#F59E0B]">💡 {locale === "th" ? "ข้อแนะนำ: " : "Tip: "}</span>
                {locale === "th"
                  ? currentDesc.fitTh
                  : currentDesc.fitEn}
              </div>
            </div>
          </motion.div>

        </motion.div>

      </div>
    </MangaChapter>
  );
}

