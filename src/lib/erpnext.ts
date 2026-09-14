import "server-only";

import { db } from "@/db";
import { proposals, operationsTickets, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { broadcastEvent } from "@/lib/sse-publisher";
import { assertNoLegacyPublicErpSecrets } from "@/lib/serverEnv";
import { getCatalogProductsByIds, type ErpnextCatalogProduct } from "@/lib/erpnextCatalog";

export type ErpnextDocument = Record<string, unknown>;
type JsonRecord = ErpnextDocument;
type ErpnextRequestResult = {
  status: number;
  data: unknown;
};
type UserRow = typeof users.$inferSelect;
type OperationTicketRow = typeof operationsTickets.$inferSelect;

type QuotationItemInput = {
  productId?: unknown;
  itemCode?: unknown;
  item_code?: unknown;
  erpItemCode?: unknown;
  erp_item_code?: unknown;
  unitPrice?: unknown;
  quantity?: unknown;
  totalPrice?: unknown;
  productName?: unknown;
  name?: unknown;
  brand?: unknown;
  model?: unknown;
};

const ERP_BASE_URL = (
  process.env.ERPNEXT_URL ||
  process.env.ERPNEXT_BASE_URL ||
  ""
).replace(/\/$/, "");
const ERP_AUTH_HEADER = process.env.ERPNEXT_API_KEY && process.env.ERPNEXT_API_SECRET
  ? `token ${process.env.ERPNEXT_API_KEY}:${process.env.ERPNEXT_API_SECRET}`
  : null;
const ERP_REQUEST_TIMEOUT_MS = 12000;
const MAX_ERP_ERROR_BODY_CHARS = 12_000;

function buildErpnextUrl(endpoint: string) {
  if (!endpoint.startsWith("/api/")) {
    throw new Error("ERPNext endpoint must be an internal Frappe API path.");
  }
  return new URL(endpoint, `${ERP_BASE_URL}/`).toString();
}

export function getQuotationDocumentNo(proposalId: string) {
  return `QT-${proposalId.slice(0, 8).toUpperCase()}`;
}

function getCommonHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: ERP_AUTH_HEADER || "",
  };
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function getText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function getNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildAlertPrefix(entity: string, id: string) {
  return `[ERPNext Sync] ${entity} ${id}`;
}

export async function frappeRequest(method: "GET" | "POST" | "PUT", endpoint: string, body?: unknown): Promise<ErpnextRequestResult> {
  assertNoLegacyPublicErpSecrets();
  if (!ERP_BASE_URL || !ERP_AUTH_HEADER) {
    throw new Error("ERPNext configuration is missing. Set ERPNEXT_BASE_URL, ERPNEXT_API_KEY and ERPNEXT_API_SECRET.");
  }

  const url = buildErpnextUrl(endpoint);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ERP_REQUEST_TIMEOUT_MS);

  try {
    let response;
    try {
      response = await fetch(url, {
        method,
        headers: getCommonHeaders(),
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
      });
    } catch (fetchErr: unknown) {
      throw new Error(`ERPNext connection failed: ${getErrorMessage(fetchErr, "Unknown fetch error")}`);
    }

    if (!response.ok) {
      const errorText = (await response.text().catch(() => ""))
        .slice(0, MAX_ERP_ERROR_BODY_CHARS);
      throw new Error(`ERPNext responded with status ${response.status}: ${errorText || response.statusText}`);
    }

    const json = await response.json().catch(() => ({}));
    return {
      status: response.status,
      data: json,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export type ErpnextFileUploadResult = {
  fileId: string;
  fileUrl: string;
  fileName: string;
};

/**
 * Uploads a server-generated file through Frappe's upload endpoint. The
 * caller owns the authorization decision; this helper never exposes ERPNext
 * credentials to the browser and keeps the document linkage explicit.
 */
export async function uploadErpnextFile(input: {
  fileBuffer: Buffer;
  fileName: string;
  mimeType: string;
  doctype: string;
  docname: string;
  isPrivate?: boolean;
}): Promise<ErpnextFileUploadResult> {
  assertNoLegacyPublicErpSecrets();
  if (!ERP_BASE_URL || !ERP_AUTH_HEADER) {
    throw new Error("ERPNext configuration is missing. Set ERPNEXT_BASE_URL, ERPNEXT_API_KEY and ERPNEXT_API_SECRET.");
  }
  if (!input.fileBuffer.length || !input.fileName.trim() || !input.doctype.trim() || !input.docname.trim()) {
    throw new Error("ERPNext file upload requires a non-empty file and document linkage.");
  }

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(input.fileBuffer)], { type: input.mimeType }), input.fileName);
  form.append("is_private", input.isPrivate === false ? "0" : "1");
  form.append("doctype", input.doctype.trim());
  form.append("docname", input.docname.trim());

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ERP_REQUEST_TIMEOUT_MS);
  try {
    let response: Response;
    try {
      response = await fetch(buildErpnextUrl("/api/method/upload_file"), {
        method: "POST",
        headers: { Authorization: ERP_AUTH_HEADER },
        body: form,
        signal: controller.signal,
      });
    } catch (fetchError: unknown) {
      throw new Error(`ERPNext file upload connection failed: ${getErrorMessage(fetchError, "Unknown fetch error")}`);
    }
    if (!response.ok) {
      const errorText = (await response.text().catch(() => ""))
        .slice(0, MAX_ERP_ERROR_BODY_CHARS);
      throw new Error(`ERPNext file upload responded with status ${response.status}: ${errorText || response.statusText}`);
    }
    const json = await response.json().catch(() => ({}));
    const document = extractErpnextDocument(json);
    const fileId = getText(document.name) || getText(document.file_name);
    const fileUrl = getText(document.file_url) || getText(document.fileUrl);
    const fileName = getText(document.file_name) || getText(document.fileName) || input.fileName;
    if (!fileId && !fileUrl) throw new Error("ERPNext did not return an uploaded file reference.");
    return { fileId: fileId || fileUrl, fileUrl: fileUrl || fileId, fileName };
  } finally {
    clearTimeout(timeout);
  }
}

