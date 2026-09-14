"use client";

import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { FiCloud, FiCloudRain, FiMoon, FiSun } from "react-icons/fi";
import { HOME_MANGA_HERO_WEATHER_ASSETS } from "@/lib/homeMangaAssets";
import { useSolarHome } from "../solar-home-context";
import styles from "../solar-home.module.css";

type SunSceneProps = Readonly<{
  locale: string;
}>;

export default function SunScene({ locale }: SunSceneProps) {
  const isThai = locale === "th";
  const prefersReducedMotion = useReducedMotion();
  const { weather } = useSolarHome();
  const weatherAsset =
    HOME_MANGA_HERO_WEATHER_ASSETS[weather.weatherId] ??
    HOME_MANGA_HERO_WEATHER_ASSETS.sunny;
  const motionDisabled = prefersReducedMotion !== false;
  const WeatherIcon =
    weather.weatherId === "night"
      ? FiMoon
      : weather.weatherId === "cloudy"
        ? FiCloud
        : weather.weatherId === "rainy"
          ? FiCloudRain
          : FiSun;
  const weatherLabel =
    weather.weatherId === "night"
      ? isThai
        ? "ช่วงกลางคืน"
        : "Nighttime"
      : weather.weatherId === "cloudy"
        ? isThai
          ? "มีเมฆบางส่วน"
          : "Partly cloudy"
        : weather.weatherId === "rainy"
          ? isThai
            ? "ฝนและเมฆ"
            : "Rain and cloud"
          : isThai
            ? "แสงแดดดี"
            : "Bright sunlight";
  const imageAlt = isThai
    ? "บ้านโซลาร์สไตล์มังงะท่ามกลางแสงแดด"
    : weatherAsset.alt;

  return (
    <div
      className={styles.scene}
      data-bagui="hero-manga-scene"
      data-weather={weather.weatherId}
    >
      <div className={styles.sceneImageFrame}>
        <AnimatePresence initial={false} mode="sync">
          <motion.div
            key={weatherAsset.src}
            className={styles.sceneImageLayer}
            initial={motionDisabled ? false : { opacity: 0, scale: 1.035 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={motionDisabled ? undefined : { opacity: 0, scale: 1.015 }}
            transition={
              motionDisabled
                ? { duration: 0 }
                : { duration: 0.85, ease: [0.22, 1, 0.36, 1] }
            }
          >
            <Image
              src={weatherAsset.src}
              alt={imageAlt}
              fill
              preload
              sizes="(max-width: 60rem) 100vw, 48vw"
              className={styles.sceneImage}
            />
          </motion.div>
        </AnimatePresence>
      </div>

      <motion.div
        className={styles.sceneSun}
        animate={
          motionDisabled
            ? { opacity: weather.weatherId === "sunny" ? 0.42 : 0.14, scale: 1 }
            : {
                opacity:
                  weather.weatherId === "sunny" ? [0.3, 0.48, 0.3] : 0.14,
                scale: weather.weatherId === "sunny" ? [1, 1.04, 1] : 1,
              }
        }
        transition={
          motionDisabled
            ? { duration: 0 }
            : { duration: 12, repeat: Infinity, ease: "easeInOut" }
        }
        aria-hidden="true"
      />
      <motion.div
        className={`${styles.sceneRay} ${styles.sceneRayOne}`}
        animate={
          motionDisabled
            ? { opacity: weather.weatherId === "sunny" ? 0.24 : 0.08, x: 0 }
            : {
                opacity:
                  weather.weatherId === "sunny" ? [0.16, 0.3, 0.16] : 0.08,
                x: weather.weatherId === "sunny" ? [0, 16, 0] : 0,
              }
        }
        transition={
          motionDisabled
            ? { duration: 0 }
            : { duration: 18, repeat: Infinity, ease: "easeInOut" }
        }
        aria-hidden="true"
      />
      <motion.div
        className={`${styles.sceneRay} ${styles.sceneRayTwo}`}
        animate={
          motionDisabled
            ? { opacity: weather.weatherId === "sunny" ? 0.12 : 0.04, x: 0 }
            : {
                opacity:
                  weather.weatherId === "sunny" ? [0.08, 0.2, 0.08] : 0.04,
                x: weather.weatherId === "sunny" ? [0, -12, 0] : 0,
              }
        }
        transition={
          motionDisabled
            ? { duration: 0 }
            : { duration: 16, repeat: Infinity, ease: "easeInOut", delay: 1.2 }
        }
        aria-hidden="true"
      />
      <div className={styles.sceneOrbOne} aria-hidden="true" />
      <div className={styles.sceneOrbTwo} aria-hidden="true" />

      <div className={styles.sceneCaption} aria-live="polite">
        <span className={styles.sceneCaptionIcon} aria-hidden="true">
          <WeatherIcon />
        </span>
        <span>
          <strong>{weatherLabel}</strong>
          <small>
            {weather.sunlightIndexPercent}%{" "}
            {isThai ? "แสงแดดวันนี้" : "sunlight today"}
          </small>
        </span>
      </div>
    </div>
  );
}
