/**
 * Serializable contracts shared by proposal routes and customer-portal clients.
 *
 * Keep this module free of React, database, and server-only imports so the same
 * DTOs can safely describe both sides of a Server Component or HTTP boundary.
 */

export type IsoDateString = string;

export type ProposalConfigurationDto = Record<string, unknown>;
export type ProposalServiceItemDto = Record<string, unknown>;

export type ProposalPaymentStatus =
  | "UNPAID"
  | "DEPOSIT_PENDING"
  | "DEPOSIT_PAID"
  | "FULLY_PAID";

export interface ProposalFinancingDto {
  providerName: string;
  financeType: string;
  interestRate: string | null;
  maxTermMonths: number | null;
  marketingTag: string | null;
}

export interface ProposalCustomerDto {
  name: string | null;
  fullName: string;
  email: string;
  phoneNumber: string | null;
}

/** Customer-facing proposal detail returned by proposal and portal routes. */
export interface ProposalPortalDto {
  requestType?: string | null;
  serviceItems?: ProposalServiceItemDto[];
  preferredDate?: IsoDateString | null;
  id: string;
  userId: string;
  systemSizeKwp: number;
  panelCount: number;
  totalPrice: number;
  monthlySavings: number;
  paybackPeriod: string;
  pdfUrl: string | null;
  revisedPdfUrl: string | null;
  signedDocumentDriveUrl?: string | null;
  revisionNumber: number;
  status: string;
  dispatchStatus?: string | null;
  paymentStatus?: ProposalPaymentStatus | null;
  configurationData: ProposalConfigurationDto;
  fulfillmentType: string;
  erpnextQuotationId: string | null;
  selectedFinancing: ProposalFinancingDto | null;
  user: ProposalCustomerDto | null;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
}

export type ProposalDocumentRequestType =
  | "FILE"
  | "LOCATION"
  | "CONTACT_INFO";
export type ProposalDocumentRequestStatus =
  | "PENDING"
  | "UPLOADED"
  | "APPROVED";

export interface ProposalDocumentAttachmentDto {
  id: string;
  fileName: string;
  fileUrl: string;
  storageProvider: string;
  storageFileId?: string | null;
  fallbackUrl?: string | null;
  metadata?: unknown;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
}

export interface ProposalDocumentRequestDto {
  id: string;
  quotationId: string;
  documentName: string;
  descriptionHint: string | null;
  requestType: ProposalDocumentRequestType;
  isRequired: boolean;
  status: ProposalDocumentRequestStatus;
  fileUrl: string | null;
  storageProvider?: string | null;
  storageFileId?: string | null;
  fallbackUrl?: string | null;
  metadata?: unknown;
  attachments?: ProposalDocumentAttachmentDto[];
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
}

export type ProposalDeliveryDocumentKind =
  | "pdf"
  | "jpeg"
  | "png"
  | "webp"
  | "heic"
  | "docx"
  | "xlsx"
  | "pptx"
  | "txt";

export interface ProposalDeliveryDocumentMetadataDto {
  originalFileName?: string;
  kind?: ProposalDeliveryDocumentKind;
  extension?: string;
  byteSize?: number;
  contentType?: string;
  version?: number;
  [key: string]: unknown;
}

export interface ProposalDeliveryDocumentDto {
  id: string;
  quotationId: string;
  deliveryType: string;
  title: string;
  description: string | null;
  fileUrl: string | null;
  storageProvider?: string | null;
  storageFileId?: string | null;
  fallbackUrl?: string | null;
  status: string;
  metadata?: ProposalDeliveryDocumentMetadataDto | null;
  attachments?: ProposalDocumentAttachmentDto[];
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
}

export type ProposalPaymentRequestStatus =
  | "PENDING"
  | "AWAITING_VERIFICATION"
  | "PAID"
  | "FAILED";
export type ProposalPaymentType = "FULL" | "INSTALLMENT";
export type ProposalPaymentMethod = "QR" | "BANK_TRANSFER";

export interface ProposalPaymentRequestDto {
  id: string;
  proposalId: string;
  title: string;
  amountRequested: string;
  status: ProposalPaymentRequestStatus;
  paymentType?: ProposalPaymentType;
  paymentMethod?: ProposalPaymentMethod;
  slipUrl: string | null;
  slipImageUrl?: string | null;
  verifiedBy?: string | null;
  verifiedAt?: IsoDateString | null;
  verificationStatus?: string | null;
  storageProvider?: string | null;
  storageFileId?: string | null;
  fallbackUrl?: string | null;
  verificationError?: string | null;
}

export interface ProposalPaymentInstructionsDto {
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
}

