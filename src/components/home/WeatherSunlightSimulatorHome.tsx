"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowRight,
  BatteryCharging,
  ChevronUp,
  Cloud,
  CloudRain,
  Compass,
  Search,
  MapPin,
  Moon,
  Sparkles,
  SunMedium,
  X,
  Zap,
} from "@/components/ui/icons";

import { cn } from "@/lib/utils";
import AnimatedNumber from "@/components/ui/AnimatedNumber";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { GsapPulse } from "@/components/ui/GsapMotion";
import SpotlightCard from "@/components/reactbits/SpotlightCard";
import TrackRequestModal from "@/components/tracking/TrackRequestModal";
import { HOME_MANGA_HERO_ENVIRONMENT } from "@/lib/homeMangaAssets";
import {
  readCachedLocation,
  writeCachedLocation,
  getRegionalFallbackLocationName,
} from "@/lib/clientLocationCache";
import styles from "./WeatherSunlightSimulatorHome.module.css";

type WeatherId = "sunny" | "cloudy" | "rainy" | "night";

const {
  asset: heroEnvironmentAsset,
  loading: heroEnvironmentLoading,
} = HOME_MANGA_HERO_ENVIRONMENT;

type WeatherPreset = {
  id: WeatherId;
  label: string;
  multiplier: number;
  sunHours: number;
  electricityRate: number;
  skyLabel: string;
  mascotImage: string;
  mascotAlt: string;
  icon: typeof SunMedium;
};

type SolarTrendPoint = {
  time: string;
  irradianceWm2: number;
  clearSkyIrradianceWm2: number;
};

type SolarWeatherData = {
  source: "openweather" | "open-meteo" | "fallback";
  weatherId: WeatherId;
  irradianceWm2: number;
  clearSkyIrradianceWm2: number;
  weatherImpactPct: number;
  sunHours: number;
  dailyIrradiationKwhM2: number;
  cloudCoverPct: number;
  trend: SolarTrendPoint[];
};

type SolarWeatherApiResponse = {
  success?: boolean;
  data?: SolarWeatherData;
};

const subscribeToNothing = () => () => {};
const getClientMountedSnapshot = () => true;
const getServerMountedSnapshot = () => false;

export const WEATHER_PRESETS: Record<WeatherId, WeatherPreset> = {
  sunny: {
    id: "sunny",
    label: "Sunny",
    multiplier: 1,
    sunHours: 5.2,
    electricityRate: 4.2,
    skyLabel: "Bright sun",
    mascotImage: "/asset/solia-sunny.webp",
    mascotAlt: "Solia presenting a bright solar forecast",
    icon: SunMedium,
  },
  cloudy: {
    id: "cloudy",
    label: "Cloudy",
    multiplier: 0.6,
    sunHours: 3.6,
    electricityRate: 4.2,
    skyLabel: "Soft cloud cover",
    mascotImage: "/asset/solia-cloudy.webp",
    mascotAlt: "Solia thinking through a cloudy solar forecast",
    icon: Cloud,
  },
  rainy: {
    id: "rainy",
    label: "Rainy",
    multiplier: 0.2,
    sunHours: 1.8,
    electricityRate: 4.2,
    skyLabel: "Rain passing through",
    mascotImage: "/asset/solia-rainy.webp",
    mascotAlt: "Solia reacting to rainy solar production",
    icon: CloudRain,
  },
  night: {
    id: "night",
    label: "Night",
    multiplier: 0,
    sunHours: 0,
    electricityRate: 4.2,
    skyLabel: "Night standby",
    mascotImage: "/asset/solia-sleepy.webp",
    mascotAlt: "Solia reviewing a nighttime solar plan",
    icon: Moon,
  },
};

const CHIANG_MAI = {
  latitude: 18.7883,
  longitude: 98.9853,
  label: "Chiang Mai, Thailand",
};
const SOLAR_SIZE_OPTIONS = [3, 5, 8, 10] as const;
const SOLAR_SIZE_LABELS: Record<(typeof SOLAR_SIZE_OPTIONS)[number], string> = {
  3: "3.0 kW Compact",
  5: "5.0 kW Popular",
  8: "8.0 kW Family",
  10: "10.0 kW Max Power",
};
const EFFICIENCY = 0.85;
const LAST_KNOWN_WEATHER_KEY = "lastKnownWeather";

function isWeatherId(value: unknown): value is WeatherId {
  return value === "sunny" || value === "cloudy" || value === "rainy" || value === "night";
}

function readLastKnownWeather(): WeatherId {
  if (typeof window === "undefined") return "sunny";

  try {
    const cached = window.localStorage.getItem(LAST_KNOWN_WEATHER_KEY);
    return isWeatherId(cached) ? cached : "sunny";
  } catch {
    return "sunny";
  }
}

function writeLastKnownWeather(weather: WeatherId) {
  try {
    window.localStorage.setItem(LAST_KNOWN_WEATHER_KEY, weather);
  } catch {
    // Local storage may be blocked in private browsing; weather still works live.
  }
}

