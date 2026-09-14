import { NextResponse } from "next/server";

import { requireStaff } from "@/lib/auth-guard";
import { listErpnextProductBundles } from "@/lib/erpnextBoq";


export async function GET(request: Request) {
  try {
    await requireStaff();
    const forceRefresh = new URL(request.url).searchParams.get("refresh") === "1";
    return NextResponse.json({ bundles: await listErpnextProductBundles(forceRefresh) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load Product Bundles." }, { status: 400 });
  }
}
