import { NextRequest, NextResponse } from "next/server";

import { requireStaff } from "@/lib/auth-guard";
import { searchErpnextItems } from "@/lib/erpnextBoq";


export async function GET(request: NextRequest) {
  try {
    await requireStaff();
    const query = request.nextUrl.searchParams.get("query") || "";
    return NextResponse.json({ items: await searchErpnextItems(query) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to search ERPNext items." }, { status: 400 });
  }
}
