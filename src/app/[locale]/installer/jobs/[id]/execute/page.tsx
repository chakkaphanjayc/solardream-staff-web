import { notFound } from "next/navigation";

import { getInstallerWorkflow } from "@/app/actions/workflows";
import WorkflowExecutionClient from "./WorkflowExecutionClient";


export default async function WorkflowExecutionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let ticket;

  try {
    ticket = await getInstallerWorkflow(id);
  } catch {
    notFound();
  }

  const workflow = ticket.workflows[0];
  if (!workflow) notFound();

  return <WorkflowExecutionClient ticket={ticket} workflow={workflow} />;
}
