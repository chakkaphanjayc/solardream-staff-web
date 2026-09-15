import "server-only";

import { frappeRequest, type ErpnextDocument } from "@/lib/erpnext";

export type ERPNextErrorCategory = "CONFIGURATION" | "NETWORK" | "PROVIDER" | "CONFLICT" | "VALIDATION";

export class ERPNextGatewayError extends Error {
  readonly category: ERPNextErrorCategory;
  readonly providerStatus: number | null;

  constructor(
    category: ERPNextErrorCategory,
    message: string,
    providerStatus: number | null = null,
  ) {
    super(message);
    this.name = "ERPNextGatewayError";
    this.category = category;
    this.providerStatus = providerStatus;
  }
}

export type ERPNextProjectProjection = {
  providerId: string;
  reused: boolean;
};

export type ERPNextTaskProjection = {
  providerId: string;
  reused: boolean;
};

type GatewayMethod = "GET" | "POST" | "PUT";

export type ERPNextPaymentStatus =
  | "UNPAID" | "REQUESTED" | "PENDING" | "PARTIALLY_PAID"
  | "PAID" | "CANCELLED" | "FAILED";

export type ERPNextNormalizedDocument = {
  providerId: string;
  status: string | null;
  raw: ErpnextDocument;
};

function asRecord(value: unknown): ErpnextDocument {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as ErpnextDocument
    : {};
}

function getText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function getNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function extractDocument(value: unknown): ErpnextDocument {
  const root = asRecord(value);
  if (root.data && typeof root.data === "object" && !Array.isArray(root.data)) return asRecord(root.data);
  if (root.message && typeof root.message === "object" && !Array.isArray(root.message)) return asRecord(root.message);
  return root;
}

export function normalizeERPNextEnvelope(value: unknown): ERPNextNormalizedDocument | null {
  const raw = extractDocument(value);
  const providerId = getText(raw.name);
  return providerId ? { providerId, status: getText(raw.status) || null, raw } : null;
}

function extractRows(value: unknown): ErpnextDocument[] {
  const root = asRecord(value);
  const rows = Array.isArray(root.data) ? root.data : Array.isArray(value) ? value : [];
  return rows.filter((row): row is ErpnextDocument => Boolean(row) && typeof row === "object" && !Array.isArray(row));
}

function encodeJson(value: unknown) {
  return encodeURIComponent(JSON.stringify(value));
}

function toErpnextDateTime(value: Date) {
  return value.toISOString().slice(0, 19).replace("T", " ");
}

function classifyError(error: unknown): ERPNextGatewayError {
  if (error instanceof ERPNextGatewayError) return error;
  const message = error instanceof Error ? error.message : "ERPNext request failed.";
  const normalized = message.toLowerCase();
  if (normalized.includes("configuration is missing")) {
    return new ERPNextGatewayError("CONFIGURATION", "ERPNext integration is not configured.");
  }
  if (normalized.includes("connection failed") || normalized.includes("aborted") || normalized.includes("timeout")) {
    return new ERPNextGatewayError("NETWORK", "ERPNext could not be reached.");
  }
  const statusMatch = message.match(/status\s+(\d{3})/i);
  const status = statusMatch ? Number(statusMatch[1]) : null;
  return new ERPNextGatewayError(
    status === 409 ? "CONFLICT" : "PROVIDER",
    "ERPNext rejected the synchronization request.",
    status,
  );
}

export class ERPNextGateway {
  isConfigured() {
    return Boolean(
      (process.env.ERPNEXT_URL || process.env.ERPNEXT_BASE_URL)?.trim()
      && process.env.ERPNEXT_API_KEY?.trim()
      && process.env.ERPNEXT_API_SECRET?.trim(),
    );
  }

  private async request(method: GatewayMethod, endpoint: string, body?: unknown) {
    try {
      return await frappeRequest(method, endpoint, body);
    } catch (error: unknown) {
      throw classifyError(error);
    }
  }

  /** Compatibility escape hatch for legacy adapters. New code should use normalized operations. */
  async compatibilityRequest(method: GatewayMethod, endpoint: string, body?: unknown) {
    return frappeRequest(method, endpoint, body);
  }

  /** Runs a legacy settings-backed transport through the facade without changing its error contract. */
  async compatibilityRequestUsing<T>(operation: () => Promise<T>): Promise<T> {
    return operation();
  }

  private normalized(value: unknown): ERPNextNormalizedDocument | null {
    return normalizeERPNextEnvelope(value);
  }

