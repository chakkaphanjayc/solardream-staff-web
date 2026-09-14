import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { getSystemSetting } from "@/app/actions/systemSettings";
import { syncErpnextMasterData } from "@/lib/erpnext-sync";
import { hasValidHeaderSecret } from "@/lib/secretAuth";


function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function getItemCode(payload: unknown) {
  const record = getRecord(payload);
  const document = getRecord(record.data ?? record.doc ?? record);
  const value = document.item_code ?? document.itemCode;
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest) {
  const expectedSecret = process.env.ERPNEXT_WEBHOOK_SECRET?.trim()
    || (await getSystemSetting("erpnext_webhook_secret"))?.trim()
    || "";
  if (!expectedSecret) {
    return NextResponse.json({ success: false, error: "ERPNext item webhook is not configured." }, { status: 503 });
  }
  if (!hasValidHeaderSecret(request.headers.get("x-erpnext-signature"), expectedSecret)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await request.json().catch(() => null);
    const itemCode = getItemCode(payload);
    if (!itemCode) {
      return NextResponse.json({ success: false, error: "Webhook payload does not include item_code." }, { status: 400 });
    }

    const result = await syncErpnextMasterData([itemCode]);
    revalidatePath("/wizard");
    revalidatePath("/build");
    revalidatePath("/catalog");
    return NextResponse.json({ ...result, itemCode });
  } catch (error) {
    console.error("[ERPNext Item Webhook]", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "ERPNext item webhook sync failed." },
      { status: 502 },
    );
  }
}
