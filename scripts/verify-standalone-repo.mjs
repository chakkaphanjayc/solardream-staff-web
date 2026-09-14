import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const surface = process.env.EXPECTED_SURFACE;
const failures = [];

if (surface !== "customer" && surface !== "staff") {
  throw new Error("EXPECTED_SURFACE must be customer or staff.");
}

function walk(directory, visitor) {
  if (!fs.existsSync(directory)) return;

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    const stats = fs.lstatSync(absolutePath);

    if (stats.isSymbolicLink()) {
      failures.push(`symlink: ${path.relative(projectRoot, absolutePath)}`);
      continue;
    }

    visitor(absolutePath, entry);
    if (stats.isDirectory()) walk(absolutePath, visitor);
  }
}

for (const directory of ["src", "packages", "public", "messages", "scripts"]) {
  walk(path.join(projectRoot, directory), () => {});
}

const routeRoot = path.join(projectRoot, "src", "app");
const forbiddenRouteSegments = surface === "customer"
  ? new Set(["admin", "installer", "tech", "tech-portal"])
  : new Set();
const requiredRouteSegments = surface === "staff"
  ? new Set(["admin", "tech-portal"])
  : new Set();
const observedRouteSegments = new Set();

walk(routeRoot, (absolutePath, entry) => {
  if (!entry.isDirectory()) return;

  const relativePath = path.relative(routeRoot, absolutePath);
  for (const segment of relativePath.split(path.sep)) {
    if (!segment || segment.startsWith("(") || segment.startsWith("[")) continue;
    observedRouteSegments.add(segment);
    if (forbiddenRouteSegments.has(segment)) {
      failures.push(`forbidden ${surface} route segment: ${relativePath}`);
    }
  }
});

for (const segment of requiredRouteSegments) {
  if (!observedRouteSegments.has(segment)) {
    failures.push(`missing required ${surface} route segment: ${segment}`);
  }
}

const packageJsonPath = path.join(projectRoot, "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const packageText = JSON.stringify(packageJson);

if (packageText.includes("workspace:")) failures.push("workspace protocol dependency remains");
if (packageText.includes("apps/*")) failures.push("monorepo app workspace remains");
if (!packageJson.name?.includes(surface)) failures.push(`package name does not identify ${surface}`);

for (const requiredPath of ["src/app", "src/server/elysia", "next.config.ts", "Dockerfile", "package-lock.json"]) {
  if (!fs.existsSync(path.join(projectRoot, requiredPath))) {
    failures.push(`missing ${requiredPath}`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`${surface} standalone repository verification passed.`);
}