  async getAddress(providerId: string) {
    return this.normalized(await this.getDocument("Address", getText(providerId)));
  }

  async listCatalogItems(input: { itemCodes?: string[]; limit?: number } = {}) {
    const filters: unknown[][] = [["Item", "disabled", "=", 0]];
    const itemCodes = (input.itemCodes || []).map(getText).filter(Boolean);
    if (itemCodes.length) filters.push(["Item", "item_code", "in", itemCodes]);
    return this.listResource("Item", ["name", "item_code", "item_name", "item_group", "brand", "image", "description"], filters, input.limit ?? 1000);
  }

  async getSellingPrices(itemCodes: string[], priceList = "Standard Selling") {
    const codes = itemCodes.map(getText).filter(Boolean);
    if (!codes.length) return [];
    return this.listResource("Item Price", ["name", "item_code", "price_list_rate", "currency", "valid_from", "valid_upto"], [
      ["Item Price", "price_list", "=", getText(priceList) || "Standard Selling"],
      ["Item Price", "item_code", "in", codes],
    ], 1000);
  }

  async listBundles(limit = 1000) {
    return this.listResource("Product Bundle", ["name", "new_item_code", "description", "items"], [], limit);
  }

  async getQuotation(providerId: string) {
    return this.normalized(await this.getDocument("Quotation", getText(providerId)));
  }

  quotationPdfPath(providerId: string, format?: string) {
    const id = getText(providerId);
    if (!id) throw new ERPNextGatewayError("VALIDATION", "An ERPNext Quotation identifier is required.");
    const query = new URLSearchParams({ doctype: "Quotation", name: id, no_letterhead: "0" });
    if (getText(format)) query.set("format", getText(format));
    return `/api/method/frappe.utils.print_format.download_pdf?${query.toString()}`;
  }

  async getSalesOrder(providerId: string) {
    return this.normalized(await this.getDocument("Sales Order", getText(providerId)));
  }

  async getPaymentTerms(templateId: string) {
    return this.normalized(await this.getDocument("Payment Terms Template", getText(templateId)));
  }

  async getPaymentRequest(providerId: string) {
    return this.normalized(await this.getDocument("Payment Request", getText(providerId)));
  }

  async createPaymentRequest(data: ErpnextDocument) {
    const result = await this.request("POST", "/api/resource/Payment%20Request", { data });
    const normalized = this.normalized(result.data);
    if (!normalized) throw new ERPNextGatewayError("PROVIDER", "ERPNext did not return a Payment Request identifier.");
    return normalized;
  }

  normalizePaymentStatus(value: unknown): ERPNextPaymentStatus {
    const status = getText(value).toLowerCase();
    if (status.includes("partial")) return "PARTIALLY_PAID";
    if (status === "paid" || status === "completed") return "PAID";
    if (status.includes("cancel")) return "CANCELLED";
    if (status.includes("fail")) return "FAILED";
    if (status.includes("request")) return "REQUESTED";
    if (status.includes("pending") || status.includes("initiated")) return "PENDING";
    return "UNPAID";
  }

  private async findByExternalKey(
    doctype: string,
    field: string,
    value: string,
    additionalFilters: readonly unknown[][] = [],
  ): Promise<ErpnextDocument | null> {
    if (!doctype.trim() || !field.trim() || !value.trim()) {
      throw new ERPNextGatewayError("VALIDATION", "ERPNext external lookup is incomplete.");
    }
    const result = await this.request(
      "GET",
      "/api/resource/" + encodeURIComponent(doctype)
        + "?fields=" + encodeJson(["name"])
        + "&filters=" + encodeJson([[doctype, field, "=", value], ...additionalFilters])
        + "&limit_page_length=2",
    );
    const rows = extractRows(result.data);
    if (rows.length > 1) {
      throw new ERPNextGatewayError(
        "CONFLICT",
        "ERPNext returned duplicate " + doctype + " records for the external key.",
      );
    }
    return rows[0] || null;
  }

  private async findByFieldContains(
    doctype: string,
    field: string,
    value: string,
  ): Promise<ErpnextDocument | null> {
    if (!doctype.trim() || !field.trim() || !value.trim()) {
      throw new ERPNextGatewayError("VALIDATION", "ERPNext marker lookup is incomplete.");
    }
    const result = await this.request(
      "GET",
      "/api/resource/" + encodeURIComponent(doctype)
        + "?fields=" + encodeJson(["name"])
        + "&filters=" + encodeJson([[doctype, field, "like", "%" + value + "%"]])
        + "&limit_page_length=2",
    );
    const rows = extractRows(result.data);
    if (rows.length > 1) {
      throw new ERPNextGatewayError(
        "CONFLICT",
        "ERPNext returned duplicate " + doctype + " records for the idempotency marker.",
      );
    }
    return rows[0] || null;
  }