function extractErpnextDocument(value: unknown): JsonRecord {
  const root = asRecord(value);
  if (root.data && typeof root.data === "object" && !Array.isArray(root.data)) {
    return asRecord(root.data);
  }
  if (root.message && typeof root.message === "object" && !Array.isArray(root.message)) {
    return asRecord(root.message);
  }
  return root;
}

function extractErpnextRows(value: unknown): JsonRecord[] {
  const root = asRecord(value);
  const rows = Array.isArray(root.data) ? root.data : Array.isArray(value) ? value : [];
  return rows.map(asRecord);
}

function encodeErpnextJson(value: unknown) {
  return encodeURIComponent(JSON.stringify(value));
}

export async function getErpnextQuotation(quotationName: string): Promise<ErpnextDocument> {
  const name = getText(quotationName);
  if (!name) throw new Error("ERPNext quotation name is required.");

  const result = await frappeRequest(
    "GET",
    `/api/resource/Quotation/${encodeURIComponent(name)}`,
  );
  const quotation = extractErpnextDocument(result.data);
  if (!getText(quotation.name)) throw new Error(`ERPNext quotation ${name} was not returned.`);
  return quotation;
}

export async function getErpnextSalesOrder(salesOrderName: string): Promise<ErpnextDocument> {
  const name = getText(salesOrderName);
  if (!name) throw new Error("ERPNext Sales Order name is required.");

  const result = await frappeRequest(
    "GET",
    `/api/resource/Sales Order/${encodeURIComponent(name)}`,
  );
  const salesOrder = extractErpnextDocument(result.data);
  if (!getText(salesOrder.name)) throw new Error(`ERPNext Sales Order ${name} was not returned.`);
  return salesOrder;
}

/**
 * ERPNext creates Projects from a submitted Sales Order asynchronously when a
 * Project Template is configured. Keep this helper as a single lookup so
 * callers can choose their own retry and timeout policy.
 */
export async function getProjectBySalesOrder(salesOrderName: string): Promise<ErpnextDocument | null> {
  const name = getText(salesOrderName);
  if (!name) throw new Error("ERPNext Sales Order name is required for Project lookup.");

  const fields = encodeErpnextJson([
    "name",
    "project_name",
    "status",
    "sales_order",
    "customer",
    "expected_start_date",
    "expected_end_date",
  ]);
  const filters = encodeErpnextJson([["Project", "sales_order", "=", name]]);
  const result = await frappeRequest(
    "GET",
    `/api/resource/Project?fields=${fields}&filters=${filters}&limit_page_length=2`,
  );
  const rows = extractErpnextRows(result.data);
  if (rows.length > 1) throw new Error(`ERPNext returned duplicate Projects for Sales Order ${name}.`);
  return rows[0] && getText(rows[0].name) ? rows[0] : null;
}

export async function getErpnextTasksByProject(projectName: string): Promise<ErpnextDocument[]> {
  const name = getText(projectName);
  if (!name) throw new Error("ERPNext Project name is required for Task lookup.");

  const fields = encodeErpnextJson([
    "name",
    "subject",
    "status",
    "progress",
    "priority",
    "exp_start_date",
    "exp_end_date",
    "completed_on",
    "project",
  ]);
  const filters = encodeErpnextJson([["Task", "project", "=", name]]);
  const result = await frappeRequest(
    "GET",
    `/api/resource/Task?fields=${fields}&filters=${filters}&order_by=exp_start_date asc,creation asc&limit_page_length=200`,
  );
  return extractErpnextRows(result.data).filter((row) => Boolean(getText(row.name)));
}

