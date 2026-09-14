import PusherClient from "pusher-js";

// ─── Client-Only Pusher Instance ─────────────────────────────────────────────
// This file is ONLY for client-side usage ("use client" components).
// Server Actions and API routes MUST import from "@/lib/pusher" instead.

export const pusherClient = typeof window !== "undefined"
  ? new PusherClient(
      process.env.NEXT_PUBLIC_PUSHER_KEY || "",
      {
        cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER || "",
      }
    )
  : null as unknown as PusherClient;
