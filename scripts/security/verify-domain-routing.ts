import assert from "node:assert/strict";
import { NextRequest, NextResponse } from "next/server";

import { proxy } from "@/proxy";
import sitemap from "@/app/sitemap";
import { getCookieDomain, getRequestOrigin } from "@/lib/siteUrl";

process.env.NEXT_PUBLIC_SITE_URL = "https://solar-dream.org";
process.env.NEXT_PUBLIC_ADMIN_URL = "https://admin.solar-dream.org";
process.env.SOLARDREAM_RUNTIME_ROLE = "all";
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
  const legacyDiscourseConnectRedirect = await proxy(
    request("https://solar-dream.org/?sso=signed-request&sig=signed-request"),
  );
  assert.equal(legacyDiscourseConnectRedirect.status, 307);
  assert.equal(
    legacyDiscourseConnectRedirect.headers.get("location"),
    "https://solar-dream.org/api/auth/discourse-sso?sso=signed-request&sig=signed-request",
  );
  assert.equal(
    legacyDiscourseConnectRedirect.headers.get("cache-control"),
    "no-store",
  );

  const publicAdminRedirect = await proxy(request("https://solar-dream.org/en/admin/crm?tab=leads"));
  assert.equal(
    await locationFor(publicAdminRedirect),
    "https://admin.solar-dream.org/en/admin/crm?tab=leads",
  );

  const directPublicHostWins = await proxy(
    request("https://solar-dream.org/en/admin/crm", undefined, {
      host: "solar-dream.org",
      "x-forwarded-host": "admin.solar-dream.org",
    }),
  );
  assert.equal(
    await locationFor(directPublicHostWins),
    "https://admin.solar-dream.org/en/admin/crm",
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

  process.env.SOLARDREAM_RUNTIME_ROLE = "public";
  assert.equal(
    (await proxy(request("https://admin.solar-dream.org/en/admin"))).status,
    421,
    "public runtime must reject admin-host page traffic",
  );

  process.env.SOLARDREAM_RUNTIME_ROLE = "admin";
  assert.equal(
    (await proxy(request("https://solar-dream.org/en"))).status,
    421,
    "admin runtime must reject public-host page traffic",
  );

  process.env.SOLARDREAM_RUNTIME_ROLE = "all";

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

  const adminRootRedirect = await proxy(request("https://admin.solar-dream.org/"));
  assert.equal(await locationFor(adminRootRedirect), "https://admin.solar-dream.org/th/admin");

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
  assert.equal((await proxy(request("https://solar-dream.org/sitemap.xml"))).status, 200);

  const publicSitemap = sitemap();
  assert.ok(publicSitemap.length > 0);
  assert.ok(publicSitemap.every(({ url }) => url.startsWith("https://solar-dream.org/")));
  assert.ok(publicSitemap.every(({ url }) => !url.includes("/admin")));

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
