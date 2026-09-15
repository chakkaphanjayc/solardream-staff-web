import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const elysiaEntry = require.resolve("elysia");
const elysiaRoot = path.dirname(path.dirname(elysiaEntry));
const { generateCompiledArtifacts } = await import(
  path.join(elysiaRoot, "dist/plugin/aot/core.js")
);

const appEntry = "src/server/elysia/staff-app.ts";
const outputPath = path.resolve(".cloudflare/elysia-compiled.mjs");
const artifacts = await generateCompiledArtifacts(appEntry, {
  target: "workerd",
  strip: "auto",
});

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, artifacts.source, "utf8");

console.log(
  `Cloudflare Elysia AOT manifest generated (${artifacts.mode} mode, ${artifacts.source.length} bytes).`,
);
