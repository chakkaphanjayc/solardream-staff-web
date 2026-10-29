import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function collectTestFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      return collectTestFiles(entryPath);
    }

    return entry.isFile() && entry.name.endsWith(".test.ts") ? [entryPath] : [];
  });
}

const testFiles = collectTestFiles(join(repositoryRoot, "src")).sort();

if (testFiles.length === 0) {
  console.error("No TypeScript test files were found under src/.");
  process.exitCode = 1;
} else {
  const shim = "--require ./scripts/security/server-only-test-shim.cjs";
  const nodeOptions = [process.env.NODE_OPTIONS, shim].filter(Boolean).join(" ");
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "--test", ...testFiles],
    {
      cwd: repositoryRoot,
      env: { ...process.env, NODE_OPTIONS: nodeOptions },
      stdio: "inherit",
    },
  );

  if (result.error) {
    console.error(result.error);
    process.exitCode = 1;
  } else {
    process.exitCode = result.status ?? 1;
  }
}
