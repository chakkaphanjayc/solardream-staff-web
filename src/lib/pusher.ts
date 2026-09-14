import Pusher from "pusher";

// ─── Server-Only Pusher Instance ─────────────────────────────────────────────
// This file is ONLY for server-side usage (Server Actions, API routes).
// Client components MUST import from "@/lib/pusherClient" instead.
// Mixing pusher-js (client) here causes RSC crashes:
//   "pusher-js default is not a constructor"

const pusherConfig = {
  appId: process.env.PUSHER_APP_ID?.trim() || "",
  key: process.env.NEXT_PUBLIC_PUSHER_KEY?.trim() || process.env.PUSHER_KEY?.trim() || "",
  secret: process.env.PUSHER_SECRET?.trim() || "",
  cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER?.trim() || process.env.PUSHER_CLUSTER?.trim() || "",
};

const hasPusherConfig = Boolean(
  pusherConfig.appId &&
  pusherConfig.key &&
  pusherConfig.secret &&
  pusherConfig.cluster,
);

const noopPusher = {
  async trigger() {
    console.warn("[Pusher] Server realtime trigger skipped because Pusher is not configured.");
    return new Response(null, { status: 204 });
  },
} as unknown as Pick<Pusher, "trigger">;

export const pusherServer = hasPusherConfig
  ? new Pusher({
      ...pusherConfig,
      useTLS: true,
    })
  : noopPusher;

// Legacy alias — all existing `await import("@/lib/pusher")` destructuring
// `{ pusherServer }` continues to work without any migration.
export const pusher = pusherServer;
