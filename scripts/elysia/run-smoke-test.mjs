import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const tsxCli = fileURLToPath(new URL("../../node_modules/tsx/dist/cli.mjs", import.meta.url));
const shim = "--require ./scripts/security/server-only-test-shim.cjs";
const nodeOptions = [process.env.NODE_OPTIONS, shim].filter(Boolean).join(" ");

const result = spawnSync(process.execPath, [tsxCli, "scripts/elysia/smoke-test.ts"], {
  env: { ...process.env, NODE_OPTIONS: nodeOptions },
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error);
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
