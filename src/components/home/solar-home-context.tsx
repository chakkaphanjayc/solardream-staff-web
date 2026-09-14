"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { LiveSolarData } from "@/lib/weather";
import {
  getRegionalFallbackLocationName,
  readCachedLocation,
  writeCachedLocation,
} from "@/lib/clientLocationCache";
import type { HomeWeatherId } from "@/types/home";
import {
  calculateSolarEstimate,
  clamp,
  DEFAULT_SOLAR_SIZE_KWP,
  normalizeSolarSize,
  type SolarEstimate,
} from "./solar-estimates";

export type SolarLocation = Readonly<{
  label: string;
  detail: string;
  latitude?: number;
  longitude?: number;
  source: "default" | "geolocation" | "search";
}>;

export type LocationSearchResult = Readonly<{
  latitude: number;
  longitude: number;
  displayName: string;
}>;

export type SolarWeatherSnapshot = Readonly<{
  weatherId: HomeWeatherId;
  sunlightIndexPercent: number;
  cloudCoverPercent: number;
  sunHours: number;
  currentOutputKw: number;
  source: "live" | "open-meteo" | "fallback";
}>;

export type SolarHomeState = Readonly<{
  solarSizeKwp: number;
  setSolarSizeKwp: (value: number) => void;
  estimate: SolarEstimate;
  location: SolarLocation;
  weather: SolarWeatherSnapshot;
  isLocating: boolean;
  isSearching: boolean;
  locationError: string | null;
  searchResults: readonly LocationSearchResult[];
  requestCurrentLocation: () => void;
  searchLocation: (query: string) => Promise<void>;
  selectLocation: (result: LocationSearchResult) => Promise<void>;
  clearSearchResults: () => void;
}>;

type SolarHomeStateProviderProps = Readonly<{
  children: ReactNode;
  locale: string;
  initialLiveSolarData?: LiveSolarData | null;
}>;

type WeatherBase = Readonly<{
  weatherId: HomeWeatherId;
  sunlightIndexPercent: number;
  cloudCoverPercent: number;
  sunHours: number;
  currentOutputKw: number;
  source: SolarWeatherSnapshot["source"];
}>;

const SolarHomeContext = createContext<SolarHomeState | null>(null);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isWeatherId(value: unknown): value is HomeWeatherId {
  return (
    value === "sunny" ||
    value === "cloudy" ||
    value === "rainy" ||
    value === "night"
  );
}

function numberFrom(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function weatherFromSunlight(sunlightIndexPercent: number): HomeWeatherId {
  if (sunlightIndexPercent < 35) return "rainy";
  if (sunlightIndexPercent < 65) return "cloudy";
  return "sunny";
}

function isNighttimeInThailand() {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Bangkok",
      hour: "2-digit",
      hour12: false,
    }).format(new Date()),
  );

  return hour >= 19 || hour < 6;
}

function createInitialWeather(data?: LiveSolarData | null): WeatherBase {
  const initialWeatherId =
    data?.weatherId ?? (isNighttimeInThailand() ? "night" : undefined);
  const sunlightIndexPercent = clamp(
    initialWeatherId === "night" ? 0 : (data?.sunlightIndexPercent ?? 82),
    0,
    100,
  );

  return {
    weatherId: initialWeatherId ?? weatherFromSunlight(sunlightIndexPercent),
    sunlightIndexPercent,
    cloudCoverPercent:
      data?.cloudCoverPercent ?? Math.round(100 - sunlightIndexPercent),
    sunHours: 4.2,
    currentOutputKw: Math.max(0, data?.liveOutputKw ?? 1.49),
    source: data ? "live" : "fallback",
  };
}

function shortLocationName(displayName: string) {
  return displayName
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(", ");
}

function parseLocationResults(payload: unknown): LocationSearchResult[] {
  if (!isRecord(payload) || !Array.isArray(payload.results)) return [];

  return payload.results.flatMap((value) => {
    if (!isRecord(value)) return [];

    const latitude = Number(value.latitude);
    const longitude = Number(value.longitude);
    const displayName =
      typeof value.displayName === "string" ? value.displayName.trim() : "";

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      !displayName
    ) {
      return [];
    }

    return [{ latitude, longitude, displayName }];
  });
}

