"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { consultationLeads, leads, proposals } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireStaff } from "@/lib/auth-guard";
import { getSystemSetting } from "@/app/actions/systemSettings";
import { buildErpnextBomItems, extractConfigurationItems } from "@/lib/erpnextBom";
import { getQuotationDocumentNo, safeSyncProposalQuotationToERP } from "@/lib/erpnext";
import { getCatalogProductsByIds } from "@/lib/erpnextCatalog";
import { trackUmamiServerEvent } from "@/utils/analytics-server";
import { queueApiLog, serializeError } from "@/utils/logger";

type ErpnextBody = Record<string, unknown>;
type ErpnextJson = {
  status: number;
  data?: Array<Record<string, unknown>> | Record<string, unknown>;
  exception?: string;
  message?: string;
};

type ErpnextCredentials = {
  baseUrl: string;
  authHeader: string;
};

export type ErpnextQuotationEquipmentItem = {
  id: string;
  itemCode: string;
  itemName: string;
  description: string | null;
  quantity: number;
  uom: string | null;
  rate: number;
  amount: number;
};

class ErpnextRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ErpnextRequestError";
  }
}

const ERPNEXT_REQUEST_TIMEOUT_MS = 15_000;
const MAX_ERPNEXT_RESPONSE_TEXT_CHARS = 12_000;

async function getErpnextCredentials(): Promise<ErpnextCredentials> {
  const [baseUrlRaw, apiKeyRaw, apiSecretRaw] = await Promise.all([
    getSystemSetting("erpnext_site_endpoint"),
    getSystemSetting("erpnext_api_key"),
    getSystemSetting("erpnext_api_secret"),
  ]);
  const baseUrl = (baseUrlRaw || process.env.ERPNEXT_BASE_URL || "").trim().replace(/\/$/, "");
  const apiKey = (apiKeyRaw || process.env.ERPNEXT_API_KEY || "").trim();
  const apiSecret = (apiSecretRaw || process.env.ERPNEXT_API_SECRET || "").trim();

  if (!baseUrl || !apiKey || !apiSecret) {
    throw new Error("ERPNext configuration is missing. Set ERPNext URL, API key, and API secret in API settings.");
  }

  return {
    baseUrl,
    authHeader: `token ${apiKey}:${apiSecret}`,
  };
}

function getHeaders(credentials: ErpnextCredentials) {
  return {
    "Content-Type": "application/json",
    Authorization: credentials.authHeader,
  };
}

function extractFrappeServerMessage(errorText: string) {
  try {
    const parsed = JSON.parse(errorText) as {
      _error_message?: unknown;
      _server_messages?: unknown;
      exc_type?: unknown;
      exception?: unknown;
      message?: unknown;
    };

    const serverMessagesText = typeof parsed._server_messages === "string"
      ? parsed._server_messages
      : "";
    const serverMessages = serverMessagesText
      ? JSON.parse(serverMessagesText) as Array<{ message?: unknown; title?: unknown }>
      : [];
    const serverMessage = serverMessages
      .map((entry) => typeof entry.message === "string" ? entry.message.replace(/<[^>]*>/g, "") : "")
      .find(Boolean);

    return [
      typeof parsed._error_message === "string" ? parsed._error_message : "",
      serverMessage || "",
      typeof parsed.exception === "string" ? parsed.exception : "",
      typeof parsed.message === "string" ? parsed.message : "",
    ].find(Boolean) || "";
  } catch {
    return "";
  }
}

function formatErpnextError(status: number, endpoint: string, errorText: string) {
  const message = extractFrappeServerMessage(errorText) || errorText || `ERPNext responded with status ${status}`;
  const isQuotationPermissionError =
    endpoint.includes("/api/resource/Quotation") &&
    /permission|No permission|does not have doctype access/i.test(message);

  if (isQuotationPermissionError) {
    return [
      "ERPNext API user does not have permission to create Quotation documents.",
      "Please grant the ERPNext API user a role with Quotation Read/Create/Write access, such as Sales User or Sales Manager, then retry from SolarDream.",
      `ERPNext detail: ${message}`,
    ].join(" ");
  }

  return message;
}

