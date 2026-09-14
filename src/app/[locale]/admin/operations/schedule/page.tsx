import { connection } from "next/server";

import ScheduleWorkspaceClient from "./ScheduleWorkspaceClient";
import { requireStaff } from "@/lib/auth-guard";
import { isOpsV2FeatureEnabled } from "@/lib/featureFlags";
import { listScheduleBoard } from "@/server/services/ops-v2/scheduling-service";

export const instant = false;

export default async function OperationsSchedulePage() {
  await connection();
  const user = await requireStaff();
  const enabled = await isOpsV2FeatureEnabled("OPS_V2_SCHEDULING");
  const initial = enabled
    ? await listScheduleBoard({ userId: user.id, role: user.role })
    : null;

  return <ScheduleWorkspaceClient enabled={enabled} initial={initial} />;
}
