import { fileURLToPath } from "node:url";

import { DOCUMENT_WORKER_TOPICS } from "@solar-dream/contracts/workers";

import { processIntegrationOutbox } from "@/lib/outboxProcessor";

export async function processDocumentsWorkerOnce(limit = 20) {
  return processIntegrationOutbox({ limit, topics: DOCUMENT_WORKER_TOPICS });
}

const isMainModule = process.argv[1]
  ? fileURLToPath(import.meta.url) === fileURLToPath(new URL(process.argv[1], "file://"))
  : false;

if (isMainModule) {
  const result = await processDocumentsWorkerOnce();
  console.log(JSON.stringify({ worker: "documents", ...result }));
  if (result.failed > 0) process.exitCode = 1;
}