function mapQuotationItemToSalesOrderItem(item: JsonRecord, quotationName: string, index: number): JsonRecord {
  const itemCode = getText(item.item_code) || getText(item.itemCode);
  if (!itemCode) throw new Error(`ERPNext quotation item ${index + 1} is missing item_code.`);

  const quantity = getNumber(item.qty ?? item.quantity, 1);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error(`ERPNext quotation item ${index + 1} has an invalid quantity.`);
  }

  const rate = getNumber(item.rate ?? item.unit_price, 0);
  return {
    item_code: itemCode,
    item_name: getText(item.item_name) || undefined,
    description: getText(item.description) || undefined,
    qty: quantity,
    uom: getText(item.uom) || undefined,
    stock_uom: getText(item.stock_uom) || undefined,
    conversion_factor: getNumber(item.conversion_factor, 1),
    rate,
    amount: getNumber(item.amount, rate * quantity),
    warehouse: getText(item.warehouse) || undefined,
    reference_doctype: "Quotation",
    reference_name: quotationName,
    // These are ERPNext's native previous-document references. The explicit
    // reference_* fields are retained as well for SolarDream custom reports.
    prevdoc_doctype: "Quotation",
    prevdoc_docname: quotationName,
  };
}

export async function createErpnextSalesOrderFromQuotation(quotationName: string): Promise<{
  quotation: ErpnextDocument;
  salesOrder: ErpnextDocument;
  salesOrderName: string;
}> {
  const quotation = await getErpnextQuotation(quotationName);
  const customer = getText(quotation.customer);
  if (!customer) throw new Error(`ERPNext quotation ${quotationName} is missing customer.`);

  const projectTemplate = (
    process.env.DEFAULT_SOLAR_PROJECT_TEMPLATE
    || process.env.ERPNEXT_DEFAULT_PROJECT_TEMPLATE
    || ""
  ).trim();
  if (!projectTemplate) {
    throw new Error("DEFAULT_SOLAR_PROJECT_TEMPLATE is not configured.");
  }

  const rawItems = Array.isArray(quotation.items) ? quotation.items : [];
  if (rawItems.length === 0) throw new Error(`ERPNext quotation ${quotationName} has no items.`);
  const normalizedQuotationName = getText(quotation.name) || quotationName;
  const items = rawItems.map((item, index) => mapQuotationItemToSalesOrderItem(asRecord(item), normalizedQuotationName, index));
  const payload: JsonRecord = {
    customer,
    customer_name: getText(quotation.customer_name) || undefined,
    transaction_date: getText(quotation.transaction_date) || new Date().toISOString().slice(0, 10),
    company: getText(process.env.ERPNEXT_COMPANY_NAME) || undefined,
    project_template: projectTemplate,
    items,
    docstatus: 1,
  };

  const created = await frappeRequest("POST", "/api/resource/Sales Order", { data: payload });
  let salesOrder = extractErpnextDocument(created.data);
  const salesOrderName = getText(salesOrder.name) || extractErpnextName(created);
  if (!salesOrderName) throw new Error("ERPNext did not return a Sales Order ID.");

  if (getNumber(salesOrder.docstatus, 0) !== 1) {
    try {
      const submitted = await frappeRequest("POST", "/api/method/frappe.client.submit", {
        doc: JSON.stringify({ doctype: "Sales Order", name: salesOrderName }),
      });
      salesOrder = extractErpnextDocument(submitted.data);
    } catch (error: unknown) {
      // A docstatus=1 create can race the explicit submit fallback. Treat it
      // as successful only when a fresh ERPNext read confirms submission.
      const refreshed = await getErpnextSalesOrder(salesOrderName);
      if (getNumber(refreshed.docstatus, 0) !== 1) throw error;
      salesOrder = refreshed;
    }
  }

  if (getNumber(salesOrder.docstatus, 0) !== 1) {
    const refreshed = await getErpnextSalesOrder(salesOrderName);
    if (getNumber(refreshed.docstatus, 0) !== 1) {
      throw new Error(`ERPNext Sales Order ${salesOrderName} was created but not submitted.`);
    }
    salesOrder = refreshed;
  }

  return { quotation, salesOrder, salesOrderName };
}

function getConfigText(config: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = config[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function resolveCustomerPayload(user: UserRow, configurationData: unknown) {
  const config = asRecord(configurationData);
  const fullName = user.fullName || user.name || getConfigText(config, ["name", "customerName"]);
  const email = user.email || getConfigText(config, ["email"]);
  const phone = user.phoneNumber || getConfigText(config, ["phone", "phoneNumber", "contactPhoneNumber"]);
  const companyAddress = getConfigText(config, ["companyAddress", "address", "location", "customerAddress"]);

  return {
    customerName: fullName || email || `SolarDream Customer ${user.id || ""}`.trim(),
    email,
    phone,
    companyAddress,
  };
}

function extractErpnextResourceName(value: unknown, depth = 0): string | null {
  // Frappe resource APIs normally return { data: { name } }, while some
  // custom methods return an array or wrap the document in `message`.
  if (depth > 2) return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const name = extractErpnextResourceName(item, depth + 1);
      if (name) return name;
    }
    return null;
  }

  const record = asRecord(value);
  const name = getText(record.name);
  if (name) return name;

  return extractErpnextResourceName(record.data, depth + 1)
    || extractErpnextResourceName(record.message, depth + 1);
}

function extractErpnextName(result: ErpnextRequestResult) {
  return extractErpnextResourceName(result.data);
}

