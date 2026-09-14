"use client";

import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import type { HomeWeatherId } from "@/types/home";
import { HOME_MANGA_HERO_WEATHER_ASSETS } from "@/lib/homeMangaAssets";

export type WeatherHeroProps = {
  activeWeather: HomeWeatherId;
  className?: string;
};

const WEATHER_KEYS: HomeWeatherId[] = ["sunny", "cloudy", "rainy", "night"];

// Cubic bezier constant for exponential ease-out (expo.out)
const EXPO_EASE_OUT = [0.19, 1, 0.22, 1] as const;

/**
 * WeatherEffectsOverlay Component
 * Renders pointer-events-none overlay layer with manga-style animations
 * customized for each weather state.
 */
export function WeatherEffectsOverlay({ activeWeather }: { activeWeather: HomeWeatherId }) {
  return (
    <div className="absolute inset-0 z-20 h-full w-full pointer-events-none overflow-hidden select-none">
      <AnimatePresence mode="wait">
        {activeWeather === "sunny" && (
          <motion.div
            key="sunny-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: EXPO_EASE_OUT }}
            className="absolute inset-0 h-full w-full"
          >
            {/* Top-Left Rotating Screentone Sunburst */}
            <div className="absolute -top-32 -left-32 h-[500px] w-[500px] rounded-full opacity-35 animate-manga-rotate">
              <div
                className="h-full w-full rounded-full"
                style={{
                  backgroundImage: `
                    radial-gradient(circle at center, #000 0 1.5px, transparent 2px),
                    repeating-conic-gradient(from 0deg, #D8A87B 0deg 8deg, transparent 8deg 16deg)
                  `,
                  backgroundSize: "16px 16px, 100% 100%",
                  WebkitMaskImage: "radial-gradient(circle, black 35%, transparent 75%)",
                  maskImage: "radial-gradient(circle, black 35%, transparent 75%)",
                }}
              />
            </div>
            {/* Warm Sunlight Flare Accent */}
            <div className="absolute top-0 left-0 h-96 w-96 bg-gradient-to-br from-[#D8A87B]/20 via-amber-300/10 to-transparent blur-2xl" />
          </motion.div>
        )}

        {activeWeather === "cloudy" && (
          <motion.div
            key="cloudy-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: EXPO_EASE_OUT }}
            className="absolute inset-0 h-full w-full"
          >
            {/* Large Semi-Transparent Cloud Shadows Moving Left to Right */}
            <div className="absolute inset-0 h-full w-full animate-manga-cloud opacity-40">
              <div className="absolute top-10 -left-64 h-64 w-[600px] rounded-full bg-slate-900/60 blur-3xl" />
              <div className="absolute top-36 left-48 h-80 w-[800px] rounded-full bg-slate-950/70 blur-3xl" />
              <div className="absolute -bottom-10 left-12 h-72 w-[700px] rounded-full bg-slate-900/50 blur-3xl" />
            </div>

            {/* Halftone Cloud Screentone Accent */}
            <div
              className="absolute inset-0 opacity-20"
              style={{
                backgroundImage: "radial-gradient(circle, #000 0 1px, transparent 1.5px)",
                backgroundSize: "14px 14px",
                WebkitMaskImage: "linear-gradient(to right, transparent, black 40%, transparent 90%)",
                maskImage: "linear-gradient(to right, transparent, black 40%, transparent 90%)",
              }}
            />
          </motion.div>
        )}

        {activeWeather === "rainy" && (
          <motion.div
            key="rainy-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: EXPO_EASE_OUT }}
            className="pointer-events-none absolute inset-0 h-full w-full overflow-hidden"
          >
            {/* Subtle Soft Atmospheric Rain Wash */}
            <div className="pointer-events-none absolute inset-0 bg-slate-950/20 mix-blend-multiply" />
          </motion.div>
        )}

        {activeWeather === "night" && (
          <motion.div
            key="night-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: EXPO_EASE_OUT }}
            className="absolute inset-0 h-full w-full"
          >
            {/* Pulsing Halftone Star Effect on Top Half */}
            <div className="absolute top-0 left-0 right-0 h-3/5 animate-manga-star">
              <div
                className="h-full w-full"
                style={{
                  backgroundImage: `
                    radial-gradient(circle, #F7F6F3 0 1.2px, transparent 1.5px),
                    radial-gradient(circle, #2B9EB3 0 0.8px, transparent 1.2px)
                  `,
                  backgroundSize: "20px 20px, 40px 40px",
                  backgroundPosition: "0 0, 10px 10px",
                  WebkitMaskImage: "linear-gradient(to bottom, black 30%, transparent 95%)",
                  maskImage: "linear-gradient(to bottom, black 30%, transparent 95%)",
                }}
              />
            </div>
            {/* Deep Night Atmospheric Gradient */}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/40 via-transparent to-indigo-950/20" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * WeatherHero Component
 * Primary manga weather view controller. Renders 4 base background images
 * and crossfades between them using 1000ms exponential ease-out transitions,
 * with dynamic non-blocking WeatherEffectsOverlay layers.
 */
export default function WeatherHero({ activeWeather, className }: WeatherHeroProps) {
  return (
    <div
      data-bagui="weather-hero"
      className={cn(
        "relative h-full w-full overflow-hidden bg-slate-950 select-none",
        className
      )}
    >
      {/* 1. Base Image Crossfade (4 absolute-positioned images) */}
      <div className="absolute inset-0 h-full w-full">
        {WEATHER_KEYS.map((weatherKey) => {
          const asset = HOME_MANGA_HERO_WEATHER_ASSETS[weatherKey];
          const isActive = activeWeather === weatherKey;

          return (
            <motion.div
              key={weatherKey}
              initial={false}
              animate={{ opacity: isActive ? 1 : 0 }}
              transition={{
                duration: 1.0,
                ease: EXPO_EASE_OUT,
              }}
              style={{ pointerEvents: isActive ? "auto" : "none" }}
              className="absolute inset-0 h-full w-full"
            >
              <Image
                src={asset.src}
                alt={asset.alt}
                fill
                priority={weatherKey === "sunny" || weatherKey === "cloudy"}
                sizes={asset.sizes || "100vw"}
                className="object-cover object-center"
              />
            </motion.div>
          );
        })}
      </div>

      {/* 2. Manga Neo-Brutalist Frame Border & Halftone Shading */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-10 border-2 border-slate-950/48"
      />

      {/* 3. Interactive Weather Overlay Component */}
      <WeatherEffectsOverlay activeWeather={activeWeather} />
    </div>
  );
}
