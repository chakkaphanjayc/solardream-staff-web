import type { HeaderNavigationItem } from "@/lib/header-navigation";
import type { WebsiteSettings } from "@/lib/websiteSettingsTypes";
import type { PortfolioProjectListItem } from "@/types/portfolio";

/** Server-owned data passed into the editorial homepage presentation tree. */
export type SolarEditorialHomeProps = Readonly<{
  locale: string;
  websiteSettings: WebsiteSettings;
  initialShowcaseProjects: readonly PortfolioProjectListItem[];
  navigationItems: readonly HeaderNavigationItem[];
  forumUrl: string;
}>;