  private async getDocument(doctype: string, providerId: string) {
    if (!doctype.trim() || !providerId.trim()) {
      throw new ERPNextGatewayError("VALIDATION", "ERPNext document lookup is incomplete.");
    }
    try {
      const result = await this.request(
        "GET",
        "/api/resource/" + encodeURIComponent(doctype) + "/" + encodeURIComponent(providerId),
      );
      return extractDocument(result.data);
    } catch (error: unknown) {
      if (error instanceof ERPNextGatewayError && error.providerStatus === 404) return null;
      throw error;
    }
  }

  private async listResource(
    doctype: string,
    fields: readonly string[],
    filters: readonly unknown[][] = [],
    limit = 100,
  ) {
    const endpoint = "/api/resource/" + encodeURIComponent(doctype)
      + "?fields=" + encodeJson(fields)
      + (filters.length > 0 ? "&filters=" + encodeJson(filters) : "")
      + "&limit_page_length=" + String(Math.min(1000, Math.max(1, limit)));
    const result = await this.request("GET", endpoint);
    return extractRows(result.data);
  }

  /** Reads the provider customer record without exposing Frappe details to callers. */
  async getCustomer(input: {
    providerId?: string | null;
    email?: string | null;
    phone?: string | null;
    name?: string | null;
  }) {
    const providerId = getText(input.providerId);
    if (providerId) return this.getDocument("Customer", providerId);
    const identities = [
      ["email_id", getText(input.email).toLowerCase()],
      ["mobile_no", getText(input.phone)],
      ["customer_name", getText(input.name)],
    ] as const;
    for (const [field, value] of identities) {
      if (!value) continue;
      const match = await this.findByExternalKey("Customer", field, value);
      const name = getText(match?.name);
      if (name) return this.getDocument("Customer", name);
    }
    return null;
  }

  /** Reads one ERPNext Item by its stable item code. */
  async getItem(itemCode: string) {
    const code = getText(itemCode);
    if (!code) throw new ERPNextGatewayError("VALIDATION", "An ERPNext item code is required.");
    const direct = await this.getDocument("Item", code);
    if (direct) return direct;
    const match = await this.findByExternalKey("Item", "item_code", code);
    const providerId = getText(match?.name);
    return providerId ? this.getDocument("Item", providerId) : null;
  }

  /** Looks up an ERPNext Serial No record by serial number. */
  async getSerialNumber(serialNumber: string) {
    const serial = getText(serialNumber);
    if (!serial) throw new ERPNextGatewayError("VALIDATION", "A serial number is required.");
    const doctype = process.env.ERPNEXT_SERIAL_DOCTYPE?.trim() || "Serial No";
    const direct = await this.getDocument(doctype, serial);
    if (direct) return direct;
    const match = await this.findByExternalKey(doctype, "serial_no", serial);
    const providerId = getText(match?.name);
    return providerId ? this.getDocument(doctype, providerId) : null;
  }

  /** Returns stock quantities from ERPNext's Bin records for an item. */
  async getStock(input: { itemCode: string; warehouse?: string | null }) {
    const itemCode = getText(input.itemCode);
    if (!itemCode) throw new ERPNextGatewayError("VALIDATION", "An item code is required for stock lookup.");
    const filters: unknown[][] = [["Bin", "item_code", "=", itemCode]];
    const warehouse = getText(input.warehouse);
    if (warehouse) filters.push(["Bin", "warehouse", "=", warehouse]);
    const rows = await this.listResource(
      "Bin",
      ["name", "item_code", "warehouse", "actual_qty", "projected_qty", "reserved_qty"],
      filters,
      200,
    );
    return rows.map((row) => ({
      providerId: getText(row.name),
      itemCode: getText(row.item_code) || itemCode,
      warehouse: getText(row.warehouse),
      actualQuantity: getNumber(row.actual_qty),
      projectedQuantity: getNumber(row.projected_qty),
      reservedQuantity: getNumber(row.reserved_qty),
    }));
  }

