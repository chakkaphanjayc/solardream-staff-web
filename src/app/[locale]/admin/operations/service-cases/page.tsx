import { connection } from "next/server";

import { requireStaff } from "@/lib/auth-guard";
import { isOpsV2FeatureEnabled } from "@/lib/featureFlags";
import ServiceCasesWorkspaceClient from "./ServiceCasesWorkspaceClient";

export const instant = false;

export default async function ServiceCasesPage() {
  await connection();
  await requireStaff();
  const enabled = await isOpsV2FeatureEnabled("OPS_V2_AFTER_SALES");
  return <ServiceCasesWorkspaceClient enabled={enabled} />;
}
