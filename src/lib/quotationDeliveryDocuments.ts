export type BuiltInQuotationDeliveryDocumentType =
  | "FINAL_QUOTATION"
  | "DATASHEET_PANEL"
  | "DATASHEET_INVERTER"
  | "DATASHEET_RACKING"
  | "ROI_REPORT";

/** Built-in document types plus administrator-defined customer deliverables. */
export type QuotationDeliveryDocumentType = BuiltInQuotationDeliveryDocumentType | `CUSTOM_${string}`;

type QuotationDeliveryDocumentVersionSource = {
  version?: unknown;
  metadata?: unknown;
  attachments?: ReadonlyArray<{
    metadata?: unknown;
  }>;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asPositiveInteger(value: unknown): number | null {
  const parsed = typeof value === "number" || typeof value === "string"
    ? Number(value)
    : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/** Returns the version displayed for a delivery document across admin and portal surfaces. */
export function getQuotationDeliveryDocumentVersion(
  document: QuotationDeliveryDocumentVersionSource | null | undefined,
  fallback = 1,
): number {
  const fallbackVersion = asPositiveInteger(fallback) || 1;
  const explicitVersion = asPositiveInteger(document?.version);
  if (explicitVersion) return explicitVersion;

  const metadataVersion = asPositiveInteger(asRecord(document?.metadata).version);
  if (metadataVersion) return metadataVersion;

  const attachmentVersions = (document?.attachments || [])
    .map((attachment) => asPositiveInteger(asRecord(attachment.metadata).version))
    .filter((version): version is number => version !== null);
  if (attachmentVersions.length > 0) return Math.max(...attachmentVersions);

  return Math.max(fallbackVersion, document?.attachments?.length || 0);
}

export type QuotationDeliveryDocumentTemplate = {
  deliveryType: QuotationDeliveryDocumentType;
  title: string;
  description: string;
  required: boolean;
};

export function getQuotationDeliveryDriveLockKey(proposalId: string) {
  return `quotation-delivery-drive:${proposalId.trim()}`;
}

export const QUOTATION_DELIVERY_DOCUMENT_TEMPLATES: QuotationDeliveryDocumentTemplate[] = [
  {
    deliveryType: "FINAL_QUOTATION",
    title: "ใบเสนอราคาฉบับสมบูรณ์",
    description: "Synced dynamically with ERPNext connection tool.",
    required: true,
  },
  {
    deliveryType: "DATASHEET_PANEL",
    title: "Data Sheet Specifications: Solar Panel",
    description: "Technical reference file for the selected solar panel specification.",
    required: false,
  },
  {
    deliveryType: "DATASHEET_INVERTER",
    title: "Data Sheet Specifications: Inverter",
    description: "Technical reference file for the selected inverter technology.",
    required: false,
  },
  {
    deliveryType: "DATASHEET_RACKING",
    title: "Data Sheet Specifications: Racking Structure",
    description: "Technical reference file for roof mounting and structural racking.",
    required: false,
  },
  {
    deliveryType: "ROI_REPORT",
    title: "รายงานประมาณการผลตอบแทน ROI",
    description: "เล่มรายงานวิเคราะห์พลังงานจากระบบ Pvsyst",
    required: false,
  },
];

export const WARRANTY_DISCLOSURE_ROWS = [
  {
    equipment: "แผงโซลาร์เซลล์ (Solar Panels)",
    coverage: "รับประกันตัวสินค้า 12 ปี / รับประกันประสิทธิภาพการผลิตพลังงาน 30 ปี",
  },
  {
    equipment: "อินเวอร์เตอร์ (Inverter)",
    coverage: "รับประกันอุปกรณ์ระบบ 5 ปี หรือ 10 ปี (ขึ้นอยู่กับรุ่นที่เลือกพัฒนา)",
  },
  {
    equipment: "ระบบแบตเตอรี่ (Battery)",
    coverage: "รับประกันอุปกรณ์ระบบ 5 ปี หรือ 10 ปี (ขึ้นอยู่กับขนาดแพ็กเกจที่ระบุ)",
  },
] as const;

export type WarrantyDisclosureTemplate = {
  id: string;
  equipment: string;
  coverage: string;
  isVisibleToClient: boolean;
};

export const WARRANTY_DISCLOSURE_TEMPLATES: WarrantyDisclosureTemplate[] = WARRANTY_DISCLOSURE_ROWS.map((row, index) => ({
  id: `warranty-${index + 1}`,
  ...row,
  isVisibleToClient: true,
}));
