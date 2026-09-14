"use server";

import { revalidatePath, revalidateTag } from "next/cache";

import { checkAdmin } from "@/app/actions/auth";
import { getSystemSetting, saveSystemSetting } from "@/app/actions/systemSettings";
import {
  BUILD_CONFIG_SETTING_KEY,
  DEFAULT_BUILD_CONFIG,
  parseBuildConfig,
  type BuildConfig,
} from "@/lib/buildConfig";
import { BUILD_CONFIG_CACHE_TAG } from "@/lib/public-build-config-cache";
import { locales } from "@/i18n/locales";

export async function getBuildConfig() {
  await checkAdmin();

  const raw = await getSystemSetting(BUILD_CONFIG_SETTING_KEY);
  if (!raw) {
    return DEFAULT_BUILD_CONFIG;
  }

  try {
    return parseBuildConfig(raw);
  } catch (error) {
    console.error("[Build Config] Failed to parse saved config:", error);
    return DEFAULT_BUILD_CONFIG;
  }
}

export async function saveBuildConfig(config: BuildConfig) {
  await checkAdmin();
  try {
    const normalized = parseBuildConfig({
      ...config,
      updatedAt: new Date().toISOString(),
    });

    const result = await saveSystemSetting(
      BUILD_CONFIG_SETTING_KEY,
      JSON.stringify(normalized),
    );

    if (!result.success) {
      return {
        success: false,
        error: result.error || "Failed to save build config.",
      };
    }

    revalidateTag(BUILD_CONFIG_CACHE_TAG, "max");

    for (const locale of locales) {
      revalidatePath(`/${locale}/admin/build/config`);
      revalidatePath(`/${locale}/admin/build`);
      revalidatePath(`/${locale}/build`);
      revalidatePath(`/${locale}/builder`);
      revalidatePath(`/${locale}/wizard`);
      revalidatePath(`/${locale}/wizard/summary`);
    }
    revalidatePath("/", "layout");

    return {
      success: true,
      config: normalized,
    };
  } catch (error: unknown) {
    console.error("[Build Config] Failed to save config:", error);
    return { success: false, error: "Failed to save build config." };
  }
}

export async function resetBuildConfigToStarter() {
  return saveBuildConfig({
    ...DEFAULT_BUILD_CONFIG,
    updatedAt: new Date().toISOString(),
  });
}