export type ErpnextCustomerMatch = {
  id: string;
  name: string;
  email: string;
  phone: string;
};

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

function normalizeCustomerName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

function extractCustomerMatches(result: ErpnextRequestResult): ErpnextCustomerMatch[] {
  const payload = asRecord(result.data);
  const rows = Array.isArray(result.data)
    ? result.data
    : Array.isArray(payload.data) ? payload.data : [];
  return rows.flatMap((item): ErpnextCustomerMatch[] => {
    const row = asRecord(item);
    const id = getText(row.name);
    if (!id) return [];
    return [{
      id,
      name: getText(row.customer_name) || id,
      email: normalizeEmail(getText(row.email_id)),
      phone: normalizePhone(getText(row.mobile_no)),
    }];
  });
}

export async function lookupErpnextCustomers(input: { email?: string; phone?: string; name?: string }) {
  const email = normalizeEmail(input.email || "");
  const phone = normalizePhone(input.phone || "");
  const name = normalizeCustomerName(input.name || "");
  if (!email && !phone && !name) throw new Error("Customer email, phone, or name is required for ERPNext lookup.");
  const fields = encodeURIComponent(JSON.stringify(["name", "customer_name", "email_id", "mobile_no"]));
  const searches: Promise<ErpnextRequestResult>[] = [];
  if (email) {
    const filters = encodeURIComponent(JSON.stringify([["Customer", "email_id", "=", email]]));
    searches.push(frappeRequest("GET", `/api/resource/Customer?fields=${fields}&filters=${filters}&limit_page_length=20`));
  }
  if (phone) {
    const filters = encodeURIComponent(JSON.stringify([["Customer", "mobile_no", "=", phone]]));
    searches.push(frappeRequest("GET", `/api/resource/Customer?fields=${fields}&filters=${filters}&limit_page_length=20`));
  }
  if (name) {
    const filters = encodeURIComponent(JSON.stringify([["Customer", "customer_name", "=", input.name?.trim() || ""]]));
    searches.push(frappeRequest("GET", `/api/resource/Customer?fields=${fields}&filters=${filters}&limit_page_length=20`));
  }
  const matches = (await Promise.all(searches)).flatMap(extractCustomerMatches);
  const exact = matches.filter((match) =>
    (email && match.email === email) ||
    (phone && match.phone === phone) ||
    (name && normalizeCustomerName(match.name) === name));
  return [...new Map(exact.map((match) => [match.id, match])).values()];
}

export async function attachErpnextCustomerAddress(input: {
  customerId: string;
  customerName: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  email?: string | null;
  phone?: string | null;
}) {
  if (!input.customerId || (!input.address && (!input.latitude || !input.longitude))) return;
  try {
    const addressTitle = `${input.customerName.trim()} Site Location`;
    await frappeRequest("POST", "/api/resource/Address", {
      data: {
        address_title: addressTitle,
        address_type: "Installation",
        address_line1: input.address?.trim() || `GPS: ${input.latitude}, ${input.longitude}`,
        city: "Bangkok",
        country: "Thailand",
        email_id: input.email || undefined,
        phone: input.phone || undefined,
        latitude: input.latitude ?? undefined,
        longitude: input.longitude ?? undefined,
        links: [
          {
            link_doctype: "Customer",
            link_name: input.customerId,
          },
        ],
      },
    });
  } catch (err) {
    console.warn(`Could not attach ERPNext Address for customer ${input.customerId}:`, err);
  }
}

export async function createErpnextCustomerIdempotently(input: {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  latitude?: number | null;
  longitude?: number | null;
  leadName?: string;
}) {
  const matches = await lookupErpnextCustomers({ email: input.email, phone: input.phone });
  if (matches.length > 1) throw new Error("Multiple exact ERPNext customer matches require staff selection.");
  if (matches[0]) {
    if (input.latitude && input.longitude) {
      await attachErpnextCustomerAddress({
        customerId: matches[0].id,
        customerName: input.name,
        address: input.address,
        latitude: input.latitude,
        longitude: input.longitude,
        email: input.email,
        phone: input.phone,
      });
    }
    return { customerId: matches[0].id, created: false };
  }
  const created = await frappeRequest("POST", "/api/resource/Customer", {
    data: {
      customer_name: input.name.trim(),
      customer_type: "Individual",
      customer_group: "Commercial",
      territory: "All Territories",
      email_id: normalizeEmail(input.email || "") || undefined,
      mobile_no: normalizePhone(input.phone || "") || undefined,
      primary_address: input.address?.trim() || undefined,
      lead_name: input.leadName?.trim() || undefined,
    },
  });
  const customerId = extractErpnextName(created);
  if (!customerId) throw new Error("ERPNext did not return a Customer ID.");

  if (input.latitude && input.longitude) {
    await attachErpnextCustomerAddress({
      customerId,
      customerName: input.name,
      address: input.address,
      latitude: input.latitude,
      longitude: input.longitude,
      email: input.email,
      phone: input.phone,
    });
  }

  return { customerId, created: true };
}

