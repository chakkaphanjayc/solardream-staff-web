import "server-only";

import { z } from "zod";
import { TURNSTILE_TEST_SECRET_KEY } from "@/lib/turnstile-config";

const turnstileResponseSchema = z
  .object({
    success: z.boolean(),
    "error-codes": z.array(z.string()).optional(),
    action: z.string().optional(),
    hostname: z.string().optional(),
  })
  .passthrough();

export const turnstilePayloadSchema = z
  .object({
    turnstileToken: z.string().trim().min(1).max(4096).optional(),
  })
  .passthrough();

export function stripTurnstileToken<T extends Record<string, unknown>>(
  value: T,
): Omit<T, "turnstileToken"> {
  const rest = { ...value };
  delete rest.turnstileToken;
  return rest;
}

export async function verifyTurnstileToken(input: {
  token: string | undefined;
  remoteIp?: string;
  expectedAction?: string;
}) {
  const useTestKeys =
    process.env.NODE_ENV !== "production" &&
    process.env.TURNSTILE_TEST_MODE === "true";
  const configuredSecret = (process.env.TURNSTILE_SECRET || process.env.TURNSTILE_SECRET_KEY)?.trim();
  const secret = useTestKeys ? TURNSTILE_TEST_SECRET_KEY : configuredSecret;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      console.error("[Turnstile] TURNSTILE_SECRET or TURNSTILE_SECRET_KEY is not configured.");
      return { success: false, error: "Turnstile is not configured." };
    }
    return { success: true, developmentBypass: true };
  }
  if (!input.token) return { success: false, error: "Turnstile token is missing." };

  const body = new URLSearchParams({
    secret,
    response: input.token,
  });
  if (input.remoteIp) body.set("remoteip", input.remoteIp);

  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
      },
    );
    const parsed = turnstileResponseSchema.safeParse(await response.json());
    if (!response.ok || !parsed.success) {
      return { success: false, error: "Turnstile verification failed." };
    }
    if (!parsed.data.success) {
      const errorCodes = parsed.data["error-codes"] || [];
      console.error("[Turnstile siteverify] Bot check failed. Error codes:", errorCodes);
      return {
        success: false,
        error: errorCodes.join(", ") || "Bot check failed.",
      };
    }
    if (
      input.expectedAction &&
      parsed.data.action &&
      parsed.data.action !== input.expectedAction
    ) {
      return { success: false, error: "Turnstile action mismatch." };
    }
    return { success: true };
  } catch (error) {
    console.error("[Turnstile] Verification request failed.", error);
    return { success: false, error: "Turnstile verification unavailable." };
  }
}