function parseMaybeJson(text: string) {
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

async function erpnextRequest(method: "GET" | "POST" | "PUT", endpoint: string, body?: ErpnextBody): Promise<ErpnextJson> {
  const credentials = await getErpnextCredentials();
  const requestHeaders = getHeaders(credentials);
  let responseWasLogged = false;

  try {
    const response = await fetch(`${credentials.baseUrl}${endpoint}`, {
      method,
      headers: requestHeaders,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: "no-store",
      signal: AbortSignal.timeout(ERPNEXT_REQUEST_TIMEOUT_MS),
    });
    const responseText = (await response.text().catch(() => ""))
      .slice(0, MAX_ERPNEXT_RESPONSE_TEXT_CHARS);
    const responseBody = parseMaybeJson(responseText);
    const errorMessage = response.ok ? null : formatErpnextError(response.status, endpoint, responseText);

    queueApiLog({
      direction: "OUTBOUND",
      sourceSystem: "ERPNEXT",
      endpoint,
      method,
      statusCode: response.status,
      requestHeaders,
      requestBody: body ?? {},
      responseBody,
      errorMessage,
    });
    responseWasLogged = true;

    if (!response.ok) {
      throw new ErpnextRequestError(
        response.status,
        errorMessage || `ERPNext responded with status ${response.status}`,
      );
    }

    return responseBody as ErpnextJson;
  } catch (error) {
    if (!responseWasLogged) {
      const serialized = serializeError(error);
      queueApiLog({
        direction: "OUTBOUND",
        sourceSystem: "ERPNEXT",
        endpoint,
        method,
        statusCode: 500,
        requestHeaders,
        requestBody: body ?? {},
        responseBody: serialized,
        errorMessage: serialized.stack || serialized.message,
      });
    }
    throw error;
  }
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function getNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function extractErpnextResourceName(value: unknown, depth = 0): string | null {
  // Standard Frappe resource responses use { data: { name } }. Some custom
  // endpoints return the document directly, an array, or a message wrapper.
  if (depth > 2) return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const name = extractErpnextResourceName(item, depth + 1);
      if (name) return name;
    }
    return null;
  }

  const record = getRecord(value);
  const name = getString(record.name);
  if (name) return name;

  return extractErpnextResourceName(record.data, depth + 1)
    || extractErpnextResourceName(record.message, depth + 1);
}

function isUsableConfiguredName(value: string) {
  return value.length > 0 && !value.includes("\"") && !/^[^\p{L}\p{N}]+$/u.test(value);
}

function getFirstResource(data: ErpnextJson["data"]) {
  return Array.isArray(data) ? data[0] : data;
}

function getErpnextRows(data: ErpnextJson["data"]): Array<Record<string, unknown>> {
  if (Array.isArray(data)) return data;
  const record = getRecord(data);
  return Array.isArray(record.data)
    ? record.data.map(getRecord)
    : [];
}

async function findErpnextLeadByIdentity(input: { email: string | null; phone: string | null }) {
  const identities = [
    { field: "email_id", value: getString(input.email).toLowerCase() },
    { field: "mobile_no", value: getString(input.phone) },
  ].filter((identity) => identity.value.length > 0);

  for (const identity of identities) {
    const filters = encodeURIComponent(JSON.stringify([[identity.field, "=", identity.value]]));
    const fields = encodeURIComponent(JSON.stringify(["name", "email_id", "mobile_no", "status"]));
    try {
      const response = await erpnextRequest(
        "GET",
        `/api/resource/Lead?filters=${filters}&fields=${fields}&limit_page_length=1`,
      );
      const leadId = getString(getErpnextRows(response.data)[0]?.name);
      if (leadId) return leadId;
    } catch (error) {
      console.warn("[ERPNext Lead Factory] Lead identity lookup skipped:", error);
    }
  }

  return null;
}

function isDuplicateErpnextLeadError(error: unknown) {
  return (
    (error instanceof ErpnextRequestError && error.status === 409) ||
    /DuplicateEntryError|Email Address must be unique/i.test(error instanceof Error ? error.message : "")
  );
}

async function getCompanyName() {
  const configuredCompanyName = (
    process.env.ERPNEXT_COMPANY_NAME?.trim() ||
    (await getSystemSetting("erpnext_company_name"))?.trim() ||
    ""
  ).trim();

  if (isUsableConfiguredName(configuredCompanyName)) {
    return configuredCompanyName;
  }

  const fields = encodeURIComponent(JSON.stringify(["name"]));
  const filters = encodeURIComponent(JSON.stringify([["Company", "is_group", "=", 0]]));
  const companies = await erpnextRequest(
    "GET",
    `/api/resource/Company?fields=${fields}&filters=${filters}&limit_page_length=2`,
  );
  const companyName = extractErpnextResourceName(companies.data);

  if (!companyName) {
    throw new Error(
      "ERPNext company name is missing or invalid. Set a valid erpnext_company_name in API settings, or grant the API user Company read access so SolarDream can discover it.",
    );
  }

  return companyName;
}

