import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const tracePath = path.resolve(".next/server/middleware.js.nft.json");
const opentelemetryRoot = path.resolve("node_modules/@opentelemetry/api");
const esmRoot = path.join(opentelemetryRoot, "build/esm");

async function collectJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectJavaScriptFiles(entryPath)));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(entryPath);
    }
  }

  return files;
}

try {
  await stat(tracePath);
  await stat(esmRoot);

  const trace = JSON.parse(await readFile(tracePath, "utf8"));
  const tracedFiles = new Set(trace.files);
  const esmFiles = await collectJavaScriptFiles(esmRoot);

  for (const file of esmFiles) {
    tracedFiles.add(path.relative(path.dirname(tracePath), file).split(path.sep).join("/"));
  }

  trace.files = [...tracedFiles].sort();
  await writeFile(tracePath, JSON.stringify(trace));
  console.log(`Cloudflare middleware trace prepared (${esmFiles.length} OpenTelemetry ESM files included).`);
} catch (error) {
  if (error?.code === "ENOENT") {
    console.log("Cloudflare middleware trace preparation skipped: Next middleware trace is not present.");
    process.exit(0);
  }

  throw error;
}
