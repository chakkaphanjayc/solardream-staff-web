import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { ensureUserExists } from "@/app/actions/auth";
import { anonymizeUserAccount } from "@/lib/privacyAccount";
import { enforcePortalRateLimit } from "@/lib/portalRateLimit";
import { hasRecentAuthentication, isSameOrigin, privacyHmac, requestClientAddress, userAgentHash } from "@/lib/privacyConsent";
import { ACCOUNT_DELETION_CONFIRMATION } from "@/lib/privacyRedaction";
import { processOutboxBestEffort } from "@/lib/outboxProcessor";
import { createAdminClient, createClient } from "@/utils/supabase/server";


const bodySchema = z.object({ confirmation: z.literal(ACCOUNT_DELETION_CONFIRMATION) }).strict();

function json(body: unknown, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

export async function DELETE(request: NextRequest) {
  try {
    if (!isSameOrigin(request)) return json({ success: false, error: "Forbidden." }, 403);
    bodySchema.parse(await request.json());
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return json({ success: false, error: "Unauthorized." }, 401);
    if (!hasRecentAuthentication(authUser.last_sign_in_at)) {
      return json({ success: false, error: "For your security, sign out and sign in again before deleting your account." }, 403);
    }
    const user = await ensureUserExists(authUser);
    if (!user) return json({ success: false, error: "Account profile is unavailable." }, 404);
    const clientAddress = requestClientAddress(request.headers);
    const rate = await enforcePortalRateLimit({ namespace: "privacy-account-delete", identity: `${user.id}:${privacyHmac(clientAddress, "ip")}`, limit: 3, windowSeconds: 3600 });
    if (!rate.allowed) return json({ success: false, error: "Too many requests." }, 429);

    const result = await anonymizeUserAccount({ userId: user.id, ipHash: privacyHmac(clientAddress, "ip"), userAgentHash: userAgentHash(request.headers.get("user-agent")), source: "account_deletion" });

    let upstreamAccountDeleted = false;
    if (process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
      try {
        const { error } = await createAdminClient().auth.admin.deleteUser(authUser.id);
        upstreamAccountDeleted = !error;
        if (error) console.warn("[Privacy Account] Supabase deletion requires operator retry.", { code: error.code });
      } catch (error) {
        console.warn("[Privacy Account] Supabase deletion requires operator retry.", error);
      }
    }
    try { await supabase.auth.signOut(); } catch { /* Local anonymization is authoritative. */ }
    void processOutboxBestEffort(user.id);
    return json({ success: true, alreadyAnonymized: result.alreadyAnonymized, upstreamAccountDeleted, operatorActionRequired: !upstreamAccountDeleted });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) return json({ success: false, error: `Confirmation must exactly match '${ACCOUNT_DELETION_CONFIRMATION}'.` }, 400);
    console.error("[Privacy Account DELETE]", error);
    return json({ success: false, error: "Account anonymization could not be completed." }, 503);
  }
}
