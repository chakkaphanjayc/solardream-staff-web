import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const apiRoot = path.join(projectRoot, "src/server/api");
const outputPath = path.join(projectRoot, "src/server/elysia/routes.ts");
const methods = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const routeFiles = [];

function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(absolutePath);
    else if (entry.isFile() && entry.name === "route.ts") routeFiles.push(absolutePath);
  }
}

function exportedMethods(source) {
  const found = new Set();

  for (const method of methods) {
    const patterns = [
      new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\b`),
      new RegExp(`export\\s+const\\s+${method}\\b`),
      new RegExp(`export\\s*\\{[^}]*\\b${method}\\b[^}]*\\}`),
    ];

    if (patterns.some((pattern) => pattern.test(source))) found.add(method);
  }

  return [...found];
}

function toElysiaPath(relativeDirectory) {
  const segments = relativeDirectory.split(path.sep).filter(Boolean);

  return `/${segments
    .map((segment) => {
      if (segment.startsWith("[[...") && segment.endsWith("]]")) {
        return `*${segment.slice(5, -2)}`;
      }

      if (segment.startsWith("[...") && segment.endsWith("]")) {
        return `*${segment.slice(4, -1)}`;
      }

      if (segment.startsWith("[") && segment.endsWith("]")) {
        return `:${segment.slice(1, -1)}`;
      }

      return segment;
    })
    .join("/")}`;
}

function generate() {
  collect(apiRoot);
  routeFiles.sort();

  const registrations = [];

  for (const absolutePath of routeFiles) {
    const source = fs.readFileSync(absolutePath, "utf8");
    const routeMethods = exportedMethods(source);
    if (routeMethods.length === 0) continue;

    const relativeDirectory = path.relative(apiRoot, path.dirname(absolutePath));
    const importPath = `@/server/api/${relativeDirectory.split(path.sep).join("/")}/route`;
    const routePath = toElysiaPath(relativeDirectory);

    for (const method of routeMethods) {
      registrations.push(
        `  .${method.toLowerCase()}(${JSON.stringify(routePath)}, adaptLegacyHandler(() => import(${JSON.stringify(importPath)}), ${JSON.stringify(method)}))`,
      );
    }
  }

  const output = `/*
 * Generated from the legacy Next route-handler modules.
 * Keep the source modules framework-agnostic; the Elysia adapter owns HTTP dispatch.
 *
 * Modules are loaded per request so importing the API server does not eagerly
 * initialize database or third-party integration clients.
 */
import { Elysia } from "elysia";

import { adaptLegacyHandler } from "./legacy-adapter";

export const apiRoutes = new Elysia({
  name: "solardream-api-routes",
  prefix: "/api",
})
${registrations.join("\n")}
;

export const apiRouteCount = ${registrations.length};
`;

  fs.writeFileSync(outputPath, output);
  console.log(`Generated ${registrations.length} lazy Elysia registrations.`);
}

generate();