function MangaWeatherFx({ weather }: { weather: WeatherId }) {
  switch (weather) {
    case "sunny":
      return (
        <div className={cn(styles.mangaFx, styles.sunnyFx)} aria-hidden="true">
          <span>✦</span>
          <span>✦</span>
          <span>✦</span>
          <span>✦</span>
        </div>
      );
    case "cloudy":
      return (
        <div className={cn(styles.mangaFx, styles.cloudyFx)} aria-hidden="true">
          <span className={styles.thoughtMark}>?</span>
          <span className={styles.thoughtDots}>•••</span>
          <span className={styles.sweatDrop} />
        </div>
      );
    case "rainy":
      return (
        <div className={cn(styles.mangaFx, styles.rainyFx)} aria-hidden="true">
          <Cloud className={styles.rainCloud} strokeWidth={1.8} />
          <span />
          <span />
          <span />
          <span />
        </div>
      );
    case "night":
      return (
        <div className={cn(styles.mangaFx, styles.nightFx)} aria-hidden="true">
          <span>Z</span>
          <span>Zz</span>
          <span>Zzz</span>
        </div>
      );
  }
}

function formatNumber(value: number, digits = 1) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function formatThb(value: number) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(value);
}

function createPresetSolarData(weather: WeatherId): SolarWeatherData {
  const preset = WEATHER_PRESETS[weather];
  const peakIrradiance = Math.round(preset.multiplier * 850);
  const clearSkyPeak = weather === "night" ? 0 : 850;
  const trend = [
    { time: "06:00", factor: 0.08 },
    { time: "09:00", factor: 0.58 },
    { time: "12:00", factor: 1 },
    { time: "15:00", factor: 0.64 },
    { time: "18:00", factor: 0.12 },
  ].map((point) => ({
    time: point.time,
    irradianceWm2: Math.round(peakIrradiance * point.factor),
    clearSkyIrradianceWm2: Math.round(clearSkyPeak * point.factor),
  }));

  return {
    source: "fallback",
    weatherId: weather,
    irradianceWm2: peakIrradiance,
    clearSkyIrradianceWm2: clearSkyPeak,
    weatherImpactPct: Math.round(preset.multiplier * 100),
    sunHours: preset.sunHours,
    dailyIrradiationKwhM2: preset.sunHours * preset.multiplier,
    cloudCoverPct: weather === "sunny" ? 12 : weather === "cloudy" ? 62 : weather === "rainy" ? 88 : 0,
    trend,
  };
}

async function fetchSolarWeather(latitude: number, longitude: number) {
  const url = new URL("/api/weather/solar", window.location.origin);
  url.searchParams.set("lat", String(latitude));
  url.searchParams.set("lon", String(longitude));

  const response = await fetch(url.toString(), { cache: "no-store" });
  if (!response.ok) throw new Error("Solar weather service unavailable.");

  const json = (await response.json()) as SolarWeatherApiResponse;
  if (!json.success || !json.data) throw new Error("Solar weather payload is empty.");
  return json.data;
}

async function fetchLocationName(latitude: number, longitude: number, fallback: string) {
  // 1. Check 2-Hour client-side cache first (prevents redundant API requests and 429s)
  const cached = readCachedLocation(latitude, longitude);
  if (cached?.displayName) {
    return cached.displayName;
  }

  try {
    const response = await fetch("/api/services/geocode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ latitude, longitude }),
      cache: "no-store",
    });
    if (response.ok) {
      const data = (await response.json()) as {
        success?: boolean;
        location?: { displayName?: string };
      };
      const displayName = data.location?.displayName?.trim();
      if (data.success && displayName) {
        writeCachedLocation(latitude, longitude, displayName);
        return displayName;
      }
    }
  } catch {
    // Fall through to regional fallback
  }

  // 2. Dynamic regional fallback mapping
  const fallbackName = getRegionalFallbackLocationName(latitude, longitude, fallback);
  // Cache the fallback name so consecutive calls within 2 hours do not repeatedly hit the network on rate limits
  writeCachedLocation(latitude, longitude, fallbackName);
  return fallbackName;
}

function WeatherEffects({ weather }: { weather: WeatherId }) {
  if (weather === "sunny") {
    return (
      <>
        <div className={styles.sun} />
        <div className={styles.sunFlare} />
      </>
    );
  }

  if (weather === "cloudy") {
    return (
      <>
        <div className={cn(styles.cloud, styles.cloudOne)} />
        <div className={cn(styles.cloud, styles.cloudTwo)} />
        <div className={cn(styles.cloud, styles.cloudThree)} />
      </>
    );
  }

  if (weather === "rainy") {
    return (
      <div className={styles.rainField}>
        {Array.from({ length: 18 }).map((_, index) => (
          <span
            key={index}
            className={styles.rainDrop}
            style={{
              left: `${(index * 31) % 100}%`,
              animationDelay: `${(index % 11) * -95}ms`,
              animationDuration: `${760 + (index % 7) * 55}ms`,
            }}
          />
        ))}
      </div>
    );
  }

  return <div className={styles.starField} />;
}

type WeatherSunlightSimulatorHomeProps = Readonly<{
  showAdminSimulator: boolean;
  solarSizeKw?: number;
  onSolarSizeChange?: (value: number) => void;
  hideInlineSelector?: boolean;
}>;

function WeatherBackdrop({ weather }: { weather: WeatherId }) {
  return (
    <div
      key={weather}
      id="ambient-glow"
      className={cn(
        styles.weatherBackdrop,
        weather === "sunny" && styles.weatherSunny,
        weather === "cloudy" && styles.weatherCloudy,
        weather === "rainy" && styles.weatherRainy,
        weather === "night" && styles.weatherNight,
      )}
    />
  );
}

