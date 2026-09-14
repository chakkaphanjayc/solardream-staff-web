import { NextRequest, NextResponse } from "next/server";

import { requireStaff } from "@/lib/auth-guard";
import { searchErpnextItems } from "@/lib/erpnextBoq";


/** Compatibility endpoint for cached BOQ clients. */
export async function GET(request: NextRequest) {
  try {
    await requireStaff();
    const query = request.nextUrl.searchParams.get("query") || "";
    const items = await searchErpnextItems(query);
    return NextResponse.json({
      items: items.map((item) => ({
        id: item.id,
        itemCode: item.itemCode,
        itemName: item.itemName,
        rate: item.rate,
        cost: item.cost ?? null,
        stockQty: item.stockQty ?? 0,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to search ERPNext items." },
      { status: 400 },
    );
  }
}
