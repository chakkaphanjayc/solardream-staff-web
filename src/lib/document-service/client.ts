import "server-only";

import { createHash, createHmac } from "node:crypto";
import { z } from "zod";

const responseSchema = z.object({
  verification: z.record(z.string(), z.unknown()),
  signatureCount: z.number().int().nonnegative(),
  correlationId: z.string(),
});

export type DocumentServiceVerificationResult = {
  verified: boolean;
  authenticity: boolean;
  integrity: boolean;
  expired: boolean;
  signatureCount: number;
  message: string | null;
};

export type DocumentServiceTemplateField = {
  id: string;
  fieldKey: string;
  fieldType: "signature" | "printed_name" | "date" | "text" | "checkbox";
  recipientRole: string;
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  pageRotation: number;
  required: boolean;
  anchorKey: string | null;
};

export type DocumentServiceTemplate = {
  id: string;
  organizationId: string;
  templateKey: string;
  versionNumber: number;
  status: "draft" | "published" | "retired";
  sourcePdfHash: string | null;
  sourceObject: Record<string, unknown> | null;
  definition: Record<string, unknown>;
  fields: DocumentServiceTemplateField[];
  creationCorrelationId: string | null;
  publishedByActorId: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function serviceEnabled(): boolean {
  return process.env.DOCUMENT_SERVICE_SIGNATURE_ENABLED?.trim().toLowerCase() === "true";
}

function serviceConfig(): { baseUrl: string; organizationId: string; sharedSecret: string; issuer: string; audience: string } {
  const baseUrl = text(process.env.DOCUMENT_SERVICE_URL)?.replace(/\/$/, "");
  const organizationId = text(process.env.DOCUMENT_SERVICE_ORGANIZATION_ID);
  const sharedSecret = text(process.env.DOCUMENT_SERVICE_SHARED_SECRET);
  const issuer = text(process.env.DOCUMENT_SERVICE_AUTH_ISSUER) || "solardream-staff-web";
  const audience = text(process.env.DOCUMENT_SERVICE_AUTH_AUDIENCE) || "solardream-document-service";
  if (!baseUrl || !organizationId || !sharedSecret) {
    throw new Error("Document Service template management is enabled but server-only configuration is incomplete.");
  }
  return { baseUrl, organizationId, sharedSecret, issuer, audience };
}

function serviceUrl(): string {
  const url = text(process.env.DOCUMENT_SERVICE_URL)?.replace(/\/$/, "");
  if (!url) throw new Error("Document Service verification is enabled but DOCUMENT_SERVICE_URL is not configured.");
  return url;
}

function templateSignature(
  config: ReturnType<typeof serviceConfig>,
  actorId: string,
  method: "GET" | "POST",
  path: string,
  body: string,
  timestamp: string,
): string {
  const bodyHash = sha256Hex(body);
  const canonical = [
    timestamp,
    method,
    path,
    bodyHash,
    actorId,
    "staff",
    config.organizationId,
    config.issuer,
    config.audience,
  ].join("\n");
  return createHmac("sha256", config.sharedSecret).update(canonical).digest("hex");
}

function templateResponseSchema() {
  return z.object({
    template: z.object({
      id: z.string(),
      organizationId: z.string(),
      templateKey: z.string(),
      versionNumber: z.number().int(),
      status: z.enum(["draft", "published", "retired"]),
      sourcePdfHash: z.string().nullable(),
      sourceObject: z.record(z.string(), z.unknown()).nullable(),
      definition: z.record(z.string(), z.unknown()),
      fields: z.array(z.object({
        id: z.string(),
        fieldKey: z.string(),
        fieldType: z.enum(["signature", "printed_name", "date", "text", "checkbox"]),
        recipientRole: z.string(),
        pageNumber: z.number().int(),
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number(),
        pageRotation: z.number().int(),
        required: z.boolean(),
        anchorKey: z.string().nullable(),
      })),
      creationCorrelationId: z.string().nullable(),
      publishedByActorId: z.string().nullable(),
      publishedAt: z.string().nullable(),
      createdAt: z.string(),
      updatedAt: z.string(),
    }),
    correlationId: z.string(),
  });
}

const templateListResponse = z.object({
  templates: z.array(templateResponseSchema().shape.template),
  correlationId: z.string(),
});

async function templateRequest(
  actorId: string,
  path: string,
  method: "GET" | "POST",
  body = "",
  idempotencyKey?: string,
): Promise<unknown> {
  if (!serviceEnabled()) throw new Error("Document Service template management is not enabled.");
  const config = serviceConfig();
  const timestamp = Math.floor(Date.now() / 1_000).toString();
  const response = await fetch(`${config.baseUrl}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      "X-Document-Actor-Id": actorId,
      "X-Document-Actor-Type": "staff",
      "X-Document-Organization-Id": config.organizationId,
      "X-Document-Auth-Timestamp": timestamp,
      "X-Document-Auth-Signature": templateSignature(config, actorId, method, path, body, timestamp),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    ...(body ? { body } : {}),
    cache: "no-store",
    signal: AbortSignal.timeout(35_000),
  });
  const payload = await response.json().catch(() => null) as unknown;
  if (!response.ok) {
    const root = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
    const error = root.error && typeof root.error === "object" && !Array.isArray(root.error) ? root.error as Record<string, unknown> : {};
    throw new Error(text(error.message) || "The Document Service request failed.");
  }
  return payload;
}

function parseTemplate(value: unknown): DocumentServiceTemplate {
  return templateResponseSchema().parse(value).template;
}

export async function listDocumentTemplates(actorId: string): Promise<DocumentServiceTemplate[]> {
  const payload = await templateRequest(actorId, "/v1/templates", "GET");
  return templateListResponse.parse(payload).templates;
}

export async function createDocumentTemplate(input: {
  actorId: string;
  templateKey: string;
  sourcePdf: File;
  fields: Array<Omit<DocumentServiceTemplateField, "id">>;
  definition?: Record<string, unknown>;
}): Promise<DocumentServiceTemplate> {
  const sourcePdfBase64 = Buffer.from(await input.sourcePdf.arrayBuffer()).toString("base64");
  const body = JSON.stringify({
    organizationId: serviceConfig().organizationId,
    templateKey: input.templateKey,
    sourcePdfBase64,
    definition: input.definition || {},
    fields: input.fields,
  });
  const key = `template-${sha256Hex(`${input.templateKey}:${sha256Hex(sourcePdfBase64)}`).slice(0, 64)}`;
  return parseTemplate(await templateRequest(input.actorId, "/v1/templates", "POST", body, key));
}

export async function publishDocumentTemplate(actorId: string, templateId: string): Promise<DocumentServiceTemplate> {
  return parseTemplate(await templateRequest(actorId, `/v1/templates/${encodeURIComponent(templateId)}/publish`, "POST"));
}

export async function getDocumentTemplateSource(actorId: string, templateId: string): Promise<string> {
  if (!serviceEnabled()) throw new Error("Document Service template management is not enabled.");
  const config = serviceConfig();
  const path = `/v1/templates/${encodeURIComponent(templateId)}/source`;
  const timestamp = Math.floor(Date.now() / 1_000).toString();
  const response = await fetch(`${config.baseUrl}${path}`, {
    headers: {
      Accept: "application/pdf",
      "X-Document-Actor-Id": actorId,
      "X-Document-Actor-Type": "staff",
      "X-Document-Organization-Id": config.organizationId,
      "X-Document-Auth-Timestamp": timestamp,
      "X-Document-Auth-Signature": templateSignature(config, actorId, "GET", path, "", timestamp),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(35_000),
  });
  if (!response.ok) throw new Error("The template source could not be loaded.");
  return Buffer.from(await response.arrayBuffer()).toString("base64");
}

export async function verifyPdfWithDocumentService(pdfBytes: Uint8Array): Promise<DocumentServiceVerificationResult> {
  if (!serviceEnabled()) throw new Error("Document Service verification is not enabled.");
  const response = await fetch(`${serviceUrl()}/v1/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ pdfBase64: Buffer.from(pdfBytes).toString("base64") }),
    cache: "no-store",
    signal: AbortSignal.timeout(35_000),
  });
  const payload = await response.json().catch(() => null) as unknown;
  if (!response.ok) {
    const root = payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : {};
    const error = root.error && typeof root.error === "object" && !Array.isArray(root.error)
      ? root.error as Record<string, unknown>
      : {};
    throw new Error(text(error.message) || "The document service could not verify this PDF.");
  }
  const parsed = responseSchema.parse(payload);
  const report = parsed.verification;
  const status = text(report.status) || "indeterminate";
  const reasons = Array.isArray(report.reasons)
    ? report.reasons.filter((reason): reason is string => typeof reason === "string")
    : [];
  return {
    verified: status === "valid",
    authenticity: text(report.certificateChainTrust) === "valid",
    integrity: text(report.cryptographicSignatureValidity) === "valid" && text(report.changesAfterSigning) === "valid",
    expired: reasons.some((reason) => /expired|not yet valid/i.test(reason)),
    signatureCount: parsed.signatureCount,
    message: reasons.length > 0 ? reasons.join(" ") : status === "valid" ? null : `Verification result: ${status}.`,
  };
}
