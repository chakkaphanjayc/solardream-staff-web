import { NextResponse } from "next/server";
import { extractGoogleDriveFileId, isSafeGoogleDriveFileId, normalizeMediaUrl } from "@/lib/mediaUrls";


const DRIVE_VIDEO_RESPONSE_TIMEOUT_MS = 10_000;

function getSafeRangeHeader(request: Request) {
  const range = request.headers.get("range");
  if (!range) return null;
  return /^bytes=\d*-\d*$/.test(range) && range.length <= 64 ? range : null;
}

function isAllowedVideoContentType(contentType: string) {
  const normalized = contentType.toLowerCase();
  return (
    normalized.startsWith("video/") ||
    normalized === "application/octet-stream" ||
    normalized === "binary/octet-stream"
  );
}

async function fetchDriveVideo(fileId: string, request: Request) {
  const urls = [
    `https://drive.usercontent.google.com/download?id=${fileId}&export=download`,
    `https://drive.google.com/uc?export=download&id=${fileId}`,
    `https://drive.google.com/file/d/${fileId}/preview`,
  ];

  let lastError: unknown = null;
  const range = getSafeRangeHeader(request);

  for (const url of urls) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DRIVE_VIDEO_RESPONSE_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        redirect: "follow",
        cache: "no-store",
        headers: range ? { range } : undefined,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        lastError = new Error(`Drive responded with ${response.status}`);
        continue;
      }

      const contentType = response.headers.get("content-type") || "application/octet-stream";
      const contentLength = response.headers.get("content-length");
      const contentRange = response.headers.get("content-range");
      const body = response.body;
      if (!body) {
        lastError = new Error("Drive response body was empty");
        continue;
      }

      if (!isAllowedVideoContentType(contentType)) {
        lastError = new Error(`Drive returned unsupported content type: ${contentType}`);
        continue;
      }

      return new NextResponse(body, {
        status: response.status === 206 ? 206 : 200,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
          "Accept-Ranges": "bytes",
          ...(contentLength ? { "Content-Length": contentLength } : {}),
          ...(contentRange ? { "Content-Range": contentRange } : {}),
        },
      });
    } catch (error: unknown) {
      clearTimeout(timeout);
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Unable to fetch Drive video.");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const source = normalizeMediaUrl(url.searchParams.get("src"));
  const fileId = extractGoogleDriveFileId(source);

  if (!fileId || !isSafeGoogleDriveFileId(fileId)) {
    return NextResponse.json(
      { error: "Missing or unsupported video source." },
      { status: 400 },
    );
  }

  try {
    return await fetchDriveVideo(fileId, request);
  } catch (error) {
    console.error("[Media Video Proxy] Failed to load drive video:", error);
    return NextResponse.json(
      { error: "Unable to load video source." },
      { status: 502 },
    );
  }
}
