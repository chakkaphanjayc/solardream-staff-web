"use client";

import Image from "next/image";
import Link from "next/link";
import {
  FiArrowRight,
  FiZap,
  FiShield,
  FiCheckCircle,
  FiTrendingUp,
  FiSliders,
  FiSun,
} from "react-icons/fi";
import LocationPicker from "./location-picker";
import SolarEstimate from "./solar-estimate";
import SolarSizeSlider from "./solar-size-slider";
import SunScene from "./sun-scene";
import { Reveal } from "../solar-motion";
import { GsapStagger } from "@/components/ui/GsapMotion";
import styles from "../solar-home.module.css";

type SolarHeroProps = Readonly<{
  locale: string;
}>;

export default function SolarHero({ locale }: SolarHeroProps) {
  const isThai = locale === "th";

  return (
    <section
      id="solar"
      className={`${styles.hero} relative isolate overflow-hidden bg-[#F0EEE9]`}
      aria-labelledby="solar-hero-title"
    >
      {/* Material You Layered Organic Ambient Blur Shapes */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-24 -left-20 h-[38rem] w-[38rem] rounded-full bg-[#B7D1EA]/15 blur-3xl" />
        <div className="absolute top-1/4 -right-16 h-[34rem] w-[34rem] rounded-full bg-[#DCE8F5]/40 blur-3xl" />
        <div className="absolute bottom-10 left-1/3 h-[28rem] w-[28rem] rounded-full bg-[#D8A87B]/10 blur-3xl" />
      </div>

      <div className={styles.contentWidth}>
        <div className={styles.heroGrid}>
          <Reveal className={styles.heroCopy}>
            {/* Branding & Value Chip */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#DCE8F5] px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-[#2E2C27] shadow-sm">
                <FiZap className="size-3.5 text-[#4F7FA8]" />
                {isThai ? "ลดค่าไฟบ้านสูงสุด 70%" : "Save up to 70% on power"}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-[#F7F6F3] px-3 py-1 text-xs font-semibold text-[#4E4B44]">
                <FiShield className="size-3 text-[#4F7FA8]" />
                {isThai ? "ประกันแผง 25 ปี" : "25-Yr Panel Warranty"}
              </span>
            </div>

            <h1 id="solar-hero-title" className="text-3xl font-extrabold tracking-tight text-[#1C1C1A] sm:text-4xl lg:text-5xl leading-[1.15]">
              {isThai
                ? "เปลี่ยนแสงแดดเป็นพลังงานฟรีตลอดชีพ ด้วยระบบโซลาร์รูฟท็อปอัจฉริยะ"
                : "Turn Sunlight into Lifetime Free Energy with Smart Solar Rooftop"}
            </h1>

            <p className="mt-4 text-base leading-relaxed text-[#4E4B44] sm:text-lg max-w-xl">
              {isThai
                ? "ออกแบบและคำนวณขนาดระบบที่คุ้มค่าที่สุดสำหรับบ้านคุณ วิศวกรผู้เชี่ยวชาญดูแลครบวงจรตั้งแต่ประเมิน ขออนุญาตการไฟฟ้า จนถึงเปิดใช้งานใน 1 วัน"
                : "Size and customize the most profitable solar system for your home. Certified engineers manage end-to-end permits and 1-day installation."}
            </p>

            {/* High Conversion Action Pill CTAs */}
            <GsapStagger as="div" className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                href={`/${locale}/wizard`}
                className="solar-home-primary inline-flex items-center justify-center gap-2 rounded-full bg-[#B7D1EA] px-7 py-3.5 text-sm font-bold text-[#142533] shadow-sm hover:bg-[#A5C2DE]/90 hover:shadow-md active:scale-95 transition-all duration-300"
              >
                <span>{isThai ? "คำนวณระบบที่เหมาะกับคุณ (Smart Wizard)" : "Start Smart Wizard"}</span>
                <FiArrowRight className="size-4" />
              </Link>
              <Link
                href={`/${locale}/build`}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#DCE8F5] px-6 py-3.5 text-sm font-bold text-[#2E2C27] hover:bg-[#DCE8F5]/90 active:scale-95 transition-all duration-300"
              >
                <span>{isThai ? "สตูดิโอออกแบบ Build" : "Custom Build Studio"}</span>
              </Link>
              <a
                href="#minigame"
                className="inline-flex items-center justify-center gap-1.5 rounded-full border border-[#8E8B83]/30 bg-transparent px-5 py-3 text-xs font-bold text-[#4F7FA8] hover:bg-[#A5C2DE]/10 active:scale-95 transition-all duration-300"
              >
                <FiSliders className="size-3.5" />
                <span>{isThai ? "ทดลองเล่น Solar Lab" : "Try Solar Lab Minigame"}</span>
              </a>
            </GsapStagger>

            {/* Key Trust Signals */}
            <div className="mt-6 flex flex-wrap items-center gap-4 text-xs font-semibold text-[#4E4B44]">
              <span className="flex items-center gap-1.5">
                <FiCheckCircle className="size-4 text-[#4F7FA8]" />
                {isThai ? "แผง Tier-1 N-Type TOPCon" : "Tier-1 N-Type TOPCon"}
              </span>
              <span className="flex items-center gap-1.5">
                <FiCheckCircle className="size-4 text-[#4F7FA8]" />
                {isThai ? "ติดตั้งได้มาตรฐาน วศ. 1 วัน" : "1-Day Certified Install"}
              </span>
              <span className="flex items-center gap-1.5">
                <FiCheckCircle className="size-4 text-[#4F7FA8]" />
                {isThai ? "แอปดูการผลิตไฟแบบ Real-Time" : "Real-time Mobile App"}
              </span>
            </div>
          </Reveal>

          <Reveal
            className={styles.heroSceneWrap}
            transition={{
              duration: 0.9,
              delay: 0.12,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            <SunScene locale={locale} />
          </Reveal>
        </div>

        {/* Quick Estimator Panel in MD3 Surface Container */}
        <Reveal
          className="mt-12 rounded-[28px] border border-transparent bg-[#E6E3DC] p-6 shadow-sm transition-all duration-300 sm:p-8"
          transition={{ duration: 0.85, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
        >
          <div id="simulator" className={styles.simulatorGrid}>
            <div className={styles.simulatorControls}>
              <LocationPicker locale={locale} />
              <div className={styles.simulatorRule} aria-hidden="true" />
              <SolarSizeSlider locale={locale} />
            </div>
            <SolarEstimate locale={locale} />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
