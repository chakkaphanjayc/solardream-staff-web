import { requireAdmin } from "@/lib/auth-guard";

import { getPortfolioProjects, getPortfolioShowcaseConfig } from "@/lib/portfolioShowcase";
import ShowcaseSettingsClient from "./ShowcaseSettingsClient";

export default async function AdminShowcaseSettingsPage() {
  await requireAdmin();
  const [config, projects] = await Promise.all([
    getPortfolioShowcaseConfig(),
    getPortfolioProjects(),
  ]);

  return <ShowcaseSettingsClient initialConfig={config} projects={projects} />;
}
