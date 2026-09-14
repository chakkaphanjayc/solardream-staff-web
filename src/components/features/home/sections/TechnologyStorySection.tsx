"use client";

import { useState } from "react";
import {
  BatteryCharging,
  Cpu,
  ShieldCheck,
  Sparkles,
  SunMedium,
  Zap,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { MangaCaption } from "@/components/features/home/MangaPanel";
import { MangaChapter } from "@/components/features/home/MangaChapter";
import VisxSystemFlowConnector from "@/components/charts/VisxSystemFlowConnector";

type FlowStep = Readonly<{
  id: string;
  stepNumber: string;
  titleTh: string;
  titleEn: string;
  tagTh: string;
  tagEn: string;
  descTh: string;
  descEn: string;
  specs: readonly { labelTh: string; labelEn: string; value: string }[];
  benefitTh: string;
  benefitEn: string;
  icon: typeof SunMedium;
  accentColor: string;
}>;

const FLOW_STEPS: readonly FlowStep[] = [
  {
    id: "harvest",
    stepNumber: "01",
    titleTh: "ดักจับโฟตอนแสงอาทิตย์ (Photovoltaic Harvest)",
    titleEn: "Photovoltaic Harvest",
    tagTh: "แผงโซลาร์เซลล์ Tier-1",
    tagEn: "Tier-1 N-Type TOPCon",
    descTh:
      "แผงโซลาร์เซลล์ชนิด N-Type TOPCon ประสิทธิภาพเซลล์สูงถึง 22.8% เปลี่ยนอนุภาคแสงแดดเป็นกระแสไฟฟ้าตรง (DC) ได้อย่างเต็มพิกัด แม้ในเช้าตรู่หรือวันที่มีเมฆหมอก",
    descEn:
      "N-Type TOPCon monocrystalline cells with 22.8% efficiency capture solar photons and convert them into Direct Current (DC), even in early mornings and overcast conditions.",
    specs: [
      { labelTh: "ประสิทธิภาพเซลล์", labelEn: "Cell Efficiency", value: "22.8% TOPCon" },
      { labelTh: "การรับประกันแผง", labelEn: "Product Warranty", value: "25 - 30 ปี" },
      { labelTh: "กระจกป้องกัน", labelEn: "Glass Coating", value: "Dual-Glass Anti-Reflective" },
      { labelTh: "ค่าสัมประสิทธิ์อุณหภูมิ", labelEn: "Temp. Coefficient", value: "-0.30% / °C" },
    ],
    benefitTh: "ผลิตไฟได้มากกว่าแผงทั่วไป 5-8% ทนทานต่อความร้อนเมืองไทยเป็นเลิศ",
    benefitEn: "Generates 5-8% more energy than standard panels in tropical climates.",
    icon: SunMedium,
    accentColor: "#D8A87B",
  },
  {
    id: "inversion",
    stepNumber: "02",
    titleTh: "แปลงไฟฟ้ากระแสตรงเป็นกระแสสลับ (Smart Inversion)",
    titleEn: "Smart AI Inversion",
    tagTh: "อินเวอร์เตอร์อัจฉริยะ",
    tagEn: "AI Hybrid Inverter",
    descTh:
      "อินเวอร์เตอร์อัจฉริยะแปลงกระแสไฟฟ้า DC เป็นกระแสสลับ (AC) 220V/380V คลื่น Pure Sine Wave มาตรฐานสูงสุด พร้อมระบบ AI AFCI ดับประกายไฟอาร์กในเสี้ยววินาที",
    descEn:
      "High-efficiency Hybrid Inverter converts DC into Pure Sine Wave AC power (220V/380V) with AI AFCI safety that detects and extinguishes electrical arcs in milliseconds.",
    specs: [
      { labelTh: "ประสิทธิภาพการแปลงไฟ", labelEn: "Euro Efficiency", value: "98.6% Max" },
      { labelTh: "ความปลอดภัย AI AFCI", labelEn: "Arc Protection", value: "< 0.5 วินาที" },
      { labelTh: "ระดับกันน้ำกันฝุ่น", labelEn: "Ingress Rating", value: "IP68 Enclosure" },
      { labelTh: "การตรวจติดตาม", labelEn: "Monitoring", value: "24/7 Mobile Realtime" },
    ],
    benefitTh: "จ่ายกระแสไฟนิ่ง เสถียร ถนอมเครื่องใช้ไฟฟ้าและเครื่องปรับอากาศภายในบ้าน",
    benefitEn: "Ultra-clean sine wave preserves sensitive home electronics and appliances.",
    icon: Cpu,
    accentColor: "#2B9EB3",
  },
  {
    id: "distribution",
    stepNumber: "03",
    titleTh: "จ่ายพลังงานให้อุปกรณ์ในบ้าน (Home Distribution)",
    titleEn: "Direct Home Powering",
    tagTh: "ลดค่าไฟกลางวัน",
    tagEn: "Daytime Zero-Meter",
    descTh:
      "ระบบจะจ่ายไฟให้เครื่องใช้ไฟฟ้าที่กำลังเปิดอยู่โดยอัตโนมัติเป็นลำดับแรก เช่น แอร์ ตู้เย็น ปั๊มน้ำ และเครื่องชาร์จรถยนต์ไฟฟ้า ทำให้มิเตอร์การไฟฟ้าแทบไม่หมุนช่วงกลางวัน",
    descEn:
      "Solar electricity flows directly into active household loads—air conditioners, refrigerators, water pumps, and EV chargers—drastically cutting daytime utility meter consumption.",
    specs: [
      { labelTh: "ลำดับการจ่ายไฟ", labelEn: "Priority Logic", value: "Solar ➔ Home Loads" },
      { labelTh: "การลดค่าไฟกลางวัน", labelEn: "Daytime Reduction", value: "สูงสุด 70%" },
      { labelTh: "รองรับการชาร์จ EV", labelEn: "EV Ready", value: "7.4 - 22 kW Smart Charger" },
      { labelTh: "ระบบตัดกระแสไฟฉุกเฉิน", labelEn: "Rapid Shutdown", value: "NEC 2020 Compliant" },
    ],
    benefitTh: "เปิดแอร์ช่วงกลางวันสบายใจ ไร้กังวลเรื่องค่าไฟช่วง Peak",
    benefitEn: "Run daytime air conditioning with near-zero electricity expense.",
    icon: Zap,
    accentColor: "#10B981",
  },
  {
    id: "storage",
    stepNumber: "04",
    titleTh: "กักเก็บพลังงาน & สลับไฟสำรอง (Hybrid Storage)",
    titleEn: "Hybrid Battery & Backup",
    tagTh: "สำรองไฟกลางคืน",
    tagEn: "Nighttime Backup",
    descTh:
      "พลังงานแสงอาทิตย์ส่วนเกินจะถูกส่งไปชาร์จแบตเตอรี่ LiFePO4 เพื่อนำมาใช้เปิดแอร์ช่วงค่ำคืน พร้อมฟังก์ชัน EPS สลับเป็นไฟสำรองอัตโนมัติภายใน 10ms เมื่อเกิดไฟดับ",
    descEn:
      "Surplus solar energy charges modular LiFePO4 battery packs for nighttime consumption, with seamless 10ms EPS emergency backup switchover during power outages.",
    specs: [
      { labelTh: "ประเภทแบตเตอรี่", labelEn: "Cell Chemistry", value: "LiFePO4 ปลอดภัยสูง" },
      { labelTh: "ความจุโมดูล", labelEn: "Capacity Range", value: "5 - 15 kWh Modular" },
      { labelTh: "เวลาสลับไฟสำรอง", labelEn: "EPS Switch Time", value: "< 10 Milliseconds" },
      { labelTh: "รอบการชาร์จ (Cycles)", labelEn: "Cycle Life", value: "6,000+ Cycles (15+ ปี)" },
    ],
    benefitTh: "บ้านสว่างตลอด 24 ชม. แม้ฝนตกหนักหรือไฟดับในพื้นที่",
    benefitEn: "Uninterrupted home power supply 24/7, completely resilient to grid outages.",
    icon: BatteryCharging,
    accentColor: "#7CA8D0",
  },
];

export default function TechnologyStorySection({
  locale,
}: {
  locale: string;
}) {
  const [activeStepId, setActiveStepId] = useState<string>("harvest");

  const activeStep = FLOW_STEPS.find((s) => s.id === activeStepId) || FLOW_STEPS[0];
  const activeStepIndex = Math.max(0, FLOW_STEPS.findIndex((s) => s.id === activeStepId));
  const StepIcon = activeStep.icon;

  return (
    <MangaChapter
      chapter="technology"
      chapterNumber={3}
      chapterTitle={locale === "th" ? "วิศวกรรมและเส้นทางพลังงาน" : "Engineering & System Flow"}
      variant="light"
      className="py-16 sm:py-20 lg:py-24"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="max-w-3xl">
          <MangaCaption tone="paper" className="mb-3">
            <Cpu className="h-3.5 w-3.5 text-[#0F172A]" />
            <span>{locale === "th" ? "มาตรฐานวิศวกรรมระดับโลก" : "Engineering Architecture"}</span>
          </MangaCaption>
          <h2 className="text-balance text-[clamp(1.85rem,3.8vw,3.4rem)] font-black leading-tight tracking-tight text-[#0F172A]">
            {locale === "th" ? "เส้นทางการทำงานของระบบโซลาร์ในบ้านคุณ" : "How Solar Power Flows Through Your Home"}
          </h2>
          <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-700 sm:text-base">
            {locale === "th"
              ? "ทำความเข้าใจวงจรพลังงานสะอาดตั้งแต่แสงอาทิตย์กระทบแผง จนถึงการจ่ายไฟเข้าแอร์ ตู้เย็น และแบตเตอรี่สำรองอย่างปลอดภัย"
              : "Discover how daylight transforms into safe, stable 220V/380V home power through Tier-1 engineering."}
          </p>
        </div>

        {/* Step Flow Navigation Selector Bar */}
        <div className="mt-10 grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
          {FLOW_STEPS.map((step) => {
            const Icon = step.icon;
            const isCurrent = step.id === activeStepId;
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => setActiveStepId(step.id)}
                className={cn(
                  "group relative flex flex-col justify-between rounded-2xl border-2 p-4 text-left transition-all duration-200 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F172A]",
                  isCurrent
                    ? "border-[#0F172A] bg-white shadow-[3px_3px_0_#0F172A] -translate-y-1"
                    : "border-slate-300 bg-[#F7F6F3]/70 hover:border-[#0F172A] hover:bg-white hover:shadow-[3px_3px_0_#0F172A]"
                )}
              >
                {/* Active accent bar on left edge */}
                {isCurrent && (
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-3 bottom-3 w-1 rounded-full"
                    style={{ background: step.accentColor }}
                  />
                )}
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "rounded-lg px-2 py-0.5 text-xs font-black transition-colors",
                      isCurrent ? "bg-[#0F172A] text-white" : "bg-slate-200 text-slate-700 group-hover:bg-slate-300"
                    )}
                  >
                    STEP {step.stepNumber}
                  </span>
                  <Icon
                    className={cn(
                      "h-5 w-5 transition-colors",
                      isCurrent ? "text-[#0F172A]" : "text-slate-400 group-hover:text-[#0F172A]"
                    )}
                  />
                </div>

                <div className="mt-3">
                  <div className="text-xs font-black text-[#0F172A] sm:text-sm line-clamp-1">
                    {locale === "th" ? step.titleTh.split("(")[0] : step.titleEn}
                  </div>
                  <span className="text-[11px] font-bold text-slate-500 line-clamp-1">
                    {locale === "th" ? step.tagTh : step.tagEn}
                  </span>
                </div>

                {isCurrent && (
                  <span
                    aria-hidden="true"
                    className="absolute -bottom-1.5 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rotate-45 border-b-2 border-r-2 border-[#0F172A] bg-white"
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Dynamic Angular Circuit Connector Line (Visx LinePath with Step Curve) */}
        <VisxSystemFlowConnector
          activeStepIndex={activeStepIndex}
          totalSteps={FLOW_STEPS.length}
          accentColor={activeStep.accentColor}
        />

        {/* Active Step Detailed Blueprint Card */}
        <div className="mt-4 sm:mt-0 rounded-3xl border-2 border-[#0F172A] bg-white p-6 shadow-[4px_4px_0_#0F172A] transition-all duration-300 sm:p-8 lg:p-10">
          <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12 lg:gap-10">
            
            {/* Left Blueprint Details */}
            <div className="lg:col-span-7">
              <div className="flex items-center gap-2">
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-lg border-2 border-[#0F172A] text-white shadow-[2px_2px_0_#0F172A]"
                  style={{ background: activeStep.accentColor }}
                >
                  <StepIcon className="h-3.5 w-3.5" />
                </span>
                <span className="rounded-xl border-2 border-[#0F172A] bg-[#B7D1EA] px-3 py-1 text-xs font-black text-[#0F172A]">
                  STEP {activeStep.stepNumber}
                </span>
                <span className="text-xs font-black uppercase tracking-wider text-slate-500">
                  {locale === "th" ? activeStep.tagTh : activeStep.tagEn}
                </span>
              </div>

              <h3 className="mt-3 text-2xl font-black text-[#0F172A] sm:text-3xl">
                {locale === "th" ? activeStep.titleTh : activeStep.titleEn}
              </h3>

              <p className="mt-3 text-sm font-semibold leading-relaxed text-slate-700 sm:text-base">
                {locale === "th" ? activeStep.descTh : activeStep.descEn}
              </p>

              {/* Real Homeowner Benefit Callout */}
              <div className="mt-6 flex items-start gap-3 rounded-2xl border-2 border-[#0F172A] bg-[#FFFBEB] p-4 shadow-[3px_3px_0_#0F172A]">
                <Sparkles className="mt-0.5 h-5 w-5 text-[#F59E0B] shrink-0" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#F59E0B]" />
                    <span className="text-xs font-black uppercase tracking-wider text-slate-600">
                      {locale === "th" ? "ประโยชน์จริงสำหรับเจ้าของบ้าน" : "Homeowner Key Benefit"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm font-bold text-[#0F172A]">
                    {locale === "th" ? activeStep.benefitTh : activeStep.benefitEn}
                  </p>
                </div>
              </div>
            </div>

            {/* Right Technical Specs Grid */}
            <div className="lg:col-span-5">
              <div className="rounded-2xl border-2 border-[#0F172A] bg-[#F7F6F3] p-5 shadow-[3px_3px_0_#0F172A]">
                <div className="flex items-center gap-2 border-b-2 border-[#0F172A]/15 pb-3">
                  <ShieldCheck className="h-5 w-5 text-emerald-600" />
                  <span className="text-xs font-black uppercase tracking-wider text-[#0F172A]">
                    {locale === "th" ? "สเปกวิศวกรรม Tier-1" : "Technical Engineering Specs"}
                  </span>
                </div>

                <div className="mt-4 space-y-2.5">
                  {activeStep.specs.map((spec, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-xl border border-[#0F172A]/10 bg-white p-2.5 text-xs transition-colors hover:border-[#0F172A]/30"
                    >
                      <span className="font-bold text-slate-600">
                        {locale === "th" ? spec.labelTh : spec.labelEn}
                      </span>
                      <span className="font-black text-[#0F172A]">
                        {spec.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>
    </MangaChapter>
  );
}

