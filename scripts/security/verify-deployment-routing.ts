import assert from "node:assert/strict";

const DEFAULT_PUBLIC_URL = "https://solar-dream.org";
const DEFAULT_ADMIN_URL = "https://admin.solar-dream.org";

function normalizeOrigin(value: string, name: string) {
  const url = new URL(value);
  assert.ok(url.protocol === "http:" || url.protocol === "https:", `${name} must use http or https`);
  assert.equal(url.pathname, "/", `${name} must be an origin without a path`);
  return url.origin;
}

function getJsonStatus(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const status = (value as Record<string, unknown>).status;
  return typeof status === "string" ? status : undefined;
}

function getJsonField(value: unknown, field: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const result = (value as Record<string, unknown>)[field];
  return typeof result === "string" ? result : undefined;
}

async function request(origin: string, pathname: string) {
  return fetch(`${origin}${pathname}`, {
    cache: "no-store",
    redirect: "manual",
    headers: {
      "cache-control": "no-cache",
    },
  });
}

function locationFor(response: Response, label: string) {
  const location = response.headers.get("location");
  assert.ok(location, `${label} did not return a Location header`);
  return new URL(location, response.url);
}

function assertCrossDomainCsp(response: Response, label: string) {
  const csp = response.headers.get("content-security-policy") || "";
  const connectSource = csp
    .split(";")
    .map((directive) => directive.trim())
    .find((directive) => directive.startsWith("connect-src "));

  assert.ok(connectSource, `${label} did not publish a connect-src CSP directive`);
  assert.match(connectSource, /(^|\s)'self'(\s|$)/, `${label} CSP omitted 'self'`);
  assert.match(connectSource, /(^|\s)https:\/\/solar-dream\.org(\s|$)/, `${label} CSP omitted the public origin`);
  assert.match(connectSource, /(^|\s)https:\/\/admin\.solar-dream\.org(\s|$)/, `${label} CSP omitted the admin origin`);
}

async function main() {
  const publicOrigin = normalizeOrigin(
    process.env.DEPLOYMENT_PUBLIC_URL || DEFAULT_PUBLIC_URL,
    "DEPLOYMENT_PUBLIC_URL",
  );
  const adminOrigin = normalizeOrigin(
    process.env.DEPLOYMENT_ADMIN_URL || DEFAULT_ADMIN_URL,
    "DEPLOYMENT_ADMIN_URL",
  );

  for (const [label, origin, expectedSurface] of [
    ["public health", publicOrigin, "customer"],
    ["admin health", adminOrigin, "staff"],
  ] as const) {
    const livenessResponse = await request(origin, "/api/health/live");
    assert.equal(livenessResponse.status, 200, `${label} liveness returned HTTP ${livenessResponse.status}`);
    const livenessPayload = (await livenessResponse.json()) as unknown;
    assert.equal(
      getJsonField(livenessPayload, "surface"),
      expectedSurface,
      `${label} liveness was not served by the ${expectedSurface} application`,
    );

    const response = await request(origin, "/api/health");
    assert.equal(response.status, 200, `${label} returned HTTP ${response.status}`);
    const payload = (await response.json()) as unknown;
    assert.equal(getJsonStatus(payload), "ok", `${label} did not report status=ok`);
  }

  const adminPage = await request(adminOrigin, "/en/admin");
  assert.equal(adminPage.status, 200, `admin page returned HTTP ${adminPage.status}`);
  assertCrossDomainCsp(adminPage, "admin page");

  const publicPage = await request(publicOrigin, "/en");
  assert.equal(publicPage.status, 200, `public page returned HTTP ${publicPage.status}`);
  assertCrossDomainCsp(publicPage, "public page");

  const publicAdminRedirect = await request(publicOrigin, "/en/admin?deployment_probe=1");
  assert.equal(publicAdminRedirect.status, 308, "public admin route did not return HTTP 308");
  assert.equal(locationFor(publicAdminRedirect, "public admin route").origin, adminOrigin);

  const adminRootRedirect = await request(adminOrigin, "/");
  assert.equal(adminRootRedirect.status, 308, "admin root did not return HTTP 308");
  assert.equal(locationFor(adminRootRedirect, "admin root").pathname, "/th/admin");

  const adminRobots = await request(adminOrigin, "/robots.txt");
  assert.equal(adminRobots.status, 200, `admin robots returned HTTP ${adminRobots.status}`);
  assert.match(await adminRobots.text(), /Disallow:\s*\//);

  const publicRobots = await request(publicOrigin, "/robots.txt");
  assert.equal(publicRobots.status, 200, `public robots returned HTTP ${publicRobots.status}`);
  assert.match(await publicRobots.text(), /Sitemap:/);

  console.log(`Deployment routing checks passed for ${publicOrigin} and ${adminOrigin}.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
