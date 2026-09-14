export function mapErpnextQuotationStatus(status: unknown) {
  const normalized = String(status || "").trim().toLowerCase();

  if (["open", "submitted"].includes(normalized)) return "SENT";
  if (["ordered", "accepted"].includes(normalized)) return "ACCEPTED";
  if (["completed", "delivered", "closed"].includes(normalized)) return "COMPLETED";
  if (["lost", "cancelled", "canceled"].includes(normalized)) return "DEACTIVATED";

  return "SENT";
}