  /** Finds submitted Delivery Notes, optionally scoped to a Sales Order/item. */
  async getDelivery(input: { salesOrderId?: string | null; itemCode?: string | null } = {}) {
    const filters: unknown[][] = [["Delivery Note", "docstatus", "=", 1]];
    const salesOrderId = getText(input.salesOrderId);
    const itemCode = getText(input.itemCode);
    if (salesOrderId) filters.push(["Delivery Note Item", "against_sales_order", "=", salesOrderId]);
    if (itemCode) filters.push(["Delivery Note Item", "item_code", "=", itemCode]);
    return this.listResource(
      "Delivery Note",
      ["name", "posting_date", "customer", "status", "docstatus"],
      filters,
      100,
    );
  }

  async getEmployeeForUser(input: { email: string }) {
    const email = getText(input.email).toLowerCase();
    if (!email) throw new ERPNextGatewayError("VALIDATION", "A technician email is required for Employee lookup.");
    const match = await this.findByExternalKey("Employee", "user_id", email);
    const providerId = getText(match?.name);
    if (!providerId) return null;
    const employee = await this.getDocument("Employee", providerId);
    if (!employee) return null;
    const status = getText(employee.status).toLowerCase();
    if (status && status !== "active") return null;
    return {
      id: providerId,
      name: getText(employee.employee_name) || providerId,
      company: getText(employee.company) || getText(process.env.ERPNEXT_COMPANY_NAME) || null,
    };
  }

  async createTimesheet(input: {
    employeeId: string;
    employeeName?: string | null;
    projectId: string;
    taskId: string;
    startedAt: Date;
    technicianEmail: string;
    idempotencyKey: string;
  }) {
    if (!input.employeeId.trim() || !input.projectId.trim() || !input.taskId.trim() || !input.idempotencyKey.trim()) {
      throw new ERPNextGatewayError("VALIDATION", "ERPNext Timesheet linkage is incomplete.");
    }
    const marker = "SolarDream technician job start | idempotency=" + input.idempotencyKey.trim();
    const existing = await this.listResource("Timesheet", ["name", "docstatus", "employee", "time_logs", "user_remark"], [["Timesheet", "user_remark", "=", marker]], 2);
    const existingId = getText(existing[0]?.name);
    if (existingId) return { id: existingId, document: existing[0], reused: true };

    const created = await this.request("POST", "/api/resource/Timesheet", {
      data: {
        employee: input.employeeId.trim(),
        employee_name: input.employeeName?.trim() || undefined,
        company: getText(process.env.ERPNEXT_COMPANY_NAME) || undefined,
        user_remark: marker,
        start_date: input.startedAt.toISOString().slice(0, 10),
        time_logs: [{
          activity_type: process.env.ERPNEXT_INSTALLATION_ACTIVITY_TYPE?.trim() || "Installation",
          from_time: toErpnextDateTime(input.startedAt),
          hours: 0,
          project: input.projectId.trim(),
          task: input.taskId.trim(),
          description: "SolarDream technician " + input.technicianEmail.trim().toLowerCase() + " started the installation task.",
        }],
      },
    });
    const document = extractDocument(created.data);
    const id = getText(document.name);
    if (!id) throw new ERPNextGatewayError("PROVIDER", "ERPNext did not return a Timesheet identifier.");
    return { id, document, reused: false };
  }

  async completeTimesheet(input: { timesheetId: string; completedAt: Date }) {
    const timesheetId = getText(input.timesheetId);
    if (!timesheetId) throw new ERPNextGatewayError("VALIDATION", "A Timesheet identifier is required.");
    const current = await this.getDocument("Timesheet", timesheetId);
    if (!current) throw new ERPNextGatewayError("CONFLICT", "The ERPNext Timesheet was not found.", 404);
    const currentLogs = Array.isArray(current.time_logs) ? current.time_logs : [];
    const logs = currentLogs.map((value, index) => {
      const log = asRecord(value);
      if (index !== currentLogs.length - 1) return log;
      const fromTime = getText(log.from_time);
      const fromMs = fromTime ? Date.parse(fromTime.includes("T") ? fromTime : fromTime.replace(" ", "T") + "Z") : input.completedAt.getTime();
      const hours = Math.max(0, (input.completedAt.getTime() - (Number.isFinite(fromMs) ? fromMs : input.completedAt.getTime())) / 3_600_000);
      return { ...log, to_time: toErpnextDateTime(input.completedAt), hours: Number(hours.toFixed(4)), completed: 1 };
    });
    if (logs.length === 0) throw new ERPNextGatewayError("VALIDATION", "The ERPNext Timesheet has no time log to close.");
    const updated = await this.request("PUT", "/api/resource/Timesheet/" + encodeURIComponent(timesheetId), { data: { time_logs: logs } });
    const document = extractDocument(updated.data);
    if (getNumber(document.docstatus) !== 1) {
      try {
        await this.request("POST", "/api/method/frappe.client.submit", { doc: JSON.stringify({ doctype: "Timesheet", name: timesheetId }) });
      } catch (error: unknown) {
        const refreshed = await this.getDocument("Timesheet", timesheetId);
        if (!refreshed || getNumber(refreshed.docstatus) !== 1) throw error;
      }
    }
    return { id: timesheetId };
  }

