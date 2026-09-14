import { createHmac, timingSafeEqual } from "node:crypto";

export interface WebhookReplayStore { claim(eventId: string, bodyHash: string): Promise<"CLAIMED" | "REPLAY" | "CONFLICT">; }
export type VerifiedWebhook = { eventId: string; replayed: boolean };
export async function verifyWebhook(input: { rawBody: Uint8Array; signature: string; timestamp: string; eventId: string; secret: string; now?: Date; toleranceSeconds?: number }, store: WebhookReplayStore): Promise<VerifiedWebhook> {
  const epoch = Number(input.timestamp);
  const now = Math.floor((input.now ?? new Date()).valueOf() / 1000);
  if (!Number.isInteger(epoch) || Math.abs(now - epoch) > (input.toleranceSeconds ?? 300)) throw new Error("Webhook timestamp is outside the accepted window.");
  if (!input.eventId.trim() || !input.secret) throw new Error("Webhook verification is incomplete.");
  const expected = createHmac("sha256", input.secret).update(input.timestamp).update(".").update(input.rawBody).digest("hex");
  const supplied = input.signature.replace(/^sha256=/, "");
  if (!/^[a-f0-9]{64}$/.test(supplied) || !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) throw new Error("Webhook signature is invalid.");
  const bodyHash = createHmac("sha256", input.secret).update(input.rawBody).digest("hex");
  const claim = await store.claim(input.eventId, bodyHash);
  if (claim === "CONFLICT") throw new Error("Webhook event ID was reused with a different payload.");
  return { eventId: input.eventId, replayed: claim === "REPLAY" };
}
