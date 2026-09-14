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
    const config = (prop.configurationData as Record<string, unknown>) || {};
    const milestone: ProjectMilestone =
      prop.status === "COMPLETED" || prop.projectStatus === "COMPLETED"
        ? "COMPLETED"
        : prop.status === "APPROVED"
        ? "INSTALLING"
        : "SURVEY_PENDING";

    return {
      id: prop.id,
      customerName: String(config.clientName || prop.user?.name || prop.user?.fullName || "Solar Customer"),
      phone: String(config.phone || prop.user?.phoneNumber || "0812345678"),
      email: prop.user?.email || (config.email as string | null),
      lineUserId: prop.user?.lineUserId,
      systemSizeKwp: prop.systemSizeKwp || 5.5,
      milestone,
      updatedAt: (prop.updatedAt || prop.createdAt).toISOString(),
    };
  });

  return <ProjectsKanbanClient initialProjects={projects} initialSelectedProjectId={selectedProposalId || null} />;
}