  async updateTaskStatus(input: { taskId: string; status: "Working" | "Completed"; progress: number }) {
    if (!input.taskId.trim() || !Number.isFinite(input.progress) || input.progress < 0 || input.progress > 100) {
      throw new ERPNextGatewayError("VALIDATION", "ERPNext Task status is invalid.");
    }
    const result = await this.request("PUT", "/api/resource/Task/" + encodeURIComponent(input.taskId.trim()), {
      data: { status: input.status, progress: input.progress },
    });
    return extractDocument(result.data);
  }

  async upsertInstallationProject(input: {
    projectCode: string;
    proposalId: string;
    title: string;
    customerId?: string | null;
    quotationId?: string | null;
    expectedStartDate?: string | null;
    existingProviderId?: string | null;
  }): Promise<ERPNextProjectProjection> {
    if (!input.projectCode.trim() || !input.proposalId.trim() || !input.title.trim()) {
      throw new ERPNextGatewayError("VALIDATION", "ERPNext project projection is incomplete.");
    }
    const payload = {
      project_name: input.title.trim(),
      status: "Open",
      customer: input.customerId?.trim() || undefined,
      custom_solardream_proposal_id: input.proposalId.trim(),
      custom_solardream_project_code: input.projectCode.trim(),
      custom_quotation_id: input.quotationId?.trim() || undefined,
      expected_start_date: input.expectedStartDate?.trim() || undefined,
    };
    let providerId = input.existingProviderId?.trim() || "";
    if (!providerId) {
      const existing = await this.findByExternalKey("Project", "custom_solardream_project_code", input.projectCode);
      providerId = getText(existing?.name);
    }
    if (providerId) {
      await this.request("PUT", "/api/resource/Project/" + encodeURIComponent(providerId), { data: payload });
      return { providerId, reused: true };
    }
    const created = await this.request("POST", "/api/resource/Project", { data: payload });
    const createdDocument = extractDocument(created.data);
    providerId = getText(createdDocument.name);
    if (!providerId) throw new ERPNextGatewayError("PROVIDER", "ERPNext did not return a Project identifier.");
    return { providerId, reused: false };
  }

  async upsertInstallationTask(input: {
    taskCode: string;
    title: string;
    projectProviderId: string;
    proposalId: string;
    quotationId?: string | null;
    dependencyProviderId?: string | null;
    existingProviderId?: string | null;
    completed?: boolean;
    checklist?: Array<{ itemCode: string; label: string; evidenceRequired: boolean }>;
  }): Promise<ERPNextTaskProjection> {
    if (!input.taskCode.trim() || !input.title.trim() || !input.projectProviderId.trim() || !input.proposalId.trim()) {
      throw new ERPNextGatewayError("VALIDATION", "ERPNext task projection is incomplete.");
    }
    const payload = {
      subject: input.title.trim(),
      project: input.projectProviderId.trim(),
      status: input.completed ? "Completed" : "Open",
      custom_solardream_proposal_id: input.proposalId.trim(),
      custom_solardream_task_code: input.taskCode.trim(),
      custom_quotation_id: input.quotationId?.trim() || undefined,
      depends_on: input.dependencyProviderId ? [{ task: input.dependencyProviderId }] : [],
      custom_installation_checklist: input.checklist?.map((item) => ({
        item_code: item.itemCode,
        label: item.label,
        evidence_required: item.evidenceRequired ? 1 : 0,
      })),
    };
    let providerId = input.existingProviderId?.trim() || "";
    if (!providerId) {
      const existing = await this.findByExternalKey(
        "Task",
        "custom_solardream_task_code",
        input.taskCode,
        [["Task", "project", "=", input.projectProviderId]],
      );
      providerId = getText(existing?.name);
    }
    if (providerId) {
      await this.request("PUT", "/api/resource/Task/" + encodeURIComponent(providerId), { data: payload });
      return { providerId, reused: true };
    }
    const created = await this.request("POST", "/api/resource/Task", { data: payload });
    const createdDocument = extractDocument(created.data);
    providerId = getText(createdDocument.name);
    if (!providerId) throw new ERPNextGatewayError("PROVIDER", "ERPNext did not return a Task identifier.");
    return { providerId, reused: false };
  }

