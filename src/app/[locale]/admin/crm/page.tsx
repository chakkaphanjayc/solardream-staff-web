import { connection } from "next/server";
import { getDbUser } from "@/app/actions/auth";
import { getLeads } from "@/app/actions/lead";
import { getCrmProposals } from "@/app/actions/proposals";
import { getSystemSetting } from "@/app/actions/systemSettings";
import { mapLeadToCrmRow, mapProposalToCrmRow } from "@/lib/crmRows";
import CrmClient from "./CrmClient";

export const instant = false;

export default async function AdminCrmPage() {
  await connection();

  const user = await getDbUser();
  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";

  const [leadResult, proposalResult, expirationDaysRaw] = await Promise.all([
    isAdmin ? getLeads() : Promise.resolve({ leads: [] }),
    getCrmProposals({ isArchived: false }),
    getSystemSetting("quotation_expiration_days"),
  ]);

  const expirationDays = Number.isFinite(Number(expirationDaysRaw)) && Number(expirationDaysRaw) > 0
    ? Math.floor(Number(expirationDaysRaw))
    : 7;

  const rows = [
    ...(leadResult.leads || []).map((lead) => mapLeadToCrmRow(lead, expirationDays)),
    ...(proposalResult.proposals || []).map((proposal) => mapProposalToCrmRow(proposal, expirationDays)),
  ].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());

  return <CrmClient initialRows={rows} />;
}