export async function bindProposalErpnextCustomer(input: {
  proposalId: string;
  customerId: string;
  actorUserId: string;
  source: string;
}) {
  const [proposal] = await db.update(proposals).set({
    erpnextCustomerId: input.customerId.trim(),
    erpnextCustomerBoundAt: new Date(),
    erpnextCustomerBoundByUserId: input.actorUserId,
    erpnextCustomerBindingSource: input.source,
    updatedAt: new Date(),
  }).where(eq(proposals.id, input.proposalId)).returning();
  if (!proposal) throw new Error("Proposal was not found for ERPNext customer binding.");
  return proposal;
}

export async function getOrCreateErpnextCustomerForUser(
  userId: string,
  configurationData?: unknown,
  location?: { latitude?: number | null; longitude?: number | null; address?: string | null }
) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    throw new Error(`User ${userId} not found for ERPNext customer sync.`);
  }

  if (user.erpnextCustomerId) {
    if (location?.latitude && location?.longitude) {
      await attachErpnextCustomerAddress({
        customerId: user.erpnextCustomerId,
        customerName: user.fullName || user.name || "Customer",
        address: location.address,
        latitude: location.latitude,
        longitude: location.longitude,
        email: user.email,
        phone: user.phoneNumber,
      });
    }
    return user.erpnextCustomerId;
  }

  const customer = resolveCustomerPayload(user, configurationData);
  const filters = customer.email
    ? encodeURIComponent(JSON.stringify([["Customer", "email_id", "=", customer.email]]))
    : encodeURIComponent(JSON.stringify([["Customer", "customer_name", "=", customer.customerName]]));
  const fields = encodeURIComponent(JSON.stringify(["name", "customer_name"]));
  const existing = await frappeRequest(
    "GET",
    `/api/resource/Customer?fields=${fields}&filters=${filters}&limit_page_length=1`
  );
  const existingId = extractErpnextName(existing);

  const erpnextCustomerId = existingId || extractErpnextName(await frappeRequest("POST", "/api/resource/Customer", {
    data: {
      customer_name: user.fullName || customer.customerName,
      customer_type: "Individual",
      customer_group: "Commercial",
      territory: "All Territories",
      email_id: user.email || undefined,
      mobile_no: customer.phone || undefined,
      primary_address: customer.companyAddress || location?.address || undefined,
    },
  }));

  if (!erpnextCustomerId) {
    throw new Error("ERPNext did not return a Customer ID.");
  }

  if (location?.latitude && location?.longitude) {
    await attachErpnextCustomerAddress({
      customerId: erpnextCustomerId,
      customerName: user.fullName || customer.customerName,
      address: location.address,
      latitude: location.latitude,
      longitude: location.longitude,
      email: user.email,
      phone: customer.phone,
    });
  }

  await db.update(users)
    .set({
      erpnextCustomerId,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));

  return erpnextCustomerId;
}

function buildQuotationItems(items: QuotationItemInput[], productsById: Map<string, ErpnextCatalogProduct>) {
  return (items || []).map((item) => {
    const productId = getText(item.productId);
    const product = productId ? productsById.get(productId) : undefined;
    const itemCode = getText(item.item_code)
      || getText(item.itemCode)
      || getText(item.erp_item_code)
      || getText(item.erpItemCode)
      || getText(product?.erpnextItemCode);
    const unitPrice = getNumber(item.unitPrice ?? product?.price, 0);
    const quantity = getNumber(item.quantity, 1);
    const productName = getText(item.productName) || getText(item.name);
    const description = productName || product?.description || "";

    return {
      item_code: itemCode,
      brand: product?.brand || getText(item.brand) || "Unknown Brand",
      model: product?.model || getText(item.model) || productName || "Unknown Model",
      description,
      qty: quantity,
      uom: "Nos",
      stock_uom: "Nos",
      conversion_factor: 1,
      rate: unitPrice,
      amount: getNumber(item.totalPrice, unitPrice * quantity),
      product_id: productId || null,
    };
  });
}

async function ensureDefaultQuotationItemCode() {
  const configuredItemCode = process.env.ERPNEXT_DEFAULT_ITEM_CODE?.trim() || "";
  const itemCode = configuredItemCode || "SOLARDREAM-SOLAR-SYSTEM";
  const fields = encodeURIComponent(JSON.stringify(["name", "item_code"]));
  const filters = encodeURIComponent(JSON.stringify([["Item", "item_code", "=", itemCode]]));
  const existing = await frappeRequest(
    "GET",
    `/api/resource/Item?fields=${fields}&filters=${filters}&limit_page_length=1`,
  );
  const existingRows = asRecord(existing.data).data;
  const existingItem = Array.isArray(existingRows) ? asRecord(existingRows[0]) : asRecord(existing.data);
  const existingCode = getText(existingItem.item_code) || extractErpnextName(existing);
  if (existingCode) return existingCode;

  const created = await frappeRequest("POST", "/api/resource/Item", {
    data: {
      item_code: itemCode,
      item_name: "SolarDream Custom Solar System",
      item_group: process.env.ERPNEXT_DEFAULT_ITEM_GROUP || "Products",
      stock_uom: process.env.ERPNEXT_DEFAULT_UOM || "Nos",
      is_sales_item: 1,
      is_stock_item: 0,
      description: "Generic SolarDream quotation line for website proposals.",
    },
  });
  const createdCode = extractErpnextName(created);
  if (!createdCode) throw new Error(`ERPNext did not return Item Code ${itemCode}.`);
  return createdCode;
}

