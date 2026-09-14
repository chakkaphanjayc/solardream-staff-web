import "server-only";

import { z } from "zod";

import { ensureUserExists } from "@/app/actions/auth";
import { ServiceCommerceError, type ServiceActor } from "@/lib/serviceCommerce";
import { createGuestSession, hashServiceActor, SERVICE_GUEST_COOKIE, verifyGuestSession } from "@/lib/serviceGuestSession";
import { createClient } from "@/utils/supabase/server";
import type { NextRequest } from "next/server";

export const idempotencyHeaderSchema = z.string().uuid();

export async function resolveServiceActor(request: NextRequest): Promise<{ actor: ServiceActor; newGuestCookie: string | null }> {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (authUser) {
    const user = await ensureUserExists(authUser);
    if (user?.isActive && !user.anonymizedAt) return { actor: { userId: user.id, actorHash: hashServiceActor("member", user.id), guestSessionHash: null }, newGuestCookie: null };
  }
  let token = verifyGuestSession(request.cookies.get(SERVICE_GUEST_COOKIE)?.value);
  let newGuestCookie: string | null = null;
  if (!token) {
    const created = createGuestSession();
    token = created.token;
    newGuestCookie = created.cookieValue;
  }
  const guestSessionHash = hashServiceActor("guest", token);
  return { actor: { userId: null, actorHash: guestSessionHash, guestSessionHash }, newGuestCookie };
}

export function publicServiceError(error: unknown) {
  if (error instanceof z.ZodError || error instanceof SyntaxError) return { status: 400, code: "INVALID_REQUEST", message: "Please check the submitted service details." };
  if (error instanceof ServiceCommerceError) {
    const allowed = {
      ACCOUNT_UNAVAILABLE: [403, "ACCOUNT_UNAVAILABLE", "An active account is required."],
      APPOINTMENT_INVALID: [400, "APPOINTMENT_INVALID", "Please choose a future appointment date."],
      OFFERING_UNAVAILABLE: [404, "OFFERING_UNAVAILABLE", "This service is currently unavailable."],
      ASSET_UNAVAILABLE: [403, "ASSET_UNAVAILABLE", "The selected SolarDream system is unavailable."],
      AUTH_REQUIRED: [401, "AUTH_REQUIRED", "Sign in to use a registered SolarDream system."],
      LEGACY_FLOW_RETIRED: [410, "LEGACY_SERVICE_FLOW_RETIRED", "This service booking flow has been retired."],
    } as const;
    const [status, code, message] = allowed[error.code];
    return { status, code, message };
  }
  if (error instanceof Error && error.message === "BOT_DETECTED") return { status: 400, code: "INVALID_REQUEST", message: "Please check the submitted service details." };
  return { status: 503, code: "SERVICE_UNAVAILABLE", message: "Service booking is temporarily unavailable." };
}
