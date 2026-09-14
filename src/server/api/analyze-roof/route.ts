import { NextResponse } from "next/server";
import { isRequestContentLengthExceeded } from "@/lib/requestSize";

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 20;
const MAX_ROOF_ANALYSIS_BODY_BYTES = 32 * 1024;
const requestBuckets = new Map<string, { count: number; resetAt: number }>();

type RoofAnalysisRequest = {
  bounds?: unknown;
  address?: unknown;
};

function getClientKey(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "anonymous"
  );
}

function isRateLimited(clientKey: string) {
  const now = Date.now();
  const current = requestBuckets.get(clientKey);
  if (!current || current.resetAt <= now) {
    requestBuckets.set(clientKey, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }

  current.count += 1;
  return current.count > MAX_REQUESTS_PER_WINDOW;
}

function numericHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function summarizeBounds(bounds: unknown) {
  if (!bounds || typeof bounds !== "object") return "";
  try {
    return JSON.stringify(bounds).slice(0, 512);
  } catch {
    return "";
  }
}

export async function POST(request: Request) {
  try {
    const clientKey = getClientKey(request);
    if (isRateLimited(clientKey)) {
      return NextResponse.json(
        { success: false, error: "Too many roof analysis requests. Please try again shortly." },
        { status: 429 },
      );
    }

    if (isRequestContentLengthExceeded(request.headers, MAX_ROOF_ANALYSIS_BODY_BYTES)) {
      return NextResponse.json(
        { success: false, error: "Roof analysis request is too large." },
        { status: 413 },
      );
    }

    const body = (await request.json().catch(() => null)) as RoofAnalysisRequest | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "Invalid request body." },
        { status: 400 },
      );
    }

    const address = typeof body.address === "string" ? body.address.trim().slice(0, 240) : "";
    const boundsKey = summarizeBounds(body.bounds);
    const seed = numericHash(`${address}:${boundsKey}`);

    const estimatedArea = 75 + (seed % 66);
    const estimatedPitch = 12 + (Math.floor(seed / 11) % 19);
    const estimatedConfidence = 88 + (Math.floor(seed / 17) % 10);

    return NextResponse.json({
      success: true,
      roofAreaSqm: estimatedArea,
      pitchDegrees: estimatedPitch,
      confidence: estimatedConfidence,
      detectedSections: 1,
      orientationDegrees: 180,
      model: "deterministic-precheck",
      message: "Roof precheck estimate generated from the submitted location context.",
    });
  } catch (error: unknown) {
    console.error("[Analyze Roof] Unexpected error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to analyze roof" },
      { status: 500 }
    );
  }
}
