import { requireStaff } from "@/lib/auth-guard";
import { getWorkflowTemplates } from "@/app/actions/workflows";
import WorkflowBuilderClient from "./WorkflowBuilderClient";


export default async function WorkflowBuilderPage({
  params,
}: {
  params: Promise<{ locale: "en" | "th" }>;
}) {
  await requireStaff();
  const { locale } = await params;

  const templates = await getWorkflowTemplates(locale);
  return <WorkflowBuilderClient initialTemplates={templates} />;
}
