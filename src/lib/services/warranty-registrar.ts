import "server-only";

import { createHash } from "node:crypto";

import { asc, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import {
  installationAuditEvents,
  installationWorkflowProjects,
  installedAssets,
  proposals,
  projectWarrantyRegistrations,
  quotationWorkflows,
  users,
} from "@/db/schema";
import { getConfiguredPublicSiteUrl } from "@/lib/siteUrl";
import { NotificationOrchestrator } from "@/lib/notificationOrchestrator";
import {
  frappeRequest,
  getOrCreateErpnextCustomerForUser,
  type ErpnextDocument,
} from "@/lib/erpnext";
import type { TechnicianTaskAccess } from "@/lib/techPortalAccess";
import type { TechnicianGps } from "@/types/techPortal";

type JsonRecord = Record<string, unknown>;

type WarrantyEquipment = {
  serialNumber: string;
  itemCode: string;
  itemName: string;
  manufacturer: string | null;
  itemType: string;
  warrantyYears: number;
  warrantyExpiryDate: string;
  datasheetUrl: string | null;
  sldUrl: string | null;
};

type WarrantyMetadata = {
  customerId: string;
  gps: TechnicianGps;
  installationAddress: string;
  peaMeterId: string | null;
  roofType: string | null;
  mainDbLocation: string | null;
  systemId: string;
  systemSizeKwp: number;
  installationDate: string;
  signedHandoverPdfUrl: string | null;
  signedHandoverSha256: string;
};

type WarrantyRegistrationPayload = {
  warrantyKey: string;
  salesOrderName: string | null;
  deliveryNoteNames: string[];
  assetProfile: { doctype: string; name: string };
  ledger: { doctype: string; name: string; hash: string };
  metadata: WarrantyMetadata;
  equipment: WarrantyEquipment[];
  workmanshipWarrantyExpiryDate: string;
  warrantyCardUrl: string;
};

type WarrantyCardResource = {
  label: string;
  url: string;
};

export type WarrantyCard = {
  customer: {
    id: string;
    name: string;
  };
  installation: {
    systemId: string;
    systemSizeKwp: number;
    systemLabel: string;
    installedAt: string;
    address: string;
    gps: { latitude: number; longitude: number } | null;
    peaMeterId: string | null;
    roofType: string | null;
    mainDbLocation: string | null;
  };
  warranty: {
    isUnderInstallationWarranty: boolean;
    daysRemaining: number;
    status: "UNDER_WARRANTY" | "EXPIRED" | "PENDING";
    expiresAt: string | null;
  };
  equipment: Array<{
    id: string;
    itemName: string;
    itemCode: string | null;
    serialNumber: string;
    manufacturer: string | null;
    warrantyExpiryDate: string;
    daysRemaining: number;
    status: "UNDER_WARRANTY" | "EXPIRED";
  }>;
  documents: {
    handoverCertificate: WarrantyCardResource | null;
    inverterDatasheets: WarrantyCardResource[];
    singleLineDiagrams: WarrantyCardResource[];
  };
  serviceRequest: {
    assetId: string | null;
    systemId: string;
    gps: { latitude: number; longitude: number } | null;
  };
};

const MAX_SERIALIZED_ITEMS = 100;
const DEFAULT_EQUIPMENT_WARRANTY_YEARS = 10;
const WORKMANSHIP_WARRANTY_YEARS = 2;
const DAY_MS = 86_400_000;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function getText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function getNullableNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getNumber(value: unknown, fallback = 0) {
  return getNullableNumber(value) ?? fallback;
}

function extractDocument(value: unknown): JsonRecord {
  const root = asRecord(value);
  if (root.data && typeof root.data === "object" && !Array.isArray(root.data)) {
    return asRecord(root.data);
  }
  if (root.message && typeof root.message === "object" && !Array.isArray(root.message)) {
    return asRecord(root.message);
  }
  return root;
}

function extractRows(value: unknown): JsonRecord[] {
  const root = asRecord(value);
  const rows = Array.isArray(root.data) ? root.data : Array.isArray(value) ? value : [];
  return rows.filter((row): row is JsonRecord => Boolean(row) && typeof row === "object" && !Array.isArray(row));
}

function encodeJson(value: unknown) {
  return encodeURIComponent(JSON.stringify(value));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown ERPNext error.";
}

function isMissingFieldError(error: unknown) {
  const message = errorMessage(error).toLowerCase();
  return message.includes("unknown column")
    || message.includes("does not exist")
    || message.includes("field not found")
    || message.includes("not a valid field");
}

function safeKey(value: string, fallback: string) {
  const normalized = value.trim().replace(/[^A-Za-z0-9_-]+/g, "-").replace(/-+/g, "-");
  return normalized.slice(0, 90) || fallback;
}

function addYears(date: Date, years: number) {
  const result = new Date(date.getTime());
  result.setFullYear(result.getFullYear() + years);
  return result;
}

function toDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseDate(value: unknown, fallback: Date) {
  const candidate = new Date(getText(value));
  return Number.isNaN(candidate.getTime()) ? fallback : candidate;
}

function getConfig(proposal: typeof proposals.$inferSelect) {
  return asRecord(proposal.configurationData);
}

function getNestedConfigValue(config: JsonRecord, keys: string[]) {
  const containers = [
    config,
    asRecord(config.site),
    asRecord(config.installation),
    asRecord(config.installationDetails),
    asRecord(config.property),
  ];
  for (const container of containers) {
    for (const key of keys) {
      const value = getText(container[key]);
      if (value) return value;
    }
  }
  return "";
}

function getInstallationAddress(proposal: typeof proposals.$inferSelect) {
  const config = getConfig(proposal);
  return getText(proposal.installationMapAddress)
    || getNestedConfigValue(config, ["installationMapAddress", "installationAddress", "address", "location"])
    || "Customer site location";
}

function getGps(handoverGps: TechnicianGps): TechnicianGps {
  return handoverGps;
}

function getSalesOrderFromConfig(proposal: typeof proposals.$inferSelect) {
  const config = getConfig(proposal);
  const goldenThread = asRecord(config.goldenThread);
  return getText(goldenThread.salesOrderId)
    || getText(goldenThread.salesOrderName)
    || getText(config.salesOrderId)
    || getText(config.salesOrderName)
    || getText(config.erpnextSalesOrderId)
    || getText(config.sales_order);
}

function getSerialValues(value: unknown): string[] {
  if (typeof value === "string") {
    return value
      .split(/[\r\n,;]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => getSerialValues(item));
  }
  if (value && typeof value === "object") {
    const record = asRecord(value);
    return getSerialValues(record.serial_no || record.serialNumber || record.serial_number || record.serial);
  }
  return [];
}

function getItemType(row: JsonRecord) {
  return getText(row.item_type)
    || getText(row.custom_item_type)
    || getText(row.item_group)
    || getText(row.item_name)
    || getText(row.item_code)
    || "Solar equipment";
}

function getWarrantyYears(itemType: string, itemCode: string, itemName: string) {
  const normalized = `${itemType} ${itemCode} ${itemName}`.toLowerCase();
  if (/workmanship|installation|labou?r|ค่าแรง|ติดตั้ง/.test(normalized)) {
    return WORKMANSHIP_WARRANTY_YEARS;
  }
  return DEFAULT_EQUIPMENT_WARRANTY_YEARS;
}

function getLink(row: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = getText(row[key]);
    if (/^https?:\/\//i.test(value)) return value;
  }
  return null;
}

function extractEquipment(rows: JsonRecord[], handoverDate: Date): WarrantyEquipment[] {
  const bySerial = new Map<string, WarrantyEquipment>();
  for (const row of rows) {
    const itemCode = getText(row.item_code) || getText(row.itemCode);
    const itemName = getText(row.item_name) || getText(row.itemName) || itemCode || "Solar equipment";
    const itemType = getItemType(row);
    const manufacturer = getText(row.manufacturer) || getText(row.brand) || null;
    const warrantyYears = getWarrantyYears(itemType, itemCode, itemName);
    const warrantyExpiryDate = toDateOnly(addYears(handoverDate, warrantyYears));
    const datasheetUrl = getLink(row, ["datasheet_url", "datasheetUrl", "inverter_datasheet_url", "custom_datasheet_url"]);
    const sldUrl = getLink(row, ["sld_url", "sldUrl", "single_line_diagram_url", "singleLineDiagramUrl", "custom_sld_url"]);
    const serialValues = getSerialValues(row.serial_no || row.serialNumber || row.serial_number || row.serials);
    for (const serialNumber of serialValues) {
      if (bySerial.has(serialNumber) || bySerial.size >= MAX_SERIALIZED_ITEMS) continue;
      bySerial.set(serialNumber, {
        serialNumber,
        itemCode,
        itemName,
        manufacturer,
        itemType,
        warrantyYears,
        warrantyExpiryDate,
        datasheetUrl,
        sldUrl,
      });
    }
  }
  return [...bySerial.values()];
}

async function enrichEquipmentDocuments(equipment: WarrantyEquipment[]) {
  const itemCodes = [...new Set(equipment.map((item) => item.itemCode).filter(Boolean))];
  const itemDocuments = new Map<string, ErpnextDocument>();
  await Promise.all(itemCodes.map(async (itemCode) => {
    try {
      const result = await frappeRequest("GET", `/api/resource/Item/${encodeURIComponent(itemCode)}`);
      const document = extractDocument(result.data);
      if (getText(document.name) || getText(document.item_code)) itemDocuments.set(itemCode, document);
    } catch {
      // Datasheet/SLD fields are optional ERPNext custom fields. The warranty
      // registration itself must continue when a catalog item has no links.
    }
  }));
  return equipment.map((item) => {
    const document = itemDocuments.get(item.itemCode);
    return {
      ...item,
      datasheetUrl: item.datasheetUrl || getLink(document || {}, ["datasheet_url", "datasheetUrl", "inverter_datasheet_url", "custom_datasheet_url"]),
      sldUrl: item.sldUrl || getLink(document || {}, ["sld_url", "sldUrl", "single_line_diagram_url", "singleLineDiagramUrl", "custom_sld_url"]),
    };
  });
}

async function getProjectDocument(projectName: string) {
  const result = await frappeRequest(
    "GET",
    `/api/resource/Project/${encodeURIComponent(projectName)}`,
  );
  return extractDocument(result.data);
}

async function resolveSalesOrderName(access: TechnicianTaskAccess) {
  const configured = getSalesOrderFromConfig(access.proposal);
  if (configured) return configured;
  const projectId = access.project.erpnextProjectId;
  if (!projectId) return null;
  try {
    const project = await getProjectDocument(projectId);
    return getText(project.sales_order) || getText(project.salesOrder) || null;
  } catch (error: unknown) {
    console.warn("[Warranty Registrar] Could not resolve Sales Order from ERPNext Project.", {
      projectId,
      error: errorMessage(error),
    });
    return null;
  }
}

async function getDeliveryNotes(salesOrderName: string) {
  const fields = encodeJson(["name", "posting_date", "customer"]);
  const filters = encodeJson([
    ["Delivery Note", "docstatus", "=", 1],
    ["Delivery Note Item", "against_sales_order", "=", salesOrderName],
  ]);
  try {
    const listed = await frappeRequest(
      "GET",
      `/api/resource/Delivery Note?fields=${fields}&filters=${filters}&limit_page_length=20`,
    );
    const notes = extractRows(listed.data);
    return Promise.all(notes.slice(0, 20).map(async (note) => {
      const name = getText(note.name);
      if (!name) return note;
      try {
        const detail = await frappeRequest("GET", `/api/resource/Delivery Note/${encodeURIComponent(name)}`);
        return extractDocument(detail.data);
      } catch {
        return note;
      }
    }));
  } catch (error: unknown) {
    console.warn("[Warranty Registrar] Delivery Note lookup was unavailable; using Sales Order items.", {
      salesOrderName,
      error: errorMessage(error),
    });
    return [];
  }
}

function getRowsFromDocuments(salesOrder: JsonRecord, deliveryNotes: JsonRecord[]) {
  const deliveryRows = deliveryNotes.flatMap((note) => Array.isArray(note.items) ? note.items.map(asRecord) : []);
  const salesRows = Array.isArray(salesOrder.items) ? salesOrder.items.map(asRecord) : [];
  return [...deliveryRows, ...salesRows];
}

export async function getErpnextSerialNumber(serialNumber: string): Promise<ErpnextDocument | null> {
  const normalized = serialNumber.trim();
  if (!normalized) return null;
  try {
    const result = await frappeRequest("GET", `/api/resource/Serial No/${encodeURIComponent(normalized)}`);
    const document = extractDocument(result.data);
    return getText(document.name) || getText(document.serial_no) ? document : null;
  } catch {
    const fields = encodeJson(["name", "serial_no", "item_code", "item_name", "customer", "status", "warranty_amc_status", "warranty_expiry_date"]);
    const filters = encodeJson([["Serial No", "serial_no", "=", normalized]]);
    try {
      const result = await frappeRequest(
        "GET",
        `/api/resource/Serial No?fields=${fields}&filters=${filters}&limit_page_length=1`,
      );
      return extractRows(result.data)[0] || null;
    } catch {
      return null;
    }
  }
}

async function upsertErpnextSerialNumber(input: {
  equipment: WarrantyEquipment;
  customerId: string;
}) {
  const existing = await getErpnextSerialNumber(input.equipment.serialNumber);
  const data: JsonRecord = {
    serial_no: input.equipment.serialNumber,
    item_code: input.equipment.itemCode || undefined,
    item_name: input.equipment.itemName || undefined,
    customer: input.customerId || undefined,
    status: "Active",
    warranty_amc_status: "Under Warranty",
    warranty_expiry_date: input.equipment.warrantyExpiryDate,
  };
  const result = existing
    ? await frappeRequest("PUT", `/api/resource/Serial No/${encodeURIComponent(getText(existing.name) || input.equipment.serialNumber)}`, { data })
    : await frappeRequest("POST", "/api/resource/Serial No", { data });
  const document = extractDocument(result.data);
  return {
    name: getText(document.name) || getText(existing?.name) || input.equipment.serialNumber,
    document,
  };
}

async function findErpnextDocumentByName(doctype: string, name: string) {
  try {
    const result = await frappeRequest("GET", `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
    const document = extractDocument(result.data);
    return getText(document.name) ? document : null;
  } catch {
    return null;
  }
}

async function findErpnextInstallationProfile(doctype: string, customerId: string, projectId: string) {
  const fields = encodeJson(["name", "customer", "project", "sales_order"]);
  const filters = encodeJson([["customer", "=", customerId], ["project", "=", projectId]]);
  try {
    const result = await frappeRequest(
      "GET",
      `/api/resource/${encodeURIComponent(doctype)}?fields=${fields}&filters=${filters}&limit_page_length=1`,
    );
    return extractRows(result.data)[0] || null;
  } catch {
    return null;
  }
}

async function upsertErpnextInstallationProfile(input: {
  access: TechnicianTaskAccess;
  metadata: WarrantyMetadata;
  equipment: WarrantyEquipment[];
  salesOrderName: string | null;
  deliveryNoteNames: string[];
}) {
  const doctype = process.env.ERPNEXT_WARRANTY_ASSET_DOCTYPE?.trim() || "Installation Note";
  const projectId = input.access.project.erpnextProjectId;
  if (!projectId) throw new Error("ERPNext installation Project is not available for warranty registration.");
  const profileKey = `SD-ASSET-${safeKey(input.access.project.projectCode, input.access.project.id.slice(0, 12))}`;
  const existing = await findErpnextDocumentByName(doctype, profileKey)
    || await findErpnextInstallationProfile(doctype, input.metadata.customerId, projectId);
  const items = input.equipment.map((equipment) => ({
    item_code: equipment.itemCode || undefined,
    item_name: equipment.itemName,
    serial_no: equipment.serialNumber,
    qty: 1,
  }));
  const description = JSON.stringify({
    source: "SolarDream automated warranty registration",
    customerId: input.metadata.customerId,
    gps: input.metadata.gps,
    installationAddress: input.metadata.installationAddress,
    peaMeterId: input.metadata.peaMeterId,
    roofType: input.metadata.roofType,
    mainDbLocation: input.metadata.mainDbLocation,
    salesOrderName: input.salesOrderName,
    deliveryNoteNames: input.deliveryNoteNames,
    equipment: input.equipment,
  });
  const data: JsonRecord = {
    name: existing ? undefined : profileKey,
    customer: input.metadata.customerId || undefined,
    customer_id: input.metadata.customerId,
    customer_name: getText(input.access.customer.fullName) || getText(input.access.customer.name),
    project: projectId,
    sales_order: input.salesOrderName || undefined,
    delivery_note: input.deliveryNoteNames[0] || undefined,
    installation_date: input.metadata.installationDate,
    gps_latitude: input.metadata.gps.latitude,
    gps_longitude: input.metadata.gps.longitude,
    installation_address: input.metadata.installationAddress,
    pea_meter_id: input.metadata.peaMeterId || undefined,
    roof_type: input.metadata.roofType || undefined,
    main_db_location: input.metadata.mainDbLocation || undefined,
    items,
    description,
    remarks: description,
  };
  const endpointName = getText(existing?.name) || profileKey;
  try {
    const result = existing
      ? await frappeRequest("PUT", `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(endpointName)}`, { data })
      : await frappeRequest("POST", `/api/resource/${encodeURIComponent(doctype)}`, { data });
    const document = extractDocument(result.data);
    return { doctype, name: getText(document.name) || endpointName };
  } catch (error: unknown) {
    if (!isMissingFieldError(error)) throw error;
    // Some installations have not created the custom GPS/roof fields yet.
    // Keep the registration usable by retaining the full immutable metadata
    // JSON in the standard description/remarks fields until those fields exist.
    const compatibilityData: JsonRecord = {
      name: existing ? undefined : profileKey,
      customer: input.metadata.customerId || undefined,
      customer_name: getText(input.access.customer.fullName) || getText(input.access.customer.name),
      installation_date: input.metadata.installationDate,
      items,
      description,
      remarks: description,
    };
    const result = existing
      ? await frappeRequest("PUT", `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(endpointName)}`, { data: compatibilityData })
      : await frappeRequest("POST", `/api/resource/${encodeURIComponent(doctype)}`, { data: compatibilityData });
    const document = extractDocument(result.data);
    return { doctype, name: getText(document.name) || endpointName };
  }
}

async function createImmutableWarrantyLedger(input: {
  access: TechnicianTaskAccess;
  metadata: WarrantyMetadata;
  equipment: WarrantyEquipment[];
  salesOrderName: string | null;
  deliveryNoteNames: string[];
}) {
  const doctype = process.env.ERPNEXT_WARRANTY_LEDGER_DOCTYPE?.trim() || "Warranty Ledger";
  const projectId = input.access.project.erpnextProjectId;
  if (!projectId) throw new Error("ERPNext installation Project is not available for warranty registration.");
  const ledgerKey = `SD-WARRANTY-${safeKey(input.access.project.projectCode, input.access.project.id.slice(0, 12))}`;
  const existing = await findErpnextDocumentByName(doctype, ledgerKey);
  if (existing) {
    return {
      doctype,
      name: getText(existing.name) || ledgerKey,
      hash: getText(existing.ledger_hash) || getText(existing.custom_ledger_hash) || "",
    };
  }
  const canonical = JSON.stringify({
    customerId: input.metadata.customerId,
    projectId,
    salesOrderName: input.salesOrderName,
    installationDate: input.metadata.installationDate,
    equipment: input.equipment,
  });
  const hash = createHash("sha256").update(canonical).digest("hex");
  const data: JsonRecord = {
    name: ledgerKey,
    customer: input.metadata.customerId || undefined,
    customer_id: input.metadata.customerId,
    project: projectId,
    sales_order: input.salesOrderName || undefined,
    delivery_notes: input.deliveryNoteNames,
    installation_date: input.metadata.installationDate,
    status: "Under Warranty",
    is_immutable: 1,
    ledger_hash: hash,
    entries: input.equipment.map((equipment) => ({
      serial_no: equipment.serialNumber,
      item_code: equipment.itemCode || undefined,
      item_name: equipment.itemName,
      warranty_amc_status: "Under Warranty",
      warranty_expiry_date: equipment.warrantyExpiryDate,
    })),
    description: JSON.stringify({
      source: "SolarDream handover",
      gps: input.metadata.gps,
      installationAddress: input.metadata.installationAddress,
      peaMeterId: input.metadata.peaMeterId,
      roofType: input.metadata.roofType,
      mainDbLocation: input.metadata.mainDbLocation,
      signedHandoverPdfUrl: input.metadata.signedHandoverPdfUrl,
      signedHandoverSha256: input.metadata.signedHandoverSha256,
    }),
  };
  try {
    const result = await frappeRequest("POST", `/api/resource/${encodeURIComponent(doctype)}`, { data });
    const document = extractDocument(result.data);
    return { doctype, name: getText(document.name) || ledgerKey, hash };
  } catch (error: unknown) {
    // A retry after a successful POST can arrive as a duplicate. Read the
    // deterministic key again before surfacing the failure.
    const duplicate = await findErpnextDocumentByName(doctype, ledgerKey);
    if (duplicate) {
      return {
        doctype,
        name: getText(duplicate.name) || ledgerKey,
        hash: getText(duplicate.ledger_hash) || hash,
      };
    }
    throw error;
  }
}

function getWarrantyKey(idempotencyKey: string) {
  return `WARRANTY_REGISTERED:${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 48)}`;
}

function buildWarrantyCardUrl() {
  return process.env.NEXT_PUBLIC_LINE_LIFF_WARRANTY_URL?.trim()
    || `${getConfiguredPublicSiteUrl()}/th/portal/warranty`;
}

function daysRemaining(expiryDate: string | Date | null, now = new Date()) {
  if (!expiryDate) return 0;
  const expiry = expiryDate instanceof Date ? expiryDate : new Date(expiryDate);
  if (Number.isNaN(expiry.getTime())) return 0;
  return Math.max(0, Math.ceil((expiry.getTime() - now.getTime()) / DAY_MS));
}

function buildMetadata(input: {
  access: TechnicianTaskAccess;
  handoverDate: Date;
  gps: TechnicianGps;
  handoverPdfUrl: string | null;
  handoverSha256: string;
  erpnextCustomerId: string;
}) {
  const config = getConfig(input.access.proposal);
  const systemId = input.access.project.projectCode;
  return {
    customerId: input.erpnextCustomerId,
    gps: getGps(input.gps),
    installationAddress: getInstallationAddress(input.access.proposal),
    peaMeterId: getNestedConfigValue(config, ["peaMeterId", "pea_meter_id", "meterId", "meter_id"]) || null,
    roofType: getNestedConfigValue(config, ["roofType", "roof_type"]) || null,
    mainDbLocation: getNestedConfigValue(config, ["mainDbLocation", "main_db_location", "mainDBLocation"]) || null,
    systemId,
    systemSizeKwp: input.access.proposal.systemSizeKwp,
    installationDate: toDateOnly(input.handoverDate),
    signedHandoverPdfUrl: input.handoverPdfUrl,
    signedHandoverSha256: input.handoverSha256,
  } satisfies WarrantyMetadata;
}

function getExistingRegistrationPayload(event: typeof installationAuditEvents.$inferSelect) {
  return asRecord(event.payload) as Partial<WarrantyRegistrationPayload>;
}

export async function registerWarrantyAfterHandover(input: {
  access: TechnicianTaskAccess;
  handoverDate: Date;
  gps: TechnicianGps;
  handoverPdfUrl: string | null;
  handoverSha256: string;
  idempotencyKey: string;
}) {
  if (!input.access.project.erpnextProjectId) {
    throw new Error("ERPNext installation Project is not available for warranty registration.");
  }
  const warrantyKey = getWarrantyKey(input.idempotencyKey);
  const existing = await db.query.installationAuditEvents.findFirst({
    where: eq(installationAuditEvents.idempotencyKey, warrantyKey),
  });
  if (existing) {
    const payload = getExistingRegistrationPayload(existing);
    return {
      reused: true,
      warrantyKey,
      payload,
      notification: null,
    };
  }

  const erpnextCustomerId = input.access.proposal.erpnextCustomerId?.trim()
    || input.access.customer.erpnextCustomerId?.trim()
    || await getOrCreateErpnextCustomerForUser(input.access.customer.id, input.access.proposal.configurationData);
  const metadata = buildMetadata({ ...input, erpnextCustomerId });
  const salesOrderName = await resolveSalesOrderName(input.access);
  let salesOrder: JsonRecord = {};
  if (salesOrderName) {
    const result = await frappeRequest("GET", `/api/resource/Sales Order/${encodeURIComponent(salesOrderName)}`);
    salesOrder = extractDocument(result.data);
  }
  const deliveryNotes = salesOrderName ? await getDeliveryNotes(salesOrderName) : [];
  const equipment = await enrichEquipmentDocuments(extractEquipment(getRowsFromDocuments(salesOrder, deliveryNotes), input.handoverDate));
  const deliveryNoteNames = deliveryNotes.map((note) => getText(note.name)).filter(Boolean);

  const serialResults = await Promise.all(
    equipment.map((item) => upsertErpnextSerialNumber({
      equipment: item,
      customerId: metadata.customerId,
    })),
  );
  const assetProfile = await upsertErpnextInstallationProfile({
    access: input.access,
    metadata,
    equipment,
    salesOrderName,
    deliveryNoteNames,
  });
  const ledger = await createImmutableWarrantyLedger({
    access: input.access,
    metadata,
    equipment,
    salesOrderName,
    deliveryNoteNames,
  });
  const workmanshipWarrantyExpiryDate = toDateOnly(addYears(input.handoverDate, WORKMANSHIP_WARRANTY_YEARS));
  const warrantyCardUrl = buildWarrantyCardUrl();
  const payload: WarrantyRegistrationPayload = {
    warrantyKey,
    salesOrderName,
    deliveryNoteNames,
    assetProfile,
    ledger,
    metadata,
    equipment,
    workmanshipWarrantyExpiryDate,
    warrantyCardUrl,
  };

  const localResult = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`warranty:${input.access.project.id}`}))`);
    const duplicate = await tx.query.installationAuditEvents.findFirst({
      where: eq(installationAuditEvents.idempotencyKey, warrantyKey),
    });
    if (duplicate) {
      return { reused: true, payload: getExistingRegistrationPayload(duplicate) };
    }

    for (const item of equipment) {
      const existingAsset = await tx.query.installedAssets.findFirst({
        where: eq(installedAssets.serialNumber, item.serialNumber),
      });
      if (existingAsset && (existingAsset.customerId !== input.access.customer.id || existingAsset.proposalId !== input.access.proposal.id)) {
        throw new Error(`Serial number ${item.serialNumber} is already linked to another customer or project.`);
      }
      if (existingAsset) {
        await tx.update(installedAssets).set({
          productName: item.itemName || item.itemCode || "Solar equipment",
          installedDate: input.handoverDate,
          warrantyExpiryDate: new Date(item.warrantyExpiryDate),
        }).where(eq(installedAssets.id, existingAsset.id));
      } else {
        await tx.insert(installedAssets).values({
          proposalId: input.access.proposal.id,
          customerId: input.access.customer.id,
          productName: item.itemName || item.itemCode || "Solar equipment",
          serialNumber: item.serialNumber,
          installedDate: input.handoverDate,
          warrantyExpiryDate: new Date(item.warrantyExpiryDate),
        });
      }
    }

    await tx.insert(projectWarrantyRegistrations).values({
      projectId: input.access.project.id,
      registeredByUserId: input.access.customer.id,
      customerName: getText(input.access.customer.fullName) || getText(input.access.customer.name) || "Customer",
      phone: input.access.customer.phoneNumber,
      installationAddress: metadata.installationAddress,
      details: payload,
      registeredAt: input.handoverDate,
      updatedAt: input.handoverDate,
    }).onConflictDoUpdate({
      target: projectWarrantyRegistrations.projectId,
      set: {
        registeredByUserId: input.access.customer.id,
        customerName: getText(input.access.customer.fullName) || getText(input.access.customer.name) || "Customer",
        phone: input.access.customer.phoneNumber,
        installationAddress: metadata.installationAddress,
        details: payload,
        registeredAt: input.handoverDate,
        updatedAt: input.handoverDate,
      },
    });
    await tx.insert(quotationWorkflows).values({
      proposalId: input.access.proposal.id,
      currentStep: 5,
      warrantyRegisteredAt: input.handoverDate,
      completedAt: input.handoverDate,
      updatedAt: input.handoverDate,
    }).onConflictDoUpdate({
      target: quotationWorkflows.proposalId,
      set: {
        currentStep: 5,
        warrantyRegisteredAt: input.handoverDate,
        completedAt: input.handoverDate,
        updatedAt: input.handoverDate,
      },
    });
    await tx.insert(installationAuditEvents).values({
      proposalId: input.access.proposal.id,
      taskId: input.access.task.id,
      eventType: "WARRANTY_REGISTERED",
      actorUserId: input.access.actor.userId,
      idempotencyKey: warrantyKey,
      payload: {
        ...payload,
        serialResults: serialResults.map((result) => ({ name: result.name })),
      },
      occurredAt: input.handoverDate,
    });
    return { reused: false, payload };
  });

  if (localResult.reused) {
    return {
      reused: true,
      warrantyKey,
      payload: localResult.payload,
      notification: null,
    };
  }

  const days = daysRemaining(workmanshipWarrantyExpiryDate, input.handoverDate);
  const notification = await NotificationOrchestrator("WARRANTY_REGISTERED", {
    customerName: getText(input.access.customer.fullName) || getText(input.access.customer.name) || "Customer",
    phone: input.access.customer.phoneNumber || "",
    email: input.access.customer.email,
    lineUserId: input.access.customer.lineUserId,
    quotationId: input.access.proposal.erpnextQuotationId,
    projectId: input.access.project.projectCode,
    proposalUrl: warrantyCardUrl,
    pdfUrl: input.handoverPdfUrl,
    warrantyCardUrl,
    warrantySubject: "ยินดีต้อนรับสู่ SolarDream Family! บัตรรับประกันดิจิทัลของคุณพร้อมใช้งานแล้ว",
    warrantyDaysRemaining: days,
    systemSizeKwp: input.access.proposal.systemSizeKwp,
    warrantyYears: WORKMANSHIP_WARRANTY_YEARS,
  });

  for (const path of [
    "/my-assets",
    "/th/my-assets",
    "/en/my-assets",
    "/th/portal/warranty",
    "/en/portal/warranty",
  ]) {
    revalidatePath(path);
  }

  return {
    reused: false,
    warrantyKey,
    payload,
    notification,
  };
}

