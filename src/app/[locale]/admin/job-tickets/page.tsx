import React from "react";
import { requireStaff } from "@/lib/auth-guard";
import { getJobTickets, getInstallers } from "@/app/actions/tickets";
import JobTicketsClient from "./JobTicketsClient";


export default async function JobTicketsPage() {
  await requireStaff();

  const ticketsResult = await getJobTickets();
  const installersResult = await getInstallers();

  const tickets = ticketsResult.success && ticketsResult.tickets ? ticketsResult.tickets : [];
  const installers = installersResult.success && installersResult.installers ? installersResult.installers : [];

  return <JobTicketsClient initialTickets={tickets as any} installers={installers as any} />;
}
