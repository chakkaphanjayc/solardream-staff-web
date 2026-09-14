import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { ESTIMATE_DRAFT_MAX_BODY_BYTES, parseFinancialReportRequest } from "@/lib/estimateDraftBridge";
import { enforcePortalRateLimit } from "@/lib/portalRateLimit";
import { createClient } from "@/utils/supabase/server";

export const maxDuration = 30;

function hasValidOrigin(request: NextRequest) {
  const source = request.headers.get("origin") || request.headers.get("referer") || "";
  if (!source) return false;
  const allowed = new Set([request.nextUrl.origin]);
  for (const value of [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NEXT_PUBLIC_ADMIN_URL,
  ]) {
    if (!value) continue;
    try { allowed.add(new URL(value).origin); } catch { /* Invalid configuration is not trusted. */ }
  }
  try { return allowed.has(new URL(source).origin); } catch { return false; }
}

async function readBoundedJson(request: NextRequest) {
  const rawLength = request.headers.get("content-length");
  if (!rawLength || !/^\d+$/.test(rawLength)) throw new Error("Content-Length is required.");
  const expected = Number(rawLength);
  if (!Number.isSafeInteger(expected) || expected <= 0 || expected > ESTIMATE_DRAFT_MAX_BODY_BYTES || !request.body) throw new Error("Report request is too large.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > ESTIMATE_DRAFT_MAX_BODY_BYTES) { await reader.cancel(); throw new Error("Report request is too large."); }
    chunks.push(value);
  }
  if (total !== expected) throw new Error("Content-Length does not match report body.");
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
}

export async function POST(request: NextRequest) {
  try {
    if (!hasValidOrigin(request)) return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
    const rate = await enforcePortalRateLimit({ namespace: "financial-report", identity: user.id, limit: 4, windowSeconds: 60 });
    if (!rate.allowed) return NextResponse.json({ success: false, error: "Too many report requests." }, { status: 429 });
    const reportRequest = parseFinancialReportRequest(await readBoundedJson(request));
    const { generateFinancialReportPdf } = await import("@/lib/financialReportPdf");
    const pdf = await generateFinancialReportPdf(reportRequest);
    const filename = `SolarDream-Financial-Estimate-${new Date().toISOString().slice(0, 10)}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store, max-age=0",
        Pragma: "no-cache",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error: unknown) {
    if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ success: false, error: "Financial report request is invalid." }, { status: 400 });
    console.error("[Financial Report]", error);
    return NextResponse.json({ success: false, error: "Unable to generate financial report." }, { status: 500 });
  }
}