function toAbsoluteUrl(value: unknown) {
  const raw = getText(value);
  if (!raw) return null;
  try {
    return new URL(raw, process.env.ERPNEXT_BASE_URL || getConfiguredPublicSiteUrl()).toString();
  } catch {
    return null;
  }
}

function getEventMetadata(event: typeof installationAuditEvents.$inferSelect | null) {
  return asRecord(asRecord(event?.payload).metadata);
}

function getEventEquipment(event: typeof installationAuditEvents.$inferSelect | null): WarrantyEquipment[] {
  const raw = asRecord(event?.payload).equipment;
  if (!Array.isArray(raw)) return [];
  return raw.map(asRecord).map((item) => ({
    serialNumber: getText(item.serialNumber),
    itemCode: getText(item.itemCode),
    itemName: getText(item.itemName) || "Solar equipment",
    manufacturer: getText(item.manufacturer) || null,
    itemType: getText(item.itemType) || "Solar equipment",
    warrantyYears: getNumber(item.warrantyYears, DEFAULT_EQUIPMENT_WARRANTY_YEARS),
    warrantyExpiryDate: getText(item.warrantyExpiryDate),
    datasheetUrl: toAbsoluteUrl(item.datasheetUrl),
    sldUrl: toAbsoluteUrl(item.sldUrl),
  })).filter((item) => item.serialNumber && item.warrantyExpiryDate);
}

