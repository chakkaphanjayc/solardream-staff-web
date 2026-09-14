import { getCustomerWarrantyCard } from "@/lib/services/warranty-registrar";
import { portalJson } from "@/lib/portalAccess";
import { createClient } from "@/utils/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return portalJson({ success: false, error: "Authentication is required." }, { status: 401 });
    }

    const card = await getCustomerWarrantyCard(user.id);
    if (!card) {
      return portalJson(
        {
          success: false,
          error: "Your completed installation warranty card is not available yet.",
          code: "WARRANTY_CARD_NOT_READY",
        },
        { status: 404 },
      );
    }

    return portalJson({ success: true, card });
  } catch (error: unknown) {
    console.error("[Customer Warranty Card] Failed to load warranty card.", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return portalJson(
      {
        success: false,
        error: "Your warranty card is temporarily unavailable. Please try again.",
        retryable: true,
      },
      { status: 503 },
    );
  }
}
