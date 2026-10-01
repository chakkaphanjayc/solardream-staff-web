import { NextResponse } from "next/server";

import { requireStaffJson } from "@/lib/auth-guard";
import { subscribeToAdminEvents, type AdminSseEvent } from "@/lib/sse-publisher";


const encoder = new TextEncoder();
const HEARTBEAT_INTERVAL_MS = 25_000;
const isRealtimeDisabled = process.env.SOLARDREAM_REALTIME_MODE !== "stream" || process.env.SOLARDREAM_CLOUDFLARE_BUILD === "1";

function encodeEvent(event: AdminSseEvent) {
  return encoder.encode(`event: message\ndata: ${JSON.stringify(event)}\n\n`);
}

export async function GET(request: Request) {
  if (isRealtimeDisabled) {
    return new NextResponse(null, {
      status: 410,
      headers: { "Cache-Control": "no-store", "X-Solar-Realtime": "polling-on-workers" },
    });
  }

  const access = await requireStaffJson();
  if (!access.ok) return access.response;

  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    unsubscribe?.();
    unsubscribe = null;
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enqueue = (chunk: Uint8Array) => {
        if (closed) return;
        try {
          controller.enqueue(chunk);
        } catch {
          close();
        }
      };

      enqueue(encoder.encode("retry: 5000\n\n"));
      unsubscribe = subscribeToAdminEvents((event) => enqueue(encodeEvent(event)));
      heartbeat = setInterval(() => enqueue(encoder.encode(`: keepalive ${Date.now()}\n\n`)), HEARTBEAT_INTERVAL_MS);
      request.signal.addEventListener("abort", close, { once: true });
    },
    cancel() {
      close();
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