function findResourceUrls(equipment: WarrantyEquipment[], serialDocuments: ErpnextDocument[]) {
  const datasheets = new Map<string, WarrantyCardResource>();
  const slds = new Map<string, WarrantyCardResource>();
  const add = (collection: Map<string, WarrantyCardResource>, url: string | null, label: string) => {
    if (url) collection.set(url, { label, url });
  };
  equipment.forEach((item) => {
    add(datasheets, item.datasheetUrl, `${item.itemName} datasheet`);
    add(slds, item.sldUrl, `${item.itemName} SLD`);
  });
  serialDocuments.forEach((document) => {
    const itemName = getText(document.item_name) || getText(document.item_code) || "Inverter";
    add(datasheets, toAbsoluteUrl(document.datasheet_url || document.inverter_datasheet_url || document.custom_datasheet_url), `${itemName} datasheet`);
    add(slds, toAbsoluteUrl(document.sld_url || document.single_line_diagram_url || document.custom_sld_url), `${itemName} SLD`);
  });
  return {
    datasheets: [...datasheets.values()],
    slds: [...slds.values()],
  };
}

export async function getCustomerWarrantyCard(customerId: string): Promise<WarrantyCard | null> {
  const assets = await db.query.installedAssets.findMany({
    where: eq(installedAssets.customerId, customerId),
    orderBy: [desc(installedAssets.installedDate)],
  });
  if (assets.length === 0) return null;

  const primaryAsset = assets[0];
  const proposal = await db.query.proposals.findFirst({
    where: eq(proposals.id, primaryAsset.proposalId),
  });
  if (!proposal) return null;
  const project = await db.query.installationWorkflowProjects.findFirst({
    where: eq(installationWorkflowProjects.proposalId, proposal.id),
  });
  const events = await db.query.installationAuditEvents.findMany({
    where: eq(installationAuditEvents.proposalId, proposal.id),
    orderBy: [asc(installationAuditEvents.occurredAt)],
  });
  const warrantyEvent = events.find((event) => event.eventType === "WARRANTY_REGISTERED") || null;
  const handoverEvent = events.find((event) => event.eventType === "HANDOVER_COMPLETED") || null;
  const metadata = getEventMetadata(warrantyEvent);
  const eventEquipment = getEventEquipment(warrantyEvent);
  const serialDocuments = (await Promise.all(
    assets.map((asset) => getErpnextSerialNumber(asset.serialNumber)),
  )).filter((document): document is ErpnextDocument => Boolean(document));
  const equipmentBySerial = new Map(eventEquipment.map((item) => [item.serialNumber, item]));
  const now = new Date();
  const equipment = assets.map((asset) => {
    const eventItem = equipmentBySerial.get(asset.serialNumber);
    const serialDocument = serialDocuments.find((document) =>
      getText(document.serial_no) === asset.serialNumber || getText(document.name) === asset.serialNumber,
    );
    const expiry = getText(serialDocument?.warranty_expiry_date) || eventItem?.warrantyExpiryDate || asset.warrantyExpiryDate.toISOString();
    return {
      id: asset.id,
      itemName: getText(serialDocument?.item_name) || eventItem?.itemName || asset.productName,
      itemCode: getText(serialDocument?.item_code) || eventItem?.itemCode || null,
      serialNumber: asset.serialNumber,
      manufacturer: eventItem?.manufacturer || getText(serialDocument?.manufacturer) || null,
      warrantyExpiryDate: expiry,
      daysRemaining: daysRemaining(expiry, now),
      status: daysRemaining(expiry, now) > 0 ? "UNDER_WARRANTY" as const : "EXPIRED" as const,
    };
  });
  const installationDate = getText(metadata.installationDate)
    || handoverEvent?.occurredAt.toISOString()
    || primaryAsset.installedDate.toISOString();
  const defaultWorkmanshipExpiry = toDateOnly(addYears(parseDate(installationDate, primaryAsset.installedDate), WORKMANSHIP_WARRANTY_YEARS));
  const expiry = getText(asRecord(warrantyEvent?.payload).workmanshipWarrantyExpiryDate) || defaultWorkmanshipExpiry;
  const remaining = daysRemaining(expiry, now);
  const resourceUrls = findResourceUrls(eventEquipment, serialDocuments);
  const handoverPayload = asRecord(handoverEvent?.payload);
  const handoverUrl = toAbsoluteUrl(handoverPayload.drivePdfUrl || handoverPayload.erpFileUrl || proposal.signedDocumentDriveUrl);
  const gpsRecord = asRecord(metadata.gps);
  const latitude = getNullableNumber(gpsRecord.latitude);
  const longitude = getNullableNumber(gpsRecord.longitude);
  const gps = latitude === null || longitude === null ? null : { latitude, longitude };
  const customer = await db.query.users.findFirst({ where: eq(users.id, customerId) });
  const systemId = getText(metadata.systemId) || project?.projectCode || project?.erpnextProjectId || proposal.id;
  const systemSizeKwp = getNumber(metadata.systemSizeKwp, proposal.systemSizeKwp);

  return {
    customer: {
      id: customerId,
      name: getText(customer?.fullName) || getText(customer?.name) || getText(customer?.email) || "SolarDream customer",
    },
    installation: {
      systemId,
      systemSizeKwp,
      systemLabel: `${systemSizeKwp}kW ${getText(asRecord(proposal.configurationData).systemType) || "Solar System"}`,
      installedAt: installationDate,
      address: getText(metadata.installationAddress) || getInstallationAddress(proposal),
      gps,
      peaMeterId: getText(metadata.peaMeterId) || null,
      roofType: getText(metadata.roofType) || null,
      mainDbLocation: getText(metadata.mainDbLocation) || null,
    },
    warranty: {
      isUnderInstallationWarranty: remaining > 0,
      daysRemaining: remaining,
      status: warrantyEvent ? remaining > 0 ? "UNDER_WARRANTY" : "EXPIRED" : "PENDING",
      expiresAt: expiry || null,
    },
    equipment,
    documents: {
      handoverCertificate: handoverUrl ? { label: "Signed handover certificate", url: handoverUrl } : null,
      inverterDatasheets: resourceUrls.datasheets,
      singleLineDiagrams: resourceUrls.slds,
    },
    serviceRequest: {
      assetId: primaryAsset.id,
      systemId,
      gps,
    },
  };
}
