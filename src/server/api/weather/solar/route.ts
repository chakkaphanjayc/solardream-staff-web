import { NextResponse } from "next/server";

type WeatherId = "sunny" | "cloudy" | "rainy" | "night";

type SolarTrendPoint = {
  time: string;
  irradianceWm2: number;
  clearSkyIrradianceWm2: number;
};

type SolarWeatherPayload = {
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

const WEATHER_CACHE_SECONDS = 10 * 60;
const WEATHER_REQUEST_TIMEOUT_MS = 5_000;

type OpenWeatherInterval = {
  start?: string;
  end?: string;
  avg_irradiance?: unknown;
  max_irradiance?: unknown;
  irradiation?: unknown;
};

type OpenWeatherSolarResponse = {
  intervals?: OpenWeatherInterval[];
};

type OpenMeteoResponse = {
  current?: {
    weather_code?: number;
    is_day?: number;
    cloud_cover?: number;
    precipitation?: number;
    shortwave_radiation?: number;
  };
  daily?: {
    sunshine_duration?: number[];
  };
  hourly?: {
    time?: string[];
    shortwave_radiation?: number[];
  };
};

const CHIANG_MAI_FALLBACK: SolarWeatherPayload = {
  source: "fallback",
  weatherId: "sunny",
  irradianceWm2: 760,
  clearSkyIrradianceWm2: 850,
  weatherImpactPct: 89,
  sunHours: 5.2,
  dailyIrradiationKwhM2: 4.9,
  cloudCoverPct: 18,
  trend: [
    { time: "06:00", irradianceWm2: 60, clearSkyIrradianceWm2: 80 },
    { time: "09:00", irradianceWm2: 520, clearSkyIrradianceWm2: 620 },
    { time: "12:00", irradianceWm2: 760, clearSkyIrradianceWm2: 850 },
    { time: "15:00", irradianceWm2: 540, clearSkyIrradianceWm2: 680 },
    { time: "18:00", irradianceWm2: 80, clearSkyIrradianceWm2: 110 },
  ],
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function numberFrom(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function objectFrom(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readSkyValue(
  source: unknown,
  sky: "cloud" | "clear",
  key: "ghi" | "dni" | "dhi",
) {
  const root = objectFrom(source);
  const skyObject =
    [`${sky} sky`, `${sky}_sky`, sky]
      .map((candidate) => objectFrom(root[candidate]))
      .find((candidate) => Object.keys(candidate).length > 0) ?? {};

  return numberFrom(skyObject[key]);
}

function weatherFromConditions({
  isDay,
  weatherCode,
  cloudCover,
  precipitation,
  irradianceWm2,
}: {
  isDay: number;
  weatherCode: number;
  cloudCover: number;
  precipitation: number;
  irradianceWm2: number;
}): WeatherId {
  if (isDay === 0 || (isDay !== 1 && irradianceWm2 <= 8)) return "night";
  if (precipitation > 0 || weatherCode >= 51) return "rainy";
  if (cloudCover >= 55 || [2, 3, 45, 48].includes(weatherCode)) return "cloudy";
  return "sunny";
}

function todayString() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function currentBangkokHour() {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Bangkok",
      hour: "2-digit",
      hour12: false,
    }).format(new Date()),
  );
}

function intervalHour(value?: string) {
  const match = value?.match(/(\d{2}):\d{2}/);
  return match ? Number(match[1]) : 12;
}

function normalizeOpenWeather(
  data: OpenWeatherSolarResponse,
): SolarWeatherPayload {
  const intervals = data.intervals ?? [];
  if (!intervals.length) return CHIANG_MAI_FALLBACK;

  const targetHour = currentBangkokHour();
  const closest = intervals.reduce((best, current) => {
    const bestDelta = Math.abs(intervalHour(best.start) - targetHour);
    const currentDelta = Math.abs(intervalHour(current.start) - targetHour);
    return currentDelta < bestDelta ? current : best;
  }, intervals[0]);

  const trend = intervals
    .map((interval) => ({
      time: interval.start ?? "",
      irradianceWm2: Math.round(
        readSkyValue(interval.avg_irradiance, "cloud", "ghi"),
      ),
      clearSkyIrradianceWm2: Math.round(
        readSkyValue(interval.avg_irradiance, "clear", "ghi"),
      ),
    }))
    .filter(
      (point) => point.irradianceWm2 > 0 || point.clearSkyIrradianceWm2 > 0,
    );

  const irradianceWm2 = Math.round(
    readSkyValue(closest.avg_irradiance, "cloud", "ghi"),
  );
  const clearSkyIrradianceWm2 = Math.max(
    Math.round(readSkyValue(closest.avg_irradiance, "clear", "ghi")),
    irradianceWm2,
    1,
  );
  const dailyIrradiationKwhM2 = intervals.reduce((sum, interval) => {
    const irradiation = readSkyValue(interval.irradiation, "cloud", "ghi");
    return sum + irradiation / 1000;
  }, 0);
  const weatherImpactPct = Math.round(
    clamp((irradianceWm2 / clearSkyIrradianceWm2) * 100, 0, 100),
  );
  const cloudCoverPct = Math.round(clamp(100 - weatherImpactPct, 0, 100));

  return {
    source: "openweather",
    weatherId: weatherFromConditions({
      isDay: irradianceWm2 > 8 ? 1 : 0,
      weatherCode: 0,
      cloudCover: cloudCoverPct,
      precipitation: 0,
      irradianceWm2,
    }),
    irradianceWm2,
    clearSkyIrradianceWm2,
    weatherImpactPct,
    sunHours: clamp(dailyIrradiationKwhM2 / 0.82, 0, 8),
    dailyIrradiationKwhM2: Number(dailyIrradiationKwhM2.toFixed(2)),
    cloudCoverPct,
    trend: trend.length ? trend : CHIANG_MAI_FALLBACK.trend,
  };
}

async function fetchOpenWeather(latitude: number, longitude: number) {
  const apiKey =
    process.env.OPENWEATHER_API_KEY || process.env.OPENWEATHERMAP_API_KEY;
  if (!apiKey) return null;

  const url = new URL(
    "https://api.openweathermap.org/energy/2.0/solar/interval_data",
  );
  url.searchParams.set("lat", String(latitude));
  url.searchParams.set("lon", String(longitude));
  url.searchParams.set("date", todayString());
  url.searchParams.set("interval", "1h");
  url.searchParams.set("appid", apiKey);

  const response = await fetch(url.toString(), {
    next: { revalidate: WEATHER_CACHE_SECONDS },
    signal: AbortSignal.timeout(WEATHER_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) return null;

  const json = (await response.json()) as OpenWeatherSolarResponse;
  return normalizeOpenWeather(json);
}

async function fetchOpenMeteo(
  latitude: number,
  longitude: number,
): Promise<SolarWeatherPayload | null> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set(
    "current",
    "weather_code,is_day,cloud_cover,precipitation,shortwave_radiation",
  );
  url.searchParams.set("hourly", "shortwave_radiation");
  url.searchParams.set("daily", "sunshine_duration");
  url.searchParams.set("forecast_days", "1");
  url.searchParams.set("timezone", "auto");

  const response = await fetch(url.toString(), {
    next: { revalidate: WEATHER_CACHE_SECONDS },
    signal: AbortSignal.timeout(WEATHER_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) return null;

  const data = (await response.json()) as OpenMeteoResponse;
  const current = data.current;
  if (!current) return null;

  const hourlyTimes = data.hourly?.time ?? [];
  const hourlyRadiation = data.hourly?.shortwave_radiation ?? [];
  const trend = hourlyTimes
    .map((time, index) => ({
      time: time.slice(11, 16),
      irradianceWm2: Math.round(numberFrom(hourlyRadiation[index])),
      clearSkyIrradianceWm2: Math.round(
        numberFrom(hourlyRadiation[index]) /
          Math.max(0.16, 1 - numberFrom(current.cloud_cover) / 130),
      ),
    }))
    .filter(
      (point) => point.irradianceWm2 > 0 || point.clearSkyIrradianceWm2 > 0,
    );

  const irradianceWm2 = Math.round(numberFrom(current.shortwave_radiation));
  const cloudCoverPct = Math.round(numberFrom(current.cloud_cover));
  const clearSkyIrradianceWm2 = Math.max(
    Math.round(irradianceWm2 / Math.max(0.16, 1 - cloudCoverPct / 130)),
    irradianceWm2,
    1,
  );
  const dailyIrradiationKwhM2 = hourlyRadiation.reduce(
    (sum, value) => sum + numberFrom(value) / 1000,
    0,
  );
  const weatherImpactPct = Math.round(
    clamp((irradianceWm2 / clearSkyIrradianceWm2) * 100, 0, 100),
  );
  const sunshineSeconds = data.daily?.sunshine_duration?.[0];

  return {
    source: "open-meteo",
    weatherId: weatherFromConditions({
      isDay: numberFrom(current.is_day),
      weatherCode: numberFrom(current.weather_code),
      cloudCover: cloudCoverPct,
      precipitation: numberFrom(current.precipitation),
      irradianceWm2,
    }),
    irradianceWm2,
    clearSkyIrradianceWm2,
    weatherImpactPct,
    sunHours:
      typeof sunshineSeconds === "number"
        ? clamp(sunshineSeconds / 3600, 0, 8)
        : clamp(dailyIrradiationKwhM2 / 0.82, 0, 8),
    dailyIrradiationKwhM2: Number(dailyIrradiationKwhM2.toFixed(2)),
    cloudCoverPct,
    trend: trend.length ? trend : CHIANG_MAI_FALLBACK.trend,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const latitude = Number(searchParams.get("lat"));
  const longitude = Number(searchParams.get("lon"));

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return NextResponse.json(
      {
        success: false,
        error: "Valid lat and lon query parameters are required.",
      },
      { status: 400 },
    );
  }

  try {
    const openWeather = await fetchOpenWeather(latitude, longitude);
    if (openWeather) {
      return NextResponse.json({ success: true, data: openWeather });
    }

    const openMeteo = await fetchOpenMeteo(latitude, longitude);
    if (openMeteo) {
      return NextResponse.json({ success: true, data: openMeteo });
    }

    return NextResponse.json({ success: true, data: CHIANG_MAI_FALLBACK });
  } catch (error) {
    console.error("[Solar Weather API] Failed to fetch solar weather:", error);
    return NextResponse.json({ success: true, data: CHIANG_MAI_FALLBACK });
  }
}
