import { createHash } from "node:crypto";

import { desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { ensureUserExists } from "@/app/actions/auth";
import { db } from "@/db";
import { userConsentLogs, users } from "@/db/schema";
import { enforcePortalRateLimit } from "@/lib/portalRateLimit";
import { isSameOrigin, needsPrivacyReconsent, privacyConsentSchema, privacyHmac, privacyPolicyVersion, requestClientAddress, userAgentHash } from "@/lib/privacyConsent";
import { createClient } from "@/utils/supabase/server";


function json(body: unknown, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("X-Privacy-Policy-Version", privacyPolicyVersion());
  return response;
}

async function actor(request: NextRequest, suppliedSession?: string) {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  const user = authUser ? await ensureUserExists(authUser) : null;
  const sessionId = suppliedSession || request.headers.get("x-privacy-session") || undefined;
  if (!user && !sessionId) return null;
  return { user, sessionHash: sessionId ? privacyHmac(sessionId, "session") : null };
}

export async function GET(request: NextRequest) {
  try {
    const subject = await actor(request);
    if (!subject) return json({ success: false, error: "A session identifier is required." }, 400);
    const identity = subject.user?.id || subject.sessionHash || "unknown";
    const rate = await enforcePortalRateLimit({ namespace: "privacy-consent-read", identity, limit: 30, windowSeconds: 60 });
    if (!rate.allowed) return json({ success: false, error: "Too many requests." }, 429);
    const where = subject.user
      ? eq(userConsentLogs.userId, subject.user.id)
      : eq(userConsentLogs.sessionHash, subject.sessionHash!);
    const records = await db.select({ consentType: userConsentLogs.consentType, policyVersion: userConsentLogs.policyVersion, granted: userConsentLogs.granted, preferences: userConsentLogs.preferences, source: userConsentLogs.source, createdAt: userConsentLogs.createdAt })
      .from(userConsentLogs).where(where).orderBy(desc(userConsentLogs.createdAt)).limit(50);
    const acceptedVersion = subject.user?.privacyPolicyVersionAccepted
      || records.find((record) => record.consentType === "PRIVACY_POLICY" && record.granted)?.policyVersion;
    return json({ success: true, policyVersion: privacyPolicyVersion(), reconsentRequired: needsPrivacyReconsent(acceptedVersion), records });
  } catch (error) {
    console.error("[Privacy Consent GET]", error);
    return json({ success: false, error: "Consent records are unavailable." }, 503);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!isSameOrigin(request)) return json({ success: false, error: "Forbidden." }, 403);
    const input = privacyConsentSchema.parse(await request.json());
    const subject = await actor(request, input.sessionId);
    if (!subject) return json({ success: false, error: "A session identifier is required." }, 400);
    const policyVersion = input.policyVersion || privacyPolicyVersion();
    if (policyVersion !== privacyPolicyVersion()) return json({ success: false, error: "Consent policy version is stale." }, 409);
    const identity = subject.user?.id || subject.sessionHash!;
    const rate = await enforcePortalRateLimit({ namespace: "privacy-consent-write", identity: `${identity}:${privacyHmac(requestClientAddress(request.headers), "ip")}`, limit: 15, windowSeconds: 60 });
    if (!rate.allowed) return json({ success: false, error: "Too many requests." }, 429);
    const eventSeed = input.eventId || `${identity}:${input.consentType}:${policyVersion}:${input.granted}:${JSON.stringify(input.preferences)}`;
    const dedupeKey = createHash("sha256").update(eventSeed).digest("hex");
    await db.transaction(async (tx) => {
      await tx.insert(userConsentLogs).values({
        userId: subject.user?.id || null,
        sessionHash: subject.sessionHash,
        consentType: input.consentType,
        policyVersion,
        granted: input.granted,
        preferences: input.preferences,
        ipHash: privacyHmac(requestClientAddress(request.headers), "ip"),
        userAgentHash: userAgentHash(request.headers.get("user-agent")),
        source: input.source,
        dedupeKey,
      }).onConflictDoNothing({ target: userConsentLogs.dedupeKey });
      if (subject.user && input.consentType === "PRIVACY_POLICY" && input.granted) {
        await tx.update(users).set({ privacyPolicyVersionAccepted: policyVersion, lastActivityAt: new Date() }).where(eq(users.id, subject.user.id));
      }
    });
    // Cookie marketing consent controls tracking only. Mailing-list consent is
    // intentionally managed by /api/users/preferences so accepting cookies can
    // never subscribe someone to promotional email.
    return json({ success: true, policyVersion, reconsentRequired: false });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) return json({ success: false, error: "Invalid consent payload." }, 400);
    console.error("[Privacy Consent POST]", error);
    return json({ success: false, error: "Consent could not be recorded." }, 503);
  }
}
