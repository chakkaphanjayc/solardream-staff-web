import { fileURLToPath } from "node:url";

import { COMMUNICATION_WORKER_TOPICS } from "@solar-dream/contracts/workers";

import { processIntegrationOutbox } from "@/lib/outboxProcessor";

export async function processCommunicationsWorkerOnce(limit = 20) {
  return processIntegrationOutbox({ limit, topics: COMMUNICATION_WORKER_TOPICS });
}

const isMainModule = process.argv[1]
  ? fileURLToPath(import.meta.url) === fileURLToPath(new URL(process.argv[1], "file://"))
  : false;

if (isMainModule) {
  const result = await processCommunicationsWorkerOnce();
  console.log(JSON.stringify({ worker: "communications", ...result }));
  if (result.failed > 0) process.exitCode = 1;
}
