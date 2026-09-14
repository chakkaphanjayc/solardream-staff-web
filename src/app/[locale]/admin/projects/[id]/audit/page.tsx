import { notFound } from "next/navigation";

import { getWorkflowAudit } from "@/app/actions/workflows";
import { requireStaff } from "@/lib/auth-guard";
import WorkflowAuditClient from "./WorkflowAuditClient";


export default async function WorkflowAuditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireStaff();
  const { id } = await params;
  const ticket = await getWorkflowAudit(id);

  if (!ticket) notFound();
  return <WorkflowAuditClient ticket={ticket} />;
}
