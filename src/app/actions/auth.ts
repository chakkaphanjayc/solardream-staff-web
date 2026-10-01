"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cache } from "react";

import { cookies } from "next/headers";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { buildSignupEmailRedirectTo } from "@/lib/authRedirect";
import { registrationConsentPreferences } from "@/lib/consentPreferences";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { normalizePreferredLanguage } from "@/lib/userLanguage";
import type { AuditEventInput } from "@/lib/auditLog";

function getBootstrapAdminEmails() {
  return new Set(
    (process.env.SOLARDREAM_ADMIN_EMAILS || process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

function getMetadataString(
  metadata: SupabaseUser["user_metadata"] | SupabaseUser["app_metadata"],
  key: string,
) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getSupabaseLineUserId(supabaseUser: SupabaseUser) {
  const lineIdentity = supabaseUser.identities?.find((identity) =>
    identity.provider === "line" ||
    identity.provider === "custom:line" ||
    identity.provider === "custom_line"
  );
  const identityData =
    lineIdentity?.identity_data && typeof lineIdentity.identity_data === "object"
      ? lineIdentity.identity_data as Record<string, unknown>
      : null;
  const identitySub = identityData && typeof identityData.sub === "string" ? identityData.sub.trim() : null;
  const identityUserId = identityData && typeof identityData.user_id === "string" ? identityData.user_id.trim() : null;

  return (
    lineIdentity?.id ||
    identitySub ||
    identityUserId ||
    getMetadataString(supabaseUser.user_metadata, "sub") ||
    getMetadataString(supabaseUser.user_metadata, "user_id") ||
    getMetadataString(supabaseUser.user_metadata, "line_user_id") ||
    null
  );
}

function getSupabaseDisplayName(supabaseUser: SupabaseUser) {
  return (
    getMetadataString(supabaseUser.user_metadata, "full_name") ||
    getMetadataString(supabaseUser.user_metadata, "name") ||
    getMetadataString(supabaseUser.user_metadata, "display_name")
  );
}

function getSupabaseAvatarUrl(supabaseUser: SupabaseUser) {
  return (
    getMetadataString(supabaseUser.user_metadata, "avatar_url") ||
    getMetadataString(supabaseUser.user_metadata, "picture") ||
    getMetadataString(supabaseUser.user_metadata, "picture_url")
  );
}

async function getUTMFromCookies() {
  try {
    const cookieStore = await cookies();
    return {
      utm_source: cookieStore.get("utm_source")?.value || null,
      utm_medium: cookieStore.get("utm_medium")?.value || null,
      utm_campaign: cookieStore.get("utm_campaign")?.value || null,
    };
  } catch (error) {
    console.error("Failed to read UTM cookies:", error);
    return { utm_source: null, utm_medium: null, utm_campaign: null };
  }
}

export async function ensureUserExists(supabaseUser: SupabaseUser) {
  if (!supabaseUser) return null;

  const email = supabaseUser.email || supabaseUser.user_metadata?.email;
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  const name = getSupabaseDisplayName(supabaseUser);
  const avatarUrl = getSupabaseAvatarUrl(supabaseUser);
  const preferredLanguageMetadata = getMetadataString(supabaseUser.user_metadata, "preferred_language");
  const preferredLanguage = preferredLanguageMetadata
    ? normalizePreferredLanguage(preferredLanguageMetadata)
    : null;

  if (!normalizedEmail) return null;

  try {
    const [{ db, withDatabaseRetry }, { users }, { eq, or }] = await Promise.all([
      import("@/db"),
      import("@/db/schema"),
      import("drizzle-orm"),
    ]);
    const utmCookies = await getUTMFromCookies();

    const lineUserId = getSupabaseLineUserId(supabaseUser);
    const existingUser = await withDatabaseRetry(() => db.query.users.findFirst({
      where: lineUserId
        ? or(
            eq(users.lineUserId, lineUserId),
            eq(users.email, normalizedEmail),
            eq(users.id, supabaseUser.id),
          )
        : or(eq(users.email, normalizedEmail), eq(users.id, supabaseUser.id)),
    }));
    // A failed upstream auth deletion must never restore an anonymized local identity.
    if (existingUser && (existingUser.anonymizedAt || existingUser.deletionRequestedAt || !existingUser.isActive)) return null;

    // Bootstrap admin access from deployment config only; existing DB roles are preserved.
    const isAdmin = getBootstrapAdminEmails().has(normalizedEmail);
    const userRole = isAdmin ? "ADMIN" : (existingUser?.role || "USER");
    const fullName = existingUser?.fullName || name || "";
    if (existingUser) {
      const [updatedUser] = await withDatabaseRetry(() => db
          .update(users)
          .set({
            email: normalizedEmail,
            ...(existingUser.name ? {} : { name }),
            ...(existingUser.fullName ? {} : { fullName }),
            ...(existingUser.avatarUrl || !avatarUrl ? {} : { avatarUrl }),
            ...(lineUserId ? { lineUserId, lineLinkNonce: null } : {}),
            ...(utmCookies.utm_source ? { utm_source: utmCookies.utm_source } : {}),
            ...(utmCookies.utm_medium ? { utm_medium: utmCookies.utm_medium } : {}),
            ...(utmCookies.utm_campaign ? { utm_campaign: utmCookies.utm_campaign } : {}),
            lastActivityAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(users.id, existingUser.id))
          .returning());

      const resolvedUser = updatedUser ?? existingUser;
      try {
        const { ensureUserConsentSync } = await import("@/lib/userConsent");
        await ensureUserConsentSync(resolvedUser.id);
      } catch (consentError) {
        console.warn("[Auth]: Failed to enqueue the user preference sync.", consentError);
      }
      if (supabaseUser.email_confirmed_at && supabaseUser.email) {
        try {
          const cookieStore = await cookies();
          const { claimServicePortalIntent, SERVICE_PORTAL_CLAIM_COOKIE } = await import("@/lib/servicePortal");
          const claim = await claimServicePortalIntent(resolvedUser.id, normalizedEmail, cookieStore.get(SERVICE_PORTAL_CLAIM_COOKIE)?.value);
          if (claim.terminal) cookieStore.delete(SERVICE_PORTAL_CLAIM_COOKIE);
        } catch (claimError) {
          console.warn("[Auth]: Service portal claim bridge was deferred.", claimError);
        }
      }

      return resolvedUser;
    }

    const [updatedUser] = await withDatabaseRetry(() => db.insert(users)
        .values({
          id: supabaseUser.id,
          email: normalizedEmail,
          name,
          fullName,
          role: userRole,
          ...(avatarUrl ? { avatarUrl } : {}),
          utm_source: utmCookies.utm_source,
          utm_medium: utmCookies.utm_medium,
          utm_campaign: utmCookies.utm_campaign,
          ...(lineUserId ? { lineUserId } : {}),
          ...(preferredLanguage ? { preferredLanguage } : {}),
        })
        .onConflictDoUpdate({
          target: users.id,
          set: {
            email: normalizedEmail,
            name,
            ...(fullName ? { fullName } : {}),
            role: userRole,
            ...(avatarUrl ? { avatarUrl } : {}),
            ...(utmCookies.utm_source ? { utm_source: utmCookies.utm_source } : {}),
            ...(utmCookies.utm_medium ? { utm_medium: utmCookies.utm_medium } : {}),
            ...(utmCookies.utm_campaign ? { utm_campaign: utmCookies.utm_campaign } : {}),
            ...(lineUserId ? { lineUserId } : {}),
            lastActivityAt: new Date(),
          },
        })
        .returning());

    if (updatedUser) {
      try {
        const { ensureUserConsentSync } = await import("@/lib/userConsent");
        await ensureUserConsentSync(updatedUser.id);
      } catch (consentError) {
        console.warn("[Auth]: Failed to enqueue the user preference sync.", consentError);
      }
      if (supabaseUser.email_confirmed_at && supabaseUser.email) {
        try {
          const cookieStore = await cookies();
          const { claimServicePortalIntent, SERVICE_PORTAL_CLAIM_COOKIE } = await import("@/lib/servicePortal");
          const claim = await claimServicePortalIntent(updatedUser.id, supabaseUser.email, cookieStore.get(SERVICE_PORTAL_CLAIM_COOKIE)?.value);
          if (claim.terminal) cookieStore.delete(SERVICE_PORTAL_CLAIM_COOKIE);
        } catch (claimError) {
          console.warn("[Auth]: Service portal claim bridge was deferred.", claimError);
        }
      }
    }

    return updatedUser;
  } catch (error) {
    console.error("[Auth]: Failed to sync Supabase user into operational DB", error);
    return null;
  }
}

async function syncUserProfileBestEffort(supabaseUser: SupabaseUser) {
  const timeout = new Promise<null>((resolve) => {
    setTimeout(() => resolve(null), 1500);
  });

  return Promise.race([ensureUserExists(supabaseUser), timeout]);
}

async function recordAuthAudit(input: AuditEventInput) {
  const { recordAuditEventBestEffort } = await import("@/lib/auditLog");
  await recordAuditEventBestEffort(input);
}

function getAuthActorType(role: string | null | undefined): AuditEventInput["actorType"] {
  if (role === "ADMIN" || role === "SUPER_ADMIN") return "ADMIN";
  if (role === "STAFF" || role === "MANAGER" || role === "INSTALLER") return "STAFF";
  return "USER";
}

export async function login(formData: FormData) {
  try {
    const botCheck = await verifyTurnstileToken({
      token: formData.get("turnstileToken")?.toString(),
      expectedAction: "auth_login",
    });
    if (!botCheck.success) {
      await recordAuthAudit({
        action: "LOGIN_DENIED",
        resourceType: "AUTH",
        actorType: "ANONYMOUS",
        outcome: "DENIED",
        metadata: { reason: "bot_check" },
      });
      return { error: botCheck.error || "Security check failed." };
    }

    const supabase = await createClient();
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.warn("[Auth]: Password login rejected.", { email, code: error.code });
      await recordAuthAudit({
        action: "LOGIN_DENIED",
        resourceType: "AUTH",
        actorType: "ANONYMOUS",
        outcome: "DENIED",
        metadata: { reason: "invalid_credentials", provider: "password" },
      });
      return { error: "Invalid email or password." };
    }

    if (data.user) {
      const syncedUser = await syncUserProfileBestEffort(data.user) ?? await ensureUserExists(data.user);
      if (!syncedUser) {
        await supabase.auth.signOut();
        await recordAuthAudit({
          action: "LOGIN_DENIED",
          resourceType: "AUTH",
          actorUserId: data.user.id,
          actorType: "USER",
          outcome: "DENIED",
          metadata: { reason: "inactive_account", provider: "password" },
        });
        return { error: "This account is no longer active." };
      }
      await recordAuthAudit({
        action: "LOGIN_SUCCESS",
        resourceType: "AUTH",
        actorUserId: syncedUser.id,
        actorType: getAuthActorType(syncedUser.role),
        metadata: { provider: "password" },
      });
      const { claimEstimateDraftFromCookie } = await import("@/lib/estimateDraftBridge");
      await claimEstimateDraftFromCookie(syncedUser.id);
    }

    revalidatePath("/", "layout");
    return { success: true };
  } catch (err: unknown) {
    console.error("Login error:", err);
    return { error: "Failed to sign in. Please try again." };
  }
}

export async function signup(formData: FormData) {
  try {
    const botCheck = await verifyTurnstileToken({
      token: formData.get("turnstileToken")?.toString(),
      expectedAction: "auth_register",
    });
    if (!botCheck.success) {
      await recordAuthAudit({
        action: "SIGNUP_DENIED",
        resourceType: "AUTH",
        actorType: "ANONYMOUS",
        outcome: "DENIED",
        metadata: { reason: "bot_check" },
      });
      return { error: botCheck.error || "Security check failed." };
    }

    const supabase = await createClient();
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const name = formData.get("name") as string;
    const consentPreferences = registrationConsentPreferences(formData);
    const preferredLanguage = normalizePreferredLanguage(formData.get("locale"));
    const emailRedirectTo = buildSignupEmailRedirectTo({
      locale: formData.get("locale"),
      nextPath: formData.get("next"),
    });

    const { error, data } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name,
          preferred_language: preferredLanguage,
        },
        emailRedirectTo,
      },
    });

    if (error) {
      console.warn("[Auth]: Signup rejected.", { email, code: error.code });
      await recordAuthAudit({
        action: "SIGNUP_DENIED",
        resourceType: "AUTH",
        actorType: "ANONYMOUS",
        outcome: "DENIED",
        metadata: { reason: "provider_rejected", provider: "password" },
      });
      return { error: "Unable to create this account. Please check your details and try again." };
    }

    if (data.user) {
      const syncedUser = await syncUserProfileBestEffort(data.user) ?? await ensureUserExists(data.user);
      if (syncedUser) {
        await recordAuthAudit({
          action: "SIGNUP_SUCCESS",
          resourceType: "AUTH",
          actorUserId: syncedUser.id,
          actorType: getAuthActorType(syncedUser.role),
          metadata: { provider: "password" },
        });
        try {
          const { updateUserConsentPreferences } = await import("@/lib/userConsent");
          await updateUserConsentPreferences(syncedUser.id, consentPreferences, "registration");
        } catch (consentError) {
          console.warn("[SIGNUP] Marketing preference sync was deferred:", consentError);
        }

        // Re-bind document if reference_number is provided
        const refNum = formData.get("reference_number") as string;
        if (refNum) {
          try {
            const { db } = await import("@/db");
            const { proposals, serviceOrders } = await import("@/db/schema");
            const { eq, or, sql } = await import("drizzle-orm");
            const { normalizeTrackingReference } = await import("@/lib/trackingReference");

            const cleanRef = normalizeTrackingReference(refNum);
            
            // Re-bind matching proposals
            const proposal = await db.query.proposals.findFirst({
              where: or(
                eq(proposals.id, cleanRef),
                eq(proposals.erpnextQuotationId, cleanRef),
                eq(proposals.magicTokenSlug, cleanRef),
                sql`${proposals.configurationData}->>'trackingRef' = ${cleanRef}`,
                sql`${proposals.configurationData}->>'trackingId' = ${cleanRef}`,
                sql`${proposals.configurationData}->>'orderReference' = ${cleanRef}`,
                sql`('SD-QT-' || substr(translate(upper(replace(${proposals.id}::text, '-', '')), '01ILO', '23444'), 1, 6)) = ${cleanRef}`
              ),
            });
            if (proposal) {
              await db.update(proposals)
                .set({ userId: syncedUser.id })
                .where(eq(proposals.id, proposal.id));
            }

            // Re-bind matching service orders
            const serviceOrder = await db.query.serviceOrders.findFirst({
              where: eq(serviceOrders.trackingRef, cleanRef),
            });
            if (serviceOrder) {
              await db.update(serviceOrders)
                .set({ customerUserId: syncedUser.id })
                .where(eq(serviceOrders.id, serviceOrder.id));
            }
          } catch (bindError) {
            console.error("[SIGNUP] Failed to re-bind document reference:", bindError);
          }
        }
      }
      if (data.session && syncedUser) {
        const { claimEstimateDraftFromCookie } = await import("@/lib/estimateDraftBridge");
        await claimEstimateDraftFromCookie(syncedUser.id);
      }
      try {
        const { sendWelcomeEmail } = await import("@/lib/email");
        const result = await sendWelcomeEmail(email, name);
        if (!result.success) {
          console.warn("[SIGNUP] Welcome email was not sent:", result);
        }
      } catch (emailError) {
        console.error("[SIGNUP] Welcome email failed after user creation:", emailError);
      }
    }

    revalidatePath("/", "layout");
    return { success: true, message: "Check your email for confirmation." };
  } catch (err: unknown) {
    console.error("Signup error:", err);
    return { error: "Failed to create account. Please try again." };
  }
}

