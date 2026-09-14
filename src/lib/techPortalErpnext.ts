import "server-only";

import { frappeRequest, uploadErpnextFile, type ErpnextDocument } from "@/lib/erpnext";
import type { TechPortalPhaseCode, TechTestValues } from "@/types/techPortal";

type JsonRecord = Record<string, unknown>;

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

function extractDocument(value: unknown): ErpnextDocument {
  const root = asRecord(value);
  if (root.data && typeof root.data === "object" && !Array.isArray(root.data)) return asRecord(root.data);
  if (root.message && typeof root.message === "object" && !Array.isArray(root.message)) return asRecord(root.message);
  return root;
}

function extractRows(value: unknown): JsonRecord[] {
  const root = asRecord(value);
  const rows = Array.isArray(root.data) ? root.data : Array.isArray(value) ? value : [];
  return rows.map(asRecord);
}

function extractName(value: unknown) {
  const document = extractDocument(value);
  return getText(document.name);
}

function encodeJson(value: unknown) {
  return encodeURIComponent(JSON.stringify(value));
}

function toErpnextDateTime(value: Date) {
  return value.toISOString().slice(0, 19).replace("T", " ");
}

function getConfiguredCompany() {
  return process.env.ERPNEXT_COMPANY_NAME?.trim() || undefined;
}

function getInstallationActivityType() {
  const activityType = process.env.ERPNEXT_INSTALLATION_ACTIVITY_TYPE?.trim() || "Installation";
  if (!activityType) throw new Error("ERPNEXT_INSTALLATION_ACTIVITY_TYPE is invalid.");
  return activityType;
}

export async function resolveErpnextEmployeeForUser(input: { email: string }) {
  const email = input.email.trim().toLowerCase();
  if (!email) throw new Error("Technician email is required for ERPNext Employee mapping.");
  const fields = encodeJson(["name", "employee_name", "user_id", "status", "company"]);
  const filters = encodeJson([["Employee", "user_id", "=", email]]);
  const result = await frappeRequest(
    "GET",
    `/api/resource/Employee?fields=${fields}&filters=${filters}&limit_page_length=5`,
  );
  const rows = extractRows(result.data).filter((row) => getText(row.name));
  const activeRows = rows.filter((row) => !getText(row.status) || getText(row.status).toLowerCase() === "active");
  if (activeRows.length > 1) throw new Error("Multiple active ERPNext Employees match the technician account.");
  const employee = activeRows[0];
  if (!employee) {
    throw new Error(`No active ERPNext Employee is mapped to technician email ${email}.`);
  }
  return {
    id: getText(employee.name),
    name: getText(employee.employee_name) || getText(employee.name),
    company: getText(employee.company) || getConfiguredCompany() || null,
  };
}

export async function createErpnextTimesheet(input: {
  employeeId: string;
  employeeName?: string | null;
  projectId: string;
  taskId: string;
  startedAt: Date;
  technicianEmail: string;
  idempotencyKey: string;
}) {
  const remark = `SolarDream technician job start | idempotency=${input.idempotencyKey}`;
  const fields = encodeJson(["name", "docstatus", "employee", "time_logs", "user_remark"]);
  const filters = encodeJson([["Timesheet", "user_remark", "=", remark]]);
  try {
    const existingResult = await frappeRequest(
      "GET",
      `/api/resource/Timesheet?fields=${fields}&filters=${filters}&limit_page_length=2`,
    );
    const existing = extractRows(existingResult.data)[0];
    if (existing && getText(existing.name)) {
      return { id: getText(existing.name), document: existing, reused: true };
    }
  } catch (error: unknown) {
    console.warn("[Technician Portal] Timesheet idempotency lookup skipped.", error);
  }

  const payload: JsonRecord = {
    employee: input.employeeId,
    employee_name: input.employeeName || undefined,
    company: getConfiguredCompany(),
    user_remark: remark,
    start_date: input.startedAt.toISOString().slice(0, 10),
    time_logs: [{
      activity_type: getInstallationActivityType(),
      from_time: toErpnextDateTime(input.startedAt),
      hours: 0,
      project: input.projectId,
      task: input.taskId,
      description: `SolarDream technician ${input.technicianEmail.trim().toLowerCase()} started the installation task.`,
    }],
  };
  const created = await frappeRequest("POST", "/api/resource/Timesheet", { data: payload });
  const id = extractName(created.data);
  if (!id) throw new Error("ERPNext did not return a Timesheet ID.");
  return { id, document: extractDocument(created.data), reused: false };
}

export async function addErpnextTaskComment(input: {
  taskId: string;
  content: string;
}) {
  if (!input.taskId.trim() || !input.content.trim()) throw new Error("ERPNext Task comment linkage is incomplete.");
  await frappeRequest("POST", "/api/resource/Comment", {
    comment_type: "Comment",
    reference_doctype: "Task",
    reference_name: input.taskId.trim(),
    content: input.content.trim(),
  });
}

