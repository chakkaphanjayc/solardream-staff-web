"use server";

import { createClient } from "@/utils/supabase/server";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import crypto from "crypto";
import { validateUploadFile } from "@/lib/fileValidation";
import { isProfileComplete } from "@/lib/profileCompletion";
import { normalizePreferredLanguage } from "@/lib/userLanguage";

const MAX_AVATAR_FILE_SIZE = 5 * 1024 * 1024;
const MAX_PROFILE_NAME_LENGTH = 120;
const MAX_PHONE_LENGTH = 32;

async function getDatabase() {
  return (await import("@/db")).db;
}

function normalizeTextInput(value: FormDataEntryValue | null, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeLineUserId(value: string): string {
  const normalized = value.trim();
  return /^[A-Za-z0-9_-]{8,128}$/.test(normalized) ? normalized : "";
}

export async function updateProfile(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { error: "Unauthorized" };

  const name = normalizeTextInput(formData.get("name"), MAX_PROFILE_NAME_LENGTH);
  const phoneNumber = normalizeTextInput(formData.get("phoneNumber"), MAX_PHONE_LENGTH);
  const preferredLanguage = normalizePreferredLanguage(formData.get("preferredLanguage"));

  if (!name) {
    return { error: "Name is required." };
  }

  try {
    const db = await getDatabase();
    await db.update(users)
      .set({
        name,
        fullName: name,
        phoneNumber,
        preferredLanguage,
      })
      .where(eq(users.id, user.id));

    const { error: authUpdateError } = await supabase.auth.updateUser({
      data: { preferred_language: preferredLanguage },
    });
    if (authUpdateError) {
      console.warn("Profile update completed but Supabase language metadata was not updated:", authUpdateError.message);
    }

    try {
      const { ensureUserConsentSync } = await import("@/lib/userConsent");
      await ensureUserConsentSync(user.id);
    } catch (syncError) {
      console.warn("Profile update completed but Listmonk sync was deferred:", syncError);
    }

    revalidatePath("/profile");
    return { success: true };
  } catch (error: unknown) {
    console.error("Profile update error:", error);
    return { error: "Failed to update profile." };
  }
}

export async function getCurrentAccountSetupState() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { authenticated: false as const, complete: false };
  }

  const db = await getDatabase();
  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, user.id),
    columns: {
      id: true,
      name: true,
      fullName: true,
      phoneNumber: true,
      email: true,
    },
  });

  return {
    authenticated: true as const,
    complete: isProfileComplete(dbUser),
    user: dbUser
      ? {
        name: dbUser.fullName || dbUser.name || "",
        phoneNumber: dbUser.phoneNumber || "",
        email: dbUser.email,
      }
      : null,
  };
}

export async function completeAccountSetup(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { success: false, error: "Unauthorized" };

  const name = normalizeTextInput(formData.get("name"), MAX_PROFILE_NAME_LENGTH);
  const phoneNumber = normalizeTextInput(formData.get("phoneNumber"), MAX_PHONE_LENGTH);

  if (name.length < 2) {
    return { success: false, error: "Please enter your full name." };
  }

  if (phoneNumber.length < 6) {
    return { success: false, error: "Please enter a valid phone number." };
  }

  try {
    const db = await getDatabase();
    await db.update(users)
      .set({
        name,
        fullName: name,
        phoneNumber,
      })
      .where(eq(users.id, user.id));

    try {
      const { ensureUserConsentSync } = await import("@/lib/userConsent");
      await ensureUserConsentSync(user.id);
    } catch (syncError) {
      console.warn("Account setup completed but Listmonk sync was deferred:", syncError);
    }

    revalidatePath("/profile");
    revalidatePath("/account/setup");
    revalidatePath("/th/profile");
    revalidatePath("/en/profile");
    revalidatePath("/th/account/setup");
    revalidatePath("/en/account/setup");

    return { success: true };
  } catch (error: unknown) {
    console.error("Account setup error:", error);
    return { success: false, error: "Failed to finish account setup." };
  }
}