async function getDefaultLeadItemCode() {
  const configuredItemCode = (
    (await getSystemSetting("erpnext_default_item_code")) ||
    process.env.ERPNEXT_DEFAULT_ITEM_CODE ||
    ""
  ).trim();
  if (configuredItemCode) {
    return configuredItemCode;
  }

  const itemCode = "SOLARDREAM-SOLAR-SYSTEM";
  const fields = encodeURIComponent(JSON.stringify(["name", "item_code"]));
  const filters = encodeURIComponent(JSON.stringify([["Item", "item_code", "=", itemCode]]));
  const existing = await erpnextRequest(
    "GET",
    `/api/resource/Item?fields=${fields}&filters=${filters}&limit_page_length=1`,
  );
  const existingItem = getFirstResource(existing.data);
  const existingItemCode = typeof existingItem?.item_code === "string"
    ? existingItem.item_code
    : extractErpnextResourceName(existing.data);
  if (existingItemCode) {
    return existingItemCode;
  }

  try {
    const created = await erpnextRequest("POST", "/api/resource/Item", {
      data: {
        item_code: itemCode,
        item_name: "SolarDream Custom Solar System",
        item_group: process.env.ERPNEXT_DEFAULT_ITEM_GROUP || "Products",
        stock_uom: process.env.ERPNEXT_DEFAULT_UOM || "Nos",
        is_sales_item: 1,
        is_stock_item: 0,
        description: "Generic SolarDream quotation line for website lead configurations.",
      },
    });
    const createdItem = getFirstResource(created.data);
    const createdItemCode = typeof createdItem?.item_code === "string"
      ? createdItem.item_code
      : extractErpnextResourceName(created.data);

    if (createdItemCode) {
      return createdItemCode;
    }
  } catch (error) {
    console.error("[ERPNext Item Setup] Failed to create default quotation item:", error);
    throw new Error(
      `ERPNext default quotation item is missing. Create Item ${itemCode}, or set erpnext_default_item_code to an existing ERPNext Item Code.`,
    );
  }

  throw new Error(`ERPNext did not return the default Item Code ${itemCode}.`);
}

async function buildLeadFallbackSystemItem(input: {
  systemSizeKwp: number;
  panelCount: number;
  totalPrice: number;
}) {
  const itemCode = await getDefaultLeadItemCode();
  const systemSizeLabel = input.systemSizeKwp > 0 ? `${input.systemSizeKwp} kWp` : "custom";
  return {
    item_code: itemCode,
    item_name: `SolarDream solar system ${systemSizeLabel}`,
    qty: 1,
    uom: "Nos",
    stock_uom: "Nos",
    conversion_factor: 1,
    rate: input.totalPrice,
    amount: input.totalPrice,
    description: `Website lead solar configuration: ${systemSizeLabel}, ${input.panelCount} panels.`,
  };
}

function getLeadDocumentNo(leadId: string) {
  return `QT-${leadId.slice(0, 8).toUpperCase()}`;
}

function buildLeadRemarks(lead: {
  id: string;
  name: string;
  email: string;
  phone: string;
  location: string | null;
  configurationSnapshot: unknown;
}) {
  const snapshot = getRecord(lead.configurationSnapshot);
  const preferredContactTime = getString(
    snapshot.preferredContactTime ?? snapshot.contactTime ?? snapshot.preferred_contact_time,
  );
  const postalCode = getString(snapshot.postalCode ?? snapshot.postcode ?? snapshot.zipCode);
  const monthlySavings = getNumber(snapshot.estimatedSavings ?? snapshot.monthlySavings, 0);

  return [
    "Generated from SolarDream website lead for staff review.",
    `Lead ID: ${lead.id}`,
    `Customer name: ${lead.name}`,
    `Phone: ${lead.phone}`,
    `Email: ${lead.email}`,
    lead.location ? `Location: ${lead.location}` : "",
    postalCode ? `Postal code: ${postalCode}` : "",
    preferredContactTime ? `Preferred contact time: ${preferredContactTime}` : "",
    monthlySavings > 0 ? `Predicted monthly savings: THB ${monthlySavings.toLocaleString("th-TH")}` : "",
    "Customer master data intentionally left for ERP staff assignment.",
  ].filter(Boolean).join("\n");
}

