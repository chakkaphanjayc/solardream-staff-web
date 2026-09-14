const CACHE_NAME = "solardream-tech-portal-v5";
const STATIC_ASSETS = ["/asset/sd-logo.png"];

function isTechnicianNavigation(pathname) {
  const path = pathname.replace(/^\/(?:en|th)(?=\/|$)/, "") || "/";

  return path === "/tech-portal"
    || path.startsWith("/tech-portal/")
    || path === "/tech/work-orders"
    || path.startsWith("/tech/work-orders/");
}

function hasAuthChallengeHeaders(response) {
  return [
    "cf-mitigated",
    "x-auth-request-redirect",
    "x-zerotrust-login",
    "x-sso-login",
  ].some((header) => response.headers.has(header));
}

function isSafeTechnicianDocument(request, response) {
  if (!response.ok || response.type === "opaque") return false;
  if (!response.headers.get("content-type")?.toLowerCase().includes("text/html")) return false;
  if (hasAuthChallengeHeaders(response)) return false;
  const responseUrl = new URL(response.url || request.url, self.location.origin);
  return isTechnicianNavigation(responseUrl.pathname);
}

function isSafeStaticAsset(response) {
  return response.ok
    && response.type !== "opaque"
    && response.headers.get("content-type")?.toLowerCase().startsWith("image/") === true;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key !== CACHE_NAME)
        .map((key) => caches.delete(key)),
    )),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // Next.js deployment chunks must always come from the active deployment.
  // Caching them here can pair an old client graph with new RSC payloads and
  // cause hydration/module-factory failures on customer routes.
  if (url.pathname.startsWith("/_next/")) return;

  const isTechnicianRoute = isTechnicianNavigation(url.pathname);
  const isTechnicianAsset = url.pathname === "/asset/sd-logo.png";
  if (!isTechnicianRoute && !isTechnicianAsset) return;

  // API responses contain private, user-scoped data. The page stores the
  // dashboard in its authenticated IndexedDB cache instead of exposing it to
  // a shared service-worker cache.
  if (url.pathname.startsWith("/api/")) return;

  const isStaticAsset = isTechnicianAsset;
  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => {
        if (isSafeStaticAsset(response)) {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })),
    );
    return;
  }

  if (request.mode === "navigate" && isTechnicianRoute) {
    event.respondWith(
      fetch(request).then((response) => {
        // A Zero Trust redirect or challenge can return status 200 with HTML.
        // Never put that response in the Technical shell cache.
        if (isSafeTechnicianDocument(request, response)) {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      }).catch(() => caches.match(request).then((cached) => cached || new Response(
        "SolarDream Engineer Console is offline. Reopen the app when a cached route is available.",
        {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        },
      ))),
    );
  }
});

self.addEventListener("sync", (event) => {
  if (event.tag !== "tech-portal-outbox") return;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      clients.forEach((client) => client.postMessage({ type: "TECH_PORTAL_SYNC_REQUEST" }));
    }),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "TECH_PORTAL_REQUEST_SYNC") return;
  const registration = self.registration;
  if ("sync" in registration && registration.sync && typeof registration.sync.register === "function") {
    event.waitUntil(registration.sync.register("tech-portal-outbox"));
  }
});
