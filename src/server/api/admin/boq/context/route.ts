import { NextResponse } from "next/server";

import { getSystemSetting } from "@/app/actions/systemSettings";
import { requireStaff } from "@/lib/auth-guard";
import { resolveErpnextCompany } from "@/lib/erpnextBoq";


export async function GET() {
  try {
    await requireStaff();
    const [company, sellingPriceList] = await Promise.all([
      getSystemSetting("erpnext_company_name"),
      getSystemSetting("erpnext_selling_price_list"),
    ]);
    return NextResponse.json({
      company: company || await resolveErpnextCompany(),
      sellingPriceList: sellingPriceList || process.env.ERPNEXT_SELLING_PRICE_LIST || "Standard Selling",
      currency: "THB",
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load BOQ settings." }, { status: 400 });
  }
}