function SystemSizeButton({
  size,
  active,
  onSelect,
  compact = false,
  showTooltip = false,
}: {
  size: (typeof SOLAR_SIZE_OPTIONS)[number];
  active: boolean;
  onSelect: (size: number) => void;
  compact?: boolean;
  showTooltip?: boolean;
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={() => onSelect(size)}
        data-analytics-event="home_size_selected"
        data-analytics-size-kw={size}
        aria-pressed={active}
        aria-label={SOLAR_SIZE_LABELS[size]}
        className={cn(
          buttonVariants({ variant: active ? "primary" : "secondary", size: compact ? "icon" : "default" }),
          "relative rounded-xl font-black focus-visible:ring-[#B7D1EA] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0F172A]",
          compact ? "h-11 w-11 text-xs" : "min-h-12 w-full px-3 text-sm",
          active
            ? "bg-[#B7D1EA] text-[#0F172A] shadow-md shadow-[#B7D1EA]/25 hover:bg-[#99BFE3]"
            : "border-white/15 bg-[#1E293B]/72 text-[#F0EEE9] hover:bg-slate-800 hover:text-white",
        )}
      >
        {size}
        {!compact ? <span className="ml-1">kW</span> : null}
      </button>
      {showTooltip ? (
        <span className="pointer-events-none absolute right-full top-1/2 mr-3 hidden -translate-y-1/2 whitespace-nowrap rounded-full bg-[#0F172A] px-3 py-1.5 text-[11px] font-black text-[#B7D1EA] opacity-0 shadow-xl shadow-slate-950/30 transition-all duration-300 ease-expo-out group-hover:block group-hover:translate-x-0 group-hover:opacity-100 group-focus-within:block group-focus-within:opacity-100">
          {SOLAR_SIZE_LABELS[size]}
        </span>
      ) : null}
    </div>
  );
}


