import { connection } from "next/server";

import { getAuditLogPage } from "@/app/actions/auditLogs";
import AuditLogsClient from "./AuditLogsClient";

export default async function AuditLogsPage() {
  await connection();
  const result = await getAuditLogPage();

  return <AuditLogsClient initialResult={result} />;
}