export interface ProposalInvoiceDto {
  id: string;
  erpnextInvoiceId: string;
  status: string;
  amount: string;
  pdfUrl: string | null;
  slipUrl: string | null;
  createdAt: IsoDateString;
}

export interface ProposalInstallationEvidenceDto {
  id: string;
  contentType: string;
  byteSize: number;
  sha256: string;
  status: string;
  latitude: number | null;
  longitude: number | null;
  capturedAt: IsoDateString | null;
  createdAt: IsoDateString;
}

export interface ProposalInstallationChecklistItemDto {
  id: string;
  taskId: string;
  itemCode: string;
  label: string;
  sequence: number;
  required: boolean;
  evidenceRequired: boolean;
  allowsNa: boolean;
  status: string;
  outcome: "PASS" | "FAIL" | "NA" | null;
  remarks: string | null;
  verifiedAt: IsoDateString | null;
  verifiedByUserId: string | null;
  evidence: ProposalInstallationEvidenceDto[];
}

export interface ProposalInstallationCapabilitiesDto {
  canView: boolean;
  canExecute: boolean;
  canUploadEvidence: boolean;
  canComplete: boolean;
  canReview: boolean;
  canReject: boolean;
  canAmend: boolean;
  isAssignedActor: boolean;
  dependencyReady: boolean;
  evidenceReady: boolean;
  checklistReady: boolean;
  lockedReason: string | null;
}

export interface ProposalInstallationTaskDto {
  id: string;
  taskCode: string;
  title: string;
  sequence: number;
  dependsOnTaskCode: string | null;
  assignedUserId: string | null;
  status: string;
  completedAt: IsoDateString | null;
  checklist: ProposalInstallationChecklistItemDto[];
  capabilities: ProposalInstallationCapabilitiesDto;
}

export type ProposalInstallationActorMode =
  | "GUEST"
  | "MEMBER"
  | "INSTALLER"
  | "REVIEWER";
export type ProposalInstallationActorRole =
  | "USER"
  | "CUSTOMER"
  | "INSTALLER"
  | "STAFF"
  | "MANAGER"
  | "ADMIN"
  | "SUPER_ADMIN";

export interface ProposalInstallationSnapshotDto {
  project: {
    id: string;
    projectCode: string;
    status: string;
    lastSyncedAt: IsoDateString | null;
    permitStatus: string;
    permitAuthority: string | null;
    permitApplicationNumber: string | null;
    permitSubmittedAt: IsoDateString | null;
    permitApprovedAt: IsoDateString | null;
  };
  actor: {
    mode: ProposalInstallationActorMode;
    role: ProposalInstallationActorRole;
  };
  tasks: ProposalInstallationTaskDto[];
}

export interface ProposalPortalSnapshotDto {
  proposal: Partial<ProposalPortalDto>;
  documentRequests: ProposalDocumentRequestDto[];
  deliveryDocuments: ProposalDeliveryDocumentDto[];
  paymentRequests: ProposalPaymentRequestDto[];
  installation: ProposalInstallationSnapshotDto | null;
}

export type ProposalPortalSnapshotResponseDto =
  | { success: true; snapshot: ProposalPortalSnapshotDto }
  | {
      success?: false;
      snapshot?: undefined;
      error?: string;
      retryable?: boolean;
    };

/** Proposal-list record consumed by the interactive proposals workspace. */
export interface ProposalUploadedVersionDto {
  version: number | string;
  url: string;
}

export interface ProposalListLineItemDto {
  productName?: string | null;
  model?: string | null;
  name?: string | null;
  description?: string | null;
  quantity?: number | string | null;
  qty?: number | string | null;
  unitPrice?: number | string | null;
  price?: number | string | null;
}

export interface ProposalPaymentRequestSummaryDto {
  id: string;
  proposalId: string;
  title: string;
  amountRequested: string;
  status: string;
  slipUrl: string | null;
  storageProvider?: string | null;
  storageFileId?: string | null;
  fallbackUrl?: string | null;
  easySlipData?: unknown;
}

export interface ProposalFieldChecklistStepDto {
  completedAt?: IsoDateString | Date | null;
  checklist?: {
    notes?: string | null;
  } | null;
}

export interface ProposalInvoiceSummaryDto {
  id: string;
  erpnextInvoiceId: string;
  amount: string | number;
  status: string;
  pdfUrl: string | null;
  eTaxUrl: string | null;
  createdAt: IsoDateString | Date;
}

export interface ProposalListConfigurationDto
  extends ProposalConfigurationDto {
  uploadedVersions?: ProposalUploadedVersionDto[];
  shippingCarrier?: string | null;
  items?: ProposalListLineItemDto[];
  pricingStatus?: string | null;
}

