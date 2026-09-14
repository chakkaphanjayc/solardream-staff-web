import React from "react";
import { getUser, ensureUserExists } from "@/app/actions/auth";
import { getInstallerTickets } from "@/app/actions/tickets";
import { getInstallerJobList } from "@/app/actions/workflows";
import { redirect } from "next/navigation";
import InstallerPortalClient from "./InstallerPortalClient";


export default async function InstallerPage() {
  const supabaseUser = await getUser();

  if (!supabaseUser) {
    redirect("/login");
  }

  await ensureUserExists(supabaseUser);

  const [result, workflowJobs] = await Promise.all([
    getInstallerTickets(supabaseUser.id),
    getInstallerJobList(),
  ]);
  const tickets = result.success && result.tickets ? result.tickets : [];

  return (
    <InstallerPortalClient
      initialTickets={tickets}
      workflowJobs={workflowJobs}
    />
  );
}