function getQuotationItemsFromConfig(configurationData: unknown): QuotationItemInput[] {
  const config = asRecord(configurationData);
  return Array.isArray(config.items) ? config.items.map((item) => asRecord(item)) : [];
}

function getErpSyncRecord(value: unknown) {
  return asRecord(asRecord(value).erpSync);
}

async function updateProposalErpSyncState(proposalId: string, status: string, metadata: JsonRecord) {
  const proposal = await db.query.proposals.findFirst({ where: eq(proposals.id, proposalId) });
  if (!proposal) return;

  const configurationData = { ...asRecord(proposal.configurationData) };
  configurationData.erpSync = {
    status,
    updatedAt: new Date().toISOString(),
    ...metadata,
  };

  await db.update(proposals)
    .set({
      configurationData,
    })
    .where(eq(proposals.id, proposalId));
}

async function updateTicketErpSyncState(ticketId: string, status: string, metadata: JsonRecord) {
  const ticket = await db.query.operationsTickets.findFirst({ where: eq(operationsTickets.id, ticketId) });
  if (!ticket) return;

  const formData = { ...asRecord(ticket.formData) };
  formData.erpSync = {
    status,
    updatedAt: new Date().toISOString(),
    ...metadata,
  };

  await db.update(operationsTickets)
    .set({
      formData,
    })
    .where(eq(operationsTickets.id, ticketId));
}

export async function syncProposalQuotationToERP(proposalId: string) {
  const proposal = await db.query.proposals.findFirst({
    where: eq(proposals.id, proposalId),
    with: {
      user: true,
    },
  });

  if (!proposal) {
    throw new Error(`Proposal ${proposalId} not found for ERP sync.`);
  }

  const items = getQuotationItemsFromConfig(proposal.configurationData);
  const productIds = items
    .map((item) => getText(item.productId))
    .filter((id): id is string => id.length > 0);

  const productsList = productIds.length ? await getCatalogProductsByIds(productIds) : [];
  const productsById = new Map(productsList.flatMap((product) => [
    [product.id, product] as const,
    [product.erpnextItemCode, product] as const,
  ]));
  const documentNo = getQuotationDocumentNo(proposal.id);
  const erpnextCustomerId = proposal.erpnextCustomerId?.trim();
  if (!erpnextCustomerId) {
    throw new Error("Proposal requires an explicit ERPNext customer binding before quotation generation.");
  }
  const mappedItems = buildQuotationItems(items, productsById);
  const requiresDefaultItem = mappedItems.length === 0 || mappedItems.some((item) => !item.item_code);
  const defaultItemCode = requiresDefaultItem ? await ensureDefaultQuotationItemCode() : "";
  const quotationItems = mappedItems.length > 0
    ? mappedItems.map((item) => ({ ...item, item_code: item.item_code || defaultItemCode }))
    : [{
        item_code: defaultItemCode,
        item_name: `SolarDream solar system ${proposal.systemSizeKwp || "Custom"} kWp`,
        description: `SolarDream proposal ${documentNo}`,
        qty: 1,
        uom: "Nos",
        stock_uom: "Nos",
        conversion_factor: 1,
        rate: proposal.totalPrice,
        amount: proposal.totalPrice,
      }];

  const payload = {
    title: documentNo,
    customer: erpnextCustomerId,
    customer_name: proposal.user?.name || proposal.user?.email || "Anonymous Customer",
    document_no: documentNo,
    items: quotationItems,
    grand_total: proposal.totalPrice,
    net_total: proposal.totalPrice,
    google_drive_preview_url: proposal.signedDocumentDriveUrl || null,
    quotation_date: new Date().toISOString().slice(0, 10),
    reference_proposal_id: proposal.id,
    erp_sync_status: "VERIFIED_IN_PROGRESS",
  };

  const currentRemoteName = getText(getErpSyncRecord(proposal.configurationData).erpnextName)
    || getText(proposal.erpnextQuotationId);

  if (currentRemoteName) {
    const fields = encodeURIComponent(JSON.stringify(["name", "docstatus", "customer", "customer_name"]));
    const remote = await frappeRequest(
      "GET",
      `/api/resource/Quotation/${encodeURIComponent(currentRemoteName)}?fields=${fields}`,
    );
    const remoteDocument = asRecord(asRecord(remote.data).data);
    if (getNumber(remoteDocument.docstatus, 0) === 1) {
      await updateProposalErpSyncState(proposal.id, "ERP_SUBMITTED_READ_ONLY", {
        erpnextName: currentRemoteName,
        erpnextType: "Quotation",
        erpnextCustomerId: getText(remoteDocument.customer) || erpnextCustomerId,
        erpnextCustomerName: getText(remoteDocument.customer_name),
        erpnextTitle: documentNo,
        documentNo,
        readOnlyReason: "ERPNext quotation is submitted and cannot be changed. Create an amendment in ERPNext for revisions.",
        validationLoopAt: new Date().toISOString(),
      });
      broadcastEvent("QUOTATION_UPDATED", {
        id: proposal.id,
        title: documentNo,
        status: "ERP_SUBMITTED_READ_ONLY",
      });
      return { remoteName: currentRemoteName, result: remote };
    }
  }

  const endpoint = currentRemoteName
    ? `/api/resource/Quotation/${encodeURIComponent(currentRemoteName)}`
    : "/api/resource/Quotation";
  const method = currentRemoteName ? "PUT" : "POST";

  const result = await frappeRequest(method, endpoint, { data: payload });

  const remoteName = extractErpnextName(result) || currentRemoteName;
  await updateProposalErpSyncState(proposal.id, "SYNCED", {
    erpnextName: remoteName,
    erpnextType: "Quotation",
    erpnextCustomerId,
    erpnextTitle: documentNo,
    documentNo,
    payloadTitle: documentNo,
    httpStatus: result.status,
    validationLoopAt: new Date().toISOString(),
  });

  await db.update(proposals)
    .set({ erpnextCustomerId })
    .where(eq(proposals.id, proposal.id));

  broadcastEvent("QUOTATION_UPDATED", {
    id: proposal.id,
    title: documentNo,
    status: "SYNCED",
  });

  return { remoteName, result };
}

