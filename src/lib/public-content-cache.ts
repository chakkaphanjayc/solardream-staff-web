import { db } from "@/db";
import { navigationItems, systemSettingsKeyValue } from "@/db/schema";
import { asc, eq, inArray, isNull } from "drizzle-orm";
import {
  ANALYTICS_CONFIG_SETTING_KEYS,
  parseAnalyticsBooleanSetting,
  type AnalyticsConfig,
} from "@/lib/analyticsConfig";
import {
  DEFAULT_LOCALIZATION_CONFIG,
  normalizeLocalizationConfig,
  type LocalizationConfig,
} from "@/lib/localization/content";
import { isLocale, type Locale } from "@/i18n/locales";
import {
  DEFAULT_KB_CONFIG,
  DEFAULT_SUPPORT_CONFIG,
  KnowledgeBaseConfigSchema,
  SupportConfigSchema,
  type KnowledgeBaseConfig,
  type SupportConfig,
} from "@/schemas/support";

const SUPPORT_CONFIG_KEY = "support_config_settings";
const SUPPORT_KB_KEY = "support_kb_settings";

export const SUPPORT_CONFIG_CACHE_TAG = "support-config";
export const SUPPORT_KB_CACHE_TAG = "support-kb-config";
export const ANALYTICS_CONFIG_CACHE_TAG = "analytics-config";
export const LOCALIZATION_CONFIG_CACHE_TAG = "localization-config";
export const NAVIGATION_CACHE_TAG = "navigation-items";

const NAVIGATION_TRANSLATIONS_KEY = "navigation_translations";
const NAVIGATION_TEMPLATES_KEY = "navigation_locale_templates";

type NavigationTranslations = Partial<Record<Locale, Record<string, string>>>;
type NavigationTemplateItem = {
  id: string;
  label: string;
  url: string;
  parentId: string | null;
  order: number;
};
type NavigationTemplates = Partial<Record<Locale, NavigationTemplateItem[]>>;

async function readSystemSettings(keys: readonly string[]) {
  try {
    const rows = await db
      .select({
        key: systemSettingsKeyValue.key,
        value: systemSettingsKeyValue.value,
      })
      .from(systemSettingsKeyValue)
      .where(inArray(systemSettingsKeyValue.key, [...keys]));

    return new Map(
      rows.map((row) => [row.key, typeof row.value === "string" ? row.value : null]),
    );
  } catch (error) {
    console.error("[public-content-cache] Failed to read system settings:", error);
    return new Map<string, string | null>();
  }
}

function parseNavigationTranslations(value: string | null): NavigationTranslations {
  if (!value) return {};

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).flatMap(([locale, labels]) => {
        if (!isLocale(locale) || labels === null || typeof labels !== "object") return [];
        const validLabels = Object.fromEntries(
          Object.entries(labels as Record<string, unknown>).flatMap(([id, label]) =>
            typeof label === "string" ? [[id, label]] : [],
          ),
        );
        return [[locale, validLabels]];
      }),
    ) as NavigationTranslations;
  } catch {
    return {};
  }
}

function parseNavigationTemplates(value: string | null): NavigationTemplates {
  if (!value) return {};

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).flatMap(([locale, items]) => {
        if (!isLocale(locale) || !Array.isArray(items)) return [];
        const validItems = items.flatMap((item): NavigationTemplateItem[] => {
          if (item === null || typeof item !== "object") return [];
          const row = item as Record<string, unknown>;
          if (
            typeof row.id !== "string" ||
            typeof row.label !== "string" ||
            typeof row.url !== "string" ||
            (row.parentId !== null && typeof row.parentId !== "string") ||
            typeof row.order !== "number"
          ) {
            return [];
          }
          return [{
            id: row.id,
            label: row.label,
            url: row.url,
            parentId: row.parentId,
            order: row.order,
          }];
        });
        return [[locale, validItems]];
      }),
    ) as NavigationTemplates;
  } catch {
    return {};
  }
}

export async function getCachedAnalyticsConfig(): Promise<AnalyticsConfig> {
  const settings = await readSystemSettings([
    ...ANALYTICS_CONFIG_SETTING_KEYS,
  ]);
  const read = (key: string, fallback = "") => settings.get(key)?.trim() || fallback;

  return {
    analytics_enabled: parseAnalyticsBooleanSetting(read("analytics_enabled"), true),
    track_acquisition_engagement: parseAnalyticsBooleanSetting(read("track_acquisition_engagement"), true),
    track_user_registration: parseAnalyticsBooleanSetting(read("track_user_registration"), true),
    track_wizard_engagement: parseAnalyticsBooleanSetting(read("track_wizard_engagement"), true),
    track_catalog_commerce: parseAnalyticsBooleanSetting(read("track_catalog_commerce"), true),
    track_proposal_lifecycle: parseAnalyticsBooleanSetting(read("track_proposal_lifecycle"), true),
    track_service_commerce: parseAnalyticsBooleanSetting(read("track_service_commerce"), true),
    track_support_engagement: parseAnalyticsBooleanSetting(read("track_support_engagement"), true),
    umamiUrl: read(
      "umami_url",
      process.env.NEXT_PUBLIC_UMAMI_URL || process.env.UMAMI_URL || "https://umami.solar-dream.org",
    ).replace(/\/$/, ""),
    umamiWebsiteId: read(
      "umami_website_id",
      process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID || process.env.UMAMI_WEBSITE_ID,
    ),
  };
}

