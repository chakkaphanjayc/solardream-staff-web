import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve("src");
const SOURCE_EXTENSION_PATTERN = /\.(?:tsx?|jsx?)$/;
const CLIENT_DIRECTIVE_PATTERN = /^\s*["']use client["'];?/m;
const ENV_PATTERN = /process\.env\.([A-Z0-9_]+)/g;

function walk(directory, files = []) {
  for (const entry of readdirSync(directory)) {
    const fullPath = path.join(directory, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      walk(fullPath, files);
    } else if (SOURCE_EXTENSION_PATTERN.test(entry)) {
      files.push(fullPath);
    }
  }
  return files;
}

const violations = [];

for (const file of walk(ROOT)) {
  const source = readFileSync(file, "utf8");
  if (!CLIENT_DIRECTIVE_PATTERN.test(source)) continue;

  const envNames = Array.from(source.matchAll(ENV_PATTERN), (match) => match[1]);
  const serverEnvNames = envNames.filter((name) => !name.startsWith("NEXT_PUBLIC_"));
  if (serverEnvNames.length > 0) {
    violations.push({
      file: path.relative(process.cwd(), file),
      envNames: Array.from(new Set(serverEnvNames)),
    });
  }
}

if (violations.length > 0) {
  console.error("Server-only environment variables were referenced from client components:");
  for (const violation of violations) {
    console.error(`- ${violation.file}: ${violation.envNames.join(", ")}`);
  }
  process.exit(1);
}

console.log("Client env check passed: only NEXT_PUBLIC_* variables are used in client components.");