function getLeadBudget(snapshot: Record<string, unknown>) {
  return getNumber(
    snapshot.totalPrice ??
    snapshot.preliminaryBudget ??
    snapshot.estimatedBudget ??
    snapshot.systemPackagePrice,
    0,
  );
}

function getLeadKwSize(snapshot: Record<string, unknown>, fallback: string) {
  const numeric = getNumber(
    snapshot.systemSizeKwp ??
    snapshot.systemPackageSizeKwp ??
    snapshot.systemkWp ??
    snapshot.targetCapacity,
    0,
  );
  return numeric > 0 ? `${numeric}kW` : fallback;
}

function buildErpLeadNotes(input: {
  consultationLeadId: string;
  targetSystemSize: string;
  systemType: string;
  addOns: string[];
  postalCode: string | null;
  customerNotes: string | null;
  budget: number;
  dynamicCalculations: Record<string, unknown>;
}) {
  return [
    "Generated automatically from SolarDream Wizard.",
    `SolarDream ConsultationLead ID: ${input.consultationLeadId}`,
    `Target system size: ${input.targetSystemSize}`,
    `System type: ${input.systemType}`,
    input.addOns.length ? `Smart add-ons: ${input.addOns.join(", ")}` : "",
    input.postalCode ? `Postal code: ${input.postalCode}` : "",
    input.budget > 0 ? `Estimated budget: THB ${input.budget.toLocaleString("th-TH")}` : "",
    input.customerNotes ? `Customer notes: ${input.customerNotes}` : "",
    `Wizard payload: ${JSON.stringify(input.dynamicCalculations).slice(0, 2500)}`,
  ].filter(Boolean).join("\n");
}

export async function createErpnextLeadForConsultation(consultationLeadId: string) {
  try {
    const consultationLead = await db.query.consultationLeads.findFirst({
      where: eq(consultationLeads.id, consultationLeadId),
    });

    if (!consultationLead) {
      return { success: false, error: "Consultation lead not found." };
    }

    if (consultationLead.erpLeadId) {
      return { success: true, erpLeadId: consultationLead.erpLeadId, alreadyExists: true };
    }

    const dynamicCalculations = getRecord(consultationLead.dynamicCalculations);
    const rawPayload = getRecord(consultationLead.rawPayload);
    const systemProfile = getRecord(rawPayload.systemProfile);
    const budget = getLeadBudget({ ...dynamicCalculations, ...systemProfile });
    const kwSize = getLeadKwSize({ ...dynamicCalculations, ...systemProfile }, consultationLead.targetSystemSize);
    const payload = {
      data: {
        lead_name: consultationLead.customerName,
        first_name: consultationLead.customerName,
        email_id: consultationLead.email,
        mobile_no: consultationLead.phone,
        phone: consultationLead.phone,
        status: "Lead",
        source: "SolarDream Wizard",
        // Lead.notes is an ERPNext child table, not a plain text field.
        notes: [{
          note: buildErpLeadNotes({
            consultationLeadId: consultationLead.id,
            targetSystemSize: consultationLead.targetSystemSize,
            systemType: consultationLead.systemType,
            addOns: consultationLead.addOns,
            postalCode: consultationLead.postalCode,
            customerNotes: consultationLead.customerNotes,
            budget,
            dynamicCalculations,
          }),
        }],
      },
    };

    let erpLeadId = await findErpnextLeadByIdentity({
      email: consultationLead.email,
      phone: consultationLead.phone,
    });
    let httpStatus = 200;

    if (!erpLeadId) {
      try {
        const result = await erpnextRequest("POST", "/api/resource/Lead", payload);
        erpLeadId = extractErpnextResourceName(result.data);
        httpStatus = result.status;
      } catch (error) {
        if (!isDuplicateErpnextLeadError(error)) throw error;
        erpLeadId = await findErpnextLeadByIdentity({
          email: consultationLead.email,
          phone: consultationLead.phone,
        });
        if (!erpLeadId) throw error;
      }
    }

    if (!erpLeadId) {
      throw new Error("ERPNext did not return a Lead ID.");
    }

    await db.update(consultationLeads)
      .set({
        erpLeadId,
        crmPayload: {
          ...getRecord(consultationLead.crmPayload),
          erpLeadId,
          erpnextLeadId: erpLeadId,
          erpLeadCreatedAt: new Date().toISOString(),
        },
        dynamicCalculations: {
          ...dynamicCalculations,
          erpSync: {
            ...getRecord(dynamicCalculations.erpSync),
            status: "ERP_LEAD_CREATED",
            erpLeadId,
            erpnextLeadId: erpLeadId,
            httpStatus,
            updatedAt: new Date().toISOString(),
          },
        },
      })
      .where(eq(consultationLeads.id, consultationLead.id));

    if (consultationLead.legacyLeadId) {
      const legacyLead = await db.query.leads.findFirst({
        where: eq(leads.id, consultationLead.legacyLeadId),
        columns: { configurationSnapshot: true },
      });
      const legacySnapshot = getRecord(legacyLead?.configurationSnapshot);
      await db.update(leads)
        .set({
          configurationSnapshot: {
            ...legacySnapshot,
            erpSync: {
              ...getRecord(legacySnapshot.erpSync),
              status: "ERP_LEAD_CREATED",
              erpLeadId,
              erpnextLeadId: erpLeadId,
              updatedAt: new Date().toISOString(),
            },
          },
        })
        .where(eq(leads.id, consultationLead.legacyLeadId));
    }

    void trackUmamiServerEvent({
      eventName: "lead_generated",
      featureFlagKey: "track_wizard_engagement",
      title: "Solar wizard lead generated",
      url: "/wizard/summary",
      properties: {
        kw_size: kwSize,
        est_budget: budget,
        consultation_lead_id: consultationLead.id,
        erp_lead_id: erpLeadId,
      },
    });

    revalidatePath("/admin/crm");
    revalidatePath("/admin/leads");
    return { success: true, erpLeadId };
  } catch (error) {
    console.error("[ERPNext Lead Factory]:", error);
    return {
      success: false,
      error: "Failed to create ERPNext Lead.",
    };
  }
}