export interface ProposalListItemDto {
  requestType?: string | null;
  serviceItems?: ProposalServiceItemDto[];
  preferredDate?: IsoDateString | Date | null;
  id: string;
  userId: string;
  systemSizeKwp: number;
  panelCount: number;
  totalPrice: number;
  monthlySavings: number;
  paybackPeriod: string;
  pdfUrl: string | null;
  revisedPdfUrl: string | null;
  revisionNumber?: number;
  isArchived: boolean;
  status: string;
  dispatchStatus?: string | null;
  signedDocumentDriveUrl: string | null;
  fulfillmentType: string | null;
  shippingTrackingNumber: string | null;
  currentMilestoneStep: number;
  fieldChecklistData: ProposalConfigurationDto | null;
  erpnextQuotationId?: string | null;
  configurationData: ProposalListConfigurationDto | null;
  surveyDate?: IsoDateString | Date | null;
  surveyNotes?: string | null;
  surveyPhotos?: unknown;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
  validUntil?: IsoDateString | Date | null;
  signatureUrl?: string | null;
  signedAt?: IsoDateString | Date | null;
}

export type ProposalProgressStatus =
  | "STAGING"
  | "PENDING_QUOTE"
  | "WAITING_CLIENT"
  | "APPROVED";

export interface ProposalWorkStatusItemDto {
  id?: string;
  productId?: string;
  productName?: string;
  model?: string;
  item_code?: string;
  name?: string;
  quantity?: number;
  qty?: number;
  unitPrice?: number;
  price?: number;
  totalPrice?: number;
  total?: number;
  categoryName?: string;
  category?: string;
  brand?: string;
  description?: string;
  productLabel?: string;
  group?: string;
}

export interface ProposalContactLinkDto {
  id: string;
  platform: string;
  value: string;
  label?: string | null;
  icon?: string | null;
}

export interface ProposalWorkStatusConfigurationDto
  extends ProposalConfigurationDto {
  items?: ProposalWorkStatusItemDto[];
  products?: ProposalWorkStatusItemDto[];
}

export interface ProposalWorkStatusDto {
  id: string;
  systemSizeKwp: number;
  panelCount: number;
  totalPrice: number;
  monthlySavings: number;
  paybackPeriod: string;
  status: string;
  configurationData: ProposalWorkStatusConfigurationDto;
  createdAt: IsoDateString | Date;
  updatedAt: IsoDateString | Date;
}

export interface ProposalWorkStatusDashboardContract {
  proposals: ProposalWorkStatusDto[];
  activeProposal: ProposalWorkStatusDto | null;
  contactLinks: ProposalContactLinkDto[];
}

export interface ProposalProjectHubItemDto {
  id?: string;
  name: string;
  model?: string | null;
  quantity: number;
}

export interface ProposalProjectHubDocumentDto {
  id: string;
  label: string;
  url: string;
  kind: "CONTRACT" | "PAYMENT";
  amount?: number;
}

export interface ProposalProjectHubContract {
  locale: string;
  proposalId: string;
  status: string;
  currentMilestoneStep: number;
  engineerName?: string | null;
  estimatedDate?: IsoDateString | Date | null;
  items: ProposalProjectHubItemDto[];
  documents: ProposalProjectHubDocumentDto[];
  totalPrice: number;
  paidAmount?: number;
}

export interface GuestProposalSummaryDto {
  id: string;
  reference: string;
  status: string;
  systemSizeKwp: number;
  panelCount: number;
  totalPrice: number;
}

export interface GuestServiceOrderSummaryDto {
  id: string;
  reference: string;
  status: string;
  offeringName: string;
  appointmentDate: IsoDateString | null;
}

export interface GuestProposalsDashboardContract {
  locale: string;
  email: string | null;
  proposals: GuestProposalSummaryDto[];
  serviceOrders: GuestServiceOrderSummaryDto[];
}

/* Compatibility names retained while callers migrate from portalTypes.ts. */
export type ClientProposal = ProposalPortalDto;
export type ClientDocumentRequest = ProposalDocumentRequestDto;
export type ClientDocumentAttachment = ProposalDocumentAttachmentDto;
export type ClientDeliveryDocument = ProposalDeliveryDocumentDto;
export type ClientDeliveryDocumentMetadata =
  ProposalDeliveryDocumentMetadataDto;
export type ClientPaymentRequest = ProposalPaymentRequestDto;
export type ClientPaymentInstructions = ProposalPaymentInstructionsDto;
export type ClientInvoice = ProposalInvoiceDto;
export type ClientInstallationEvidence = ProposalInstallationEvidenceDto;
export type ClientInstallationChecklistItem =
  ProposalInstallationChecklistItemDto;
export type ClientInstallationTask = ProposalInstallationTaskDto;
export type ClientInstallationSnapshot =
  ProposalInstallationSnapshotDto | null;
