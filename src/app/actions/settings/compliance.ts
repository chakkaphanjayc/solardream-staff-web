"use server";

import { db } from "@/db";
import { siteSettings, cookieConsentLogs, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth-guard";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import crypto from "crypto";
import { createClient } from "@/utils/supabase/server";
import { revalidateTag } from "next/cache";
import { sendConfiguredTemplateEmail } from "@/lib/email";
import { getSystemSetting, saveSystemSetting } from "@/app/actions/systemSettings";
import { isLocale, type Locale } from "@/i18n/locales";
import { z } from "zod";

const COMPLIANCE_TRANSLATIONS_KEY = "compliance_translations";

const complianceSettingsSchema = z.object({
  cookieBannerText: z.string().trim().max(4000),
  cookieBannerEnabled: z.boolean(),
  termsAndConditions: z.string().max(50_000),
  privacyPolicy: z.string().max(50_000),
  notifyUsers: z.boolean().optional(),
});

export type ComplianceCopy = {
  cookieBannerText: string;
  termsAndConditions: string;
  privacyPolicy: string;
};

export async function getComplianceTranslations(): Promise<Partial<Record<Locale, ComplianceCopy>>> {
  const raw = await getSystemSetting(COMPLIANCE_TRANSLATIONS_KEY);
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(value).flatMap(([locale, copy]) => {
      if (!isLocale(locale) || copy === null || typeof copy !== "object") return [];
      const item = copy as Record<string, unknown>;
      if (typeof item.cookieBannerText !== "string" || typeof item.termsAndConditions !== "string" || typeof item.privacyPolicy !== "string") return [];
      return [[locale, { cookieBannerText: item.cookieBannerText, termsAndConditions: item.termsAndConditions, privacyPolicy: item.privacyPolicy }]];
    })) as Partial<Record<Locale, ComplianceCopy>>;
  } catch {
    return {};
  }
}

export async function saveComplianceTranslation(locale: Locale, copy: ComplianceCopy) {
  await requireAdmin();
  if (!isLocale(locale)) return { success: false, error: "Unsupported language." };
  const translations = await getComplianceTranslations();
  const result = await saveSystemSetting(COMPLIANCE_TRANSLATIONS_KEY, JSON.stringify({ ...translations, [locale]: copy }));
  if (result.success) revalidateTag("site-settings-default", "max");
  return result;
}

/**
 * Fetches the global compliance settings.
 * Accessible to public visitors for rendering cookie consent banners.
 */
export async function getComplianceSettings() {
  try {
    const config = await db.query.siteSettings.findFirst({
      where: eq(siteSettings.id, "default"),
    });

    return config ?? {
      id: "default",
      cookieBannerText: "เราใช้คุกกี้เพื่อพัฒนาประสิทธิภาพ และประสบการณ์ที่ดีในการใช้เว็บไซต์ของคุณ ทั้งนี้ ท่านสามารถศึกษารายละเอียดการใช้คุกกี้ได้ที่ นโยบายความเป็นส่วนตัว",
      cookieBannerEnabled: true,
      termsAndConditions: "",
      privacyPolicy: "",
      updatedAt: new Date(0),
    };
  } catch (error) {
    console.error("[getComplianceSettings] Error fetching compliance settings:", error);
    // Return standard defaults if database is not ready or querying fails
    return {
      id: "default",
      cookieBannerText: "เราใช้คุกกี้เพื่อพัฒนาประสิทธิภาพ และประสบการณ์ที่ดีในการใช้เว็บไซต์ของคุณ ทั้งนี้ ท่านสามารถศึกษารายละเอียดการใช้คุกกี้ได้ที่ นโยบายความเป็นส่วนตัว",
      cookieBannerEnabled: true,
      termsAndConditions: "",
      privacyPolicy: "",
      updatedAt: new Date(),
    };
  }
}

/**
 * Updates the global compliance settings.
 * Restricted to authenticated admins.
 */
export async function updateComplianceSettings(data: {
  cookieBannerText: string;
  cookieBannerEnabled: boolean;
  termsAndConditions: string;
  privacyPolicy: string;
  notifyUsers?: boolean;
}) {
  await requireAdmin();
  const parsed = complianceSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || "Invalid compliance settings." };
  }
  const { notifyUsers = false, ...settings } = parsed.data;

  const [updated] = await db
    .insert(siteSettings)
    .values({
      id: "default",
      ...settings,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: siteSettings.id,
      set: {
        ...settings,
        updatedAt: new Date(),
      },
    })
    .returning({ id: siteSettings.id });
  if (!updated) return { success: false, error: "Compliance settings were not saved." };

  // Revalidate both the public layouts, privacy/terms pages, and compliance admin paths
  revalidatePath("/", "layout");
  revalidatePath("/privacy");
  revalidatePath("/terms");
  revalidatePath("/legal/privacy-policy");
  revalidatePath("/legal/terms-of-service");
  revalidatePath("/admin/settings/compliance");
  revalidateTag("site-settings-default", "max");

  if (notifyUsers) {
    const recipients = await db.select({ email: users.email, name: users.name }).from(users);
    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://solar-dream.org").replace(/\/$/, "");
    const policySummary = "SolarDream has published an important update to its Terms, Privacy Policy, or compliance notice.";
    await Promise.allSettled(recipients.map((recipient) => sendConfiguredTemplateEmail({
      templateKey: "policy_updated",
      to: recipient.email,
      values: {
        customer_name: recipient.name || recipient.email.split("@")[0],
        policy_summary: policySummary,
        action_url: `${siteUrl}/legal/terms-of-service`,
        site_url: siteUrl,
      },
    })));
  }
  
  return { success: true };
}

/**
 * Logs a cookie consent preference event for PDPA/GDPR compliance.
 */
export async function logCookieConsentPreference(
  preferences: {
    essential: boolean;
    analytics: boolean;
    marketing: boolean;
  },
  sessionId?: string
) {
  try {
    const headersList = await headers();
    
    // Retrieve IP Address from header (x-forwarded-for or fallback)
    const rawIp = headersList.get("x-forwarded-for") || "127.0.0.1";
    // Extract first IP if list (e.g. from cloudflare or proxies)
    const firstIp = rawIp.split(",")[0].trim();
    
    // Anonymize IP address with SHA-256 hash
    const ipAddress = crypto.createHash("sha256").update(firstIp).digest("hex");
    
    // Retrieve User-Agent
    const userAgent = headersList.get("user-agent") || "unknown";
    
    // Retrieve current user if logged in
    let userId: string | null = null;
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id || null;
    } catch (authError) {
      console.warn("[logCookieConsentPreference] Could not retrieve authenticated user:", authError);
    }
    
    // Insert preference audit log
    await db.insert(cookieConsentLogs).values({
      userId,
      sessionId: sessionId || null,
      ipAddress,
      userAgent,
      consentPreferences: preferences,
    });
    
    return { success: true };
  } catch (error) {
    console.error("[logCookieConsentPreference] Error logging cookie consent preference:", error);
    return { success: false, error: "Failed to log consent preference" };
  }
}
