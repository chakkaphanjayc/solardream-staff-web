import type { HomeWeatherId } from "@/types/home";

export type LiveSolarData = {
  liveOutputKw: number;
  sunlightIndexPercent: number;
  dailyForecastKwh: number;
  cloudCoverPercent: number;
  weatherId: HomeWeatherId;
};

// Chiang Mai Coordinates
const LATITUDE = 18.7953;
const LONGITUDE = 98.962;
// Base system size for simulations (5kW system)
const BASE_SYSTEM_KW = 5;
// Average efficiency of panels
const PANEL_EFFICIENCY = 0.2;
// Approx panel area for 5kW system (m2)
const PANEL_AREA = 25;
const WEATHER_REQUEST_TIMEOUT_MS = 5_000;

/**
 * Fetches current solar data from Open-Meteo and computes live metrics.
 * Revalidates every hour (3600 seconds) in Next.js cache.
 */
export async function getLiveSolarData(): Promise<LiveSolarData | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${LATITUDE}&longitude=${LONGITUDE}&current=shortwave_radiation,cloud_cover,weather_code,is_day,precipitation&hourly=shortwave_radiation&forecast_days=1&timezone=Asia%2FBangkok`;

    // next: { revalidate: 3600 } caches the result for 1 hour on the server
    const response = await fetch(url, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(WEATHER_REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`Open-Meteo API responded with ${response.status}`);
    }

    const data = (await response.json()) as {
      current?: {
        cloud_cover?: number;
        is_day?: number;
        precipitation?: number;
        shortwave_radiation?: number;
        weather_code?: number;
      };
      hourly?: { shortwave_radiation?: number[] };
    };
    const currentRadiation = data.current?.shortwave_radiation ?? 0; // W/m2
    const currentCloudCover = Math.min(
      100,
      Math.max(0, data.current?.cloud_cover ?? 0),
    ); // %
    const currentWeatherCode = data.current?.weather_code ?? 0;
    const currentPrecipitation = data.current?.precipitation ?? 0;
    const isNight =
      data.current?.is_day === 0 ||
      (typeof data.current?.is_day !== "number" && currentRadiation <= 8);
    const hourlyRadiation = data.hourly?.shortwave_radiation ?? [];

    const weatherId: HomeWeatherId = isNight
      ? "night"
      : currentPrecipitation > 0 || currentWeatherCode >= 51
        ? "rainy"
        : currentCloudCover >= 55 || [2, 3, 45, 48].includes(currentWeatherCode)
          ? "cloudy"
          : "sunny";

    // 1. Calculate live output (kW)
    // Formula: Radiation (W/m2) * Area * Efficiency / 1000 = kW
    // We add a max cap to base system size.
    let liveOutputKw =
      (currentRadiation * PANEL_AREA * PANEL_EFFICIENCY) / 1000;
    if (liveOutputKw > BASE_SYSTEM_KW) {
      liveOutputKw = BASE_SYSTEM_KW;
    }

    // 2. Sunlight Index % (100% - cloud cover, loosely mapped to efficiency)
    let sunlightIndexPercent = isNight ? 0 : 100 - currentCloudCover;
    if (sunlightIndexPercent < 0) sunlightIndexPercent = 0;

    // 3. Daily Forecast kWh
    // Sum hourly radiation for the day and calculate total yield.
    // Assuming the first 24 items in hourly array correspond to today.
    const todayHourlyRadiation = hourlyRadiation.slice(0, 24) as number[];
    const totalDailyRadiation = todayHourlyRadiation.reduce(
      (sum, val) => sum + val,
      0,
    );
    // Total daily yield (kWh) = sum(radiation) W/m2 * 1h * Area * Efficiency / 1000
    const dailyForecastKwh =
      (totalDailyRadiation * PANEL_AREA * PANEL_EFFICIENCY) / 1000;

    // Round to 2 decimals for kW, 1 decimal for kWh, int for index
    return {
      liveOutputKw: Number(liveOutputKw.toFixed(2)),
      sunlightIndexPercent: Math.round(sunlightIndexPercent),
      dailyForecastKwh: Number(dailyForecastKwh.toFixed(1)),
      cloudCoverPercent: Math.round(currentCloudCover),
      weatherId,
    };
  } catch (error) {
    console.error("Failed to fetch live solar data from Open-Meteo", error);
    return null;
  }
}