export async function signOut() {
  const supabase = await createClient();
  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.warn("[Auth]: Sign out failed.", { code: error.code });
    await recordAuthAudit({
      action: "LOGOUT_FAILURE",
      resourceType: "AUTH",
      actorUserId: currentUser?.id || null,
      actorType: currentUser ? "USER" : "ANONYMOUS",
      outcome: "FAILURE",
      metadata: { provider: "supabase" },
    });
    return { error: "Failed to sign out. Please try again." };
  }

  await recordAuthAudit({
    action: "LOGOUT_SUCCESS",
    resourceType: "AUTH",
    actorUserId: currentUser?.id || null,
    actorType: currentUser ? "USER" : "ANONYMOUS",
    metadata: { provider: "supabase" },
  });

  revalidatePath("/", "layout");
  return { success: true };
}

export async function getUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    await syncUserProfileBestEffort(user);
  }
  return user;
}

export const getDbUser = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const [{ db }, { users }, { eq }] = await Promise.all([
    import("@/db"),
    import("@/db/schema"),
    import("drizzle-orm"),
  ]);
  return await db.query.users.findFirst({
    where: eq(users.id, user.id)
  }) ?? null;
});

export async function checkAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const dbUser = await ensureUserExists(user);

  if (!dbUser || !["ADMIN", "SUPER_ADMIN", "MANAGER", "STAFF"].includes(dbUser.role)) {
    redirect("/");
  }

  return dbUser;
}

export async function getCurrentUserAdminStatus(): Promise<{ isAdmin: boolean; isStaff: boolean }> {
  try {
    const user = await getDbUser();
    if (!user) return { isAdmin: false, isStaff: false };
    const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";
    const isStaff = isAdmin || user.role === "STAFF" || user.role === "MANAGER";
    return { isAdmin, isStaff };
  } catch {
    return { isAdmin: false, isStaff: false };
  }
}
