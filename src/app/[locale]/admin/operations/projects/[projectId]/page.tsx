import { connection } from "next/server";

import ProjectWorkspaceClient from "./ProjectWorkspaceClient";
import { requireStaff } from "@/lib/auth-guard";
import { isOpsV2FeatureEnabled } from "@/lib/featureFlags";

export const instant = false;

export default async function OperationsProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  await connection();
  await requireStaff();
  const { projectId } = await params;
  const [
    projectsEnabled,
    workspaceEnabled,
    schedulingEnabled,
    assetsEnabled,
    warrantyEnabled,
    afterSalesEnabled,
  ] = await Promise.all([
    isOpsV2FeatureEnabled("OPS_V2_PROJECTS"),
    isOpsV2FeatureEnabled("OPS_V2_PROJECT_WORKSPACE"),
    isOpsV2FeatureEnabled("OPS_V2_SCHEDULING"),
    isOpsV2FeatureEnabled("OPS_V2_ASSETS"),
    isOpsV2FeatureEnabled("OPS_V2_WARRANTY"),
    isOpsV2FeatureEnabled("OPS_V2_AFTER_SALES"),
  ]);

  return (
    <ProjectWorkspaceClient
      projectId={projectId}
      enabled={projectsEnabled && workspaceEnabled}
      schedulingEnabled={schedulingEnabled}
      assetsEnabled={assetsEnabled}
      warrantyEnabled={warrantyEnabled}
      afterSalesEnabled={afterSalesEnabled}
    />
  );
}
