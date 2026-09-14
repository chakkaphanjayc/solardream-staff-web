"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { HomeWeatherId } from "@/types/home";
import styles from "./solar-home.module.css";

type WeatherAtmosphereProps = Readonly<{
  weatherId: HomeWeatherId;
}>;

const RAIN_DROPS = Array.from({ length: 28 }, (_, index) => ({
  left: `${((index * 41 + 6) % 106) - 3}%`,
  top: `${((index * 23) % 100) - 15}%`,
  height: `${28 + (index % 5) * 8}px`,
  animationDelay: `${-((index % 9) * 0.24)}s`,
  animationDuration: `${1.25 + (index % 4) * 0.18}s`,
}));

const NIGHT_STARS = Array.from({ length: 20 }, (_, index) => ({
  left: `${(index * 47 + 8) % 94}%`,
  top: `${(index * 29 + 7) % 58}%`,
  size: `${2 + (index % 3)}px`,
  animationDelay: `${-((index % 6) * 0.7)}s`,
}));

export default function WeatherAtmosphere({
  weatherId,
}: WeatherAtmosphereProps) {
  const prefersReducedMotion = useReducedMotion();
  const motionDisabled = prefersReducedMotion !== false;

  return (
    <div
      aria-hidden="true"
      className={styles.weatherAtmosphere}
      data-weather={weatherId}
    >
      <div className={styles.weatherSky} />
      <div className={styles.weatherHorizon} />

      <AnimatePresence initial={false} mode="sync">
        <motion.div
          key={weatherId}
          className={styles.weatherMode}
          initial={motionDisabled ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={motionDisabled ? undefined : { opacity: 0 }}
          transition={
            motionDisabled
              ? { duration: 0 }
              : { duration: 1.15, ease: [0.22, 1, 0.36, 1] }
          }
        >
          {weatherId === "sunny" ? (
            <div className={styles.weatherSunny}>
              <span className={styles.weatherSunCore} />
              <span
                className={`${styles.weatherRay} ${styles.weatherRayOne}`}
              />
              <span
                className={`${styles.weatherRay} ${styles.weatherRayTwo}`}
              />
              <span
                className={`${styles.weatherRay} ${styles.weatherRayThree}`}
              />
            </div>
          ) : null}

          {weatherId === "cloudy" ? (
            <div className={styles.weatherClouds}>
              <span
                className={`${styles.weatherCloud} ${styles.weatherCloudOne}`}
              />
              <span
                className={`${styles.weatherCloud} ${styles.weatherCloudTwo}`}
              />
              <span
                className={`${styles.weatherCloud} ${styles.weatherCloudThree}`}
              />
              <span className={styles.weatherCloudVeil} />
            </div>
          ) : null}

          {weatherId === "rainy" ? (
            <div className={styles.weatherRain}>
              <span className={styles.weatherRainMist} />
              <span className={styles.weatherRainDrops}>
                {RAIN_DROPS.map((drop, index) => (
                  <span
                    className={styles.weatherRainDrop}
                    key={`${drop.left}-${index}`}
                    style={drop}
                  />
                ))}
              </span>
            </div>
          ) : null}

          {weatherId === "night" ? (
            <div className={styles.weatherNight}>
              <span className={styles.weatherMoon} />
              <span className={styles.weatherNightGlow} />
              <span className={styles.weatherStars}>
                {NIGHT_STARS.map((star, index) => (
                  <span
                    className={styles.weatherStar}
                    key={`${star.left}-${index}`}
                    style={{
                      left: star.left,
                      top: star.top,
                      width: star.size,
                      height: star.size,
                      animationDelay: star.animationDelay,
                    }}
                  />
                ))}
              </span>
            </div>
          ) : null}
        </motion.div>
      </AnimatePresence>

      <div className={styles.weatherVignette} />
    </div>
  );
}
