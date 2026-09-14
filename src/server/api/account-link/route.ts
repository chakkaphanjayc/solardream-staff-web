import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { isRequestContentLengthExceeded } from "@/lib/requestSize";

type AccountLinkRequestBody = {
  username?: unknown;
  password?: unknown;
  linkToken?: unknown;
};

const MAX_ACCOUNT_LINK_BODY_BYTES = 16 * 1024;

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: NextRequest) {
  try {
    if (isRequestContentLengthExceeded(request.headers, MAX_ACCOUNT_LINK_BODY_BYTES)) {
      return NextResponse.json(
        { error: "Account linking request is too large." },
        { status: 413 },
      );
    }

    const body = (await request.json().catch(() => null)) as AccountLinkRequestBody | null;
    const username = cleanString(body?.username).toLowerCase();
    const password = cleanString(body?.password);
    const linkToken = cleanString(body?.linkToken);

    if (!username || !password || !linkToken || !isValidEmail(username)) {
      return NextResponse.json(
        { error: "A valid email, password, and linkToken are required." },
        { status: 400 }
      );
    }

    if (password.length > 256 || linkToken.length > 512) {
      return NextResponse.json(
        { error: "Invalid account linking request." },
        { status: 400 },
      );
    }

    let authenticatedUserId: string | null = null;
    let customerName = "Customer";

    // 1. Connection with real Supabase Auth
    // Attempts to log in using the email/password provided against the actual auth db
    try {
      const supabase = await createClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: username,
        password: password,
      });

      if (!error && data.user) {
        authenticatedUserId = data.user.id;
        customerName = data.user.user_metadata?.full_name || data.user.email || "Customer";
      }
    } catch (authErr) {
      console.warn("Supabase Auth check failed during account linking:", authErr);
    }

    if (!authenticatedUserId) {
      return NextResponse.json(
        { error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" },
        { status: 401 },
      );
    }

    // 3. Generate the standard LINE account-linking redirect URL. LINE issues
    // the link token before this request; the platform completes verification
    // at the redirect URL and sends the account-link event to the webhook.
    const nonce = crypto.randomUUID();
    
    // Save this nonce in the database associated with the authenticated user
    if (authenticatedUserId) {
      await db.update(users)
        .set({ lineLinkNonce: nonce })
        .where(eq(users.id, authenticatedUserId));
    }

    console.log(`[Account Link API] Created linking association: Nonce ${nonce} -> User ID ${authenticatedUserId}`);

    const redirectUrl = `https://access.line.me/dialog/bot/accountLink?linkToken=${linkToken}&nonce=${nonce}`;

    return NextResponse.json({
      success: true,
      name: customerName,
      redirectUrl, // Frontend will redirect here to complete linking on the LINE platform
    });

  } catch (error: unknown) {
    console.error("Account Link processing error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