export async function uploadAvatar(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { error: "Unauthorized" };

  const file = formData.get("avatar");
  if (!file) return { error: "No file provided" };
  if (!(file instanceof File)) return { error: "Invalid avatar file." };

  try {
    const validatedFile = await validateUploadFile({
      file,
      allowedKinds: ["jpeg", "png", "webp"],
      fallbackName: "avatar",
      maxBytes: MAX_AVATAR_FILE_SIZE,
    });
    const fileName = `${user.id}-${crypto.randomUUID()}.${validatedFile.extension}`;
    const filePath = `avatars/${fileName}`;

    // 1. Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(filePath, file, {
        contentType: validatedFile.contentType,
        upsert: true,
      });

    if (uploadError) throw uploadError;

    // 2. Get Public URL
    const { data: { publicUrl } } = supabase.storage
      .from("avatars")
      .getPublicUrl(filePath);

    // 3. Update Database
    const db = await getDatabase();
    await db.update(users)
      .set({ avatarUrl: publicUrl })
      .where(eq(users.id, user.id));

    revalidatePath("/profile");
    return { success: true, url: publicUrl };
  } catch (error: unknown) {
    console.error("Avatar upload error:", error);
    return { error: "Failed to upload avatar." };
  }
}

export async function changePassword(formData: FormData) {
  const supabase = await createClient();
  const password = normalizeTextInput(formData.get("password"), 256);

  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const { error } = await supabase.auth.updateUser({
    password: password,
  });

  if (error) {
    console.error("Password change error:", error.message);
    return { error: "Failed to update password." };
  }
  return { success: true };
}

export async function disconnectLineAccount() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { error: "Unauthorized" };

  try {
    const db = await getDatabase();
    const dbUser = await db.query.users.findFirst({
      where: eq(users.id, user.id),
    });

    if (dbUser?.lineUserId) {
      try {
        const { unlinkRichMenuFromUser } = await import("@/lib/linePush");
        await unlinkRichMenuFromUser(dbUser.lineUserId);
      } catch (lineErr) {
        console.warn("Failed to unlink rich menu from LINE during disconnect:", lineErr);
      }
    }

    await db.update(users)
      .set({
        lineUserId: null,
        lineLinkNonce: null,
      })
      .where(eq(users.id, user.id));

    revalidatePath("/profile");
    return { success: true };
  } catch (error: unknown) {
    console.error("Disconnect LINE error:", error);
    return { error: "Failed to disconnect LINE account." };
  }
}

export async function initiateLineLinking(linkToken: string, preferredLanguage?: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { error: "Unauthorized" };
  const normalizedLinkToken = linkToken.trim();
  if (!normalizedLinkToken) return { error: "Link token is required" };

  try {
    const db = await getDatabase();
    const nonce = crypto.randomUUID();

    await db.update(users)
      .set({
        lineLinkNonce: nonce,
        preferredLanguage: normalizePreferredLanguage(preferredLanguage),
      })
      .where(eq(users.id, user.id));

    console.log(`[Profile Action] Initiated LINE linking for User: ${user.email}`);

    const redirectUrl = `https://access.line.me/dialog/bot/accountLink?linkToken=${encodeURIComponent(normalizedLinkToken)}&nonce=${encodeURIComponent(nonce)}`;
    return { success: true, redirectUrl };
  } catch (error: unknown) {
    console.error("Initiate LINE linking error:", error);
    return { error: "Failed to initiate LINE linking process." };
  }
}

export async function getLineBotBasicId() {
  try {
    const { getSystemSetting } = await import("@/app/actions/systemSettings");
    return await getSystemSetting("line_bot_basic_id");
  } catch (err) {
    console.error("Failed to get LINE bot basic ID:", err);
    return null;
  }
}

export async function checkLineLinkStatusByNonce(nonce: string) {
  const normalizedNonce = nonce.trim();
  if (!normalizedNonce) return { error: "Nonce is required" };

  try {
    const db = await getDatabase();
    const userWithNonce = await db.query.users.findFirst({
      where: eq(users.lineLinkNonce, normalizedNonce),
    });

    if (!userWithNonce) {
      return { success: false, pending: false, error: "Nonce not found" };
    }

    if (userWithNonce.lineUserId) {
      // Consume the nonce (clear it from database)
      await db.update(users)
        .set({ lineLinkNonce: null })
        .where(eq(users.id, userWithNonce.id));
      
      console.log(`[Profile Action] Nonced link verified and consumed for user: ${userWithNonce.email}`);
      return { success: true, pending: false, email: userWithNonce.email };
    }

    return { success: false, pending: true };
  } catch (error: unknown) {
    console.error("Check line link status error:", error);
    return { success: false, pending: false, error: "Failed to check status" };
  }
}

