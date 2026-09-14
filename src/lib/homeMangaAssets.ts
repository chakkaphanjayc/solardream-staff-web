import type {
  HomeMangaAsset,
  HomeMangaAssetManifest,
  HomeMangaAssetManifestItem,
  HomeWeatherId,
} from "@/types/home";

/**
 * Project-local artwork used by the manga homepage. UI copy and translated
 * labels stay in React so the raster asset never carries inaccessible text.
 */
export const HOME_MANGA_HERO_WEATHER_ASSETS: Record<HomeWeatherId, HomeMangaAsset> = {
  sunny: {
    src: "/asset/home-manga/hero-solar-home-sunny.png",
    width: 1672,
    height: 941,
    alt: "SolarDream residential solar home under bright sunny skies",
    sizes: "100vw",
  },
  cloudy: {
    src: "/asset/home-manga/hero-solar-home-cloudy.png",
    width: 1672,
    height: 941,
    alt: "SolarDream residential solar home under soft cloudy skies",
    sizes: "100vw",
  },
  rainy: {
    src: "/asset/home-manga/hero-solar-home-rainy.png",
    width: 1672,
    height: 941,
    alt: "SolarDream residential solar home during refreshing rain",
    sizes: "100vw",
  },
  night: {
    src: "/asset/home-manga/hero-solar-home-night.png",
    width: 1672,
    height: 941,
    alt: "SolarDream residential solar home illuminated under the night sky",
    sizes: "100vw",
  },
};

export const HOME_MANGA_HERO_ENVIRONMENT_ASSET = HOME_MANGA_HERO_WEATHER_ASSETS.sunny;

export const HOME_MANGA_HERO_ENVIRONMENT = {
  role: "hero-environment",
  loading: "eager",
  asset: HOME_MANGA_HERO_ENVIRONMENT_ASSET,
} as const satisfies HomeMangaAssetManifestItem;

export const HOME_MANGA_ASSETS = [
  HOME_MANGA_HERO_ENVIRONMENT,
] as const satisfies HomeMangaAssetManifest;
