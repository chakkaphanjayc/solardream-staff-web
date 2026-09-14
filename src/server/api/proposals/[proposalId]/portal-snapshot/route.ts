import { NextRequest } from "next/server";

import { portalJson, resolvePortalAccess } from "@/lib/portalAccess";
import { loadPortalSnapshot } from "@/lib/portalSnapshot";

type RouteContext = { params: Promise<{ proposalId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  let proposalId = "unknown";
  try {
    ({ proposalId } = await context.params);
    const access = await resolvePortalAccess({
      request,
      proposalId,
      capability: "proposal:read",
    });
    if (!access) return portalJson({ success: false, error: "Access denied." }, { status: 401 });

    const snapshot = await loadPortalSnapshot(access);
    return portalJson({ success: true, snapshot });
  } catch (error) {
    console.error("[Portal Snapshot] Failed to load portal data.", {
      proposalId,
      error,
    });
    return portalJson(
      {
        success: false,
        error: "Portal data is temporarily unavailable. Please try again.",
        retryable: true,
      },
      { status: 503 },
    );
  }
}
