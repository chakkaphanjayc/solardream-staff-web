"use client";

import { useCallback, useEffect, useState } from "react";
import type { HomeWeatherId } from "@/types/home";
import type { LiveSolarData } from "@/lib/weather";
import {
  readCachedLocation,
  writeCachedLocation,
  getRegionalFallbackLocationName,
} from "@/lib/clientLocationCache";

export type HomeWeatherState = {
  weatherId: HomeWeatherId;
  locationName: string;
  isLocating: boolean;
  isOverride: boolean;
  liveOutputKw: number;
  sunlightIntensityPct: number;
  dailyForecastKwh: number;
  setWeatherOverride: (weather: HomeWeatherId | null) => void;
  resetWeatherOverride: () => void;
};

// Default fallback coordinates (Nong Kaeo, Hang Dong, Chiang Mai, Thailand)
const DEFAULT_LAT = 18.7061;
const DEFAULT_LON = 98.9817;
const DEFAULT_LOCATION_NAME = "Nong Kaeo, Chiang Mai";

function calculateInitialWeatherId(
  liveSolarData?: LiveSolarData | null,
): HomeWeatherId {
  if (liveSolarData?.weatherId) return liveSolarData.weatherId;

  const bangkokHour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Bangkok",
      hour: "2-digit",
      hour12: false,
    }).format(new Date()),
  );

  // If between 18:30 and 06:00, default to night
  if (bangkokHour >= 19 || bangkokHour < 6) {
    return "night";
  }

  if (liveSolarData) {
    if (liveSolarData.sunlightIndexPercent < 35) return "rainy";
    if (liveSolarData.sunlightIndexPercent < 65) return "cloudy";
    return "sunny";
  }

  return "sunny";
}

export function useHomeWeather(
  initialLiveSolarData?: LiveSolarData | null,
): HomeWeatherState {
  const [weatherOverride, setWeatherOverrideState] =
    useState<HomeWeatherId | null>(null);
  const [liveWeatherId, setLiveWeatherId] = useState<HomeWeatherId>(() =>
    calculateInitialWeatherId(initialLiveSolarData),
  );
  const [locationName, setLocationName] = useState<string>(
    DEFAULT_LOCATION_NAME,
  );
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [solarMetrics, setSolarMetrics] = useState<{
    liveOutputKw: number;
    sunlightIntensityPct: number;
    dailyForecastKwh: number;
  }>({
    liveOutputKw: initialLiveSolarData?.liveOutputKw ?? 1.49,
    sunlightIntensityPct: initialLiveSolarData?.sunlightIndexPercent ?? 37,
    dailyForecastKwh: initialLiveSolarData?.dailyForecastKwh ?? 19.0,
  });

  const activeWeatherId: HomeWeatherId = weatherOverride ?? liveWeatherId;

  // Sync data-weather attribute on documentElement for styling & navbar coordination
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-weather", activeWeatherId);
  }, [activeWeatherId]);

  // Handle client-side geolocation and live weather fetch
  useEffect(() => {
    if (typeof window === "undefined") return;

    let isMounted = true;

    async function fetchWeatherForCoords(
      lat: number,
      lon: number,
      locName: string,
    ) {
      try {
        const res = await fetch(`/api/weather/solar?lat=${lat}&lon=${lon}`);
        if (!res.ok) return;
        const json = await res.json();
        if (!json.success || !json.data || !isMounted) return;

        const data = json.data;
        const newWeatherId = (data.weatherId as HomeWeatherId) || "sunny";
        setLiveWeatherId(newWeatherId);
        setLocationName(locName);

        // Compute simulated outputs based on live irradiance
        const irradiance = data.irradianceWm2 ?? 600;
        const calculatedKw = Number(
          ((irradiance * 25 * 0.2) / 1000).toFixed(2),
        );
        const sunlightPct =
          data.weatherImpactPct ?? 100 - (data.cloudCoverPct ?? 20);
        const dailyKwh = Number(
          (data.dailyIrradiationKwhM2 * 25 * 0.2).toFixed(1),
        );

        setSolarMetrics({
          liveOutputKw: Math.min(5, calculatedKw),
          sunlightIntensityPct: Math.max(0, Math.min(100, sunlightPct)),
          dailyForecastKwh: dailyKwh > 0 ? dailyKwh : 19.0,
        });
      } catch (err) {
        console.warn("Failed to fetch live weather coordinates:", err);
      }
    }

    async function detectLocation() {
      // 1. Check browser geolocation
      if (!("geolocation" in navigator)) {
        void fetchWeatherForCoords(
          DEFAULT_LAT,
          DEFAULT_LON,
          DEFAULT_LOCATION_NAME,
        );
        return;
      }

      setIsLocating(true);
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          if (!isMounted) return;
          setIsLocating(false);
          const { latitude, longitude } = position.coords;

          // Check cached location name
          const cached = readCachedLocation(latitude, longitude);
          let resolvedName = cached?.displayName;

          if (!resolvedName) {
            resolvedName = getRegionalFallbackLocationName(
              latitude,
              longitude,
              "Your Location",
            );
            writeCachedLocation(latitude, longitude, resolvedName);
          }

          setLocationName(resolvedName);
          await fetchWeatherForCoords(latitude, longitude, resolvedName);
        },
        () => {
          if (!isMounted) return;
          setIsLocating(false);
          // Fallback to default
          void fetchWeatherForCoords(
            DEFAULT_LAT,
            DEFAULT_LON,
            DEFAULT_LOCATION_NAME,
          );
        },
        { timeout: 8000, maximumAge: 600000, enableHighAccuracy: false },
      );
    }

    void detectLocation();

    return () => {
      isMounted = false;
    };
  }, []);

  const setWeatherOverride = useCallback((weather: HomeWeatherId | null) => {
    setWeatherOverrideState(weather);
  }, []);

  const resetWeatherOverride = useCallback(() => {
    setWeatherOverrideState(null);
  }, []);

  return {
    weatherId: activeWeatherId,
    locationName,
    isLocating,
    isOverride: weatherOverride !== null,
    liveOutputKw: solarMetrics.liveOutputKw,
    sunlightIntensityPct: solarMetrics.sunlightIntensityPct,
    dailyForecastKwh: solarMetrics.dailyForecastKwh,
    setWeatherOverride,
    resetWeatherOverride,
  };
}
