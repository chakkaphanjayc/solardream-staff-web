"use server";

import { z } from "zod";

import { requireStaff } from "@/lib/auth-guard";
import {
  createDocumentTemplate,
  getDocumentTemplateSource,
  listDocumentTemplates,
  publishDocumentTemplate,
  type DocumentServiceTemplate,
  type DocumentServiceTemplateField,
} from "@/lib/document-service/client";

const templateKeySchema = z.string().trim().regex(/^[A-Za-z][A-Za-z0-9_.:-]{0,159}$/);
const fieldSchema = z.object({
  fieldKey: z.string().trim().regex(/^[A-Za-z][A-Za-z0-9_.:-]{0,159}$/),
  fieldType: z.enum(["signature", "printed_name", "date", "text", "checkbox"]),
  recipientRole: z.string().trim().min(1).max(120),
  pageNumber: z.number().int().min(1).max(500),
  x: z.number().finite().min(0),
  y: z.number().finite().min(0),
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
  pageRotation: z.number().int().refine((value) => [0, 90, 180, 270].includes(value)),
  required: z.boolean(),
  anchorKey: z.string().trim().max(160).nullable(),
}).strict();

function asFields(value: FormDataEntryValue | null): Array<Omit<DocumentServiceTemplateField, "id">> {
  if (typeof value !== "string") throw new Error("Template field definitions are missing.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new Error("Template field definitions are invalid JSON.");
  }
  return z.array(fieldSchema).max(100).parse(parsed);
}

function serialized(template: DocumentServiceTemplate) {
  return template;
}

export async function listDocumentTemplatesAction(): Promise<{ success: boolean; templates: DocumentServiceTemplate[]; error?: string }> {
  try {
    const staff = await requireStaff();
    return { success: true, templates: await listDocumentTemplates(staff.id) };
  } catch (error: unknown) {
    return { success: false, templates: [], error: error instanceof Error ? error.message : "Template Service is unavailable." };
  }
}

export async function saveDocumentTemplateAction(formData: FormData): Promise<{ success: boolean; template?: DocumentServiceTemplate; error?: string }> {
  try {
    const staff = await requireStaff();
    const templateKey = templateKeySchema.parse(formData.get("templateKey"));
    const sourcePdf = formData.get("sourcePdf");
    if (!(sourcePdf instanceof File) || sourcePdf.size === 0) throw new Error("Choose a PDF template source.");
    if (sourcePdf.type !== "application/pdf" && !sourcePdf.name.toLowerCase().endsWith(".pdf")) {
      throw new Error("Template source must be a PDF.");
    }
    if (sourcePdf.size > 40 * 1024 * 1024) throw new Error("Template source exceeds the 40 MB limit.");
    const definitionText = formData.get("definition");
    let definition: Record<string, unknown> = {};
    if (typeof definitionText === "string" && definitionText.trim()) {
      const parsed = JSON.parse(definitionText) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) definition = parsed as Record<string, unknown>;
    }
    const template = await createDocumentTemplate({
      actorId: staff.id,
      templateKey,
      sourcePdf,
      fields: asFields(formData.get("fields")),
      definition,
    });
    return { success: true, template: serialized(template) };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : "Template could not be saved." };
  }
}

export async function publishDocumentTemplateAction(templateId: string): Promise<{ success: boolean; template?: DocumentServiceTemplate; error?: string }> {
  try {
    const staff = await requireStaff();
    const template = await publishDocumentTemplate(staff.id, templateId);
    return { success: true, template: serialized(template) };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : "Template could not be published." };
  }
}

export async function getDocumentTemplateSourceAction(templateId: string): Promise<{ success: boolean; base64?: string; error?: string }> {
  try {
    const staff = await requireStaff();
    return { success: true, base64: await getDocumentTemplateSource(staff.id, templateId) };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : "Template source could not be loaded." };
  }
}
