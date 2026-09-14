import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { getSystemSetting } from "@/app/actions/systemSettings";
import { requireStaff } from "@/lib/auth-guard";
import { db } from "@/db";
import { proposals } from "@/db/schema";


export async function GET(_request: NextRequest, context: { params: Promise<{ proposalId: string }> }) {
  try {
    await requireStaff();
    const { proposalId } = await context.params;
    const proposal = await db.query.proposals.findFirst({ where: eq(proposals.id, proposalId), columns: { erpnextQuotationId: true } });
    if (!proposal?.erpnextQuotationId) return NextResponse.json({ error: "An ERPNext quotation is required." }, { status: 409 });
    const [settingUrl, settingKey, settingSecret] = await Promise.all([getSystemSetting("erpnext_site_endpoint"), getSystemSetting("erpnext_api_key"), getSystemSetting("erpnext_api_secret")]);
    const baseUrl = (settingUrl || process.env.ERPNEXT_BASE_URL || "").replace(/\/$/, "");
    const key = settingKey || process.env.ERPNEXT_API_KEY || "";
    const secret = settingSecret || process.env.ERPNEXT_API_SECRET || "";
    if (!baseUrl || !key || !secret) throw new Error("ERPNext integration is not configured.");
    const query = new URLSearchParams({ doctype: "Quotation", name: proposal.erpnextQuotationId, format: "Standard", no_letterhead: "0" });
    const response = await fetch(`${baseUrl}/api/method/frappe.utils.print_format.download_pdf?${query}`, { headers: { Authorization: `token ${key}:${secret}` }, cache: "no-store" });
    if (!response.ok) throw new Error(`ERPNext PDF export failed with ${response.status}.`);
    return new NextResponse(await response.arrayBuffer(), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${proposal.erpnextQuotationId}.pdf"`, "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to download the ERPNext quotation PDF." }, { status: 400 });
  }
}
