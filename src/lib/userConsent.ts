import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import {
  applyConsentPreferencePatch,
  normalizeUserConsentPreferences,
  type ConsentPreferencePatch,
  type UserConsentPreferences,
} from "@/lib/consentPreferences";
import { enqueueIntegrationEvent } from "@/lib/integrationOutbox";
import { normalizePreferredLanguage } from "@/lib/userLanguage";

export const LISTMONK_SUBSCRIBER_SYNC_TOPIC = "listmonk.subscriber.sync";

async function enqueueListmonkSync(
  executor: Parameters<typeof enqueueIntegrationEvent>[0],
  userId: string,
  preferences: UserConsentPreferences,
  source: "profile_sync" | "registration" | "preferences",
  profile: { preferredLanguage: unknown; lineUserId: string | null },
) {
  const preferredLanguage = normalizePreferredLanguage(profile.preferredLanguage);
  const lineIdentity = profile.lineUserId?.trim() || "none";
  await enqueueIntegrationEvent(executor, {
    topic: LISTMONK_SUBSCRIBER_SYNC_TOPIC,
    aggregateType: "USER",
    aggregateId: userId,
    payload: { source, consentRevision: preferences.revision },
    dedupeKey: `${LISTMONK_SUBSCRIBER_SYNC_TOPIC}:${userId}:${preferences.revision}:${preferredLanguage}:${lineIdentity}`,
  });
}

export async function ensureUserConsentSync(userId: string) {
  return db.transaction(async (tx) => {
    const [user] = await tx.select({
      consentPreferences: users.consentPreferences,
      preferredLanguage: users.preferredLanguage,
      lineUserId: users.lineUserId,
    })
      .from(users)
      .where(eq(users.id, userId))
      .for("update");
    if (!user) throw new Error("User profile does not exist.");

    const preferences = normalizeUserConsentPreferences(user.consentPreferences);
    if (JSON.stringify(preferences) !== JSON.stringify(user.consentPreferences)) {
      await tx.update(users).set({ consentPreferences: preferences }).where(eq(users.id, userId));
    }
    await enqueueListmonkSync(tx, userId, preferences, "profile_sync", user);
    return preferences;
  });
}

export async function updateUserConsentPreferences(
  userId: string,
  patch: ConsentPreferencePatch,
  source: "registration" | "preferences",
) {
  return db.transaction(async (tx) => {
    const [user] = await tx.select({
      consentPreferences: users.consentPreferences,
      preferredLanguage: users.preferredLanguage,
      lineUserId: users.lineUserId,
    })
      .from(users)
      .where(eq(users.id, userId))
      .for("update");
    if (!user) throw new Error("User profile does not exist.");

    const preferences = applyConsentPreferencePatch(user.consentPreferences, patch);
    await tx.update(users).set({ consentPreferences: preferences }).where(eq(users.id, userId));
    await enqueueListmonkSync(tx, userId, preferences, source, user);
    return preferences;
  });
}
