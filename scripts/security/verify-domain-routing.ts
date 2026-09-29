import assert from "node:assert/strict";
import { NextRequest, NextResponse } from "next/server";

import { proxy } from "@/proxy";
import { getCookieDomain, getRequestOrigin } from "@/lib/siteUrl";

process.env.NEXT_PUBLIC_SITE_URL = "https://solar-dream.org";
process.env.NEXT_PUBLIC_ADMIN_URL = "https://admin.solar-dream.org";
delete process.env.AUTH_COOKIE_DOMAIN;

function request(
  url: string,
  cookies?: Record<string, string>,
  extraHeaders?: Record<string, string>,
) {
  const headers = new Headers(extraHeaders);
  if (cookies) {
    headers.set(
      "cookie",
      Object.entries(cookies)
        .map(([name, value]) => `${name}=${value}`)
        .join("; "),
    );
  }

  return new NextRequest(url, {
    headers,
  });
}

async function locationFor(response: NextResponse) {
  assert.equal(response.status, 308);
  return response.headers.get("location");
}

async function main() {
  const customerHostRejection = await proxy(request("https://solar-dream.org/en"));
  assert.equal(customerHostRejection.status, 421);

  const workersDevRedirect = await proxy(
    request("https://solardream-staff-web.chakkaphan-pocki.workers.dev/th/admin?source=workers-dev"),
  );
  assert.equal(
    await locationFor(workersDevRedirect),
    "https://admin.solar-dream.org/th/admin?source=workers-dev",
  );

  const directAdminHostWins = await proxy(
    request("https://admin.solar-dream.org/", undefined, {
      host: "admin.solar-dream.org",
      "x-forwarded-host": "solar-dream.org",
    }),
  );
  assert.equal(
    await locationFor(directAdminHostWins),
    "https://admin.solar-dream.org/th/admin",
  );

  const adminPageResponse = await proxy(request("https://admin.solar-dream.org/en/admin"));
  assert.equal(adminPageResponse.status, 200);
  assert.equal(
    adminPageResponse.headers.get("link"),
    null,
    "locale middleware must not emit an oversized alternate-links header",
  );

  const technicianRootRedirect = await proxy(request("https://admin.solar-dream.org/tech-portal", { NEXT_LOCALE: "en" }));
  assert.equal(await locationFor(technicianRootRedirect), "https://admin.solar-dream.org/en/tech-portal");

  assert.equal(
    getRequestOrigin(
      "http://127.0.0.1:3639/en/auth/callback",
      new Headers({
        host: "admin.solar-dream.org",
        "x-forwarded-host": "solar-dream.org",
      }),
    ),
    "https://admin.solar-dream.org",
  );

  const adminLocaleRedirect = await proxy(request("https://admin.solar-dream.org/en"));
  assert.equal(await locationFor(adminLocaleRedirect), "https://admin.solar-dream.org/en/admin");

  const adminBareRouteRedirect = await proxy(
    request("https://admin.solar-dream.org/admin/projects", { NEXT_LOCALE: "en" }),
  );
  assert.equal(
    await locationFor(adminBareRouteRedirect),
    "https://admin.solar-dream.org/en/admin/projects",
  );

  assert.equal((await proxy(request("https://admin.solar-dream.org/robots.txt"))).status, 200);

  assert.equal(getCookieDomain("solar-dream.org"), ".solar-dream.org");
  assert.equal(getCookieDomain("admin.solar-dream.org"), ".solar-dream.org");
  assert.equal(getCookieDomain("untrusted.solar-dream.org"), undefined);
  assert.equal(getCookieDomain("localhost:3000"), undefined);

  process.env.AUTH_COOKIE_DOMAIN = ".solar-dream.org";
  assert.equal(getCookieDomain("solar-dream.org"), ".solar-dream.org");
  assert.equal(getCookieDomain("admin.solar-dream.org"), ".solar-dream.org");
  assert.equal(
    getCookieDomain("localhost:3000"),
    undefined,
    "production cookie domains must not be emitted for localhost",
  );
  assert.equal(getCookieDomain("untrusted.example.com"), undefined);
  delete process.env.AUTH_COOKIE_DOMAIN;

  console.log("Domain routing and cookie-scope checks passed.");
}

void main();
