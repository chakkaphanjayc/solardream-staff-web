import React from "react";
import { requireStaff } from "@/lib/auth-guard";
import { getOperationsTickets } from "@/app/actions/tickets";
import AdminTicketsClient from "./AdminTicketsClient";


export default async function AdminTicketsPage() {
  await requireStaff();

  const result = await getOperationsTickets();
  const tickets = result.success && result.tickets ? result.tickets : [];

  return <AdminTicketsClient initialTickets={tickets as any} />;
}