export async function getCachedLocalizationConfig(): Promise<LocalizationConfig> {
  const settings = await readSystemSettings(["localization_config"]);
  const value = settings.get("localization_config");
  if (!value) return DEFAULT_LOCALIZATION_CONFIG;

  try {
    return normalizeLocalizationConfig(JSON.parse(value));
  } catch {
    return DEFAULT_LOCALIZATION_CONFIG;
  }
}

export async function getCachedNavigationItems(locale: Locale) {
  const [items, settings] = await Promise.all([
    db.query.navigationItems.findMany({
      where: isNull(navigationItems.parentId),
      with: { children: { orderBy: [asc(navigationItems.order)] } },
      orderBy: [asc(navigationItems.order)],
    }),
    readSystemSettings([NAVIGATION_TRANSLATIONS_KEY, NAVIGATION_TEMPLATES_KEY]),
  ]).catch((error: unknown) => {
    console.error("[public-content-cache] Failed to read navigation items:", error);
    return [[], new Map<string, string | null>()] as const;
  });

  const translations = parseNavigationTranslations(settings.get(NAVIGATION_TRANSLATIONS_KEY) ?? null);
  const templates = parseNavigationTemplates(settings.get(NAVIGATION_TEMPLATES_KEY) ?? null);
  const localizedTemplate = templates[locale];

  if (localizedTemplate?.length) {
    return localizedTemplate
      .filter((item) => item.parentId === null)
      .sort((a, b) => a.order - b.order)
      .map((item) => ({
        ...item,
        children: localizedTemplate
          .filter((child) => child.parentId === item.id)
          .sort((a, b) => a.order - b.order),
      }));
  }

  if (items.length > 0) {
    const labels = locale !== "th" ? translations[locale] : undefined;
    return items.map((item) => ({
      ...item,
      label: labels?.[item.id] || item.label,
      children: item.children.map((child) => ({
        ...child,
        label: labels?.[child.id] || child.label,
      })),
    }));
  }

  const labels = locale === "th"
    ? {
        products: "สินค้าและบริการ",
        build: "เครื่องคำนวณโซลาร์เซลล์",
        protools: "เครื่องมือ",
        wizard: "ระบบแนะนำอัจฉริยะ",
        visualizer: "เครื่องมือจำลองการติดตั้ง",
        community: "ชุมชน",
        news: "ข่าวสารและบทความ",
      }
    : {
        products: "Products & Services",
        build: "Solar Panel Calculator",
        protools: "Tools",
        wizard: "Smart Recommendation System",
        visualizer: "Installation Visualizer",
        community: "Community",
        news: "News & Articles",
      };

  return [
    {
      id: "default-products",
      label: labels.products,
      url: "#",
      parentId: null,
      order: 0,
      children: [
        { id: "default-build", label: labels.build, url: "/build", parentId: "default-products", order: 1, children: [] },
      ],
    },
    {
      id: "default-pro-tools",
      label: labels.protools,
      url: "#",
      parentId: null,
      order: 1,
      children: [
        { id: "default-wizard", label: labels.wizard, url: "/wizard", parentId: "default-pro-tools", order: 0, children: [] },
        { id: "default-visualizer", label: labels.visualizer, url: "/visualizer", parentId: "default-pro-tools", order: 1, children: [] },
      ],
    },
    {
      id: "default-community",
      label: labels.community,
      url: "#",
      parentId: null,
      order: 2,
      children: [
        { id: "default-news", label: labels.news, url: "/news", parentId: "default-community", order: 0, children: [] },
      ],
    },
  ];
}

export async function getCachedSupportConfig(): Promise<SupportConfig> {
  try {
    const row = await db.query.systemSettingsKeyValue.findFirst({
      where: eq(systemSettingsKeyValue.key, SUPPORT_CONFIG_KEY),
    });

    if (!row?.value) return DEFAULT_SUPPORT_CONFIG;

    const validated = SupportConfigSchema.safeParse(JSON.parse(row.value));
    return validated.success ? validated.data : DEFAULT_SUPPORT_CONFIG;
  } catch (error) {
    console.error("[getCachedSupportConfig]", error);
    return DEFAULT_SUPPORT_CONFIG;
  }
}

export async function getCachedKnowledgeBaseConfig(): Promise<KnowledgeBaseConfig> {
  try {
    const row = await db.query.systemSettingsKeyValue.findFirst({
      where: eq(systemSettingsKeyValue.key, SUPPORT_KB_KEY),
    });

    if (!row?.value) return DEFAULT_KB_CONFIG;

    const validated = KnowledgeBaseConfigSchema.safeParse(JSON.parse(row.value));
    return validated.success ? validated.data : DEFAULT_KB_CONFIG;
  } catch (error) {
    console.error("[getCachedKnowledgeBaseConfig]", error);
    return DEFAULT_KB_CONFIG;
  }
}
