import { connection } from "next/server";

import OperationsWorkspaceClient from "./OperationsWorkspaceClient";
import { requireStaff } from "@/lib/auth-guard";
import { isOpsV2FeatureEnabled } from "@/lib/featureFlags";
import { listOpsProjects } from "@/server/services/ops-v2/project-service";

export default async function OperationsWorkspacePage() {
  await connection();
  const user = await requireStaff();
  const enabled = await isOpsV2FeatureEnabled("OPS_V2_PROJECTS");
  const initial = enabled
    ? await listOpsProjects({ userId: user.id, role: user.role }, { page: 1, limit: 25 })
    : { items: [], pagination: { page: 1, limit: 25, total: 0, totalPages: 0 } };

  return <OperationsWorkspaceClient enabled={enabled} initial={initial} />;
}
