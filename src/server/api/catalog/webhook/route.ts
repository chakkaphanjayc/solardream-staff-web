import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { enqueueCatalogSync } from "@/server/services/sales/catalog/sync/catalog-sync-events";
const MAX_BYTES = 64 * 1024,
  MAX_AGE_SECONDS = 300;
function validSignature(
  raw: string,
  timestamp: string,
  provided: string,
  secret: string,
) {
  if (!/^sha256=[0-9a-f]{64}$/i.test(provided)) return false;
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${raw}`)
    .digest("hex");
  return timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(provided.slice(7), "hex"),
  );
}
export async function POST(request: NextRequest) {
  const secret = process.env.CATALOG_WEBHOOK_SECRET;
  if (!secret)
    return NextResponse.json(
      { error: "Catalog webhook is not configured." },
      { status: 503 },
    );
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_BYTES)
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BYTES)
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  const timestamp = request.headers.get("x-catalog-timestamp") || "";
  const epoch = Number(timestamp);
  if (
    !Number.isInteger(epoch) ||
    Math.abs(Date.now() / 1000 - epoch) > MAX_AGE_SECONDS
  )
    return NextResponse.json(
      { error: "Invalid webhook timestamp." },
      { status: 401 },
    );
  if (
    !validSignature(
      raw,
      timestamp,
      request.headers.get("x-catalog-signature") || "",
      secret,
    )
  )
    return NextResponse.json(
      { error: "Invalid webhook signature." },
      { status: 401 },
    );
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const record =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};
  const supplied =
    request.headers.get("x-event-id") ||
    (typeof record.eventId === "string" ? record.eventId : "");
  const eventId = supplied.trim().slice(0, 200);
  if (!eventId)
    return NextResponse.json(
      { error: "A stable event ID is required." },
      { status: 400 },
    );
  const inserted = await enqueueCatalogSync({
    eventId,
    trigger: "WEBHOOK",
    requestedAt: new Date().toISOString(),
  });
  return NextResponse.json(
    { accepted: true, duplicate: !inserted, eventId },
    { status: 202 },
  );
}
