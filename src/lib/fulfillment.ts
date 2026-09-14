import { INSTALLATION_FIELD_STAGES } from "@/types/techPortal";

export const FULFILLMENT_INSTALLATION = "INSTALLATION";
export const FULFILLMENT_PURCHASE_ONLY = "SUPPLY_ONLY";

export type FulfillmentType = typeof FULFILLMENT_INSTALLATION | typeof FULFILLMENT_PURCHASE_ONLY;

/** Customer-facing installation milestones mirror the canonical field order. */
export const FIELD_MILESTONES = INSTALLATION_FIELD_STAGES.map((stage) => stage.titleTh);

export function normalizeFulfillmentType(value: unknown): FulfillmentType {
  return value === FULFILLMENT_INSTALLATION ? FULFILLMENT_INSTALLATION : FULFILLMENT_PURCHASE_ONLY;
}

export function getCarrierTrackingUrl(carrier: string | null | undefined, trackingNumber: string | null | undefined) {
  if (!carrier || !trackingNumber) return "";
  const cleanTracking = encodeURIComponent(trackingNumber.trim());
  const key = carrier.toLowerCase().trim();

  if (key.includes("dhl")) return `https://www.dhl.com/global-en/home/tracking/tracking-express.html?submit=1&tracking-id=${cleanTracking}`;
  if (key.includes("fedex")) return `https://www.fedex.com/fedextrack/?trknbr=${cleanTracking}`;
  if (key.includes("ups")) return `https://www.ups.com/track?tracknum=${cleanTracking}`;
  if (key.includes("thai") || key.includes("ems")) return `https://track.thailandpost.co.th/?trackNumber=${cleanTracking}`;

  return "";
}

export function canRouteProposal(status: string) {
  return status === "SIGNED_WAITING_VERIFY" || status === "SIGNED";
}
