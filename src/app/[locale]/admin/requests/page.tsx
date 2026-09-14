import { getInboundRequests } from "@/app/actions/inboundRequests";
import { getSystemSetting } from "@/app/actions/systemSettings";
import InboundRequestsClient from "./InboundRequestsClient";


export default async function AdminRequestsPage() {
  const [initialRequests, erpnextBaseUrlRaw] = await Promise.all([
    getInboundRequests(),
    getSystemSetting("erpnext_site_endpoint"),
  ]);
  const erpnextBaseUrl = (erpnextBaseUrlRaw || process.env.ERPNEXT_BASE_URL || "")
    .trim()
    .replace(/\/$/, "");

  return (
    <InboundRequestsClient
      initialRequests={initialRequests}
      erpnextBaseUrl={erpnextBaseUrl}
    />
  );
}
