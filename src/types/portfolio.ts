export type SystemMetric = {
  label: string;
  value: string;
  subtext?: string;
};

export type GalleryItem = {
  url: string;
  caption: string;
};

export type ProjectCaseStudy = {
  id: string;
  isFeatured?: boolean;
  sortOrder?: number;
  showFinancials?: boolean;
  title: string;
  clientName: string;
  location: string;
  province: string;
  category: "residential" | "commercial" | "villa" | "industrial" | "agricultural" | "other" | string;
  solarSizeKw: number;
  panelCount: number;
  inverterModel: string;
  batteryBackup?: string;
  monthlySavingsThb: number;
  annualCo2SavedTons: number;
  completionYear: string;
  heroImage: string;
  galleryImages: GalleryItem[];
  tags: string[];
  summary: string;
  quote?: {
    text: string;
    author: string;
    role: string;
  };
  beforeAfter: {
    beforeBillThb: number;
    afterBillThb: number;
    paybackYears: number;
  };
};

export type PortfolioProjectContentConfig = {
  version: 1;
  projects: ProjectCaseStudy[];
  /** Project IDs removed from the built-in showcase catalog by an administrator. */
  removedProjectIds?: string[];
};

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isGalleryItem(value: unknown): value is GalleryItem {
  return isObject(value) && typeof value.url === "string" && typeof value.caption === "string";
}

export function isPortfolioProject(value: unknown): value is ProjectCaseStudy {
  if (!isObject(value)) return false;
  if (typeof value.id !== "string" || typeof value.title !== "string" || typeof value.clientName !== "string") return false;
  if (typeof value.location !== "string" || typeof value.heroImage !== "string" || typeof value.summary !== "string") return false;
  if (typeof value.province !== "string" || typeof value.category !== "string") return false;
  if (typeof value.solarSizeKw !== "number" || typeof value.panelCount !== "number") return false;
  if (typeof value.inverterModel !== "string" || typeof value.monthlySavingsThb !== "number" || typeof value.annualCo2SavedTons !== "number") return false;
  if (typeof value.completionYear !== "string" || !Array.isArray(value.galleryImages) || !value.galleryImages.every(isGalleryItem)) return false;
  if (!Array.isArray(value.tags) || !value.tags.every((tag) => typeof tag === "string")) return false;
  if (!isObject(value.beforeAfter)) return false;
  if (typeof value.beforeAfter.beforeBillThb !== "number" || typeof value.beforeAfter.afterBillThb !== "number" || typeof value.beforeAfter.paybackYears !== "number") return false;
  if (value.quote !== undefined && value.quote !== null) {
    if (!isObject(value.quote) || typeof value.quote.text !== "string" || typeof value.quote.author !== "string" || typeof value.quote.role !== "string") return false;
  }
  return true;
}

/** The fields needed to render a portfolio list before a detail view is opened. */
export type PortfolioProjectListItem = Pick<
  ProjectCaseStudy,
  "id" | "title" | "location" | "province" | "category" | "solarSizeKw" | "monthlySavingsThb" | "completionYear" | "heroImage" | "showFinancials"
> & {
  galleryImageCount: number;
};

export function toPortfolioProjectListItem(project: ProjectCaseStudy): PortfolioProjectListItem {
  return {
    id: project.id,
    title: project.title,
    location: project.location,
    province: project.province,
    category: project.category,
    solarSizeKw: project.solarSizeKw,
    monthlySavingsThb: project.monthlySavingsThb,
    completionYear: project.completionYear,
    heroImage: project.heroImage,
    showFinancials: project.showFinancials,
    galleryImageCount: project.galleryImages.length,
  };
}

export type ProjectFilter = "all" | "3kw" | "5kw" | "8kw" | "10kw" | string;

export const MAX_PORTFOLIO_SHOWCASE_PROJECTS = 10;

export type PortfolioShowcaseItemConfig = {
  projectId: string;
  isFeatured: boolean;
  sortOrder: number;
};

export type PortfolioShowcaseConfig = {
  version: 1;
  isEnabled: boolean;
  items: PortfolioShowcaseItemConfig[];
};

export function createDefaultProjectDraft(id = ""): ProjectCaseStudy {
  const currentYear = new Date().getFullYear().toString();
  return {
    id: id.trim() || `proj-${Date.now().toString(36)}`,
    showFinancials: true,
    title: "",
    clientName: "",
    location: "",
    province: "bangkok",
    category: "residential",
    solarSizeKw: 5.0,
    panelCount: 10,
    inverterModel: "Huawei SUN2000-5KTL-L1",
    batteryBackup: undefined,
    monthlySavingsThb: 3000,
    annualCo2SavedTons: 3.5,
    completionYear: currentYear,
    heroImage: "",
    galleryImages: [
      {
        url: "",
        caption: "Installation rooftop view",
      },
    ],
    tags: ["5.0 kW", "Residential", "Solar Rooftop"],
    summary: "",
    quote: undefined,
    beforeAfter: {
      beforeBillThb: 4500,
      afterBillThb: 1500,
      paybackYears: 4.5,
    },
  };
}