  async appendTaskComment(input: { taskProviderId: string; eventId: string; content: string }) {
    if (!input.taskProviderId.trim() || !input.eventId.trim() || !input.content.trim()) {
      throw new ERPNextGatewayError("VALIDATION", "ERPNext comment linkage is incomplete.");
    }
    const marker = "[SolarDream-Event:" + input.eventId + "]";
    const fields = encodeJson(["name"]);
    const filters = encodeJson([
      ["Comment", "reference_doctype", "=", "Task"],
      ["Comment", "reference_name", "=", input.taskProviderId.trim()],
      ["Comment", "content", "like", "%" + input.eventId + "%"],
    ]);
    const existing = await this.request(
      "GET",
      "/api/resource/Comment?fields=" + fields + "&filters=" + filters + "&limit_page_length=1",
    );
    if (extractRows(existing.data).length > 0) return { reused: true };
    await this.request("POST", "/api/resource/Comment", {
      comment_type: "Comment",
      reference_doctype: "Task",
      reference_name: input.taskProviderId.trim(),
      content: marker + "\n" + input.content.trim(),
    });
    return { reused: false };
  }

  async upsertInstalledAsset(input: {
    serialNumber: string;
    productName: string;
    projectCode: string;
    existingProviderId?: string | null;
  }) {
    if (!input.serialNumber.trim() || !input.productName.trim() || !input.projectCode.trim()) {
      throw new ERPNextGatewayError("VALIDATION", "ERPNext asset projection is incomplete.");
    }
    const doctype = process.env.ERPNEXT_SERIAL_DOCTYPE?.trim() || "Serial No";
    let providerId = input.existingProviderId?.trim() || "";
    if (!providerId) {
      const existing = await this.findByExternalKey(doctype, "serial_no", input.serialNumber);
      providerId = getText(existing?.name);
    }
    if (providerId) return { providerId, reused: true };
    const created = await this.request("POST", "/api/resource/" + encodeURIComponent(doctype), {
      data: {
        serial_no: input.serialNumber.trim(),
        custom_solardream_project_code: input.projectCode.trim(),
        description: input.productName.trim(),
      },
    });
    providerId = getText(extractDocument(created.data).name);
    if (!providerId) throw new ERPNextGatewayError("PROVIDER", "ERPNext did not return a serial identifier.");
    return { providerId, reused: false };
  }

  async registerSerial(input: {
    serialNumber: string;
    itemCode?: string | null;
    productName: string;
    customerId?: string | null;
    projectCode?: string | null;
    warrantyExpiryDate?: string | null;
    existingProviderId?: string | null;
  }) {
    const serialNumber = getText(input.serialNumber);
    const productName = getText(input.productName);
    if (!serialNumber || !productName) throw new ERPNextGatewayError("VALIDATION", "ERPNext serial registration is incomplete.");
    const doctype = process.env.ERPNEXT_SERIAL_DOCTYPE?.trim() || "Serial No";
    let providerId = getText(input.existingProviderId);
    if (!providerId) {
      const existing = await this.getSerialNumber(serialNumber);
      providerId = getText(existing?.name) || getText(existing?.serial_no);
    }
    const data = {
      serial_no: serialNumber,
      item_code: getText(input.itemCode) || undefined,
      customer: getText(input.customerId) || undefined,
      custom_solardream_project_code: getText(input.projectCode) || undefined,
      warranty_expiry_date: getText(input.warrantyExpiryDate) || undefined,
      description: productName,
    };
    if (providerId) {
      await this.request("PUT", "/api/resource/" + encodeURIComponent(doctype) + "/" + encodeURIComponent(providerId), { data });
      return { providerId, reused: true };
    }
    const created = await this.request("POST", "/api/resource/" + encodeURIComponent(doctype), { data });
    providerId = getText(extractDocument(created.data).name);
    if (!providerId) throw new ERPNextGatewayError("PROVIDER", "ERPNext did not return a serial identifier.");
    return { providerId, reused: false };
  }

