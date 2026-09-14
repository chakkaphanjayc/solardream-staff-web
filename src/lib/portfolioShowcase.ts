import "server-only";

import { unstable_cache } from "next/cache";

import { getSystemSetting } from "@/app/actions/systemSettings";
import { PORTFOLIO_PROJECTS } from "@/data/portfolioData";
import {
  createDefaultProjectDraft,
  MAX_PORTFOLIO_SHOWCASE_PROJECTS,
  type GalleryItem,
  type PortfolioProjectContentConfig,
  type PortfolioShowcaseConfig,
  type PortfolioShowcaseItemConfig,
  type ProjectCaseStudy,
} from "@/types/portfolio";

export { createDefaultProjectDraft };

export const PORTFOLIO_SHOWCASE_CONFIG_KEY = "portfolio_showcase_config";
export const PORTFOLIO_SHOWCASE_CACHE_TAG = "portfolio-showcase";
export const PORTFOLIO_PROJECT_CONTENT_CONFIG_KEY = "portfolio_project_content_v1";
export const PORTFOLIO_PROJECT_CONTENT_CACHE_TAG = "portfolio-project-content";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeSortOrder(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(10_000, Math.max(0, Math.floor(value)));
}

function normalizeOptionalString(value: unknown, fallback = "", maxLength = 2_000): string {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "string") return String(value).slice(0, maxLength);
  return value.trim().slice(0, maxLength);
}

function normalizeRequiredString(value: unknown, fallback: string, maxLength = 2_000): string {
  if (typeof value !== "string" || !value.trim()) return fallback;
  return value.trim().slice(0, maxLength);
}

function normalizeNumber(value: unknown, fallback: number, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  if (value === undefined || value === null) return fallback;
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(maximum, Math.max(minimum, num));
}

function normalizeProjectIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return Array.from(new Set(
    value
      .filter((projectId): projectId is string => typeof projectId === "string")
      .map((projectId) => projectId.trim())
      .filter(Boolean),
  )).slice(0, 500);
}

function cloneGalleryImages(images: readonly GalleryItem[]): GalleryItem[] {
  return images.map((image) => ({ url: image.url, caption: image.caption }));
}

function cloneProject(project: ProjectCaseStudy): ProjectCaseStudy {
  return {
    ...project,
    galleryImages: cloneGalleryImages(project.galleryImages),
    tags: [...project.tags],
    quote: project.quote ? { ...project.quote } : undefined,
    beforeAfter: { ...project.beforeAfter },
  };
}

function normalizeGalleryImages(value: unknown, fallback: readonly GalleryItem[]): GalleryItem[] {
  if (!Array.isArray(value)) return cloneGalleryImages(fallback);

  return value
    .filter(isRecord)
    .map((image) => ({
      url: typeof image.url === "string" ? image.url.trim().slice(0, 2_000) : "",
      caption: typeof image.caption === "string" ? image.caption.trim().slice(0, 240) : "",
    }))
    .filter((image) => image.url)
    .slice(0, 48);
}

function normalizeProject(value: unknown, fallback: ProjectCaseStudy): ProjectCaseStudy {
  if (!isRecord(value)) return cloneProject(fallback);

  const rawBeforeAfter = isRecord(value.beforeAfter) ? value.beforeAfter : {};
  const rawTags = Array.isArray(value.tags)
    ? value.tags
        .filter((tag): tag is string => typeof tag === "string" && Boolean(tag.trim()))
        .map((tag) => tag.trim().slice(0, 80))
        .slice(0, 24)
    : fallback.tags;

  const rawQuote = !isRecord(value.quote)
    ? undefined
    : value.quote.text && typeof value.quote.text === "string" && value.quote.text.trim()
      ? {
          text: value.quote.text.trim().slice(0, 2_000),
          author: typeof value.quote.author === "string" ? value.quote.author.trim().slice(0, 160) : "",
          role: typeof value.quote.role === "string" ? value.quote.role.trim().slice(0, 160) : "",
        }
      : undefined;

  const rawBattery = typeof value.batteryBackup === "string" ? value.batteryBackup.trim().slice(0, 180) : undefined;

  return {
    ...cloneProject(fallback),
    id: normalizeRequiredString(value.id, fallback.id, 80),
    title: normalizeRequiredString(value.title, fallback.title || "Installation project", 180),
    clientName: normalizeOptionalString(value.clientName, fallback.clientName, 160),
    location: normalizeOptionalString(value.location, fallback.location, 160),
    province: value.province === "chiangmai" || value.province === "bangkok" || value.province === "phuket" || value.province === "other"
      ? value.province
      : fallback.province,
    category: value.category === "residential" || value.category === "commercial" || value.category === "villa"
      ? value.category
      : fallback.category,
    solarSizeKw: normalizeNumber(value.solarSizeKw, fallback.solarSizeKw, 0, 1_000),
    panelCount: Math.round(normalizeNumber(value.panelCount, fallback.panelCount, 0, 10_000)),
    inverterModel: normalizeOptionalString(value.inverterModel, fallback.inverterModel, 180),
    batteryBackup: rawBattery || undefined,
    monthlySavingsThb: Math.round(normalizeNumber(value.monthlySavingsThb, fallback.monthlySavingsThb, 0, 10_000_000)),
    annualCo2SavedTons: normalizeNumber(value.annualCo2SavedTons, fallback.annualCo2SavedTons, 0, 10_000),
    completionYear: normalizeOptionalString(value.completionYear, fallback.completionYear, 12),
    heroImage: normalizeOptionalString(value.heroImage, fallback.heroImage, 2_000),
    galleryImages: normalizeGalleryImages(value.galleryImages, fallback.galleryImages),
    tags: rawTags,
    summary: normalizeOptionalString(value.summary, fallback.summary, 4_000),
    quote: rawQuote,
    beforeAfter: {
      beforeBillThb: Math.round(normalizeNumber(rawBeforeAfter.beforeBillThb, fallback.beforeAfter?.beforeBillThb ?? 0, 0, 10_000_000)),
      afterBillThb: Math.round(normalizeNumber(rawBeforeAfter.afterBillThb, fallback.beforeAfter?.afterBillThb ?? 0, 0, 10_000_000)),
      paybackYears: normalizeNumber(rawBeforeAfter.paybackYears, fallback.beforeAfter?.paybackYears ?? 0, 0, 100),
    },
  };
}

