import { deriveQuotationTrackingReference } from "@/lib/trackingReference";

export type CrmTab =
  | "ALL"
  | "LEADS"
  | "PROPOSALS"
  | "WON_COMPLETED"
  | "ARCHIVE";
export type CrmRowType = "LEAD" | "PROPOSAL";
export type CrmConfigurationData = Record<string, unknown> & {
  items?: Array<Record<string, unknown>>;
};
type CrmRawRecord = Record<string, unknown>;

export interface CrmRow {
  id: string;
  type: CrmRowType;
  displayType: "NEW LEAD" | "PROPOSAL";
  customerName: string;
  email: string;
  phone: string | null;
  location: string | null;
  status: string;
  isArchived: boolean;
  value: number | null;
  valueLabel: string;
  systemSizeKwp: number | null;
  panelCount: number | null;
  createdAt: string;
  expiresAt: string;
  updatedAt: string;
  source: "FORM_INGESTION" | "SOLAR_WIZARD_BOM";
  configurationData: CrmConfigurationData;
  pdfUrl?: string | null;
  dispatchStatus?: string | null;
  magicTokenSlug?: string | null;
  signedAt?: string | null;
  signedDocumentDriveUrl?: string | null;
  revisedPdfUrl?: string | null;
  wizardLeadId?: string | null;
  surveyDate?: string | null;
  surveyNotes?: string | null;
  surveyPhotos?: unknown | null;
  erpnextCustomerId?: string | null;
  erpnextQuotationId?: string | null;
  fulfillmentType?: string | null;
  shippingTrackingNumber?: string | null;
  trackRequestNumber: string;
  trackingReferences: string[];
  shippingCarrier?: string | null;
  currentMilestoneStep?: number | null;
  fieldChecklistData?: Record<string, unknown> | null;
  isInstallationRequired?: boolean;
  installationLatitude?: string | null;
  installationLongitude?: string | null;
  installationMapAddress?: string | null;
  installationNotes?: string | null;
  paymentStatus?: "Unpaid" | "Deposit Paid" | "Paid 100%" | "N/A" | null;
  requestType: string;
  serviceItems: Array<Record<string, unknown>>;
  preferredDate: string | null;
  raw: CrmRawRecord;
}

function isoDate(value: unknown) {
  if (!value) return new Date(0).toISOString();
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime())
    ? new Date(0).toISOString()
    : date.toISOString();
}

function toNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatThb(value: number | null) {
  if (value === null) return "No value";
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function addDaysIso(dateLike: unknown, days: number) {
  const base =
    dateLike instanceof Date
      ? dateLike
      : new Date(String(dateLike || new Date(0).toISOString()));
  if (Number.isNaN(base.getTime())) return new Date(0).toISOString();
  const expires = new Date(base);
  expires.setDate(expires.getDate() + days);
  return expires.toISOString();
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function shortQuotationTrackNumber(id: string) {
  return deriveQuotationTrackingReference(id);
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [
    ...new Set(
      values.map((value) => value?.trim()).filter(Boolean) as string[],
    ),
  ];
}

export function mapLeadToCrmRow(
  lead: CrmRawRecord,
  quotationExpirationDays = 7,
): CrmRow {
  const leadId = String(lead.id || "");
  const snapshot = (
    lead.configurationSnapshot && typeof lead.configurationSnapshot === "object"
      ? lead.configurationSnapshot
      : {}
  ) as CrmConfigurationData;
  const value =
    typeof snapshot.totalPrice === "number" ? snapshot.totalPrice : null;
  const systemSizeKwp = toNumber(snapshot.systemkWp ?? snapshot.systemSizeKwp);
  const panelCount = toNumber(snapshot.panelCount);
  const erpSync = (
    snapshot.erpSync && typeof snapshot.erpSync === "object"
      ? snapshot.erpSync
      : {}
  ) as CrmRawRecord;

  return {
    id: leadId,
    type: "LEAD",
    displayType: "NEW LEAD",
    customerName: String(lead.name || "Unknown Lead"),
    email: String(lead.email || ""),
    phone: typeof lead.phone === "string" ? lead.phone : null,
    location: typeof lead.location === "string" ? lead.location : null,
    status: String(lead.status || "NEW"),
    isArchived: false,
    value,
    valueLabel: formatThb(value),
    systemSizeKwp,
    panelCount,
    createdAt: isoDate(lead.createdAt),
    expiresAt: addDaysIso(lead.createdAt, quotationExpirationDays),
    updatedAt: isoDate(lead.updatedAt),
    source: "FORM_INGESTION",
    configurationData: snapshot,
    isInstallationRequired: false,
    installationLatitude: null,
    installationLongitude: null,
    installationMapAddress: null,
    installationNotes: null,
    erpnextCustomerId:
      typeof erpSync.erpnextCustomerId === "string"
        ? erpSync.erpnextCustomerId
        : typeof erpSync.erpCustomerId === "string"
          ? erpSync.erpCustomerId
          : null,
    erpnextQuotationId:
      typeof erpSync.erpnextQuotationId === "string"
        ? erpSync.erpnextQuotationId
        : typeof erpSync.erpQuotationId === "string"
          ? erpSync.erpQuotationId
          : null,
    paymentStatus: "N/A",
    trackRequestNumber: `LEAD-${leadId.slice(0, 8).toUpperCase()}`,
    trackingReferences: uniqueStrings([
      leadId,
      `LEAD-${leadId.slice(0, 8).toUpperCase()}`,
    ]),
    requestType: "Installation",
    serviceItems: [],
    preferredDate: null,
    raw: lead,
  };
}

export function mapProposalToCrmRow(
  proposal: CrmRawRecord,
  quotationExpirationDays = 7,
): CrmRow {
  const config = (
    proposal.configurationData && typeof proposal.configurationData === "object"
      ? proposal.configurationData
      : {}
  ) as CrmConfigurationData;
  const user = (
    proposal.user && typeof proposal.user === "object" ? proposal.user : {}
  ) as CrmRawRecord;
  const isCustomServiceQuote =
    String(proposal.requestType || config.requestType || "").toLowerCase() ===
      "service" && config.pricingStatus === "CUSTOM_REQUIRED";
  const proposalValue = isCustomServiceQuote
    ? null
    : typeof proposal.totalPrice === "number"
      ? proposal.totalPrice
      : null;
  const proposalId = String(proposal.id || "");
  const normalizedRequestType = String(
    proposal.requestType || config.requestType || "",
  ).toLowerCase();
  const configTrackingId = firstString(
    config.trackingRef,
    config.trackingId,
    config.orderReference,
    config.serviceOrderTrackingId,
  );
  const serviceOrderId = firstString(proposal.serviceOrderId, config.serviceOrderId);
  const magicTokenSlug =
    typeof proposal.magicTokenSlug === "string" ? proposal.magicTokenSlug : null;
  const trackRequestNumber =
    normalizedRequestType === "service" && configTrackingId
      ? configTrackingId
      : shortQuotationTrackNumber(proposalId);

  const milestones = Array.isArray(proposal.paymentMilestones)
    ? proposal.paymentMilestones.filter(
        (milestone): milestone is CrmRawRecord =>
          milestone !== null &&
          typeof milestone === "object" &&
          !Array.isArray(milestone),
      )
    : [];
  let paymentStatus: "Unpaid" | "Deposit Paid" | "Paid 100%" | "N/A" = "Unpaid";
  if (milestones.length > 0) {
    const allPaid = milestones.every(
      (milestone) => milestone.status === "PAID",
    );
    const anyPaid = milestones.some((milestone) => milestone.status === "PAID");
    if (allPaid) {
      paymentStatus = "Paid 100%";
    } else if (anyPaid) {
      paymentStatus = "Deposit Paid";
    }
  }

  return {
    id: proposalId,
    type: "PROPOSAL",
    displayType: "PROPOSAL",
    customerName: String(user.name || user.email || "Unknown Customer"),
    email: String(user.email || ""),
    phone:
      typeof user.phoneNumber === "string"
        ? user.phoneNumber
        : typeof config.phone === "string"
          ? config.phone
          : null,
    location: typeof config.location === "string" ? config.location : null,
    status: String(proposal.status || "DRAFT"),
    isArchived: Boolean((proposal as CrmRawRecord).isArchived),
    value: proposalValue,
    valueLabel: isCustomServiceQuote
      ? "Custom quote pending"
      : formatThb(proposalValue),
    systemSizeKwp: toNumber(proposal.systemSizeKwp),
    panelCount: toNumber(proposal.panelCount),
    createdAt: isoDate(proposal.createdAt),
    expiresAt: addDaysIso(proposal.createdAt, quotationExpirationDays),
    updatedAt: isoDate(proposal.updatedAt),
    source: "SOLAR_WIZARD_BOM",
    configurationData: config,
    pdfUrl: typeof proposal.pdfUrl === "string" ? proposal.pdfUrl : null,
    dispatchStatus:
      typeof proposal.dispatchStatus === "string"
        ? proposal.dispatchStatus
        : null,
    magicTokenSlug:
      magicTokenSlug,
    signedAt: proposal.signedAt ? isoDate(proposal.signedAt) : null,
    signedDocumentDriveUrl:
      typeof proposal.signedDocumentDriveUrl === "string"
        ? proposal.signedDocumentDriveUrl
        : null,
    revisedPdfUrl:
      typeof proposal.revisedPdfUrl === "string"
        ? proposal.revisedPdfUrl
        : null,
    wizardLeadId:
      typeof proposal.wizardLeadId === "string"
        ? proposal.wizardLeadId
        : null,
    surveyDate: proposal.surveyDate ? isoDate(proposal.surveyDate) : null,
    surveyNotes:
      typeof proposal.surveyNotes === "string" ? proposal.surveyNotes : null,
    surveyPhotos: proposal.surveyPhotos,
    erpnextCustomerId:
      typeof proposal.erpnextCustomerId === "string"
        ? proposal.erpnextCustomerId
        : null,
    erpnextQuotationId:
      typeof proposal.erpnextQuotationId === "string"
        ? proposal.erpnextQuotationId
        : null,
    fulfillmentType:
      typeof proposal.fulfillmentType === "string"
        ? proposal.fulfillmentType
        : "SUPPLY_ONLY",
    shippingTrackingNumber:
      typeof proposal.shippingTrackingNumber === "string"
        ? proposal.shippingTrackingNumber
        : null,
    trackRequestNumber,
    trackingReferences: uniqueStrings([
      trackRequestNumber,
      proposalId,
      shortQuotationTrackNumber(proposalId),
      magicTokenSlug,
      typeof proposal.erpnextQuotationId === "string"
        ? proposal.erpnextQuotationId
        : null,
      configTrackingId,
      serviceOrderId,
      typeof proposal.shippingTrackingNumber === "string"
        ? proposal.shippingTrackingNumber
        : null,
    ]),
    shippingCarrier:
      typeof config.shippingCarrier === "string"
        ? config.shippingCarrier
        : null,
    currentMilestoneStep: toNumber(proposal.currentMilestoneStep),
    fieldChecklistData:
      proposal.fieldChecklistData &&
      typeof proposal.fieldChecklistData === "object"
        ? (proposal.fieldChecklistData as Record<string, unknown>)
        : null,
    isInstallationRequired: Boolean(proposal.isInstallationRequired),
    installationLatitude:
      typeof proposal.installationLatitude === "string"
        ? proposal.installationLatitude
        : null,
    installationLongitude:
      typeof proposal.installationLongitude === "string"
        ? proposal.installationLongitude
        : null,
    installationMapAddress:
      typeof proposal.installationMapAddress === "string"
        ? proposal.installationMapAddress
        : null,
    installationNotes:
      typeof proposal.installationNotes === "string"
        ? proposal.installationNotes
        : null,
    paymentStatus,
    requestType:
      typeof proposal.requestType === "string" && proposal.requestType.trim()
        ? proposal.requestType
        : "Installation",
    serviceItems: Array.isArray(proposal.serviceItems)
      ? proposal.serviceItems.filter(
          (item): item is Record<string, unknown> =>
            Boolean(item) && typeof item === "object" && !Array.isArray(item),
        )
      : [],
    preferredDate: proposal.preferredDate
      ? isoDate(proposal.preferredDate)
      : null,
    raw: proposal,
  };
}

export function rowMatchesCrmTab(row: CrmRow, tab: CrmTab) {
  if (tab === "ALL") return true;
  if (row.isArchived && tab !== "ARCHIVE") return false;
  if (tab === "LEADS") return row.type === "LEAD";
  if (tab === "PROPOSALS") return row.type === "PROPOSAL";
  if (tab === "ARCHIVE") {
    return row.type === "PROPOSAL" && row.isArchived === true;
  }
  return row.type === "LEAD"
    ? row.status === "WON"
    : ["SIGNED", "CONFIRMED", "VERIFIED_IN_PROGRESS", "COMPLETED"].includes(
        row.status,
      );
}