  async createWarrantyClaim(input: {
    customerId?: string | null;
    serialNumber?: string | null;
    itemCode?: string | null;
    description: string;
    idempotencyKey: string;
  }) {
    const description = getText(input.description);
    const idempotencyKey = getText(input.idempotencyKey);
    if (!description || !idempotencyKey) throw new ERPNextGatewayError("VALIDATION", "ERPNext Warranty Claim data is incomplete.");
    const doctype = process.env.ERPNEXT_WARRANTY_CLAIM_DOCTYPE?.trim() || "Warranty Claim";
    const marker = "SolarDream service case | idempotency=" + idempotencyKey;
    const existing = await this.findByFieldContains(doctype, "description", marker);
    const existingId = getText(existing?.name);
    if (existingId) return { providerId: existingId, reused: true };
    const created = await this.request("POST", "/api/resource/" + encodeURIComponent(doctype), {
      data: {
        customer: getText(input.customerId) || undefined,
        serial_no: getText(input.serialNumber) || undefined,
        item_code: getText(input.itemCode) || undefined,
        claim_date: new Date().toISOString().slice(0, 10),
        status: "Open",
        description: marker + "\n" + description,
      },
    });
    const providerId = getText(extractDocument(created.data).name);
    if (!providerId) throw new ERPNextGatewayError("PROVIDER", "ERPNext did not return a Warranty Claim identifier.");
    return { providerId, reused: false };
  }

  async updateWarrantyClaim(input: { providerId: string; status: string }) {
    const providerId = getText(input.providerId);
    const status = getText(input.status);
    if (!providerId || !status) throw new ERPNextGatewayError("VALIDATION", "ERPNext Warranty Claim update is incomplete.");
    const result = await this.request(
      "PUT",
      "/api/resource/" + encodeURIComponent(process.env.ERPNEXT_WARRANTY_CLAIM_DOCTYPE?.trim() || "Warranty Claim") + "/" + encodeURIComponent(providerId),
      { data: { status } },
    );
    return extractDocument(result.data);
  }

  async createMaintenanceVisit(input: {
    customerId?: string | null;
    serialNumber?: string | null;
    itemCode?: string | null;
    scheduledDate?: string | null;
    description: string;
    idempotencyKey: string;
  }) {
    const description = getText(input.description);
    const idempotencyKey = getText(input.idempotencyKey);
    if (!description || !idempotencyKey) throw new ERPNextGatewayError("VALIDATION", "ERPNext Maintenance Visit data is incomplete.");
    const doctype = process.env.ERPNEXT_MAINTENANCE_VISIT_DOCTYPE?.trim() || "Maintenance Visit";
    const marker = "SolarDream service visit | idempotency=" + idempotencyKey;
    const existing = await this.findByFieldContains(doctype, "work_details", marker);
    const existingId = getText(existing?.name);
    if (existingId) return { providerId: existingId, reused: true };
    const created = await this.request("POST", "/api/resource/" + encodeURIComponent(doctype), {
      data: {
        customer: getText(input.customerId) || undefined,
        serial_no: getText(input.serialNumber) || undefined,
        item_code: getText(input.itemCode) || undefined,
        planned_date: getText(input.scheduledDate) || undefined,
        work_details: marker + "\n" + description,
      },
    });
    const providerId = getText(extractDocument(created.data).name);
    if (!providerId) throw new ERPNextGatewayError("PROVIDER", "ERPNext did not return a Maintenance Visit identifier.");
    return { providerId, reused: false };
  }

  async updateMaintenanceVisit(input: { providerId: string; status?: string; scheduledDate?: string | null }) {
    const providerId = getText(input.providerId);
    if (!providerId) throw new ERPNextGatewayError("VALIDATION", "An ERPNext Maintenance Visit identifier is required.");
    const data = {
      status: getText(input.status) || undefined,
      planned_date: getText(input.scheduledDate) || undefined,
    };
    const result = await this.request(
      "PUT",
      "/api/resource/" + encodeURIComponent(process.env.ERPNEXT_MAINTENANCE_VISIT_DOCTYPE?.trim() || "Maintenance Visit") + "/" + encodeURIComponent(providerId),
      { data },
    );
    return extractDocument(result.data);
  }

  async completeProject(projectProviderId: string) {
    const providerId = getText(projectProviderId);
    if (!providerId) throw new ERPNextGatewayError("VALIDATION", "An ERPNext Project identifier is required.");
    const result = await this.request("PUT", "/api/resource/Project/" + encodeURIComponent(providerId), {
      data: { status: "Completed" },
    });
    return extractDocument(result.data);
  }