export async function syncOperationsTicketToERP(ticket: OperationTicketRow) {
  if (!ticket) {
    throw new Error("Missing ticket payload for ERP sync.");
  }

  const formData = { ...asRecord(ticket.formData) };
  const payload = {
    ticket_number: ticket.ticketNumber,
    document_title: ticket.documentTitle,
    assigned_role: ticket.assignedRole,
    status: ticket.status,
    phase: ticket.phase,
    proposal_id: ticket.proposalId,
    form_data: JSON.stringify(formData),
    ticket_reference: ticket.ticketNumber,
  };

  const erpSync = asRecord(formData.erpSync);
  const existingName = getText(erpSync.erpnextName) || getText(formData.erpnextName);
  const endpoint = existingName
    ? `/api/resource/Operations Ticket/${encodeURIComponent(existingName)}`
    : "/api/resource/Operations Ticket";
  const method = existingName ? "PUT" : "POST";

  const result = await frappeRequest(method, endpoint, { data: payload });
  const remoteName = extractErpnextName(result) || existingName;

  await updateTicketErpSyncState(ticket.id, "SYNCED", {
    erpnextName: remoteName,
    erpnextDocType: "Operations Ticket",
    httpStatus: result.status,
    validationLoopAt: new Date().toISOString(),
  });

  broadcastEvent("PROJECT_STATUS_CHANGED", {
    id: ticket.id,
    title: ticket.documentTitle || ticket.ticketNumber,
    status: ticket.status,
  });

  return { remoteName, result };
}

export async function safeSyncProposalQuotationToERP(proposalId: string) {
  try {
    return await syncProposalQuotationToERP(proposalId);
  } catch (error: unknown) {
    const message = getErrorMessage(error, "Unknown ERPNext sync error");
    console.error(buildAlertPrefix("Proposal", proposalId), "failed to sync ERPNext:", message);
    await updateProposalErpSyncState(proposalId, "SYNC_PENDING_ERP", {
      error: message,
    });
    return null;
  }
}

export async function safeSyncOperationsTicketToERP(ticket: OperationTicketRow) {
  try {
    return await syncOperationsTicketToERP(ticket);
  } catch (error: unknown) {
    const message = getErrorMessage(error, "Unknown ERPNext sync error");
    console.error(buildAlertPrefix("OperationsTicket", ticket?.id || "unknown"), "failed to sync ERPNext:", message);
    await updateTicketErpSyncState(ticket.id, "SYNC_PENDING_ERP", {
      error: message,
    });
    return null;
  }
}

export interface ERPNextLeadPayload {
  [key: string]: unknown;
  first_name: string;
  email_id?: string | null;
  mobile_no?: string | null;
  source?: string;
  notes?: string;
  status?: string;
  company_name?: string | null;
  job_title?: string | null;
  territory?: string | null;
  lead_type?: string | null;
  market_segment?: string | null;
  industry?: string | null;
  address_line1?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  country?: string | null;
  preferred_contact_method?: string | null;
}

function getErpnextCollection(value: unknown): JsonRecord[] {
  const envelope = asRecord(value);
  const rows = Array.isArray(envelope.data) ? envelope.data : Array.isArray(value) ? value : [];
  return rows.map(asRecord);
}

