import { NextRequest } from "next/server";

import { requireOpsV2Feature } from "@/server/services/ops-v2/api-response";
import { POST as legacyPost } from "@/server/api/tech/sync/route";

export async function POST(request: NextRequest) {
  const featureResponse = await requireOpsV2Feature("OPS_V2_FIELD");
  if (featureResponse) return featureResponse;
  return legacyPost(request);
}
