import { desc } from "drizzle-orm";
import { db } from "@/db";
import { proposals } from "@/db/schema";
import { requireStaff } from "@/lib/auth-guard";
import { getStaffProposalVisibility } from "@/lib/developerAccess";
import ProjectsKanbanClient, { type ProjectItem } from "./ProjectsKanbanClient";
import type { ProjectMilestone } from "@/lib/customerLifecycle";


type AdminProjectsPageProps = {
  searchParams?: Promise<{ proposal?: string | string[] }>;
};

export default async function AdminProjectsPage({ searchParams }: AdminProjectsPageProps) {
  const actor = await requireStaff();
  const query = searchParams ? await searchParams : {};
  const selectedProposalId = Array.isArray(query.proposal) ? query.proposal[0] : query.proposal;
  const visibility = await getStaffProposalVisibility(actor.id, "projects");
  if (visibility?.mode === "NONE") {
    return <ProjectsKanbanClient initialProjects={[]} initialSelectedProjectId={null} />;
  }
  const proposalRows = await db.query.proposals.findMany({
    where: visibility?.mode === "OWN" && "condition" in visibility ? visibility.condition : undefined,
    orderBy: [desc(proposals.createdAt)],
    with: {
      user: {
        columns: {
          name: true,
          fullName: true,
          email: true,
          phoneNumber: true,
          lineUserId: true,
        },
      },
    },
  });

  const projects: ProjectItem[] = proposalRows.map((prop) => {
    const config = prop.configurationData && typeof prop.configurationData === "object" && !Array.isArray(prop.configurationData)
      ? prop.configurationData as Record<string, unknown>
      : {};
    const configText = (key: string) => {
      const value = config[key];
      return typeof value === "string" && value.trim() ? value.trim() : null;
    };
    const systemSizeKwp = typeof prop.systemSizeKwp === "number" && Number.isFinite(prop.systemSizeKwp) && prop.systemSizeKwp > 0
      ? prop.systemSizeKwp
      : null;
    const milestone: ProjectMilestone =
      prop.status === "COMPLETED" || prop.projectStatus === "COMPLETED"
        ? "COMPLETED"
        : prop.status === "APPROVED"
        ? "INSTALLING"
        : "SURVEY_PENDING";

    return {
      id: prop.id,
      customerName: configText("clientName") || prop.user?.name?.trim() || prop.user?.fullName?.trim() || null,
      phone: configText("phone") || prop.user?.phoneNumber?.trim() || null,
      email: prop.user?.email?.trim() || configText("email"),
      lineUserId: prop.user?.lineUserId,
      systemSizeKwp,
      milestone,
      updatedAt: (prop.updatedAt || prop.createdAt).toISOString(),
    };
  });

  return <ProjectsKanbanClient initialProjects={projects} initialSelectedProjectId={selectedProposalId || null} />;
}
