import { NextResponse } from "next/server";

import { requireAdminJson } from "@/lib/auth-guard";
import { getListmonkTransactionalTemplates } from "@/lib/listmonk";

export async function GET() {
  const admin = await requireAdminJson();
  if (!admin.ok) return admin.response;

  const result = await getListmonkTransactionalTemplates();
  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error }, { status: result.status ?? 502 });
  }

  return NextResponse.json(
    { success: true, templates: result.data },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}
