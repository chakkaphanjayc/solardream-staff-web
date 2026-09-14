import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminJson } from "@/lib/auth-guard";
import {
  assignStaffRole,
  assignSalesOwner,
  createExternalAccessAccount,
  deleteExternalAccessAccount,
  deleteStaffRole,
  getDeveloperAccessState,
  revokeExternalAccessAccount,
  revokeStaffAssignment,
  saveStaffRole,
  STAFF_PERMISSION_OPTIONS,
  type ExternalScopeType,
  type StaffScopeMode,
} from "@/lib/developerAccess";

const permissionSchema = z.array(z.enum(STAFF_PERMISSION_OPTIONS)).max(30);
const scopeModeSchema = z.enum(["ALL", "OWN"]);
const externalScopeSchema = z.enum(["PROJECT", "TASK", "PROPOSAL"]);

function badRequest(error: unknown) {
  const message = error instanceof z.ZodError
    ? error.issues[0]?.message || "Invalid access-control request."
    : "The access-control change could not be completed.";
  return NextResponse.json({ success: false, error: message }, { status: error instanceof z.ZodError ? 400 : 500 });
}

function parseExpiry(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("The expiry date is invalid.");
  return date;
}

export async function GET() {
  const access = await requireAdminJson();
  if (!access.ok) return access.response;

  try {
    const state = await getDeveloperAccessState();
    return NextResponse.json({ success: true, ...state }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error: unknown) {
    console.error("[Developer Access] Failed to load state:", error);
    return NextResponse.json({ success: false, error: "Access-control data is temporarily unavailable." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const access = await requireAdminJson();
  if (!access.ok) return access.response;

  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid access-control request.");
    const record = body as Record<string, unknown>;
    const action = typeof record.action === "string" ? record.action : "";

    if (action === "save-role") {
      const parsed = z.object({
        id: z.string().trim().min(1).max(100).optional(),
        code: z.string().trim().min(1).max(64),
        name: z.string().trim().min(1).max(120),
        description: z.string().max(500).nullable().optional(),
        permissions: permissionSchema,
        scopeMode: scopeModeSchema,
      }).parse(record);
      const role = await saveStaffRole({ ...parsed, actorUserId: access.user.id, scopeMode: parsed.scopeMode as StaffScopeMode });
      return NextResponse.json({ success: true, role }, { headers: { "Cache-Control": "no-store" } });
    }

    if (action === "delete-role") {
      const parsed = z.object({ roleId: z.string().trim().min(1).max(100) }).parse(record);
      await deleteStaffRole(parsed.roleId, access.user.id);
      return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
    }

    if (action === "assign-role") {
      const parsed = z.object({
        userId: z.string().trim().min(1).max(200),
        roleId: z.string().trim().min(1).max(100),
        scopeMode: scopeModeSchema,
        expiresAt: z.string().trim().optional().nullable(),
      }).parse(record);
      const assignment = await assignStaffRole({ userId: parsed.userId, roleId: parsed.roleId, scopeMode: parsed.scopeMode as StaffScopeMode, expiresAt: parseExpiry(parsed.expiresAt), actorUserId: access.user.id });
      return NextResponse.json({ success: true, assignment }, { headers: { "Cache-Control": "no-store" } });
    }

    if (action === "revoke-assignment") {
      const parsed = z.object({ assignmentId: z.string().trim().min(1).max(100) }).parse(record);
      await revokeStaffAssignment(parsed.assignmentId, access.user.id);
      return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
    }

    if (action === "assign-sales-owner") {
      const parsed = z.object({ proposalId: z.string().trim().min(1).max(200), salesOwnerId: z.string().trim().max(200).nullable() }).parse(record);
      const updated = await assignSalesOwner({ proposalId: parsed.proposalId, salesOwnerId: parsed.salesOwnerId || null, actorUserId: access.user.id });
      return NextResponse.json({ success: true, proposal: updated }, { headers: { "Cache-Control": "no-store" } });
    }

    if (action === "create-external") {
      const parsed = z.object({
        displayName: z.string().trim().min(1).max(160),
        email: z.string().trim().email().max(320).optional().nullable().or(z.literal("")),
        companyName: z.string().trim().max(160).optional().nullable(),
        scopeType: externalScopeSchema,
        scopeId: z.string().trim().min(1).max(200),
        permissions: z.array(z.enum(["external:work:read", "external:evidence:read"])).max(4),
        expiresAt: z.string().trim().min(1),
        locale: z.enum(["en", "th"]).default("en"),
      }).parse(record);
      const expiresAt = parseExpiry(parsed.expiresAt);
      if (!expiresAt) throw new Error("An expiry date is required for external access.");
      const created = await createExternalAccessAccount({ displayName: parsed.displayName, email: parsed.email || null, companyName: parsed.companyName || null, scopeType: parsed.scopeType as ExternalScopeType, scopeId: parsed.scopeId, permissions: parsed.permissions, expiresAt, locale: parsed.locale, actorUserId: access.user.id });
      return NextResponse.json({ success: true, account: created.account, inviteUrl: created.inviteUrl }, { status: 201, headers: { "Cache-Control": "no-store" } });
    }

    if (action === "revoke-external") {
      const parsed = z.object({ accountId: z.string().trim().min(1).max(100) }).parse(record);
      await revokeExternalAccessAccount(parsed.accountId, access.user.id);
      return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
    }

    if (action === "delete-external") {
      const parsed = z.object({ accountId: z.string().trim().min(1).max(100) }).parse(record);
      await deleteExternalAccessAccount(parsed.accountId, access.user.id);
      return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
    }

    throw new Error("Unsupported access-control action.");
  } catch (error: unknown) {
    console.error("[Developer Access] Mutation failed:", error);
    return badRequest(error);
  }
}
