import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireOpsCustomer } from "@/server/services/ops-v2/api-response";
import { createServiceCase, listServiceCases } from "@/server/services/ops-v2/service-case-service";
import { opsErrorResponse } from "@/server/services/ops-v2/api-response";

const createSchema = z.object({
  projectId: z.string().uuid().optional().nullable(),
  assetId: z.string().uuid().optional().nullable(),
  productWarrantyId: z.string().uuid().optional().nullable(),
  installationWarrantyId: z.string().uuid().optional().nullable(),
  type: z.enum(["REPAIR", "CLAIM", "MAINTENANCE", "QUESTION"]),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  subject: z.string().trim().min(1).max(240),
  description: z.string().trim().min(1).max(10_000),
  idempotencyKey: z.string().trim().max(180).optional(),
});

export async function GET() {
  const access = await requireOpsCustomer(["OPS_V2_CUSTOMER_PORTAL", "OPS_V2_AFTER_SALES"]);
  if (!access.ok) return access.response;
  try {
    return NextResponse.json({ success: true, data: await listServiceCases(access.actor) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error: unknown) {
    return opsErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const access = await requireOpsCustomer(["OPS_V2_CUSTOMER_PORTAL", "OPS_V2_AFTER_SALES"]);
  if (!access.ok) return access.response;
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: { code: "INVALID_INPUT", message: "The service case payload is invalid." } }, { status: 400 });
  try {
    const data = await createServiceCase(access.actor, {
      ...parsed.data,
      idempotencyKey: parsed.data.idempotencyKey || request.headers.get("idempotency-key") || "",
    });
    return NextResponse.json({ success: true, data }, { status: data.replayed ? 200 : 201 });
  } catch (error: unknown) {
    return opsErrorResponse(error);
  }
}