export function getDefaultPortfolioShowcaseConfig(): PortfolioShowcaseConfig {
  return {
    version: 1,
    isEnabled: true,
    items: PORTFOLIO_PROJECTS.map((project, index) => ({
      projectId: project.id,
      isFeatured: project.isFeatured === true,
      sortOrder: project.sortOrder ?? index,
    })),
  };
}

export function getDefaultPortfolioProjectContentConfig(): PortfolioProjectContentConfig {
  return {
    version: 1,
    projects: PORTFOLIO_PROJECTS.map(cloneProject),
    removedProjectIds: [],
  };
}

export function normalizePortfolioProjectContentConfig(value: unknown): PortfolioProjectContentConfig {
  const defaults = getDefaultPortfolioProjectContentConfig();
  if (!isRecord(value) || !Array.isArray(value.projects)) return defaults;

  const removedProjectIds = normalizeProjectIds(value.removedProjectIds);
  const removedProjectIdSet = new Set(removedProjectIds);

  const rawById = new Map<string, unknown>();
  for (const rawProject of value.projects) {
    if (!isRecord(rawProject) || typeof rawProject.id !== "string" || rawById.has(rawProject.id)) continue;
    rawById.set(rawProject.id, rawProject);
  }

  const defaultProjectsMap = new Map(defaults.projects.map((p) => [p.id, p]));
  const processedProjectIds = new Set<string>();
  const normalizedProjects: ProjectCaseStudy[] = [];

  // 1. Maintain ordering of incoming projects array
  for (const rawProject of value.projects) {
    if (!isRecord(rawProject) || typeof rawProject.id !== "string") continue;
    const projectId = rawProject.id.trim();
    if (!projectId || processedProjectIds.has(projectId) || removedProjectIdSet.has(projectId)) continue;

    processedProjectIds.add(projectId);
    const defaultProject = defaultProjectsMap.get(projectId);
    const fallbackProject = defaultProject ? cloneProject(defaultProject) : createDefaultProjectDraft(projectId);
    normalizedProjects.push(normalizeProject(rawProject, fallbackProject));
  }

  // 2. Include any default projects that were not explicitly in incoming list and not removed
  for (const defaultProject of defaults.projects) {
    if (processedProjectIds.has(defaultProject.id) || removedProjectIdSet.has(defaultProject.id)) continue;
    processedProjectIds.add(defaultProject.id);
    normalizedProjects.push(normalizeProject(rawById.get(defaultProject.id), defaultProject));
  }

  return {
    version: 1,
    projects: normalizedProjects,
    removedProjectIds,
  };
}

function parsePortfolioProjectContentConfig(rawValue: string | null): PortfolioProjectContentConfig {
  if (!rawValue?.trim()) return getDefaultPortfolioProjectContentConfig();

  try {
    return normalizePortfolioProjectContentConfig(JSON.parse(rawValue) as unknown);
  } catch {
    return getDefaultPortfolioProjectContentConfig();
  }
}

export async function getPortfolioProjectContentConfig(): Promise<PortfolioProjectContentConfig> {
  return parsePortfolioProjectContentConfig(await getSystemSetting(PORTFOLIO_PROJECT_CONTENT_CONFIG_KEY));
}

export const getCachedPortfolioProjectContentConfig = unstable_cache(
  getPortfolioProjectContentConfig,
  ["portfolio-project-content-v1"],
  { revalidate: 300, tags: [PORTFOLIO_PROJECT_CONTENT_CACHE_TAG] },
);

