import "server-only";

import { getLocalizationConfig, getSystemSetting } from "@/app/actions/systemSettings";
import {
  BUILD_CONFIG_SETTING_KEY,
  DEFAULT_BUILD_CONFIG,
  localizeBuildConfig,
  parseBuildConfig,
  type BuildConfig,
} from "@/lib/buildConfig";
import { listErpnextAddonConfigs } from "@/lib/erpnextCatalog";
import type { Locale } from "@/i18n/locales";
import type { SolarAddonConfig } from "@/lib/solarAddonConfig";

export async function getPublicBuildConfig(locale?: Locale): Promise<BuildConfig> {
  try {
    const [raw, localization, erpnextAddons] = await Promise.all([
      getSystemSetting(BUILD_CONFIG_SETTING_KEY),
      getLocalizationConfig(),
      listErpnextAddonConfigs(),
    ]);
    const config = raw ? parseBuildConfig(raw) : parseBuildConfig(DEFAULT_BUILD_CONFIG);
    config.smartAddons = erpnextAddons;
    if (config.localeConfigs) {
      Object.values(config.localeConfigs).forEach((locConfig) => {
        if (locConfig) locConfig.smartAddons = erpnextAddons;
      });
    }

    const languageConfig = locale ? config.localeConfigs?.[locale] ?? config : config;
    languageConfig.smartAddons = erpnextAddons;

    return locale ? localizeBuildConfig(languageConfig, locale, localization.defaultLocale) : config;
  } catch (error) {
    console.error("[Public Build Config] Failed to load ERPNext-backed build config:", error);
    return locale ? localizeBuildConfig(DEFAULT_BUILD_CONFIG, locale, "th") : DEFAULT_BUILD_CONFIG;
  }
}

export async function getPublicAddonsConfig(locale?: Locale): Promise<SolarAddonConfig[]> {
  const buildConfig = await getPublicBuildConfig(locale);
  return buildConfig.smartAddons.filter((addon) => addon.isVisible !== false);
}
