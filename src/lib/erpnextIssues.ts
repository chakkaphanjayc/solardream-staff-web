import { frappeRequest, getOrCreateErpnextCustomerForUser } from "@/lib/erpnext";

export const ERPNEXT_ISSUE_STATUSES = [
  "Open",
  "Replied",
  "On Hold",
  "Resolved",
  "Closed",
] as const;

export type ErpnextIssueStatus = (typeof ERPNEXT_ISSUE_STATUSES)[number];
export type ServiceRequestType = "REPAIR" | "CLAIM" | "MAINTENANCE";

interface CreateErpnextIssueInput {
  requestId: string;
  userId: string;
  userEmail: string;
  erpnextCustomerId?: string | null;
  proposalConfiguration?: unknown;
  type: ServiceRequestType;
  subject: string;
  description: string;
  imageUrls: string[];
  contactName: string;
  contactPhone: string;
  appointmentDate: Date;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function issueTypeLabel(type: ServiceRequestType) {
  switch (type) {
    case "CLAIM":
      return "Claim";
    case "MAINTENANCE":
      return "Maintenance";
    default:
      return "Repair";
  }
}

function formatIssueDescription(input: CreateErpnextIssueInput) {
  const appointment = input.appointmentDate.toISOString().slice(0, 10);
  const images = input.imageUrls.length
    ? `<p><strong>Evidence images</strong></p><ul>${input.imageUrls
        .map((url, index) => {
          const safeUrl = escapeHtml(url);
          return `<li><a href="${safeUrl}" target="_blank" rel="noopener noreferrer">Image ${index + 1}</a></li>`;
        })
        .join("")}</ul>`
    : "";

  return [
    `<p>${escapeHtml(input.description).replaceAll("\n", "<br>")}</p>`,
    "<hr>",
    `<p><strong>SolarDream Request ID:</strong> ${escapeHtml(input.requestId)}</p>`,
    `<p><strong>Contact:</strong> ${escapeHtml(input.contactName)} (${escapeHtml(input.contactPhone)})</p>`,
    `<p><strong>Requested appointment:</strong> ${appointment}</p>`,
    images,
  ].join("");
}

function extractDocumentName(response: { data: unknown }) {
  const root = response.data;
  if (!root || typeof root !== "object" || Array.isArray(root)) return null;

  const rootRecord = root as Record<string, unknown>;
  if (typeof rootRecord.name === "string") return rootRecord.name;

  const data = rootRecord.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const name = (data as Record<string, unknown>).name;
  return typeof name === "string" ? name : null;
}

export function normalizeErpnextIssueStatus(value: unknown): ErpnextIssueStatus | null {
  if (typeof value !== "string") return null;

  switch (value.trim().toLowerCase().replaceAll("_", " ")) {
    case "open":
    case "pending":
      return "Open";
    case "replied":
    case "assigned":
    case "in progress":
      return "Replied";
    case "hold":
    case "on hold":
      return "On Hold";
    case "resolved":
      return "Resolved";
    case "closed":
    case "cancelled":
    case "canceled":
      return "Closed";
    default:
      return null;
  }
}

export async function createErpnextIssue(input: CreateErpnextIssueInput) {
  const customer =
    input.erpnextCustomerId?.trim() ||
    (await getOrCreateErpnextCustomerForUser(
      input.userId,
      input.proposalConfiguration,
    ));

  const response = await frappeRequest("POST", "/api/resource/Issue", {
    customer,
    subject: input.subject,
    issue_type: issueTypeLabel(input.type),
    description: formatIssueDescription(input),
    status: "Open",
    raised_by: input.userEmail,
  });

  const issueId = extractDocumentName(response);
  if (!issueId) {
    throw new Error("ERPNext created the Issue but did not return its document ID.");
  }

  return { issueId, customer };
}