export async function getPortfolioProjects(): Promise<ProjectCaseStudy[]> {
  const config = await getCachedPortfolioProjectContentConfig();
  return config.projects.map(cloneProject);
}

export async function getPortfolioProjectById(projectId: string): Promise<ProjectCaseStudy | null> {
  const projects = await getPortfolioProjects();
  const project = projects.find((candidate) => candidate.id === projectId);
  return project ?? null;
}

export function normalizePortfolioShowcaseConfig(value: unknown): PortfolioShowcaseConfig {
  const defaults = getDefaultPortfolioShowcaseConfig();
  if (!isRecord(value)) return defaults;

  const rawItems = Array.isArray(value.items) ? value.items : [];
  const rawById = new Map<string, JsonRecord>();

  for (const rawItem of rawItems) {
    if (!isRecord(rawItem) || typeof rawItem.projectId !== "string" || rawById.has(rawItem.projectId)) continue;
    rawById.set(rawItem.projectId, rawItem);
  }

  const items: PortfolioShowcaseItemConfig[] = [];
  const processedProjectIds = new Set<string>();

  // Process incoming items first to preserve custom items & manual ordering
  for (const rawItem of rawItems) {
    if (!isRecord(rawItem) || typeof rawItem.projectId !== "string") continue;
    const projectId = rawItem.projectId.trim();
    if (!projectId || processedProjectIds.has(projectId)) continue;

    processedProjectIds.add(projectId);
    const defaultItem = defaults.items.find((item) => item.projectId === projectId);
    items.push({
      projectId,
      isFeatured: typeof rawItem.isFeatured === "boolean" ? rawItem.isFeatured : (defaultItem?.isFeatured ?? false),
      sortOrder: normalizeSortOrder(rawItem.sortOrder, defaultItem?.sortOrder ?? items.length),
    });
  }

  // Add remaining default items if not present
  for (const defaultItem of defaults.items) {
    if (processedProjectIds.has(defaultItem.projectId)) continue;
    processedProjectIds.add(defaultItem.projectId);
    items.push({
      projectId: defaultItem.projectId,
      isFeatured: defaultItem.isFeatured,
      sortOrder: defaultItem.sortOrder,
    });
  }

  return {
    version: 1,
    isEnabled: typeof value.isEnabled === "boolean" ? value.isEnabled : defaults.isEnabled,
    items,
  };
}

function parsePortfolioShowcaseConfig(rawValue: string | null): PortfolioShowcaseConfig {
  if (!rawValue?.trim()) return getDefaultPortfolioShowcaseConfig();

  try {
    return normalizePortfolioShowcaseConfig(JSON.parse(rawValue) as unknown);
  } catch {
    return getDefaultPortfolioShowcaseConfig();
  }
}

export async function getPortfolioShowcaseConfig(): Promise<PortfolioShowcaseConfig> {
  return parsePortfolioShowcaseConfig(await getSystemSetting(PORTFOLIO_SHOWCASE_CONFIG_KEY));
}

export const getCachedPortfolioShowcaseConfig = unstable_cache(
  getPortfolioShowcaseConfig,
  ["portfolio-showcase-config-v1"],
  { revalidate: 300, tags: [PORTFOLIO_SHOWCASE_CACHE_TAG] },
);

function normalizeLimit(limit: number) {
  if (!Number.isFinite(limit)) return MAX_PORTFOLIO_SHOWCASE_PROJECTS;
  return Math.min(MAX_PORTFOLIO_SHOWCASE_PROJECTS, Math.max(0, Math.floor(limit)));
}

export function applyPortfolioShowcaseConfig(
  config: PortfolioShowcaseConfig,
  limit = MAX_PORTFOLIO_SHOWCASE_PROJECTS,
  projects: readonly ProjectCaseStudy[] = PORTFOLIO_PROJECTS,
): ProjectCaseStudy[] {
  if (!config.isEnabled) return [];

  const itemById = new Map(config.items.map((item) => [item.projectId, item]));

  return projects
    .map((project) => {
      const item = itemById.get(project.id);
      return item
        ? { ...project, isFeatured: item.isFeatured, sortOrder: item.sortOrder }
        : project;
    })
    .filter((project) => project.isFeatured === true)
    .sort((left, right) => {
      const sortOrderDifference = (left.sortOrder ?? Number.MAX_SAFE_INTEGER) - (right.sortOrder ?? Number.MAX_SAFE_INTEGER);
      if (sortOrderDifference !== 0) return sortOrderDifference;

      return right.completionYear.localeCompare(left.completionYear);
    })
    .slice(0, normalizeLimit(limit));
}

export async function getConfiguredFeaturedPortfolioProjects(limit = MAX_PORTFOLIO_SHOWCASE_PROJECTS) {
  const [config, projectContent] = await Promise.all([
    getCachedPortfolioShowcaseConfig(),
    getCachedPortfolioProjectContentConfig(),
  ]);
  return applyPortfolioShowcaseConfig(config, limit, projectContent.projects);
}
