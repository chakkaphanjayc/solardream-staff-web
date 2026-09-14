"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  FiSun,
  FiMoon,
  FiZap,
  FiBatteryCharging,
  FiTrendingUp,
  FiSliders,
  FiCheckCircle,
  FiArrowRight,
  FiInfo,
  FiRefreshCw,
  FiShield,
  FiWind,
  FiCpu,
} from "react-icons/fi";
import { Reveal } from "../solar-motion";

type SolarKnowledgeGameProps = Readonly<{
  locale: string;
}>;

export default function SolarKnowledgeGame({ locale }: SolarKnowledgeGameProps) {
  const isThai = locale === "th";

  // Simulation Interactive States
  const [hour, setHour] = useState<number>(12); // 0 - 24
  const [tilt, setTilt] = useState<"flat" | "optimal" | "steep">("optimal"); // 0 deg, 15 deg, 45 deg
  const [isClean, setIsClean] = useState<boolean>(true);
  const [batteryCapacity, setBatteryCapacity] = useState<number>(5); // 0, 5, 10 kWh
  const [acLoad, setAcLoad] = useState<boolean>(true); // 2.2 kW
  const [evLoad, setEvLoad] = useState<boolean>(false); // 7.0 kW
  const [baseLoad, setBaseLoad] = useState<boolean>(true); // 0.6 kW

  // Calculate Solar Output Physics based on hour, tilt, cleanliness
  const { solarKw, sunIntensity, isDaytime } = useMemo(() => {
    // Sun curve: peak at 12:00, 0 before 6:00 and after 18:00
    let intensity = 0;
    if (hour >= 6 && hour <= 18) {
      // Bell curve approximation: sin((hour - 6) / 12 * PI)
      const rad = ((hour - 6) / 12) * Math.PI;
      intensity = Math.sin(rad);
    }

    // Tilt factor (Thailand optimal is ~15 deg south)
    let tiltFactor = 1.0;
    if (tilt === "flat") tiltFactor = 0.84;
    else if (tilt === "steep") tiltFactor = 0.76;

    // Cleanliness factor
    const cleanFactor = isClean ? 1.0 : 0.72;

    // Max 10 kWp system
    const rawKw = 10 * intensity * tiltFactor * cleanFactor;
    return {
      solarKw: Math.max(0, parseFloat(rawKw.toFixed(1))),
      sunIntensity: intensity,
      isDaytime: hour >= 6 && hour < 18,
    };
  }, [hour, tilt, isClean]);

  // Calculate Home Consumption Load
  const homeLoadKw = useMemo(() => {
    let load = 0;
    if (baseLoad) load += 0.6;
    if (acLoad) load += 2.2;
    if (evLoad) load += 7.0;
    return parseFloat(load.toFixed(1));
  }, [baseLoad, acLoad, evLoad]);

  // Net Balance
  const netKw = useMemo(() => {
    return parseFloat((solarKw - homeLoadKw).toFixed(1));
  }, [solarKw, homeLoadKw]);

  // Dynamic Solar Knowledge Insights
  const dynamicInsight = useMemo(() => {
    if (!isDaytime) {
      if (batteryCapacity > 0) {
        return isThai
          ? "🌙 เวลากลางคืนไม่มีแสงแดด: ระบบสลับมาดึงพลังงานที่กักเก็บไว้ในแบตเตอรี่ LFP มาจ่ายให้เครื่องใช้ไฟฟ้าอัตโนมัติ ทำให้คุณลดการซื้อไฟจากการไฟฟ้าช่วง Peak ได้ 100%!"
          : "🌙 Nighttime / Zero Sun: System automatically draws clean energy stored in the LFP battery to power your home, avoiding peak utility grid rates!";
      } else {
        return isThai
          ? "🌙 กลางคืน: เมื่อไม่มีแบตเตอรี่ บ้านจะดึงไฟจากสายส่งของการไฟฟ้า หากต้องการใช้ไฟฟรี 24 ชั่วโมง แนะนำให้ติดตั้งแบตเตอรี่กักเก็บพลังงานร่วมด้วย"
          : "🌙 Nighttime: Without a battery storage unit, your home draws power from the utility grid. Adding a battery enables 24/7 free solar power.";
      }
    }

    if (!isClean) {
      return isThai
        ? "⚠️ แผงมีฝุ่นเกาะหนา: ประสิทธิภาพลดลงถึง 28%! การล้างทำความสะอาดแผงปีละ 1-2 ครั้ง ช่วยเพิ่มกำลังผลิตได้ทันที และคืนทุนเร็วกว่าเดิมถึง 2 ปี"
        : "⚠️ Dusty Panels: Output drops by ~28%! Regular cleaning twice a year instantly restores peak generation and speeds up payback by up to 2 years.";
    }

    if (netKw > 0) {
      if (batteryCapacity > 0) {
        return isThai
          ? `☀️ ผลิตไฟเกินความต้องการ (+${netKw} kW): พลังงานส่วนเกินจะถูกส่งไปชาร์จแบตเตอรี่ ${batteryCapacity} kWh จนเต็ม แล้วจึงขายคืนเข้าระบบ Grid (โครงการโซลาร์ภาคประชาชน)!`
          : `☀️ ผลิตไฟเกินความต้องการ (+${netKw} kW): แผงผลิตไฟได้มากกว่าที่บ้านใช้ พลังงานส่วนเกินสามารถขายคืนเข้าสายส่งการไฟฟ้าได้ 2.20 บาท/หน่วย!`;
      }
      return isThai
        ? `⚡ ไฟฟรี 100%: พลังงานแสงอาทิตย์ ${solarKw} kW จ่ายให้บ้าน ${homeLoadKw} kW ฟรีทั้งหมด เหลือพลังงานส่วนเกิน +${netKw} kW สำหรับกักเก็บหรือขายคืน!`
        : `⚡ 100% Free Power: Solar generates ${solarKw} kW, effortlessly covering your ${homeLoadKw} kW demand with +${netKw} kW surplus!`;
    }

    if (netKw < 0) {
      return isThai
        ? `⚡ ใช้งานไฟหนักกว่าการผลิต: แผงช่วยแบกรับภาระไปแล้ว ${solarKw} kW ส่วนที่ขาดอีก ${Math.abs(netKw)} kW ระบบจะดึงจากแบตเตอรี่หรือการไฟฟ้าเข้ามาเสริมอัตโนมัติโดยไฟไม่กระตุก!`
        : `⚡ High Demand: Solar covers ${solarKw} kW of your needs. The remaining ${Math.abs(netKw)} kW is seamlessly supplemented from your battery or the grid with zero flicker!`;
    }

    return isThai
      ? "🎯 การผลิตและใช้ไฟสมดุลอย่างสมบูรณ์แบบ: พลังงานสะอาดหล่อเลี้ยงบ้านคุณ 100% โดยไม่ต้องพึ่งพาไฟฟ้าจากภายนอก!"
      : "🎯 Perfect Energy Balance: Clean solar energy fully sustains your home with zero waste!";
  }, [isDaytime, batteryCapacity, isClean, netKw, solarKw, homeLoadKw, isThai]);

  // Annual Estimated Savings Calculation (THB)
  const estimatedAnnualSavings = useMemo(() => {
    // Avg 4.5 peak sun hours per day in Thailand, 10kWp system ~ 14,000 kWh/year
    // Tilt factor & cleanliness
    const eff = (tilt === "optimal" ? 1.0 : tilt === "flat" ? 0.85 : 0.78) * (isClean ? 1.0 : 0.72);
    const annualKwh = 14000 * eff;
    const rate = 4.7; // THB per unit average
    return Math.round(annualKwh * rate);
  }, [tilt, isClean]);

  return (
    <section
      id="minigame"
      data-bagui="solar-knowledge-game"
      className="relative isolate overflow-hidden py-16 sm:py-24 bg-[#F0EEE9]"
      aria-labelledby="simulation-game-title"
    >
      {/* Material You Layered Organic Ambient Blur Shapes */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-32 -left-32 h-[34rem] w-[34rem] rounded-full bg-[#B7D1EA]/15 blur-3xl" />
        <div className="absolute top-1/3 -right-24 h-[30rem] w-[30rem] rounded-full bg-[#DCE8F5]/40 blur-3xl" />
        <div className="absolute -bottom-24 left-1/4 h-[28rem] w-[28rem] rounded-full bg-[#D8A87B]/12 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-[#DCE8F5] px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-[#2E2C27] shadow-sm">
            <FiSliders className="size-3.5 text-[#4F7FA8]" />
            {isThai ? "SOLAR POWER LAB · ห้องทดลองพลังงานมีชีวิต" : "SOLAR POWER LAB · LIVING SIMULATION"}
          </span>
          <h2
            id="simulation-game-title"
            className="mt-4 text-3xl font-bold tracking-tight text-[#1C1C1A] sm:text-4xl lg:text-5xl"
          >
            {isThai
              ? "จำลองการทำงานโซลาร์เซลล์บนบ้านคุณ"
              : "Experience Real-time Solar Physics on Your Roof"}
          </h2>
          <p className="mt-3 text-base leading-relaxed text-[#4E4B44] sm:text-lg">
            {isThai
              ? "ลองขยับดวงอาทิตย์ ปรับองศาหลังคา ทำความสะอาดแผง หรือเปิดแอร์และชาร์จ EV เพื่อดูการไหลเวียนของพลังงานและผลประหยัดค่าไฟในพริบตา"
              : "Shift the sun, tilt the roof, clean panels, or toggle high-draw appliances to see real-time energy conversion and instant savings."}
          </p>
        </div>

        {/* Interactive Lab Grid */}
        <div className="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-stretch">
          {/* ─── LEFT: LIVE VISUAL ENERGY CANVAS (7 Cols) ─── */}
          <div className="flex flex-col justify-between overflow-hidden rounded-[28px] border border-transparent bg-[#E6E3DC] p-6 shadow-sm transition-all duration-300 lg:col-span-7 sm:p-8">
            {/* Visual Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#8E8B83]/15 pb-4">
              <div className="flex items-center gap-2.5">
                <div
                  className={`flex size-10 items-center justify-center rounded-full transition-colors duration-500 ${
                    isDaytime ? "bg-[#DCE8F5] text-[#4F7FA8]" : "bg-[#0E2336] text-[#A5C2DE]"
                  }`}
                >
                  {isDaytime ? <FiSun className="size-5 animate-spin-slow" /> : <FiMoon className="size-5" />}
                </div>
                <div>
                  <div className="text-xs font-medium text-[#4E4B44]">
                    {isThai ? "เวลาจำลอง (Time)" : "Simulated Time"}
                  </div>
                  <div className="text-lg font-bold text-[#1C1C1A]">
                    {hour.toString().padStart(2, "0")}:00 น.
                    <span className="ml-2 text-xs font-normal text-[#4F7FA8]">
                      {isDaytime ? (isThai ? "(กลางวัน แดดส่อง)" : "(Daylight Active)") : (isThai ? "(กลางคืน)" : "(Night)")}
                    </span>
                  </div>
                </div>
              </div>

              {/* Status Pills */}
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#DCE8F5] px-3 py-1 text-xs font-semibold text-[#2E2C27]">
                  <span className={`size-2 rounded-full ${solarKw > 0 ? "bg-[#388E3C] animate-pulse" : "bg-[#8E8B83]"}`} />
                  {solarKw > 0 ? (isThai ? "กำลังผลิตไฟ" : "Generating") : (isThai ? "พักการผลิต" : "Idle")}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-[#F7F6F3] px-3 py-1 text-xs font-medium text-[#4E4B44]">
                  {tilt === "optimal" ? "Optimal 15°" : tilt === "flat" ? "Flat 0°" : "Steep 45°"}
                </span>
              </div>
            </div>

            {/* Simulated Animated House & Sun Graphics */}
            <div className="relative my-6 flex min-h-[260px] flex-1 items-center justify-center overflow-hidden rounded-[20px] bg-gradient-to-b from-[#DCE8F5]/30 via-[#E6E3DC] to-[#F7F6F3]/40 p-4">
              {/* Dynamic Sun Orb following an arc */}
              <div
                className="absolute transition-all duration-700 ease-out"
                style={{
                  left: `${Math.min(92, Math.max(8, ((hour - 4) / 16) * 100))}%`,
                  top: `${isDaytime ? Math.max(12, 100 - sunIntensity * 85) : 88}%`,
                  opacity: isDaytime ? 1 : 0.2,
                }}
              >
                <div className="relative flex items-center justify-center">
                  <div className="absolute size-20 rounded-full bg-[#F59E0B]/20 blur-xl animate-pulse" />
                  <div className="size-12 rounded-full bg-gradient-to-tr from-[#F59E0B] to-[#FBBF24] shadow-[0_0_30px_rgba(245,158,11,0.6)] flex items-center justify-center text-white">
                    <FiSun className="size-6 animate-spin-slow" />
                  </div>
                </div>
              </div>

              {/* Architectural House & Roof Graphic (SVG) */}
              <div className="relative z-10 w-full max-w-[420px] pt-8">
                <svg viewBox="0 0 400 240" className="w-full drop-shadow-md">
                  {/* Sky Glow */}
                  <defs>
                    <linearGradient id="panelGlow" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor={solarKw > 0 ? "#B7D1EA" : "#4E4B44"} />
                      <stop offset="100%" stopColor={solarKw > 0 ? "#8B70CD" : "#2E2C27"} />
                    </linearGradient>
                    <linearGradient id="houseWall" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#FFFFFF" />
                      <stop offset="100%" stopColor="#F7F6F3" />
                    </linearGradient>
                  </defs>

                  {/* House Body */}
                  <rect x="70" y="110" width="260" height="110" rx="12" fill="url(#houseWall)" stroke="#8E8B83" strokeWidth="1.5" />
                  <rect x="180" y="150" width="40" height="70" rx="4" fill="#B7D1EA" opacity="0.15" stroke="#B7D1EA" strokeWidth="1.5" />
                  <circle cx="212" cy="185" r="2.5" fill="#B7D1EA" />

                  {/* Windows with interactive interior warm light */}
                  <rect x="95" y="135" width="45" height="35" rx="6" fill={!isDaytime ? "#FDE047" : "#B7D1EA"} opacity={!isDaytime ? 0.85 : 0.6} stroke="#8E8B83" strokeWidth="1" />
                  <line x1="117.5" y1="135" x2="117.5" y2="170" stroke="#8E8B83" strokeWidth="1" />
                  <line x1="95" y1="152.5" x2="140" y2="152.5" stroke="#8E8B83" strokeWidth="1" />

                  <rect x="260" y="135" width="45" height="35" rx="6" fill={!isDaytime ? "#FDE047" : "#B7D1EA"} opacity={!isDaytime ? 0.85 : 0.6} stroke="#8E8B83" strokeWidth="1" />
                  <line x1="282.5" y1="135" x2="282.5" y2="170" stroke="#8E8B83" strokeWidth="1" />
                  <line x1="260" y1="152.5" x2="305" y2="152.5" stroke="#8E8B83" strokeWidth="1" />

                  {/* Rooftop Structure */}
                  <polygon points="50,110 200,45 350,110" fill="#313331" stroke="#1C1C1A" strokeWidth="2" />

                  {/* Photovoltaic Solar Panels on Roof (Interactive Tilt transformation) */}
                  <g
                    transform={`translate(200, 78) rotate(${tilt === "flat" ? -6 : tilt === "steep" ? 14 : 4}) translate(-200, -78)`}
                    className="transition-transform duration-500 ease-out"
                  >
                    <rect x="100" y="60" width="95" height="42" rx="4" fill="url(#panelGlow)" stroke="#DCE8F5" strokeWidth="1.5" />
                    <rect x="205" y="60" width="95" height="42" rx="4" fill="url(#panelGlow)" stroke="#DCE8F5" strokeWidth="1.5" />
                    {/* Solar Panel Grid Wires */}
                    <line x1="132" y1="60" x2="132" y2="102" stroke="#FFFFFF" strokeWidth="0.75" opacity="0.4" />
                    <line x1="164" y1="60" x2="164" y2="102" stroke="#FFFFFF" strokeWidth="0.75" opacity="0.4" />
                    <line x1="237" y1="60" x2="237" y2="102" stroke="#FFFFFF" strokeWidth="0.75" opacity="0.4" />
                    <line x1="269" y1="60" x2="269" y2="102" stroke="#FFFFFF" strokeWidth="0.75" opacity="0.4" />

                    {/* Sparkle effects if clean & generating */}
                    {isClean && solarKw > 2 && (
                      <circle cx="120" cy="72" r="3" fill="#FFFFFF" className="animate-ping" />
                    )}
                  </g>

                  {/* Hybrid Inverter Wall Mount Box */}
                  <rect x="310" y="145" width="22" height="35" rx="3" fill="#2E2C27" stroke="#B7D1EA" strokeWidth="1" />
                  <circle cx="321" cy="155" r="2.5" fill={solarKw > 0 ? "#22C55E" : "#8E8B83"} className={solarKw > 0 ? "animate-pulse" : ""} />

                  {/* Battery Unit Ground Mount (If enabled) */}
                  {batteryCapacity > 0 && (
                    <g className="transition-opacity duration-300">
                      <rect x="42" y="165" width="22" height="45" rx="3" fill="#D8A87B" stroke="#D5DFD7" strokeWidth="1" />
                      <circle cx="53" cy="175" r="2" fill="#34D399" />
                      <text x="53" y="196" fontSize="7" fill="#FFFFFF" textAnchor="middle" fontWeight="bold">
                        {batteryCapacity}k
                      </text>
                    </g>
                  )}

                  {/* Energy Flow Animation Particles (Rays & Wires) */}
                  {solarKw > 0 && (
                    <>
                      <line x1="200" y1="102" x2="320" y2="145" stroke="#B7D1EA" strokeWidth="2" strokeDasharray="4 4" className="animate-pulse" />
                      <line x1="320" y1="180" x2="200" y2="185" stroke="#22C55E" strokeWidth="2" strokeDasharray="3 3" />
                    </>
                  )}
                </svg>
              </div>
            </div>

            {/* Real-time Dynamic Physics Insight Callout */}
            <div className="rounded-[20px] bg-[#DCE8F5] p-4 text-[#2E2C27] shadow-sm">
              <div className="flex items-start gap-3">
                <FiInfo className="mt-0.5 size-5 shrink-0 text-[#4F7FA8]" />
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#4F7FA8]">
                    {isThai ? "ระบบวิเคราะห์พลังงานอัจฉริยะ (Physics Insight)" : "Physics Simulation Engine"}
                  </h4>
                  <p className="mt-1 text-sm leading-relaxed font-medium">
                    {dynamicInsight}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ─── RIGHT: INTERACTIVE CONTROL DECK & METRICS (5 Cols) ─── */}
          <div className="flex flex-col justify-between gap-6 rounded-[28px] border border-transparent bg-[#E6E3DC] p-6 shadow-sm lg:col-span-5 sm:p-8">
            {/* Live Metrics Quad */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#4E4B44]">
                {isThai ? "กำลังการผลิตและใช้ไฟฟ้าสด" : "Live Power Metrics"}
              </h3>

              <div className="mt-4 grid grid-cols-2 gap-3">
                {/* Metric 1: Solar Gen */}
                <div className="rounded-[20px] bg-[#F0EEE9] p-4 shadow-sm border border-[#8E8B83]/10">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-[#4F7FA8]">
                    <FiSun className="size-4" />
                    {isThai ? "แผงผลิตได้" : "Solar Power"}
                  </div>
                  <div className="mt-2 text-2xl font-bold text-[#1C1C1A]">
                    {solarKw}{" "}
                    <span className="text-xs font-semibold text-[#4E4B44]">kW</span>
                  </div>
                </div>

                {/* Metric 2: Home Load */}
                <div className="rounded-[20px] bg-[#F0EEE9] p-4 shadow-sm border border-[#8E8B83]/10">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-[#D8A87B]">
                    <FiZap className="size-4" />
                    {isThai ? "บ้านใช้ไฟ" : "Home Load"}
                  </div>
                  <div className="mt-2 text-2xl font-bold text-[#1C1C1A]">
                    {homeLoadKw}{" "}
                    <span className="text-xs font-semibold text-[#4E4B44]">kW</span>
                  </div>
                </div>

                {/* Metric 3: Net Grid */}
                <div className="rounded-[20px] bg-[#F0EEE9] p-4 shadow-sm border border-[#8E8B83]/10">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-[#4E4B44]">
                    <FiTrendingUp className="size-4" />
                    {isThai ? "สุทธิ (Net)" : "Net Flow"}
                  </div>
                  <div className={`mt-2 text-xl font-bold ${netKw >= 0 ? "text-[#2E7D32]" : "text-[#C2410C]"}`}>
                    {netKw > 0 ? `+${netKw}` : netKw}{" "}
                    <span className="text-xs font-semibold text-[#4E4B44]">kW</span>
                  </div>
                </div>

                {/* Metric 4: Est. Annual Savings */}
                <div className="rounded-[20px] bg-[#DCE8F5] p-4 shadow-sm">
                  <div className="text-xs font-medium text-[#2E2C27]">
                    {isThai ? "ประหยัดเฉลี่ย" : "Est. Savings"}
                  </div>
                  <div className="mt-2 text-xl font-extrabold text-[#4F7FA8]">
                    ฿{estimatedAnnualSavings.toLocaleString()}
                    <span className="block text-[10px] font-normal text-[#4E4B44]">
                      {isThai ? "/ปี โดยประมาณ" : "/year avg"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Controls Deck */}
            <div className="space-y-5">
              {/* Control 1: Time of Day Slider */}
              <div className="rounded-[20px] bg-[#F0EEE9] p-4 shadow-sm border border-[#8E8B83]/10">
                <div className="flex items-center justify-between">
                  <label htmlFor="time-slider" className="text-xs font-bold uppercase tracking-wider text-[#1C1C1A]">
                    {isThai ? "ช่วงเวลาใน 1 วัน (Time of Day)" : "Time of Day"}
                  </label>
                  <span className="rounded-full bg-[#DCE8F5] px-2.5 py-0.5 text-xs font-bold text-[#4F7FA8]">
                    {hour}:00
                  </span>
                </div>

                <input
                  id="time-slider"
                  type="range"
                  min="0"
                  max="24"
                  step="1"
                  value={hour}
                  onChange={(e) => setHour(parseInt(e.target.value, 10))}
                  className="mt-3 w-full accent-[#B7D1EA] cursor-pointer"
                />

                {/* Preset Time Quick-Buttons */}
                <div className="mt-2 flex justify-between text-[11px] font-medium text-[#4E4B44]">
                  <button
                    type="button"
                    onClick={() => setHour(7)}
                    className={`rounded-full px-2 py-0.5 transition-colors ${hour === 7 ? "bg-[#B7D1EA] text-[#142533] font-bold" : "hover:bg-[#DCE8F5]"}`}
                  >
                    🌅 07:00
                  </button>
                  <button
                    type="button"
                    onClick={() => setHour(12)}
                    className={`rounded-full px-2 py-0.5 transition-colors ${hour === 12 ? "bg-[#B7D1EA] text-[#142533] font-bold" : "hover:bg-[#DCE8F5]"}`}
                  >
                    ☀️ 12:00
                  </button>
                  <button
                    type="button"
                    onClick={() => setHour(16)}
                    className={`rounded-full px-2 py-0.5 transition-colors ${hour === 16 ? "bg-[#B7D1EA] text-[#142533] font-bold" : "hover:bg-[#DCE8F5]"}`}
                  >
                    🌇 16:00
                  </button>
                  <button
                    type="button"
                    onClick={() => setHour(21)}
                    className={`rounded-full px-2 py-0.5 transition-colors ${hour === 21 ? "bg-[#B7D1EA] text-[#142533] font-bold" : "hover:bg-[#DCE8F5]"}`}
                  >
                    🌙 21:00
                  </button>
                </div>
              </div>

              {/* Control 2: Tilt & Cleanliness Toggles */}
              <div className="grid grid-cols-2 gap-3">
                {/* Tilt selector */}
                <div className="rounded-[20px] bg-[#F0EEE9] p-3.5 shadow-sm border border-[#8E8B83]/10">
                  <div className="text-[11px] font-bold text-[#1C1C1A]">
                    {isThai ? "องศาหลังคา (Tilt)" : "Roof Tilt"}
                  </div>
                  <div className="mt-2 flex gap-1">
                    {(["flat", "optimal", "steep"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTilt(t)}
                        className={`flex-1 rounded-full py-1 text-[11px] font-semibold transition-all active:scale-95 ${
                          tilt === t
                            ? "bg-[#B7D1EA] text-[#142533] shadow-sm"
                            : "bg-[#F7F6F3] text-[#4E4B44] hover:bg-[#DCE8F5]"
                        }`}
                      >
                        {t === "optimal" ? "15°" : t === "flat" ? "0°" : "45°"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Cleanliness Toggle */}
                <div className="rounded-[20px] bg-[#F0EEE9] p-3.5 shadow-sm border border-[#8E8B83]/10">
                  <div className="text-[11px] font-bold text-[#1C1C1A]">
                    {isThai ? "ความสะอาดแผง" : "Panel Clean"}
                  </div>
                  <div className="mt-2 flex gap-1">
                    <button
                      type="button"
                      onClick={() => setIsClean(true)}
                      className={`flex-1 rounded-full py-1 text-[11px] font-semibold transition-all active:scale-95 ${
                        isClean
                          ? "bg-[#B7D1EA] text-[#142533] shadow-sm"
                          : "bg-[#F7F6F3] text-[#4E4B44] hover:bg-[#DCE8F5]"
                      }`}
                    >
                      ✨ {isThai ? "สะอาด" : "Clean"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsClean(false)}
                      className={`flex-1 rounded-full py-1 text-[11px] font-semibold transition-all active:scale-95 ${
                        !isClean
                          ? "bg-[#D8A87B] text-white shadow-sm"
                          : "bg-[#F7F6F3] text-[#4E4B44] hover:bg-[#DCE8F5]"
                      }`}
                    >
                      🧹 {isThai ? "ฝุ่นเกาะ" : "Dusty"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Control 3: Battery Storage & Appliances */}
              <div className="rounded-[20px] bg-[#F0EEE9] p-4 shadow-sm border border-[#8E8B83]/10">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-[#1C1C1A]">
                    {isThai ? "ความจุแบตเตอรี่ (Storage)" : "Battery Storage"}
                  </div>
                  <div className="flex gap-1">
                    {[0, 5, 10].map((cap) => (
                      <button
                        key={cap}
                        type="button"
                        onClick={() => setBatteryCapacity(cap)}
                        className={`rounded-full px-2.5 py-0.5 text-xs font-bold transition-all active:scale-95 ${
                          batteryCapacity === cap
                          ? "bg-[#B7D1EA] text-[#142533]"
                            : "bg-[#F7F6F3] text-[#4E4B44] hover:bg-[#DCE8F5]"
                        }`}
                      >
                        {cap === 0 ? (isThai ? "ไม่มี" : "None") : `${cap} kWh`}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-3 border-t border-[#8E8B83]/10 pt-3">
                  <div className="text-[11px] font-bold text-[#4E4B44] mb-2">
                    {isThai ? "จำลองเปิดเครื่องใช้ไฟฟ้า (Appliance Loads)" : "Toggle Appliances"}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setAcLoad(!acLoad)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-all active:scale-95 ${
                        acLoad
                          ? "bg-[#DCE8F5] text-[#2E2C27] ring-1 ring-[#B7D1EA]"
                          : "bg-[#F7F6F3] text-[#4E4B44] opacity-60"
                      }`}
                    >
                      ❄️ {isThai ? "แอร์ 2.2 kW" : "Air Con 2.2 kW"} {acLoad ? "✓" : ""}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEvLoad(!evLoad)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-all active:scale-95 ${
                        evLoad
                          ? "bg-[#DCE8F5] text-[#2E2C27] ring-1 ring-[#B7D1EA]"
                          : "bg-[#F7F6F3] text-[#4E4B44] opacity-60"
                      }`}
                    >
                      🚗 {isThai ? "เครื่องชาร์จ EV 7 kW" : "EV Charger 7 kW"} {evLoad ? "✓" : ""}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Direct High-Conversion Action CTAs */}
            <div className="pt-2 flex flex-col sm:flex-row gap-3">
              <Link
                href={`/${locale}/wizard`}
                className="solar-home-primary flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-[#B7D1EA] px-6 py-3.5 text-sm font-bold text-[#142533] shadow-sm hover:bg-[#A5C2DE]/90 hover:shadow-md active:scale-95 transition-all duration-300"
              >
                <span>{isThai ? "คำนวณระบบที่เหมาะกับบ้านคุณ" : "Start Smart Wizard"}</span>
                <FiArrowRight className="size-4" />
              </Link>
              <Link
                href={`/${locale}/build`}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#DCE8F5] px-6 py-3.5 text-sm font-bold text-[#2E2C27] hover:bg-[#DCE8F5]/90 active:scale-95 transition-all duration-300"
              >
                <span>{isThai ? "สตูดิโอออกแบบ Build" : "Custom Build"}</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