async function findErpnextLeadByIdentity(payload: ERPNextLeadPayload): Promise<{ id: string; data: JsonRecord } | null> {
  const identities = [
    { field: "email_id", value: getText(payload.email_id).toLowerCase() },
    { field: "mobile_no", value: getText(payload.mobile_no) },
  ].filter((identity) => identity.value.length > 0);

  for (const identity of identities) {
    const filters = encodeURIComponent(JSON.stringify([[identity.field, "=", identity.value]]));
    const fields = encodeURIComponent(JSON.stringify(["name", "email_id", "mobile_no", "status"]));
    try {
      const result = await frappeRequest(
        "GET",
        `/api/resource/Lead?filters=${filters}&fields=${fields}&limit_page_length=1`,
      );
      const existing = getErpnextCollection(result.data)[0];
      const id = getText(existing?.name);
      if (id) return { id, data: existing };
    } catch (error) {
      console.warn("[ERPNext] Lead identity lookup skipped:", error);
    }
  }

  return null;
}

function isDuplicateErpnextLeadError(error: unknown) {
  const message = getErrorMessage(error, "");
  return /status 409|DuplicateEntryError|Email Address must be unique/i.test(message);
}

export async function createERPNextLead(payload: ERPNextLeadPayload) {
  try {
    const existingLead = await findErpnextLeadByIdentity(payload);
    if (existingLead) {
      return {
        success: true as const,
        leadId: existingLead.id,
        data: existingLead.data,
        alreadyExists: true as const,
      };
    }

    const leadData: Record<string, unknown> = {
      first_name: payload.first_name,
      lead_name: payload.first_name,
      email_id: payload.email_id || undefined,
      mobile_no: payload.mobile_no || undefined,
      source: payload.source || "Direct",
      status: payload.status || "Lead",
      company_name: payload.company_name || undefined,
      job_title: payload.job_title || undefined,
      territory: payload.territory || undefined,
      // ERPNext's standard Lead DocType names this field `type` and accepts
      // only Individual or Company. SolarDream's broader lead type remains local.
      type: payload.lead_type === "Individual" || payload.lead_type === "Company"
        ? payload.lead_type
        : undefined,
      market_segment: payload.market_segment || undefined,
      industry: payload.industry || undefined,
      address_line1: payload.address_line1 || undefined,
      city: payload.city || undefined,
      state: payload.state || undefined,
      pincode: payload.pincode || undefined,
      country: payload.country || undefined,
    };

    if (payload.notes && payload.notes.trim()) {
      leadData.notes = [{ note: payload.notes.trim() }];
    }

    let res: ErpnextRequestResult;
    try {
      res = await frappeRequest("POST", "/api/resource/Lead", {
        data: leadData,
      });
    } catch (error) {
      // A concurrent submission with the same email can win after the lookup.
      if (!isDuplicateErpnextLeadError(error)) throw error;
      const racedLead = await findErpnextLeadByIdentity(payload);
      if (!racedLead) throw error;
      return {
        success: true as const,
        leadId: racedLead.id,
        data: racedLead.data,
        alreadyExists: true as const,
      };
    }

    const dataRecord = res.data && typeof res.data === "object" && "data" in res.data
      ? asRecord((res.data as { data: unknown }).data)
      : asRecord(res.data);

    const leadId = extractErpnextName(res) || getText(dataRecord.name) || getText(dataRecord.first_name) || null;

    return {
      success: true as const,
      leadId,
      data: dataRecord,
    };
  } catch (error: unknown) {
    console.error("[ERPNext] createERPNextLead error:", error);
    throw new Error(
      error instanceof Error
        ? `Failed to create ERPNext lead: ${error.message}`
        : "Failed to create ERPNext lead due to an unknown error."
    );
  }
}

export async function updateERPNextLead(
  leadId: string,
  updates: {
    status?: string;
    notes?: string;
    email_id?: string | null;
    mobile_no?: string | null;
    first_name?: string;
    organization_name?: string;
    [key: string]: unknown;
  }
) {
  try {
    const data: Record<string, unknown> = {};

    if (updates.status) data.status = updates.status;
    if (updates.first_name) data.first_name = updates.first_name;
    if (updates.email_id) data.email_id = updates.email_id;
    if (updates.mobile_no) data.mobile_no = updates.mobile_no;
    if (updates.organization_name) data.company_name = updates.organization_name;
    if (updates.lead_type === "Individual" || updates.lead_type === "Company") {
      data.type = updates.lead_type;
    }

    for (const [key, val] of Object.entries(updates)) {
      if (![
        "status",
        "first_name",
        "email_id",
        "mobile_no",
        "notes",
        "organization_name",
        "lead_type",
        "preferred_contact_method",
      ].includes(key) && val !== undefined) {
        data[key] = val;
      }
    }

    if (updates.notes && typeof updates.notes === "string" && updates.notes.trim()) {
      data.notes = [{ note: updates.notes.trim() }];
    }

    const res = await frappeRequest("PUT", `/api/resource/Lead/${encodeURIComponent(leadId)}`, {
      data,
    });

    return {
      success: true as const,
      data: res.data,
    };
  } catch (error: unknown) {
    console.error(`[ERPNext] updateERPNextLead error for ${leadId}:`, error);
    throw new Error(
      error instanceof Error
        ? `Failed to update ERPNext lead: ${error.message}`
        : "Failed to update ERPNext lead due to an unknown error."
    );
  }
}