export async function verifyErpnextLead(erpLeadId: string): Promise<{
  success: boolean;
  exists?: boolean;
  error?: string;
}> {
  const normalizedLeadId = erpLeadId.trim();

  if (!normalizedLeadId) {
    return { success: false, error: "ERPNext Lead ID is required." };
  }

  try {
    await erpnextRequest(
      "GET",
      `/api/resource/Lead/${encodeURIComponent(normalizedLeadId)}`,
    );
    return { success: true, exists: true };
  } catch (error) {
    if (error instanceof ErpnextRequestError && error.status === 404) {
      return { success: true, exists: false };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "ERPNext lead verification failed.",
    };
  }
}

async function ensureErpLeadForConsultation(consultationLeadId: string | null) {
  if (!consultationLeadId) return "";

  const consultationLead = await db.query.consultationLeads.findFirst({
    where: eq(consultationLeads.id, consultationLeadId),
    columns: { erpLeadId: true },
  });

  if (consultationLead?.erpLeadId) return consultationLead.erpLeadId;

  const result = await createErpnextLeadForConsultation(consultationLeadId);
  return result.success && result.erpLeadId ? result.erpLeadId : "";
}

export async function createErpnextQuotation(proposalId: string) {
  await requireStaff();
  return createErpnextQuotationCore(proposalId);
}

export async function ensureErpnextQuotationSync(proposalId: string) {
  await requireStaff();

  const proposal = await db.query.proposals.findFirst({
    where: eq(proposals.id, proposalId),
    columns: {
      id: true,
      erpnextQuotationId: true,
      erpnextCustomerId: true,
      configurationData: true,
    },
  });
  if (!proposal) return { success: false, error: "Proposal not found." };

  if (!proposal.erpnextQuotationId) {
    return createErpnextQuotationCore(proposal.id);
  }

  const remoteQuotation = await verifyErpnextQuotation(proposal.erpnextQuotationId);
  if (!remoteQuotation.success) {
    return { success: false, error: remoteQuotation.error };
  }

  if (!remoteQuotation.exists) {
    const configurationData = getRecord(proposal.configurationData);
    const erpSync = getRecord(configurationData.erpSync);
    await db.update(proposals)
      .set({
        erpnextQuotationId: null,
        configurationData: {
          ...configurationData,
          erpSync: {
            ...erpSync,
            status: "ERP_QUOTATION_MISSING",
            missingQuotationId: proposal.erpnextQuotationId,
            updatedAt: new Date().toISOString(),
          },
        },
        updatedAt: new Date(),
      })
      .where(eq(proposals.id, proposal.id));

    return createErpnextQuotationCore(proposal.id);
  }

  const synced = await safeSyncProposalQuotationToERP(proposal.id);
  if (!synced?.remoteName) {
    return {
      success: false,
      error: "ERPNext quotation sync failed. Review the ERP sync state for details.",
    };
  }

  revalidatePath("/admin/crm");
  revalidatePath(`/admin/crm/${proposal.id}`);
  revalidatePath(`/th/admin/crm/${proposal.id}`);
  revalidatePath(`/en/admin/crm/${proposal.id}`);
  revalidatePath("/proposals");

  return {
    success: true,
    quotationId: synced.remoteName,
    customerId: proposal.erpnextCustomerId,
  };
}

