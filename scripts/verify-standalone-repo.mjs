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

const generatedSurfacePath = path.join(projectRoot, "src", "server", "elysia", `${surface}-routes.ts`);
if (!fs.existsSync(generatedSurfacePath)) {
  failures.push(`missing generated ${surface} API surface`);
} else {
  const generatedSurface = fs.readFileSync(generatedSurfacePath, "utf8");
  const routeLine = (pathname) => generatedSurface.split("\n").some((line) => line.includes(`(\"${pathname}`));
  if (surface === "customer") {
    for (const forbiddenPath of ["/admin", "/tech", "/v1/admin", "/v2/assets", "/v2/field", "/v2/integrations", "/v2/materials", "/v2/projects", "/v2/schedule", "/v2/service-cases", "/v2/visits", "/catalog/webhook", "/create-richmenu", "/crm/webhook", "/cron", "/erpnext", "/installations/amend", "/installations/checklist", "/installations/evidence", "/installations/review", "/installations/tasks", "/lifecycle", "/listmonk", "/richmenu", "/tickets", "/webhooks"]) {
      if (routeLine(forbiddenPath)) failures.push(`customer API surface contains forbidden ${forbiddenPath}`);
    }
    if (!routeLine("/installations/projects/:proposalId/snapshot")) failures.push("customer API surface is missing the read-only installation snapshot");
  } else {
    for (const requiredPath of ["/tech/sync", "/documents/render", "/installations/amend", "/installations/checklist/:itemId/complete", "/installations/evidence", "/installations/review", "/installations/tasks/:taskId/complete"]) {
      if (!routeLine(requiredPath)) failures.push(`staff API surface is missing ${requiredPath}`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`${surface} standalone repository verification passed.`);
}
