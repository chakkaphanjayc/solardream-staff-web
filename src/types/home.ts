export const HOME_SOLAR_SIZE_OPTIONS = [3, 5, 8, 10] as const;

export type HomeSolarSizeKw = (typeof HOME_SOLAR_SIZE_OPTIONS)[number];

export type HomeWeatherId = "sunny" | "cloudy" | "rainy" | "night";

export type HomeChapterId =
  | "sunlight"
  | "sizing"
  | "technology"
  | "impact"
  | "works"
  | "next-step";

export type HomeSolarMetric = Readonly<{
  id: "current-output" | "sunlight-intensity" | "today-forecast" | "monthly-savings";
  value: string;
  detail: string;
}>;

export type HomeChapter = Readonly<{
  id: HomeChapterId;
  label: string;
  heading: string;
  description?: string;
}>;

export type SolarTrendPoint = Readonly<{
  time: string;
  irradianceWm2: number;
  clearSkyIrradianceWm2: number;
}>;

export type SolarWeatherData = Readonly<{
  source: "openweather" | "open-meteo" | "fallback";
  weatherId: HomeWeatherId;
  irradianceWm2: number;
  clearSkyIrradianceWm2: number;
  weatherImpactPct: number;
  sunHours: number;
  dailyIrradiationKwhM2: number;
  cloudCoverPct: number;
  trend: readonly SolarTrendPoint[];
}>;

export type HomeSolarCalculationResult = Readonly<{
  solarSizeKw: HomeSolarSizeKw;
  panelCount550w: number;
  panelCount450w: number;
  dailyOutputKwh: number;
  monthlySavingsThb: number;
  annualOutputKwh: number;
  avoidedCo2Kg: number;
  treeEquivalent: number;
  diurnalTrend: readonly { label: string; value: number }[];
}>;

export type HomeSolarState = Readonly<{
  solarSizeKw: HomeSolarSizeKw;
  setSolarSizeKw: (size: HomeSolarSizeKw) => void;
  activeChapter: number;
  setActiveChapter: (index: number) => void;
  storyProgress: number;
  setStoryProgress: (progress: number) => void;
  calculations: HomeSolarCalculationResult;
}>;

/**
 * Raster assets are kept separate from UI copy so generated artwork never
 * becomes the source of truth for an accessible label or localized message.
 */
export type HomeMangaAsset = Readonly<{
  src: `/asset/${string}`;
  width: number;
  height: number;
  alt: string;
  sizes?: string;
}>;

export type HomeMangaAssetRole =
  | "hero-environment"
  | "hero-character"
  | "blueprint"
  | "impact-accent"
  | "chapter-decoration";

export type HomeMangaAssetManifestItem = Readonly<{
  role: HomeMangaAssetRole;
  asset: HomeMangaAsset;
  loading: "eager" | "lazy";
}>;

export type HomeMangaAssetManifest = readonly HomeMangaAssetManifestItem[];
