import { connection } from "next/server";
import { getAdminSupportTicketsAction } from "@/app/actions/support";
import AdminSupportClient from "./AdminSupportClient";

export const metadata = {
  title: "Support Operations Desk | Admin | SolarDream",
  description: "Manage customer support requests, inverter tickets, and field job dispatch.",
};

export default async function AdminSupportPage() {
  await connection();

  const result = await getAdminSupportTicketsAction();
  const initialTickets = result.tickets || [];
  const initialMetrics = result.metrics || {
    totalCount: 0,
    newCount: 0,
    urgentCount: 0,
    inProgressCount: 0,
    resolvedCount: 0,
  };

  return <AdminSupportClient initialTickets={initialTickets} initialMetrics={initialMetrics} />;
}
