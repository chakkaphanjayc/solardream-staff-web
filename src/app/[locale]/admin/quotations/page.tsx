import { connection } from "next/server";
import { getCrmProposals } from "@/app/actions/proposals";
import { getSystemSetting } from "@/app/actions/systemSettings";
import { getInboundRequests } from "@/app/actions/inboundRequests";
import { getSalesThreads } from "@/app/actions/salesThread";
import { getSalesCustomers } from "@/app/actions/salesCustomers";
import { mapProposalToCrmRow } from "@/lib/crmRows";
import UnifiedSalesPipelineClient from "./UnifiedSalesPipelineClient";

export default async function AdminQuotationsPage() {
  await connection();

  const [
    inboundRequests,
    proposalResult,
    quotationExpirationDaysRaw,
    erpnextBaseUrlRaw,
    salesThreadResult,
    salesCustomers,
  ] = await Promise.all([
    getInboundRequests(),
    getCrmProposals({ isArchived: false }),
    getSystemSetting("quotation_expiration_days"),
    getSystemSetting("erpnext_site_endpoint"),
    getSalesThreads(),
    getSalesCustomers(),
  ]);

  const proposalsList = proposalResult.proposals || [];
  const quotationExpirationDays =
    Number.isFinite(Number(quotationExpirationDaysRaw)) && Number(quotationExpirationDaysRaw) > 0
      ? Math.floor(Number(quotationExpirationDaysRaw))
      : 7;

  // Tab 2 (Quotation CRM) strictly displays generated proposals/quotations
  const crmRows = proposalsList
    .map((proposal) => mapProposalToCrmRow(proposal, quotationExpirationDays))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <UnifiedSalesPipelineClient
      initialInboundRequests={inboundRequests}
      crmRows={crmRows}
      salesThreads={salesThreadResult.success ? salesThreadResult.threads : []}
      salesThreadError={salesThreadResult.success ? null : salesThreadResult.error}
      initialCustomers={salesCustomers}
      erpnextBaseUrl={(erpnextBaseUrlRaw || process.env.ERPNEXT_BASE_URL || "").trim().replace(/\/$/, "")}
    />
  );
}
