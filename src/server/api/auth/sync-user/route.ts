import { NextResponse } from "next/server";
import { ensureUserExists } from "@/app/actions/auth";
import { isProfileComplete } from "@/lib/profileCompletion";
import { createClient } from "@/utils/supabase/server";
import { claimEstimateDraftFromCookie } from "@/lib/estimateDraftBridge";

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const dbUser = await ensureUserExists(user);
    if (!dbUser) throw new Error("User synchronization failed.");
    const estimateDraft = await claimEstimateDraftFromCookie(dbUser.id);
    return NextResponse.json({
      success: true,
      profileComplete: isProfileComplete(dbUser),
      estimateDraftClaimed: estimateDraft.claimed,
    });
  } catch (error) {
    console.error("[Auth Sync]: Failed to sync authenticated user", error);
    return NextResponse.json({ success: false, error: "Unable to sync user profile." }, { status: 500 });
  }
}
