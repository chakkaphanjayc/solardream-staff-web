import { NextRequest, NextResponse } from "next/server";

import { requireStaff } from "@/lib/auth-guard";
import { loadBoqTemplate } from "@/lib/erpnextBoq";


/**
 * Compatibility endpoint for existing BOQ clients. New clients use
 * `/api/admin/boq/bundles/[itemCode]`, but both endpoints load the same
 * flattened ERPNext Product Bundle data.
 */
export async function GET(request: NextRequest) {
  try {
    await requireStaff();
    const itemCode = request.nextUrl.searchParams.get("itemCode")?.trim() || "";
    if (!itemCode) {
      return NextResponse.json({ error: "An ERPNext Product Bundle item code is required." }, { status: 400 });
    }

    const template = await loadBoqTemplate(itemCode);
    return NextResponse.json({
      templateItemCode: template.bundleItemCode,
      lines: template.lines.map((line) => ({
        itemCode: line.itemCode,
        itemName: line.itemName,
        qty: line.qty,
        rate: line.rate,
        cost: line.cost ?? null,
        stockQty: line.stockQty ?? 0,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load the Product Bundle." },
      { status: 400 },
    );
  }
}