export async function getErpnextQuotationEquipment(
  quotationId: string | null | undefined,
): Promise<ErpnextQuotationEquipmentItem[]> {
  await requireStaff();

  const normalizedQuotationId = quotationId?.trim();
  if (!normalizedQuotationId) return [];

  try {
    const response = await erpnextRequest(
      "GET",
      `/api/resource/Quotation/${encodeURIComponent(normalizedQuotationId)}`,
    );
    const quotation = getRecord(response.data);
    const items = Array.isArray(quotation.items) ? quotation.items : [];

    return items.map((item, index) => {
      const row = getRecord(item);
      const itemCode = getString(row.item_code);
      const itemName = getString(row.item_name) || itemCode || `Component ${index + 1}`;
      const quantity = getNumber(row.qty, 0);
      const rate = getNumber(row.rate, 0);

      return {
        id: getString(row.name) || `${normalizedQuotationId}-${itemCode || index}`,
        itemCode,
        itemName,
        description: getString(row.description) || null,
        quantity,
        uom: getString(row.uom) || getString(row.stock_uom) || null,
        rate,
        amount: getNumber(row.amount, quantity * rate),
      };
    });
  } catch (error) {
    console.error(`[ERPNext] Failed to load quotation equipment for ${normalizedQuotationId}:`, error);
    return [];
  }
}

async function verifyErpnextQuotation(erpQuotationId: string): Promise<{
  success: boolean;
  exists?: boolean;
  error?: string;
}> {
  const normalizedQuotationId = erpQuotationId.trim();
  if (!normalizedQuotationId) {
    return { success: false, error: "ERPNext quotation ID is required." };
  }

  try {
    await erpnextRequest(
      "GET",
      `/api/resource/Quotation/${encodeURIComponent(normalizedQuotationId)}`,
    );
    return { success: true, exists: true };
  } catch (error) {
    if (error instanceof ErpnextRequestError && error.status === 404) {
      return { success: true, exists: false };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "ERPNext quotation verification failed.",
    };
  }
}