export function SolarHomeStateProvider({
  children,
  locale,
  initialLiveSolarData,
}: SolarHomeStateProviderProps) {
  const isThai = locale === "th";
  const [solarSizeKwp, setSolarSizeKwpState] = useState(DEFAULT_SOLAR_SIZE_KWP);
  const [location, setLocation] = useState<SolarLocation>({
    label: isThai ? "ประเทศไทย" : "Thailand",
    detail: isThai ? "ค่าเฉลี่ยแสงแดดในประเทศไทย" : "Regional sunlight average",
    source: "default",
  });
  const [weatherBase, setWeatherBase] = useState<WeatherBase>(() =>
    createInitialWeather(initialLiveSolarData),
  );
  const [isLocating, setIsLocating] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<
    readonly LocationSearchResult[]
  >([]);

  const setSolarSizeKwp = useCallback((value: number) => {
    setSolarSizeKwpState(normalizeSolarSize(value));
  }, []);

  const refreshWeather = useCallback(
    async (latitude: number, longitude: number) => {
      try {
        const response = await fetch(
          `/api/weather/solar?lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}`,
          { cache: "no-store" },
        );
        if (!response.ok) return;

        const payload: unknown = await response.json();
        const data =
          isRecord(payload) && isRecord(payload.data) ? payload.data : null;
        if (!data) return;

        const sunlightIndexPercent = clamp(
          numberFrom(data.weatherImpactPct, 82),
          0,
          100,
        );

        setWeatherBase({
          weatherId: isWeatherId(data.weatherId)
            ? data.weatherId
            : weatherFromSunlight(sunlightIndexPercent),
          sunlightIndexPercent,
          cloudCoverPercent: clamp(
            numberFrom(data.cloudCoverPct, 100 - sunlightIndexPercent),
            0,
            100,
          ),
          sunHours: clamp(numberFrom(data.sunHours, 4.2), 0, 8),
          currentOutputKw: Math.max(
            0,
            numberFrom(data.irradianceWm2, 600) * 0.005,
          ),
          source:
            data.source === "open-meteo" || data.source === "openweather"
              ? "open-meteo"
              : "fallback",
        });
      } catch {
        // Location selection remains useful even if weather context is offline.
      }
    },
    [],
  );

  const setLocationFromCoordinates = useCallback(
    async (
      latitude: number,
      longitude: number,
      source: "geolocation" | "search",
    ) => {
      let label = getRegionalFallbackLocationName(
        latitude,
        longitude,
        isThai ? "ตำแหน่งปัจจุบัน" : "Current location",
      );

      if (source === "geolocation") {
        const cached = readCachedLocation(latitude, longitude);
        if (cached?.displayName) {
          label = shortLocationName(cached.displayName);
        } else {
          try {
            const response = await fetch("/api/services/geocode", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ latitude, longitude }),
            });
            const payload: unknown = await response.json();
            const resolved =
              isRecord(payload) && isRecord(payload.location)
                ? payload.location
                : null;
            const displayName =
              resolved && typeof resolved.displayName === "string"
                ? resolved.displayName.trim()
                : "";

            if (displayName) {
              label = shortLocationName(displayName);
              writeCachedLocation(latitude, longitude, displayName);
            }
          } catch {
            // The regional fallback keeps the control useful when geocoding is unavailable.
          }
        }
      }

      setLocation({
        label,
        detail: isThai
          ? "ตำแหน่งที่เลือกสำหรับการประเมิน"
          : "Location used for this estimate",
        latitude,
        longitude,
        source,
      });
      setLocationError(null);
      setSearchResults([]);
      await refreshWeather(latitude, longitude);
    },
    [isThai, refreshWeather],
  );

  const requestCurrentLocation = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setLocationError(
        isThai
          ? "เบราว์เซอร์นี้ไม่รองรับการระบุตำแหน่ง โปรดลองค้นหาจังหวัดหรือพื้นที่แทน"
          : "Location access is not available here. Search for a province or area instead.",
      );
      return;
    }

    setIsLocating(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        void setLocationFromCoordinates(
          position.coords.latitude,
          position.coords.longitude,
          "geolocation",
        ).finally(() => setIsLocating(false));
      },
      () => {
        setIsLocating(false);
        setLocationError(
          isThai
            ? "ยังใช้ตำแหน่งปัจจุบันไม่ได้ คุณสามารถค้นหาพื้นที่ของบ้านแทนได้"
            : "We could not use your location. Search for your home area instead.",
        );
      },
      { timeout: 8_000, maximumAge: 600_000, enableHighAccuracy: false },
    );
  }, [isThai, setLocationFromCoordinates]);

  const searchLocation = useCallback(
    async (query: string) => {
      const trimmedQuery = query.trim();
      if (trimmedQuery.length < 3) {
        setLocationError(
          isThai
            ? "พิมพ์อย่างน้อย 3 ตัวอักษรเพื่อค้นหา"
            : "Enter at least 3 characters to search.",
        );
        setSearchResults([]);
        return;
      }

      setIsSearching(true);
      setLocationError(null);
      try {
        const response = await fetch(
          `/api/services/location/search?q=${encodeURIComponent(trimmedQuery)}`,
          { cache: "no-store" },
        );
        const payload: unknown = await response.json();
        const results = parseLocationResults(payload);

        setSearchResults(results);
        if (!results.length) {
          setLocationError(
            isThai
              ? "ไม่พบพื้นที่นี้ ลองค้นหาด้วยชื่อจังหวัด"
              : "No locations found. Try a province name.",
          );
        }
      } catch {
        setSearchResults([]);
        setLocationError(
          isThai
            ? "ระบบค้นหาพื้นที่ไม่พร้อมใช้งานในขณะนี้"
            : "Location search is unavailable right now.",
        );
      } finally {
        setIsSearching(false);
      }
    },
    [isThai],
  );

  const selectLocation = useCallback(
    async (result: LocationSearchResult) => {
      await setLocationFromCoordinates(
        result.latitude,
        result.longitude,
        "search",
      );
      setLocation((current) => ({
        ...current,
        label: shortLocationName(result.displayName) || result.displayName,
        source: "search",
      }));
    },
    [setLocationFromCoordinates],
  );

  const clearSearchResults = useCallback(() => {
    setSearchResults([]);
  }, []);

  const weather = useMemo<SolarWeatherSnapshot>(
    () => ({
      ...weatherBase,
      currentOutputKw: Number(
        Math.min(
          solarSizeKwp,
          weatherBase.currentOutputKw * (solarSizeKwp / DEFAULT_SOLAR_SIZE_KWP),
        ).toFixed(2),
      ),
    }),
    [solarSizeKwp, weatherBase],
  );

  const estimate = useMemo(
    () => calculateSolarEstimate(solarSizeKwp, weatherBase.sunHours),
    [solarSizeKwp, weatherBase.sunHours],
  );

  const value = useMemo<SolarHomeState>(
    () => ({
      solarSizeKwp,
      setSolarSizeKwp,
      estimate,
      location,
      weather,
      isLocating,
      isSearching,
      locationError,
      searchResults,
      requestCurrentLocation,
      searchLocation,
      selectLocation,
      clearSearchResults,
    }),
    [
      clearSearchResults,
      estimate,
      isLocating,
      isSearching,
      location,
      locationError,
      requestCurrentLocation,
      searchLocation,
      searchResults,
      selectLocation,
      setSolarSizeKwp,
      solarSizeKwp,
      weather,
    ],
  );

  return (
    <SolarHomeContext.Provider value={value}>
      {children}
    </SolarHomeContext.Provider>
  );
}

export function useSolarHome(): SolarHomeState {
  const context = useContext(SolarHomeContext);
  if (!context) {
    throw new Error("useSolarHome must be used within SolarHomeStateProvider");
  }

  return context;
}

/**
 * The shared header also renders on routes that do not mount the home
 * simulator. Keep the strict hook above for home-only features and expose an
 * optional variant for reusable site chrome.
 */
export function useSolarHomeOptional(): SolarHomeState | null {
  return useContext(SolarHomeContext);
}