  private async callInstallationCommand(methodName: string, data: ErpnextDocument) {
    const result = await this.request(
      "POST",
      "/api/method/solardream_installation.api." + methodName,
      data,
    );
    const response = extractDocument(result.data);
    if (Object.keys(response).length === 0) {
      throw new ERPNextGatewayError("PROVIDER", "ERPNext did not return an installation command result.");
    }
    return response;
  }

  async completeInstallationChecklistItem(input: {
    taskId: string;
    itemCode: string;
    outcome: "Pass" | "Fail" | "N/A";
    remarks?: string | null;
    evidenceHash?: string | null;
    evidenceMime?: string | null;
    idempotencyKey: string;
  }) {
    const taskId = getText(input.taskId);
    const itemCode = getText(input.itemCode);
    const idempotencyKey = getText(input.idempotencyKey);
    if (!taskId || !itemCode || !idempotencyKey) {
      throw new ERPNextGatewayError("VALIDATION", "ERPNext checklist command linkage is incomplete.");
    }
    if (input.outcome === "N/A" && !getText(input.remarks)) {
      throw new ERPNextGatewayError("VALIDATION", "ERPNext N/A checklist commands require a reason.");
    }
    return this.callInstallationCommand("complete_checklist_item", {
      task_name: taskId,
      item_code: itemCode,
      outcome: input.outcome,
      remarks: getText(input.remarks) || undefined,
      evidence_hash: getText(input.evidenceHash) || undefined,
      evidence_mime: getText(input.evidenceMime) || undefined,
      idempotency_key: idempotencyKey,
    });
  }

  async completeInstallationTask(input: { taskId: string; idempotencyKey: string }) {
    const taskId = getText(input.taskId);
    const idempotencyKey = getText(input.idempotencyKey);
    if (!taskId || !idempotencyKey) {
      throw new ERPNextGatewayError("VALIDATION", "ERPNext task command linkage is incomplete.");
    }
    return this.callInstallationCommand("complete_task", {
      task_name: taskId,
      idempotency_key: idempotencyKey,
    });
  }

  async reviewInstallationEvidence(input: {
    taskId: string;
    itemCode: string;
    decision: "Approved" | "Rejected";
    reason: string;
    evidenceHash: string;
    idempotencyKey: string;
  }) {
    const taskId = getText(input.taskId);
    const itemCode = getText(input.itemCode);
    const reason = getText(input.reason);
    const evidenceHash = getText(input.evidenceHash);
    const idempotencyKey = getText(input.idempotencyKey);
    if (!taskId || !itemCode || !reason || !evidenceHash || !idempotencyKey) {
      throw new ERPNextGatewayError("VALIDATION", "ERPNext evidence review command is incomplete.");
    }
    return this.callInstallationCommand("review_evidence", {
      task_name: taskId,
      item_code: itemCode,
      decision: input.decision,
      reason,
      evidence_hash: evidenceHash,
      idempotency_key: idempotencyKey,
    });
  }

  async amendInstallationChecklistItem(input: {
    taskId: string;
    itemCode: string;
    newItemCode?: string | null;
    label: string;
    evidenceRequired: boolean;
    allowsNa: boolean;
    reason: string;
    idempotencyKey: string;
  }) {
    const taskId = getText(input.taskId);
    const itemCode = getText(input.itemCode);
    const newItemCode = getText(input.newItemCode);
    const label = getText(input.label);
    const reason = getText(input.reason);
    const idempotencyKey = getText(input.idempotencyKey);
    if (!taskId || !itemCode || !label || !reason || !idempotencyKey) {
      throw new ERPNextGatewayError("VALIDATION", "ERPNext checklist amendment command is incomplete.");
    }
    return this.callInstallationCommand("amend_checklist_item", {
      task_name: taskId,
      item_code: itemCode,
      new_item_code: newItemCode || undefined,
      label,
      evidence_required: input.evidenceRequired ? 1 : 0,
      allows_na: input.allowsNa ? 1 : 0,
      reason,
      idempotency_key: idempotencyKey,
    });
  }

  async ping() {
    const result = await this.request("GET", "/api/method/frappe.auth.get_logged_user");
    return { ok: result.status >= 200 && result.status < 300 };
  }
}

export const erpNextGateway = new ERPNextGateway();
