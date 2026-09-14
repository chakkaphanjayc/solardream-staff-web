import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourcePath = path.join(projectRoot, "src/server/elysia/routes.ts");
const outputDirectory = path.join(projectRoot, "src/server/elysia");

const staffOnlyPrefixes = [
  "/admin",
  "/tech",
  "/v1/admin",
  "/v2/assets",
  "/v2/field",
  "/v2/integrations",
  "/v2/materials",
  "/v2/projects",
  "/v2/schedule",
  "/v2/service-cases",
  "/v2/visits",
  "/catalog/webhook",
  "/create-richmenu",
  "/crm/webhook",
  "/cron",
  "/erpnext",
  "/lifecycle",
  "/listmonk",
  "/richmenu",
  "/tickets",
  "/webhooks",
];

function routePathFromRegistration(line) {
  const match = line.match(/^\s+\.\w+\(("(?:[^"\\]|\\.)*"),/);
  return match ? JSON.parse(match[1]) : null;
}

function isStaffOnly(pathname) {
  return staffOnlyPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function registrations() {
  return fs.readFileSync(sourcePath, "utf8").split("\n").filter((line) => line.match(/^\s+\.(get|post|put|patch|delete)\(/));
}

function writeSurface(name, lines) {
  const output = `/*\n * Generated from routes.ts. This surface deliberately contains only the\n * lazy handlers assigned to the ${name} application.\n */\nimport { Elysia } from "elysia";\n\nimport { adaptLegacyHandler } from "./legacy-adapter";\n\nexport const ${name}ApiRoutes = new Elysia({\n  name: "solardream-${name}-api-routes",\n  prefix: "/api",\n})\n${lines.join("\n")}\n;\n\nexport const ${name}ApiRouteCount = ${lines.length};\n`;
  fs.writeFileSync(path.join(outputDirectory, `${name}-routes.ts`), output);
}

const allRegistrations = registrations();
const customerRegistrations = allRegistrations.filter((line) => {
  const pathname = routePathFromRegistration(line);
  return pathname ? !isStaffOnly(pathname) : false;
});

writeSurface("customer", customerRegistrations);
writeSurface("staff", allRegistrations);
console.log(`Generated customer (${customerRegistrations.length}) and staff (${allRegistrations.length}) API registrations.`);
