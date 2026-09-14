import { NextRequest, NextResponse } from "next/server";

import { requireStaff } from "@/lib/auth-guard";
import { loadBoqTemplate } from "@/lib/erpnextBoq";


export async function GET(_request: NextRequest, context: { params: Promise<{ itemCode: string }> }) {
  try {
    await requireStaff();
    const { itemCode } = await context.params;
    return NextResponse.json({ template: await loadBoqTemplate(itemCode) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load the Product Bundle." }, { status: 400 });
  }
}
