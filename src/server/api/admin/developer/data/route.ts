import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminJson } from "@/lib/auth-guard";
import {
  DeveloperDataValidationError,
  deleteDeveloperDataRows,
  getDeveloperDataResourceDefinitions,
  getDeveloperDataRows,
  saveDeveloperData,
  type DeveloperDataResource,
} from "@/lib/developerData";

const resourceSchema = z.enum([
  "feature_flags",
  "system_settings",
  "service_system_options",
  "service_fee_configs",
  "global_banners",
]);

const valuesSchema = z
  .record(z.string().trim().min(1).max(80), z.unknown())
  .refine((value) => Object.keys(value).length <= 32, "Too many fields in a data row.")
  .refine((value) => JSON.stringify(value).length <= 128_000, "Data row payload is too large.");

function isResource(value: string): value is DeveloperDataResource {
  return resourceSchema.safeParse(value).success;
}

function errorResponse(error: unknown, fallback: string) {
  const isValidationError = error instanceof DeveloperDataValidationError;
  const isMalformedJson = error instanceof SyntaxError;
  const message = isValidationError || isMalformedJson
    ? error instanceof Error ? error.message : fallback
    : fallback;
  return NextResponse.json(
    { success: false, error: message },
    { status: isValidationError || isMalformedJson ? 400 : 500 },
  );
}

export async function GET(request: NextRequest) {
  const access = await requireAdminJson();
  if (!access.ok) return access.response;

  const resourceValue = request.nextUrl.searchParams.get("resource") || "feature_flags";
  if (!isResource(resourceValue)) {
    return NextResponse.json({ success: false, error: "Unsupported Developer data collection." }, { status: 400 });
  }

  try {
    const rows = await getDeveloperDataRows(resourceValue, request.nextUrl.searchParams.get("q") || "");
    return NextResponse.json({ success: true, resources: getDeveloperDataResourceDefinitions(), resource: resourceValue, rows }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error: unknown) {
    console.error("[Developer Data] Failed to load collection:", error);
    return NextResponse.json({ success: false, error: "The selected data collection is temporarily unavailable." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const access = await requireAdminJson();
  if (!access.ok) return access.response;

  try {
    const body: unknown = await request.json();
    const parsed = z.object({ resource: resourceSchema, values: valuesSchema }).safeParse(body);
    if (!parsed.success) return errorResponse(new Error("A valid collection and data object are required."), "Invalid request.");
    const id = await saveDeveloperData({ resource: parsed.data.resource, values: parsed.data.values, actorUserId: access.user.id });
    return NextResponse.json({ success: true, id }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    console.error("[Developer Data] Failed to create row:", error);
    return errorResponse(error, "The data row could not be created.");
  }
}

export async function PATCH(request: NextRequest) {
  const access = await requireAdminJson();
  if (!access.ok) return access.response;

  try {
    const body: unknown = await request.json();
    const parsed = z.object({ resource: resourceSchema, id: z.string().trim().min(1).max(200), values: valuesSchema }).safeParse(body);
    if (!parsed.success) return errorResponse(new Error("A collection, row ID, and data object are required."), "Invalid request.");
    const id = await saveDeveloperData({ resource: parsed.data.resource, id: parsed.data.id, values: parsed.data.values, actorUserId: access.user.id });
    return NextResponse.json({ success: true, id }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    console.error("[Developer Data] Failed to update row:", error);
    return errorResponse(error, "The data row could not be updated.");
  }
}

export async function DELETE(request: NextRequest) {
  const access = await requireAdminJson();
  if (!access.ok) return access.response;

  try {
    const body: unknown = await request.json();
    const parsed = z.object({
      resource: resourceSchema,
      id: z.string().trim().min(1).max(200).optional(),
      ids: z.array(z.string().trim().min(1).max(200)).min(1).max(100).optional(),
    }).superRefine((value, context) => {
      if (!value.id && !value.ids) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "A row ID or row ID list is required." });
      }
    }).safeParse(body);
    if (!parsed.success) return errorResponse(new Error("A collection and row ID or row ID list are required."), "Invalid request.");

    const ids = Array.from(new Set(parsed.data.ids ?? (parsed.data.id ? [parsed.data.id] : [])));
    const result = await deleteDeveloperDataRows({
      resource: parsed.data.resource,
      ids,
      actorUserId: access.user.id,
    });
    return NextResponse.json({ success: true, count: result.count, deletedIds: result.deletedIds }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    console.error("[Developer Data] Failed to delete row:", error);
    return errorResponse(error, "The data row could not be deleted.");
  }
}