export default function WeatherSunlightSimulatorHome({
  showAdminSimulator,
  solarSizeKw: controlledSolarSizeKw,
  onSolarSizeChange,
  hideInlineSelector,
}: WeatherSunlightSimulatorHomeProps) {
  const locale = useLocale();
  const t = useTranslations("WeatherSunlightSimulatorHome");
  const [weatherId, setWeatherId] = useState<WeatherId>("sunny");
  const mounted = useSyncExternalStore(subscribeToNothing, getClientMountedSnapshot, getServerMountedSnapshot);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-weather", weatherId);
    return () => {
      document.documentElement.removeAttribute("data-weather");
    };
  }, [weatherId]);
  const [internalSolarSizeKw, setInternalSolarSizeKw] = useState(5);
  const [locationLabel, setLocationLabel] = useState(CHIANG_MAI.label);
  const [locationStatus, setLocationStatus] = useState(t("readingSkyInitial"));
  const [liveSunHours, setLiveSunHours] = useState<number | null>(null);
  const [solarWeatherData, setSolarWeatherData] = useState<SolarWeatherData>(() => createPresetSolarData("sunny"));
  const [isLoadingWeather, setIsLoadingWeather] = useState(true);
  const solarSizeKw = controlledSolarSizeKw ?? internalSolarSizeKw;
  const setSolarSizeKw = (value: number) => {
    setInternalSolarSizeKw(value);
    onSolarSizeChange?.(value);
  };

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) return;
      const cachedWeather = readLastKnownWeather();
      setWeatherId(cachedWeather);
      setLiveSunHours(WEATHER_PRESETS[cachedWeather].sunHours);
      setSolarWeatherData(createPresetSolarData(cachedWeather));
    });

    const applyWeather = async (latitude: number, longitude: number, label: string, status: string) => {
      setIsLoadingWeather(true);
      try {
        const [solarWeather, resolvedLabel] = await Promise.all([
          fetchSolarWeather(latitude, longitude),
          fetchLocationName(latitude, longitude, label),
        ]);
        if (cancelled) return;
        const nextWeatherId = solarWeather.weatherId;
        setWeatherId(nextWeatherId);
        writeLastKnownWeather(nextWeatherId);
        setSolarWeatherData(solarWeather);
        setLiveSunHours(solarWeather.sunHours);
        setLocationLabel(resolvedLabel);
        setLocationStatus(status);
      } catch {
        if (cancelled) return;
        setWeatherId("sunny");
        writeLastKnownWeather("sunny");
        setSolarWeatherData(createPresetSolarData("sunny"));
        setLiveSunHours(WEATHER_PRESETS.sunny.sunHours);
        setLocationLabel(CHIANG_MAI.label);
        setLocationStatus(t("weatherNoResponse"));
      } finally {
        if (!cancelled) setIsLoadingWeather(false);
      }
    };

    const loadChiangMaiWeather = (message: string) => {
      void applyWeather(CHIANG_MAI.latitude, CHIANG_MAI.longitude, CHIANG_MAI.label, message);
    };

    if (!navigator.geolocation) {
      loadChiangMaiWeather(t("locationUnavailable"));
      return () => {
        cancelled = true;
      };
    }

    const geolocationAttemptKey = "solardream_home_geolocation_attempts";
    const maximumGeolocationAttempts = 3;
    const attempts = Number(window.sessionStorage.getItem(geolocationAttemptKey) ?? "0");
    if (attempts >= maximumGeolocationAttempts) {
      loadChiangMaiWeather(t("permissionDenied"));
      return () => {
        cancelled = true;
      };
    }
    window.sessionStorage.setItem(geolocationAttemptKey, String(attempts + 1));

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        void applyWeather(latitude, longitude, t("currentArea"), t("liveActive"));
      },
      () => {
        loadChiangMaiWeather(t("permissionDenied"));
      },
      {
        enableHighAccuracy: false,
        maximumAge: 1000 * 60 * 15,
        timeout: 6000,
      },
    );

    return () => {
      cancelled = true;
    };
  }, [t]);

  const preset = WEATHER_PRESETS[weatherId];
  const darkWeather = weatherId === "rainy" || weatherId === "night";
  const Icon = preset.icon;
  const effectiveSunHours = liveSunHours ?? solarWeatherData.sunHours ?? preset.sunHours;

  const calculations = useMemo(() => {
    const irradianceFactor = Math.max(0, solarWeatherData.irradianceWm2) / 1000;
    const currentKw = Math.min(solarSizeKw * 0.95, solarSizeKw * irradianceFactor * EFFICIENCY);
    const todayKwh =
      solarSizeKw *
      Math.max(0, solarWeatherData.dailyIrradiationKwhM2 || effectiveSunHours * preset.multiplier) *
      EFFICIENCY;
    const monthlySavings = todayKwh * 30 * preset.electricityRate;
    const annualCo2Tons = todayKwh * 365 * 0.000475;
    const treeEquivalent = annualCo2Tons * 43;
    const weatherImpactPct = Math.round(
      Math.max(0, Math.min(100, solarWeatherData.weatherImpactPct || preset.multiplier * 100)),
    );
    const trend = solarWeatherData.trend.map((point) => {
      const currentKwPoint = Math.min(solarSizeKw * 0.95, solarSizeKw * (point.irradianceWm2 / 1000) * EFFICIENCY);
      const yieldKwh = currentKwPoint;
      return {
        time: point.time,
        irradiance: Math.round(point.irradianceWm2),
        currentKw: Number(currentKwPoint.toFixed(2)),
        yieldKwh: Number(yieldKwh.toFixed(2)),
        savings: Math.round(yieldKwh * preset.electricityRate * 30),
      };
    });

    return {
      currentKw,
      todayKwh,
      monthlySavings,
      monthlyKwh: todayKwh * 30,
      panels550w: Math.ceil((solarSizeKw * 1000) / 550),
      intensityPct: weatherImpactPct,
      irradianceWm2: Math.round(solarWeatherData.irradianceWm2),
      clearSkyIrradianceWm2: Math.round(solarWeatherData.clearSkyIrradianceWm2),
      annualCo2Tons,
      treeEquivalent,
      trend,
    };
  }, [effectiveSunHours, preset, solarSizeKw, solarWeatherData]);

  const setSimulatorWeather = (id: WeatherId) => {
    setWeatherId(id);
    writeLastKnownWeather(id);
    const presetSolarData = createPresetSolarData(id);
    setSolarWeatherData(presetSolarData);
    setLiveSunHours(presetSolarData.sunHours);
    setIsLoadingWeather(false);
    setLocationStatus(t("simulatorOverride", { label: t(`presets.${id}.label`) }));
  };

  return (
    <div
      data-bagui="weather-simulator"
      className={cn(
        styles.shell,
        weatherId === "cloudy" && styles.cloudy,
        weatherId === "rainy" && styles.rainy,
        weatherId === "night" && styles.night,
        "relative flex min-h-[100svh] w-full items-start justify-center overflow-y-auto overflow-x-clip px-4 pb-28 pt-20 sm:px-6 sm:pb-24 sm:pt-22 md:items-center md:px-8 md:pb-10 md:pt-24 xl:h-[100svh] xl:min-h-0 xl:overflow-hidden xl:px-8 xl:py-6",
        !hideInlineSelector && "xl:pr-24",
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
        style={{
          WebkitMaskImage: "linear-gradient(to bottom, black 60%, transparent 100%)",
          maskImage: "linear-gradient(to bottom, black 60%, transparent 100%)",
        }}
      >
        <WeatherBackdrop weather={weatherId} />
        <Image
          src={heroEnvironmentAsset.src}
          alt={heroEnvironmentAsset.alt}
          fill
          loading={heroEnvironmentLoading}
          sizes={heroEnvironmentAsset.sizes}
          className={styles.heroEnvironment}
          aria-hidden="true"
        />
        <WeatherEffects weather={weatherId} />
        <div className={styles.skyVeil} />
      </div>

      {!hideInlineSelector ? (
        <nav
          aria-label={t("systemSizePresets")}
          className="premium-glass-dark fixed right-4 top-1/2 z-40 hidden -translate-y-1/2 flex-col gap-2 rounded-full bg-[#1E293B]/80 p-2 shadow-2xl shadow-slate-950/25 transition-all duration-500 ease-expo-out lg:flex xl:right-8"
        >
          {SOLAR_SIZE_OPTIONS.map((size) => (
            <SystemSizeButton
              key={size}
              size={size}
              active={solarSizeKw === size}
              onSelect={setSolarSizeKw}
              compact
              showTooltip
            />
          ))}
        </nav>
      ) : null}

      <div className="relative z-10 mx-auto grid w-full max-w-[1440px] min-w-0 grid-cols-1 items-stretch gap-6 md:grid-cols-2 md:items-center md:gap-6 xl:grid-cols-12 xl:gap-8">
        <div
          className="w-full min-w-0 space-y-[clamp(0.75rem,2.2vh,1.25rem)] py-2 md:col-span-1 md:py-0 xl:col-span-4"
          style={{ maxWidth: "calc(100vw - 2rem)" }}
        >
          {isLoadingWeather ? (
            <GsapPulse
              className={cn("w-fit rounded-2xl px-4 py-3", darkWeather ? "premium-glass-dark" : "premium-glass")}
              scale={1.02}
            >
              <div className={cn("flex items-center gap-2 text-sm font-bold", darkWeather ? "text-white" : "text-slate-950")}>
                <MapPin className="h-4 w-4" />
                <span>{t("readingSky")}</span>
              </div>
            </GsapPulse>
          ) : (
            <div className={cn("max-w-full min-w-0 overflow-hidden rounded-2xl px-4 py-3", darkWeather ? "premium-glass-dark" : "premium-glass")}>
              <div className={cn("flex min-w-0 items-center gap-2 text-sm font-bold", darkWeather ? "text-white" : "text-slate-950")}>
                <MapPin className="h-4 w-4" />
                <span className="min-w-0 truncate">
                  {locationLabel === "Chiang Mai, Thailand" || locationLabel === "Chiang Mai, TH"
                    ? (locale === "th" ? t("locations.chiangMai") : locationLabel)
                    : locationLabel === "Bangkok, Thailand"
                      ? (locale === "th" ? t("locations.bangkok") : locationLabel)
                      : locationLabel === "Your current area"
                        ? t("currentArea")
                        : locationLabel}
                </span>
              </div>
            </div>
          )}

          <div className="flex max-w-full flex-col gap-3 sm:max-w-3xl lg:max-w-[34rem] lg:gap-[clamp(0.75rem,2vh,1.1rem)]">
            <h1
              key={weatherId}
              data-manga-panel
              className={cn(
                styles.mascotTransition,
                styles.speechBubble,
                darkWeather ? "premium-glass-dark" : "premium-glass",
                "w-full min-w-0 max-w-[32ch] text-balance text-[clamp(1.5rem,2.2vw+0.3rem,2.25rem)] font-black leading-[1.25] tracking-tight",
              )}
            >
              {t(`presets.${weatherId}.dialogue`)}
            </h1>
            <div
              key={`${weatherId}-mobile-mascot`}
              className={cn(
                styles.mascotTransition,
                "relative z-0 mx-auto flex h-36 w-full max-w-[200px] items-end justify-center overflow-hidden pb-1 sm:h-40 sm:max-w-[220px] md:hidden",
              )}
            >
              <MangaWeatherFx weather={weatherId} />
              <Image
                src={preset.mascotImage}
                alt={t(`presets.${preset.id}.mascotAlt`)}
                width={320}
                height={320}
                loading="eager"
                sizes="220px"
                className={cn(
                  styles.mascotImage,
                  "relative z-0 h-36 w-auto max-w-full object-contain transition-transform duration-700 ease-expo-out animate-float-soft sm:h-40",
                )}
                style={{ filter: "drop-shadow(0px 16px 24px rgba(0, 0, 0, 0.28))" }}
              />
            </div>
            <p className={cn(
              "order-4 max-w-[34ch] text-pretty text-sm font-semibold leading-relaxed sm:max-w-[60ch] sm:text-base sm:leading-7 lg:order-none lg:text-[clamp(0.95rem,2vh,1.08rem)]",
              darkWeather ? "text-white/80" : "text-slate-700",
            )}>
              {t("heroDesc")}
            </p>
            {/* Consolidated Action Area */}
            <div data-manga-panel className="relative z-20 order-3 flex w-full max-w-md flex-col gap-3 pt-1 lg:order-none lg:gap-4 lg:pt-2">
              <Link
                  href={`/${locale}/wizard/summary`}
                  data-analytics-event="primary_cta_clicked"
                  data-analytics-cta="home_start_plan"
                  data-analytics-position="hero"
                  className={cn(buttonVariants({ variant: "primary", size: "lg" }), "primary-action group min-h-16 min-w-0 items-center justify-between gap-4 rounded-2xl px-5 py-3.5 lg:min-h-[5.25rem] lg:px-6 lg:py-3.5")}
                >
                  <span>
                    <span className="block text-base lg:text-[1.2rem] font-black leading-tight">{t("startPlan")}</span>
                    <span className="mt-0.5 block text-xs lg:text-sm font-semibold text-[#0F172A]/80">{t("useLive")}</span>
                  </span>
                  <span className="flex h-10 w-10 lg:h-12 lg:w-12 items-center justify-center rounded-full bg-[#0F172A] text-white transition-transform duration-500 ease-expo-out group-hover:translate-x-1.5 group-hover:scale-110 group-active:translate-x-0.5">
                    <ArrowRight className="h-4 w-4 transition-transform duration-500 ease-expo-out group-hover:scale-110 lg:h-5 lg:w-5" />
                  </span>
              </Link>

              <TrackRequestModal
                trigger={
                  <button
                    type="button"
                    data-analytics-event="navigation_clicked"
                    data-analytics-target-path="track_request"
                    className={cn(
                      buttonVariants({ variant: "secondary", size: "lg" }),
                      "group min-h-13 w-full min-w-0 justify-between gap-3 rounded-2xl px-4 py-2.5 text-left text-sm font-black focus-visible:ring-4 focus-visible:ring-[#B7D1EA]",
                      darkWeather
                        ? "premium-glass-dark text-white hover:bg-white/12"
                        : "premium-glass text-slate-950 hover:bg-white/55",
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-[#B7D1EA] text-[#0F172A]">
                        <Search className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-black">
                          {t("trackRequest")}
                        </span>
                        <span
                          className={cn(
                            "mt-0.5 block truncate text-[11px] font-semibold",
                            darkWeather ? "text-white/72" : "text-slate-600",
                          )}
                        >
                          {t("trackRequestHint")}
                        </span>
                      </span>
                    </span>
                    <ArrowRight className="h-4 w-4 flex-none transition-transform duration-500 ease-expo-out group-hover:translate-x-1.5 group-hover:scale-110" />
                  </button>
                }
              />
            </div>
          </div>

          {!hideInlineSelector ? (
            <div
              className="hidden md:grid w-full min-w-0 gap-3 sm:max-w-xl sm:grid-cols-[1fr_0.78fr] xl:grid-cols-1 xl:self-start"
              style={{ maxWidth: "min(100%, calc(100vw - 2rem))" }}
            >
              <div className={cn("min-w-0 rounded-2xl p-4 lg:p-6", darkWeather ? "premium-glass-dark" : "premium-glass")}>
                <p className={cn("text-xs lg:text-sm font-black", darkWeather ? "text-white/80" : "text-slate-700")}>{t("liveEstimate")}</p>
                <p className={cn("mt-2 text-2xl lg:text-3xl font-black tracking-[-0.02em]", darkWeather ? "text-white" : "text-slate-950")}>
                  <AnimatedNumber value={calculations.currentKw} formatter={(value) => `${formatNumber(value, 2)} kW`} />
                </p>
                <p className={cn("mt-1 text-xs lg:text-sm font-semibold", darkWeather ? "text-white/80" : "text-slate-700")}>{t("producingNow", { solarSizeKw })}</p>
              </div>

              <div
                className={cn(
                  "w-full min-w-0 rounded-2xl p-4 sm:col-span-2 sm:p-5 lg:col-span-1",
                  darkWeather ? "premium-glass-dark" : "premium-glass",
                )}
              >
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black">{t("title")}</p>
                    <p className={cn("text-sm font-semibold", darkWeather ? "text-white/80" : "text-slate-700")}>
                      {t("selection", { solarSizeKw })}
                    </p>
                  </div>
                  <div className={cn(
                    "premium-glass-tile hidden items-center gap-2 rounded-full px-3 py-2 text-xs font-black sm:inline-flex",
                    darkWeather ? "text-white/80" : "text-slate-950",
                  )}>
                    <Compass className="h-4 w-4" />
                    {t("liveWeather")}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {SOLAR_SIZE_OPTIONS.map((size) => (
                    <SystemSizeButton
                      key={size}
                      size={size}
                      active={solarSizeKw === size}
                      onSelect={setSolarSizeKw}
                    />
                  ))}
                </div>
                <p className={cn("mt-3 max-w-[34ch] text-xs font-semibold sm:max-w-none", darkWeather ? "text-white/70" : "text-slate-600")}>
                  {locationStatus}
                </p>
              </div>
            </div>
          ) : null}
        </div>

        <div
          key={`${weatherId}-mascot`}
          className={cn(
            styles.mascotTransition,
            "relative z-0 hidden w-full items-end justify-center overflow-visible pb-0 md:col-span-1 md:flex md:h-[clamp(22rem,50vh,36rem)] xl:col-span-4 xl:h-[clamp(24rem,58vh,40rem)]",
          )}
        >
          <MangaWeatherFx weather={weatherId} />
          <Image
            src={preset.mascotImage}
            alt={t(`presets.${preset.id}.mascotAlt`)}
            width={640}
            height={640}
            loading="eager"
            sizes="(min-width: 1280px) 35vw, 420px"
            className={cn(
              styles.mascotImage,
              "relative z-10 h-auto w-auto max-w-full object-contain transition-transform duration-700 ease-expo-out animate-float-soft scale-105 xl:scale-115 xl:max-h-[clamp(24rem,58vh,38rem)]",
            )}
            style={{ filter: "drop-shadow(0px 24px 36px rgba(0, 0, 0, 0.42))" }}
          />
        </div>

        <div className="relative z-10 w-full min-w-0 md:col-span-1 md:ml-auto xl:col-span-4 xl:max-w-xl">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 md:grid-cols-2 xl:grid-cols-3 xl:max-h-[calc(100svh-6rem)] xl:content-center">
            {/* Bento Block 1: Header / Weather Status */}
            <Card tone={darkWeather ? "dark" : "subtle"} className={cn(
              "col-span-full flex items-center justify-between rounded-2xl p-3.5 md:col-span-2 xl:col-span-full xl:p-[clamp(0.85rem,1.8vh,1.05rem)]",
              darkWeather ? "premium-glass-dark" : "premium-glass",
            )}>
              <div>
                <div className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black",
                  darkWeather ? "premium-glass-tile-dark text-white/80" : "premium-glass-tile text-slate-800",
                )}>
                  <Icon className={cn("h-3.5 w-3.5", darkWeather ? "text-[#B7D1EA]" : "text-[#4F7FA8]")} />
                  {t(`presets.${preset.id}.skyLabel`)}
                </div>
                <h2 className={cn("mt-1.5 text-lg font-black leading-tight tracking-[-0.03em] sm:text-xl lg:text-[clamp(1.2rem,3vh,1.6rem)]", darkWeather ? "text-white" : "text-slate-900")}>
                  {t("homeSignal", { solarSizeKw })}
                </h2>
              </div>
              <div className="text-right">
                <p className={cn("text-[9px] font-black uppercase tracking-wider", darkWeather ? "text-white/80" : "text-slate-500")}>{t("weatherImpact")}</p>
                <AnimatedNumber
                  value={calculations.intensityPct}
                  formatter={(value) => `${Math.round(value)}%`}
                  className={cn("text-lg font-black sm:text-xl", darkWeather ? "text-white" : "text-slate-950")}
                />
              </div>
            </Card>

            {/* Metric Cards: horizontal scroll on mobile, grid on md, contents on xl */}
            <div className="col-span-full -mx-4 flex snap-x snap-mandatory flex-row gap-3 overflow-x-auto px-4 pb-3 md:mx-0 md:grid md:grid-cols-2 md:gap-3 md:px-0 md:pb-0 lg:contents lg:gap-0 lg:overflow-visible">

            {/* Bento Block 2: Current Power */}
            <Card tone="dark" className="premium-glass-dark flex min-h-[96px] min-w-[85vw] snap-center flex-col justify-between rounded-2xl p-3 text-white md:min-w-0 lg:col-span-1 lg:min-h-[clamp(90px,13vh,110px)] lg:min-w-0">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#B7D1EA] text-[#0F172A]">
                <Zap className="h-4 w-4 fill-[#0F172A]/20" />
              </div>
              <div className="mt-2">
                <p className="text-[9px] font-bold uppercase tracking-wider leading-tight text-white/80">{t("metricProducingNow")}</p>
                <p className="mt-0.5 text-base font-black leading-none text-white sm:text-lg">
                  <AnimatedNumber value={calculations.currentKw} formatter={(value) => `${formatNumber(value, 2)} kW`} />
                </p>
                <p className="mt-1 text-[9px] font-semibold leading-tight text-slate-300">{t("producingNow", { solarSizeKw })}</p>
              </div>
            </Card>

            {/* Bento Block 3: Expected Yield */}
            <Card tone={darkWeather ? "dark" : "subtle"} className={cn(
              "flex min-h-[96px] min-w-[85vw] snap-center flex-col justify-between rounded-2xl p-3 md:min-w-0 xl:col-span-1 xl:min-h-[clamp(90px,13vh,110px)] xl:min-w-0",
              darkWeather ? "premium-glass-dark" : "premium-glass",
            )}>
              <div className={cn("flex h-7 w-7 items-center justify-center rounded-lg", darkWeather ? "bg-amber-300/15 text-amber-200" : "bg-amber-500/10 text-amber-600")}>
                <SunMedium className="h-4 w-4" />
              </div>
              <div className="mt-2">
                <p className={cn("text-[9px] font-bold uppercase tracking-wider leading-tight", darkWeather ? "text-white/80" : "text-slate-500")}>{t("metricTodayForecast")}</p>
                <p className={cn("mt-0.5 text-base font-black leading-none sm:text-lg", darkWeather ? "text-white" : "text-slate-950")}>
                  <AnimatedNumber value={calculations.todayKwh} formatter={(value) => `${formatNumber(value, 1)} kWh`} />
                </p>
                <p className={cn("mt-1 text-[9px] font-semibold leading-tight", darkWeather ? "text-white/80" : "text-slate-600")}>
                  <AnimatedNumber value={effectiveSunHours} formatter={(value) => t("metricTodayForecastDetail", { hours: formatNumber(value, 1) })} />
                </p>
              </div>
            </Card>

            {/* Bento Block 4: Monthly Savings */}
            <Card tone={darkWeather ? "dark" : "accent"} className={cn(
              "flex min-h-[96px] min-w-[85vw] snap-center flex-col justify-between rounded-2xl p-3 md:min-w-0 xl:col-span-1 xl:min-h-[clamp(90px,13vh,110px)] xl:min-w-0",
              darkWeather ? "premium-glass-dark" : "premium-glass-accent",
            )}>
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#B7D1EA] text-[#0F172A]">
                <BatteryCharging className="h-4 w-4" />
              </div>
              <div className="mt-2">
                <p className={cn("text-[9px] font-bold uppercase tracking-wider leading-tight", darkWeather ? "text-white/80" : "text-[#0F172A]")}>{t("metricMonthlySavings")}</p>
                <p className={cn("mt-0.5 text-base font-black leading-none sm:text-lg", darkWeather ? "text-white" : "text-[#0F172A]")}>
                  <AnimatedNumber value={calculations.monthlySavings} formatter={formatThb} />
                </p>
                <p className={cn("mt-1 text-[9px] font-semibold leading-tight", darkWeather ? "text-white/80" : "text-slate-700")}>
                  <AnimatedNumber value={calculations.monthlyKwh} formatter={(value) => t("metricMonthlySavingsDetail", { kwh: formatNumber(value, 0) })} />
                </p>
              </div>
            </Card>
            </div>{/* end metric scroll row */}

            {/* Bento Block 5: System Specs */}
            <SpotlightCard
              className={cn(
                "col-span-full flex flex-col justify-between rounded-2xl p-3 sm:col-span-2 md:col-span-1 xl:col-span-2",
                darkWeather ? "premium-glass-dark" : "premium-glass",
              )}
              spotlightColor={darkWeather ? "rgba(183, 209, 234, 0.2)" : "rgba(79, 127, 168, 0.18)"}
            >
              <p className={cn("text-[9px] font-black uppercase tracking-wider leading-none", darkWeather ? "text-white/80" : "text-slate-500")}>{t("systemSnapshot")}</p>
              <div className="mt-2 grid grid-cols-2 gap-1.5 text-[11px] font-semibold">
                <div className={cn("flex flex-col rounded-xl p-1.5", darkWeather ? "premium-glass-tile-dark" : "premium-glass-tile")}>
                  <span className={cn("text-[9px]", darkWeather ? "text-white/80" : "text-slate-600")}>{t("panelEstimate")}</span>
                  <span className={cn("mt-0.5 text-xs sm:text-sm font-black", darkWeather ? "text-white" : "text-slate-950")}>
                    <AnimatedNumber value={calculations.panels550w} formatter={(value) => t("panelEstimateValue", { panels: Math.round(value) })} />
                  </span>
                </div>
                <div className={cn("flex flex-col rounded-xl p-1.5", darkWeather ? "premium-glass-tile-dark" : "premium-glass-tile")}>
                  <span className={cn("text-[9px]", darkWeather ? "text-white/80" : "text-slate-600")}>{t("efficiencyModel")}</span>
                  <span className={cn("mt-0.5 text-xs sm:text-sm font-black", darkWeather ? "text-white" : "text-slate-950")}>
                    <AnimatedNumber value={EFFICIENCY * 100} formatter={(value) => t("efficiencyModelValue", { pct: Math.round(value) })} />
                  </span>
                </div>
                <div className={cn("flex flex-col rounded-xl p-1.5", darkWeather ? "premium-glass-tile-dark" : "premium-glass-tile")}>
                  <span className={cn("text-[9px]", darkWeather ? "text-white/80" : "text-slate-600")}>{t("electricityRate")}</span>
                  <span className={cn("mt-0.5 text-xs sm:text-sm font-black", darkWeather ? "text-white" : "text-slate-950")}>
                    <AnimatedNumber value={preset.electricityRate} formatter={(value) => t("electricityRateValue", { rate: formatNumber(value, 1) })} />
                  </span>
                </div>
                <div className={cn("flex flex-col rounded-xl p-1.5", darkWeather ? "premium-glass-tile-dark" : "premium-glass-tile")}>
                  <span className={cn("text-[9px]", darkWeather ? "text-white/80" : "text-slate-600")}>{t("solarRadiation")}</span>
                  <span className={cn("mt-0.5 text-xs sm:text-sm font-black", darkWeather ? "text-white" : "text-slate-950")}>
                    <AnimatedNumber value={calculations.irradianceWm2} formatter={(value) => t("solarRadiationValue", { watts: formatNumber(value, 0) })} />
                  </span>
                </div>
              </div>
            </SpotlightCard>

            {/* Bento Block 6: Real Installed Proof Showcase */}
            <Card
              asChild
              tone={darkWeather ? "dark" : "accent"}
              interactive
              className={cn(
                "group col-span-full flex flex-col justify-between rounded-2xl p-3 transition-all duration-300 sm:col-span-1 hover:scale-[1.03]",
                darkWeather ? "premium-glass-dark text-white hover:bg-white/18" : "premium-glass-accent text-[#0F172A] hover:bg-[#99BFE3]"
              )}
            >
            <Link
              href={`/${locale}/works`}
              className="flex h-full flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-black uppercase tracking-[0.14em] opacity-80">REAL WORKS</span>
                  <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                </div>
                <p className="mt-1.5 text-sm sm:text-base font-black tracking-tight leading-none">
                  120+ Real Works
                </p>
                <p className="mt-1 line-clamp-2 text-[10px] opacity-75">
                  {t("realWorksDesc")}
                </p>
              </div>
              <div className="mt-2.5 flex items-center justify-between border-t border-current/15 pt-1.5 text-[9px] font-extrabold">
                <span>EXPLORE SHOWCASE</span>
                <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-1" />
              </div>
            </Link>
            </Card>
          </div>
        </div>
      </div>

      {/* Collapsible, Non-Intrusive Floating Admin Simulator */}
      {showAdminSimulator && mounted && typeof document !== "undefined" ? (
        createPortal(
          <aside aria-label="Admin Weather Simulator" className="fixed bottom-4 left-4 z-50">
            {!isSimulatorOpen ? (
              <button
                type="button"
                onClick={() => setIsSimulatorOpen(true)}
                className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "premium-glass-dark gap-2 rounded-full border-white/25 px-3 py-1.5 text-xs font-black text-white hover:scale-105 hover:bg-white/20")}
                aria-label="Open Weather Simulator"
              >
                <Icon className="h-3.5 w-3.5 text-[#B7D1EA]" />
                <span className="text-[11px] font-extrabold">{t(`presets.${weatherId}.label`)}</span>
                <ChevronUp className="h-3 w-3 text-white/70" />
              </button>
            ) : (
              <div className="premium-glass-dark flex flex-col gap-2 rounded-2xl border border-white/25 p-3 shadow-2xl backdrop-blur-2xl transition-all duration-300 max-w-xs animate-in fade-in slide-in-from-bottom-2">
                <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-1.5 px-0.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-[#B7D1EA]">{t("adminConsole")}</span>
                  <button
                    type="button"
                    onClick={() => setIsSimulatorOpen(false)}
                    className={cn(buttonVariants({ variant: "quiet", size: "icon" }), "h-5 w-5 text-white/70 hover:bg-white/15 hover:text-white")}
                    aria-label="Close Weather Simulator"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {(Object.keys(WEATHER_PRESETS) as WeatherId[]).map((id) => {
                    const WeatherIcon = WEATHER_PRESETS[id].icon;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => {
                          setSimulatorWeather(id);
                        }}
                        data-analytics-event="home_weather_selected"
                        data-analytics-weather={id}
                        aria-pressed={weatherId === id}
                        className={cn(
                          buttonVariants({ variant: weatherId === id ? "primary" : "quiet", size: "sm" }),
                          "flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs font-black",
                          weatherId === id
                            ? "bg-[#B7D1EA] text-[#0F172A] shadow-md shadow-[#B7D1EA]/30"
                            : "bg-white/10 text-white hover:bg-white/20",
                        )}
                      >
                        <WeatherIcon className="h-3.5 w-3.5" />
                        <span>{t(`presets.${id}.label`)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </aside>,
          document.body,
        )
      ) : null}
    </div>
  );
}