export async function linkLineAccountViaLiff(lineUserId: string, preferredLanguage?: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { error: "Unauthorized" };
  const normalizedLineUserId = normalizeLineUserId(lineUserId);
  if (!normalizedLineUserId) return { error: "LINE User ID is invalid" };

  try {
    const db = await getDatabase();
    // 1. Clear this lineUserId from any other user record to avoid unique constraints violation
    await db.update(users)
      .set({ lineUserId: null })
      .where(eq(users.lineUserId, normalizedLineUserId));

    // 2. Save lineUserId for the current user and clear any pending nonce
    await db.update(users)
      .set({
        lineUserId: normalizedLineUserId,
        lineLinkNonce: null,
        isLineBlocked: false,
        preferredLanguage: normalizePreferredLanguage(preferredLanguage),
      })
      .where(eq(users.id, user.id));

    const { error: authUpdateError } = await supabase.auth.updateUser({
      data: { preferred_language: normalizePreferredLanguage(preferredLanguage) },
    });
    if (authUpdateError) {
      console.warn("LIFF link completed but Supabase language metadata was not updated:", authUpdateError.message);
    }

    try {
      const { ensureUserConsentSync } = await import("@/lib/userConsent");
      await ensureUserConsentSync(user.id);
    } catch (syncError) {
      console.warn("LIFF link completed but Listmonk sync was deferred:", syncError);
    }
    
    console.log(`[LIFF Action] Linked LINE account to user ${user.email}`);

    // 3. Swap rich menu dynamically from User Group -> active schedule/profile mapping.
    const { applyResolvedRichMenuToUser } = await import("@/lib/richMenuScheduler");
    const { pushMessageToLine } = await import("@/lib/linePush");
    const richMenuResult = await applyResolvedRichMenuToUser(user.id);
    if (!richMenuResult.success) {
      console.warn("[LIFF Action] Rich menu auto-apply after account link did not complete:", richMenuResult);
    }

    // 4. Send success push notification directly to user on LINE
    const flexMessage = {
      type: "flex",
      altText: "เชื่อมต่อบัญชี SolarDream ของคุณเข้ากับ LINE สำเร็จแล้ว!",
      contents: {
        type: "bubble",
        header: {
          type: "box",
          layout: "vertical",
          backgroundColor: "#0F172A",
          contents: [
            {
              type: "text",
              text: "🎉 เชื่อมต่อบัญชีสำเร็จ (Account Linked)",
              color: "#B7D1EA",
              weight: "bold",
              size: "sm",
            },
            {
              type: "text",
              text: "SolarDream x LINE",
              color: "#FFFFFF",
              weight: "bold",
              size: "lg",
              margin: "sm",
            },
          ],
        },
        body: {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "text",
              text: `ยินดีด้วยค่ะ! บัญชี SolarDream ของคุณ (${user.email}) ได้รับการเชื่อมต่อกับ LINE เรียบร้อยแล้ว\n\nคุณสามารถใช้บริการเช็คสถานะออเดอร์ ดูใบเสนอราคา และรับสิทธิพิเศษต่างๆ ได้โดยตรงจากห้องแชทนี้เลยค่ะ`,
              size: "xs",
              color: "#475569",
              wrap: true,
            },
          ],
        },
      },
    };
    await pushMessageToLine(normalizedLineUserId, [flexMessage]);

    revalidatePath("/profile");
    return { success: true };
  } catch (error: unknown) {
    console.error("Link LINE account via LIFF error:", error);
    return { error: "Failed to link LINE account." };
  }
}

export async function checkLineLinkedStatus() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { linked: false };

  try {
    const db = await getDatabase();
    const dbUser = await db.query.users.findFirst({
      where: eq(users.id, user.id),
    });
    return { linked: !!dbUser?.lineUserId, lineUserId: dbUser?.lineUserId };
  } catch (err) {
    console.error("checkLineLinkedStatus error:", err);
    return { linked: false };
  }
}
