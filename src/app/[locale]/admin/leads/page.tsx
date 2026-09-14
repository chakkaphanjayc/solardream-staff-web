import { connection } from "next/server";
import { getLeads } from "@/app/actions/lead";
import LeadsClient from "./LeadsClient";


export default async function AdminLeadsPage() {
  await connection();

  const result = await getLeads();
  const leads = result.leads || [];

  return <LeadsClient initialLeads={leads} />;
}