export async function createErpnextQuotationFromLead(leadId: string) {
  await requireStaff();

  let payload: Record<string, unknown> | null = null;
  try {
    const lead = await db.query.leads.findFirst({
      where: eq(leads.id, leadId),
    });

    if (!lead) {
      return { success: false, error: "Lead not found." };
    }

    const snapshot = getRecord(lead.configurationSnapshot);
    const existingSync = getRecord(snapshot.erpSync);
    const existingQuotationId = getString(existingSync.erpnextQuotationId ?? existingSync.erpQuotationId);
    if (existingQuotationId) {
      return {
        success: true,
        quotationId: existingQuotationId,
        customerId: getString(existingSync.erpnextCustomerId ?? existingSync.erpCustomerId) || null,
        erpQuotationId: existingQuotationId,
        erpCustomerId: getString(existingSync.erpnextCustomerId ?? existingSync.erpCustomerId) || null,
      };
    }

    const rawItems = extractConfigurationItems(snapshot);
    const productIds = rawItems
      .map((item) => item.productId)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    const productsList = productIds.length ? await getCatalogProductsByIds(productIds) : [];
    const productsById = new Map(productsList.map((product) => [product.id, product]));
    const items = buildErpnextBomItems(snapshot, productsById);
    const totalPrice = getNumber(snapshot.totalPrice ?? snapshot.preliminaryBudget ?? snapshot.estimatedBudget, 0);
    const systemSizeKwp = getNumber(snapshot.systemkWp ?? snapshot.systemSizeKwp ?? snapshot.targetCapacity, 0);
    const panelCount = getNumber(snapshot.panelCount, 0);
    const erpnextItems = items.length > 0
      ? items
      : [await buildLeadFallbackSystemItem({ systemSizeKwp, panelCount, totalPrice })];
    let erpLeadId = getString(existingSync.erpLeadId ?? existingSync.erpnextLeadId);
    if (!erpLeadId) {
      const createdLead = await erpnextRequest("POST", "/api/resource/Lead", {
        data: {
          lead_name: lead.name,
          first_name: lead.name,
          email_id: lead.email || undefined,
          mobile_no: lead.phone || undefined,
          status: "Lead",
          source: "SolarDream CRM",
          notes: buildLeadRemarks(lead),
        },
      });
      erpLeadId = extractErpnextResourceName(createdLead.data) || "";
      if (!erpLeadId) {
        throw new Error("ERPNext did not return a Lead ID.");
      }

      await db.update(leads)
        .set({
          configurationSnapshot: {
            ...snapshot,
            erpSync: {
              ...existingSync,
              status: "ERP_LEAD_CREATED",
              erpLeadId,
              erpnextLeadId: erpLeadId,
              httpStatus: createdLead.status,
              updatedAt: new Date().toISOString(),
            },
          },
          updatedAt: new Date(),
        })
        .where(eq(leads.id, lead.id));
    }
    const customerId = getString(existingSync.erpnextCustomerId ?? existingSync.erpCustomerId);
    const documentNo = getLeadDocumentNo(lead.id);
    const companyName = await getCompanyName();

    const quotationPayload = {
      data: {
        naming_series: "QTN-.YYYY.-",
        title: `${documentNo} ${lead.name}`.trim(),
        // ERPNext uses party_name as the standard Dynamic Link from a
        // quotation to its source CRM record. Quoting the Lead directly
        // allows the lead-to-quotation conversion to happen without waiting
        // for a separate Customer master-data binding.
        party_name: erpLeadId,
        quotation_to: "Lead",
        custom_linked_lead: erpLeadId,
        transaction_date: new Date().toISOString().slice(0, 10),
        valid_till: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        company: companyName,
        currency: "THB",
        selling_price_list: process.env.ERPNEXT_SELLING_PRICE_LIST || "Standard Selling",
        remarks: buildLeadRemarks(lead),
        items: erpnextItems,
      },
    };

    payload = quotationPayload;

    const result = await erpnextRequest("POST", "/api/resource/Quotation", quotationPayload);
    const quotationName = extractErpnextResourceName(result.data);

    if (!quotationName) {
      throw new Error("ERPNext did not return a quotation ID.");
    }

    try {
      await erpnextRequest("PUT", `/api/resource/Lead/${encodeURIComponent(erpLeadId)}`, {
        data: { status: "Quotation" },
      });
    } catch (error) {
      console.warn(`[ERPNext Lead Quotation] quotation ${quotationName} created, but Lead ${erpLeadId} status was not updated:`, error);
    }

    const configurationSnapshot = {
      ...snapshot,
      erpSync: {
        ...existingSync,
        status: "LEAD_QUOTATION_CREATED",
        erpLeadId: erpLeadId || null,
        erpnextLeadId: erpLeadId || null,
        erpnextQuotationId: quotationName,
        erpnextCustomerId: customerId || null,
        erpCustomerId: customerId || null,
        erpQuotationId: quotationName,
        erpnextTitle: documentNo,
        documentNo,
        payloadTitle: documentNo,
        customerAssignmentMode: customerId ? "EXPLICIT_BINDING" : "LEAD_PARTY",
        httpStatus: result.status,
        validationLoopAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };

    await db.update(leads)
      .set({
        status: "QUOTED",
        notes: [
          lead.notes,
          `ERPNext quotation ${quotationName} generated against ERPNext lead ${erpLeadId}.`,
        ].filter(Boolean).join("\n"),
        configurationSnapshot,
        updatedAt: new Date(),
      })
      .where(eq(leads.id, leadId));

    revalidatePath("/admin/crm");
    revalidatePath(`/admin/crm/${leadId}`);
    return {
      success: true,
      quotationId: quotationName,
      customerId: customerId || null,
      erpLeadId,
      erpQuotationId: quotationName,
      erpCustomerId: customerId || null,
    };
  } catch (err: unknown) {
    console.error("[ERPNext Lead Quotation Factory]:", err);
    return {
      success: false,
      error: "Failed to create ERPNext quotation from lead.",
      debugPayload: {
        sentData: payload,
        erpResponse: "ERPNext quotation creation failed. Check server logs for provider response details.",
      },
    };
  }
}

export async function createErpnextQuotationForMember(proposalId: string) {
  return createErpnextQuotationCore(proposalId);
}

async function createErpnextQuotationCore(proposalId: string) {
  let payload: Record<string, unknown> | null = null;
  try {
    const proposal = await db.query.proposals.findFirst({
      where: eq(proposals.id, proposalId),
      with: {
        user: true,
      },
    });

    if (!proposal) {
      return { success: false, error: "Proposal not found." };
    }

    payload = {
      action: "getOrCreateErpnextCustomerForUser",
      proposalId,
      userId: proposal.userId,
    };

    const rawItems = extractConfigurationItems(proposal.configurationData);
    const productIds = rawItems
      .map((item) => item.productId)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    const productsList = productIds.length ? await getCatalogProductsByIds(productIds) : [];
    const productsById = new Map(productsList.map((product) => [product.id, product]));
    const items = buildErpnextBomItems(proposal.configurationData, productsById);
    const erpnextItems = items.length > 0
      ? items
      : [await buildLeadFallbackSystemItem({
          systemSizeKwp: proposal.systemSizeKwp || 0,
          panelCount: proposal.panelCount || 0,
          totalPrice: proposal.totalPrice || 0,
        })];
    const erpLeadId = await ensureErpLeadForConsultation(proposal.wizardLeadId);
    const customerId = proposal.erpnextCustomerId?.trim() || "";
    if (!customerId) {
      return {
        success: false,
        error: "Bind an ERPNext customer before generating the quotation.",
      };
    }
    const documentNo = getQuotationDocumentNo(proposal.id);
    const companyName = await getCompanyName();

    const config = ((proposal.configurationData as Record<string, unknown>) || {});
    const quotationPayload = {
      data: {
        naming_series: "QTN-.YYYY.-",
        title: documentNo,
        party_name: customerId,
        customer: customerId,
        quotation_to: "Customer",
        transaction_date: new Date().toISOString().slice(0, 10),
        valid_till: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        company: companyName,
        currency: "THB",
        selling_price_list: process.env.ERPNEXT_SELLING_PRICE_LIST || "Standard Selling",
        custom_solardream_proposal_id: proposal.id,
        custom_solardream_document_no: documentNo,
        custom_target_system_size: proposal.systemSizeKwp,
        custom_predicted_monthly_savings: typeof config.monthlySavings === "number" ? config.monthlySavings : undefined,
        custom_frontend_configuration_json: JSON.stringify(config),
        items: erpnextItems,
      },
    };

    payload = quotationPayload;

    const result = await erpnextRequest("POST", "/api/resource/Quotation", quotationPayload);
    const quotationName = extractErpnextResourceName(result.data);

    if (!quotationName) {
      throw new Error("ERPNext did not return a quotation ID.");
    }

    const configurationData = {
      ...((proposal.configurationData as Record<string, unknown>) || {}),
      erpSync: {
        status: "QUOTATION_CREATED",
        erpLeadId: erpLeadId || null,
        erpnextLeadId: erpLeadId || null,
        erpnextQuotationId: quotationName,
        erpnextCustomerId: customerId || null,
        erpCustomerId: customerId || null,
        erpQuotationId: quotationName,
        erpnextTitle: documentNo,
        documentNo,
        payloadTitle: documentNo,
        httpStatus: result.status,
        validationLoopAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };

    await db.update(proposals)
      .set({
        erpnextCustomerId: customerId || null,
        erpnextQuotationId: quotationName,
        status: proposal.status === "DRAFT" ? "SENT" : proposal.status,
        configurationData,
      })
      .where(eq(proposals.id, proposalId));

    revalidatePath("/admin/crm");
    revalidatePath(`/admin/crm/${proposalId}`);
    revalidatePath("/proposals");
    return {
      success: true,
      quotationId: quotationName,
      customerId: customerId || null,
      erpLeadId: erpLeadId || null,
      erpQuotationId: quotationName,
      erpCustomerId: customerId || null,
    };
  } catch (err: unknown) {
    console.error("[ERPNext Quotation Factory]:", err);
    return {
      success: false,
      error: "Failed to create ERPNext quotation.",
      debugPayload: {
        sentData: payload,
        erpResponse: "ERPNext quotation creation failed. Check server logs for provider response details.",
      },
    };
  }
}
