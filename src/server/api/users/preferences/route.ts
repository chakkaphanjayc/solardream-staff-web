import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { ensureUserExists } from "@/app/actions/auth";
import { consentPreferencePatchSchema, normalizeUserConsentPreferences } from "@/lib/consentPreferences";
import { enforcePortalRateLimit, getPortalClientAddress } from "@/lib/portalRateLimit";
import { updateUserConsentPreferences } from "@/lib/userConsent";
import { createClient } from "@/utils/supabase/server";

function preferencesJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

function isAllowedOrigin(request: NextRequest) {
  const source = request.headers.get("origin") || request.headers.get("referer") || "";
  if (!source) return false;
  const allowed = new Set([request.nextUrl.origin]);
  for (const configured of [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NEXT_PUBLIC_ADMIN_URL,
  ]) {
    if (!configured) continue;
    try { allowed.add(new URL(configured).origin); } catch { /* Invalid configuration is not trusted. */ }
  }
  try { return allowed.has(new URL(source).origin); } catch { return false; }
}

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  return await ensureUserExists(user);
}

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return preferencesJson({ success: false, error: "Unauthorized." }, { status: 401 });
    return preferencesJson({
      success: true,
      preferences: normalizeUserConsentPreferences(user.consentPreferences),
    });
  } catch (error) {
    console.error("[User Preferences] Failed to load preferences.", error);
    return preferencesJson({ success: false, error: "Preferences are temporarily unavailable." }, { status: 503 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    if (!isAllowedOrigin(request)) {
      return preferencesJson({ success: false, error: "Forbidden." }, { status: 403 });
    }
    const user = await getAuthenticatedUser();
    if (!user) return preferencesJson({ success: false, error: "Unauthorized." }, { status: 401 });
    const rate = await enforcePortalRateLimit({
      namespace: "user-preferences",
      identity: `${user.id}:${getPortalClientAddress(request.headers)}`,
      limit: 20,
      windowSeconds: 60,
    });
    if (!rate.allowed) {
      return preferencesJson({ success: false, error: "Too many requests." }, { status: 429 });
    }

    const patch = consentPreferencePatchSchema.parse(await request.json());
    const preferences = await updateUserConsentPreferences(user.id, patch, "preferences");
    return preferencesJson({ success: true, preferences });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return preferencesJson({ success: false, error: "Invalid preference values." }, { status: 400 });
    }
    console.error("[User Preferences] Failed to update preferences.", error);
    return preferencesJson({ success: false, error: "Unable to save preferences." }, { status: 503 });
  }
}