export async function updateErpnextTask(input: {
  taskId: string;
  status: "Working" | "Completed";
  progress: number;
}) {
  const result = await frappeRequest(
    "PUT",
    `/api/resource/Task/${encodeURIComponent(input.taskId)}`,
    { data: { status: input.status, progress: input.progress } },
  );
  return extractDocument(result.data);
}

export async function createErpnextQualityInspection(input: {
  projectId: string;
  taskId: string;
  phase: TechPortalPhaseCode;
  testValues: TechTestValues;
  evidenceHashes: readonly string[];
  idempotencyKey: string;
}) {
  const itemCode = process.env.ERPNEXT_SOLAR_QC_ITEM_CODE?.trim();
  if (!itemCode) {
    throw new Error("ERPNEXT_SOLAR_QC_ITEM_CODE is not configured; Quality Inspection cannot be created safely.");
  }

  const remark = [
    "SolarDream technician QC",
    `phase=${input.phase}`,
    `task=${input.taskId}`,
    `idempotency=${input.idempotencyKey}`,
    `evidence_sha256=${input.evidenceHashes.join(",") || "none"}`,
    `test_values=${JSON.stringify(input.testValues)}`,
  ].join(" | ");
  const lookupFields = encodeJson(["name", "docstatus", "reference_type", "reference_name", "remarks"]);
  const lookupFilters = encodeJson([["Quality Inspection", "remarks", "=", remark]]);
  try {
    const existingResult = await frappeRequest(
      "GET",
      `/api/resource/Quality%20Inspection?fields=${lookupFields}&filters=${lookupFilters}&limit_page_length=2`,
    );
    const existing = extractRows(existingResult.data)[0];
    if (existing && getText(existing.name)) return { id: getText(existing.name), document: existing, reused: true };
  } catch (error: unknown) {
    console.warn("[Technician Portal] Quality Inspection idempotency lookup skipped.", error);
  }

  const readings = Object.entries(input.testValues).map(([key, value]) => ({
    specification: key,
    value: String(value),
    status: "Accepted",
  }));
  const payload: JsonRecord = {
    item_code: itemCode,
    inspection_type: "In Process",
    reference_type: "Project",
    reference_name: input.projectId,
    remarks: remark,
    readings,
  };
  const created = await frappeRequest("POST", "/api/resource/Quality%20Inspection", { data: payload });
  const id = extractName(created.data);
  if (!id) throw new Error("ERPNext did not return a Quality Inspection ID.");
  return { id, document: extractDocument(created.data), reused: false };
}

export async function completeErpnextTimesheet(input: {
  timesheetId: string;
  completedAt: Date;
}) {
  const currentResult = await frappeRequest(
    "GET",
    `/api/resource/Timesheet/${encodeURIComponent(input.timesheetId)}`,
  );
  const current = extractDocument(currentResult.data);
  const currentLogs = Array.isArray(current.time_logs) ? current.time_logs : [];
  const logs = currentLogs.map((value, index) => {
    const log = asRecord(value);
    if (index !== currentLogs.length - 1) return log;
    const fromTime = getText(log.from_time);
    const normalizedFromTime = fromTime.includes("T") ? fromTime : `${fromTime.replace(" ", "T")}Z`;
    const fromMs = fromTime ? Date.parse(normalizedFromTime) : input.completedAt.getTime();
    const hours = Math.max(0, (input.completedAt.getTime() - (Number.isFinite(fromMs) ? fromMs : input.completedAt.getTime())) / 3_600_000);
    return {
      ...log,
      to_time: toErpnextDateTime(input.completedAt),
      hours: Number(hours.toFixed(4)),
      completed: 1,
    };
  });
  if (logs.length === 0) throw new Error(`ERPNext Timesheet ${input.timesheetId} has no time log to close.`);

  const updated = await frappeRequest(
    "PUT",
    `/api/resource/Timesheet/${encodeURIComponent(input.timesheetId)}`,
    { data: { time_logs: logs } },
  );
  const updatedDocument = extractDocument(updated.data);
  if (getNumber(updatedDocument.docstatus) !== 1) {
    try {
      await frappeRequest("POST", "/api/method/frappe.client.submit", {
        doc: JSON.stringify({ doctype: "Timesheet", name: input.timesheetId }),
      });
    } catch (error: unknown) {
      const refreshed = await frappeRequest(
        "GET",
        `/api/resource/Timesheet/${encodeURIComponent(input.timesheetId)}`,
      );
      if (getNumber(extractDocument(refreshed.data).docstatus) !== 1) throw error;
    }
  }
  return { id: input.timesheetId };
}

export async function completeErpnextProject(projectId: string) {
  const result = await frappeRequest(
    "PUT",
    `/api/resource/Project/${encodeURIComponent(projectId)}`,
    { data: { status: "Completed" } },
  );
  return extractDocument(result.data);
}

export { uploadErpnextFile };
