import { NextResponse } from "next/server";

import { requireStaffJson } from "@/lib/auth-guard";
import { getDbUser } from "@/app/actions/auth";
import { isOpsV2FeatureEnabled } from "@/lib/featureFlags";
import { OpsDomainError } from "@/lib/opsV2State";
import type { OpsActor, OpsV2FeatureFlag } from "@/types/ops-v2";
import { ERPNextGatewayError } from "@/server/services/integrations/erpnext-gateway";

export async function requireOpsV2Feature(flag: OpsV2FeatureFlag) {
  if (await isOpsV2FeatureEnabled(flag)) return null;
  return NextResponse.json(
    { success: false, error: { code: "FEATURE_DISABLED", message: "This Operations V2 capability is not enabled." } },
    { status: 404, headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function requireOpsStaff(flag?: OpsV2FeatureFlag) {
  const access = await requireStaffJson();
  if (!access.ok) return access;
  if (flag) {
    const featureResponse = await requireOpsV2Feature(flag);
    if (featureResponse) return { ok: false as const, response: featureResponse };
  }
  return {
    ok: true as const,
    user: access.user,
    actor: {
      userId: access.user.id,
      role: access.user.role,
    } satisfies OpsActor,
  };
}

export async function requireOpsCustomer(
  flag: OpsV2FeatureFlag | readonly OpsV2FeatureFlag[] = "OPS_V2_CUSTOMER_PORTAL",
) {
  const user = await getDbUser();
  if (!user) {
    return { ok: false as const, response: NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication is required." } }, { status: 401 }) };
  }
  if (!user.isActive || !["USER", "CUSTOMER"].includes(user.role)) {
    return { ok: false as const, response: NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "Customer portal access is not permitted." } }, { status: 403 }) };
  }
  const flags = Array.isArray(flag) ? flag : [flag];
  for (const featureFlag of flags) {
    const featureResponse = await requireOpsV2Feature(featureFlag);
    if (featureResponse) return { ok: false as const, response: featureResponse };
  }
  return { ok: true as const, actor: { userId: user.id, role: user.role } satisfies OpsActor };
}

export function opsErrorResponse(error: unknown) {
  if (error instanceof OpsDomainError) {
    const status = error.code === "FORBIDDEN"
      ? 403
      : error.code === "NOT_FOUND"
        ? 404
        : error.code === "CONFLICT"
          ? 409
          : error.code === "DEPENDENCY_BLOCKED" || error.code === "INVALID_TRANSITION"
            ? 422
            : 400;
    return NextResponse.json(
      { success: false, error: { code: error.code, message: error.message } },
      { status },
    );
  }

  console.error("[Ops V2] Unexpected request failure.", error instanceof Error ? { name: error.name, message: error.message } : { type: typeof error });
  return NextResponse.json(
    { success: false, error: { code: "INTERNAL_ERROR", message: "The operations request could not be completed." } },
    { status: 500 },
  );
}

export function integrationErrorResponse(error: unknown) {
  if (error instanceof ERPNextGatewayError) {
    const status = error.category === "CONFIGURATION"
      ? 503
      : error.category === "CONFLICT"
        ? 409
        : error.category === "VALIDATION"
          ? 400
          : 502;
    return NextResponse.json(
      { success: false, error: { code: "ERPNEXT_" + error.category, message: error.message } },
      { status },
    );
  }
  return opsErrorResponse(error);
}
