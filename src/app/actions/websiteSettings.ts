"use server";

import { revalidatePath, revalidateTag } from "next/cache";

import { checkAdmin } from "@/app/actions/auth";
import { saveSystemSetting } from "@/app/actions/systemSettings";
import { WEBSITE_SETTINGS_CACHE_TAG, WEBSITE_SETTINGS_KEY } from "@/lib/websiteSettings";
import { websiteSettingsSchema } from "@/lib/websiteSettingsTypes";
import { locales } from "@/i18n/locales";

export async function saveWebsiteSettingsJson(rawJson: string) {
  await checkAdmin();
  try {
    if (typeof rawJson !== "string" || rawJson.length > 500_000) {
      return { success: false, error: "Website settings payload is invalid." };
    }
    const parsed = JSON.parse(rawJson) as unknown;
    const settings = websiteSettingsSchema.parse(parsed);
    const result = await saveSystemSetting(WEBSITE_SETTINGS_KEY, JSON.stringify(settings, null, 2));
    if (!result.success) return result;
    revalidateTag(WEBSITE_SETTINGS_CACHE_TAG, "max");
    revalidatePath("/", "layout");
    for (const locale of locales) revalidatePath(`/${locale}/admin/settings/website`);
    return { success: true };
  } catch (error: unknown) {
    console.error("[Website Settings Save]", error);
    return {
      success: false,
      error: "Website settings could not be saved.",
    };
  }
}
