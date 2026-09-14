import assert from "node:assert/strict";
import { Elysia } from "elysia";

import { POST as catchAllPost } from "../../src/app/api/[[...slugs]]/route";
import { app } from "../../src/server/elysia/app";
import { createApiErrorResponse } from "../../src/server/elysia/error-response";
import { apiRouteCount } from "../../src/server/elysia/routes";

async function main() {
  assert.ok(apiRouteCount >= 199, `expected at least 199 API registrations, received ${apiRouteCount}`);

  process.env.SOLARDREAM_RUNTIME_ROLE = "all";
  const livenessResponse = await app.handle(
    new Request("http://localhost/api/health/live"),
  );
  assert.equal(livenessResponse.status, 200);
  const livenessBody = (await livenessResponse.json()) as { role?: string };
  assert.equal(livenessBody.role, "all");

  const legacyDiscourseSsoResponse = await app.handle(
    new Request("http://localhost/api/sso"),
  );
  assert.equal(legacyDiscourseSsoResponse.status, 400);
  assert.equal(legacyDiscourseSsoResponse.headers.get("Cache-Control"), "no-store");

  const strictPathResponse = await app.handle(
    new Request("http://localhost/api/health/live/"),
  );
  assert.equal(strictPathResponse.status, 404);

  const catchAllResponse = await catchAllPost(
    new Request("http://localhost/api/services/book", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ smokeTest: true }),
    }),
  );
  assert.equal(catchAllResponse.status, 410);

  const oversizedCatchAllResponse = await catchAllPost(
    new Request("http://localhost/api/services/book", {
      method: "POST",
      headers: {
        "content-length": String(193 * 1024 * 1024),
      },
      body: "x",
    }),
  );
  assert.equal(oversizedCatchAllResponse.status, 413);

  process.env.SOLARDREAM_RUNTIME_ROLE = "public";
  const earlyRuntimeMismatchResponse = await catchAllPost(
    new Request("https://admin.solar-dream.org/api/services/book", {
      method: "POST",
      headers: {
        "content-length": String(193 * 1024 * 1024),
      },
      body: "x",
    }),
  );
  assert.equal(earlyRuntimeMismatchResponse.status, 421);
  process.env.SOLARDREAM_RUNTIME_ROLE = "all";

  const retiredResponse = await app.handle(
    new Request("http://localhost/api/services/book", { method: "POST" }),
  );
  assert.equal(retiredResponse.status, 410);

  const retiredBody = (await retiredResponse.json()) as {
    code?: string;
  };
  assert.equal(retiredBody.code, "LEGACY_SERVICE_FLOW_RETIRED");

  const technicianValidationResponse = await app.handle(
    new Request("http://localhost/api/tech/start-job", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }),
  );
  assert.equal(technicianValidationResponse.status, 400);

  const technicianSyncValidationResponse = await app.handle(
    new Request("http://localhost/api/tech/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }),
  );
  assert.equal(technicianSyncValidationResponse.status, 400);

  const paymentVerificationValidationResponse = await app.handle(
    new Request("http://localhost/api/payments/verify-slip", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }),
  );
  assert.ok([400, 411].includes(paymentVerificationValidationResponse.status));

  const warrantyCardResponse = await app.handle(
    new Request("http://localhost/api/customer/warranty-card"),
  );
  assert.notEqual(warrantyCardResponse.status, 404);

  const missingResponse = await app.handle(
    new Request("http://localhost/api/does-not-exist"),
  );
  assert.equal(missingResponse.status, 404);
  assert.equal(missingResponse.headers.get("X-SolarDream-Error"), "handled");

  const handledErrorResponse = createApiErrorResponse(new Error("intentional smoke-test failure"));
  assert.equal(handledErrorResponse.status, 500);
  assert.equal(handledErrorResponse.headers.get("X-SolarDream-Error"), "handled");
  assert.deepEqual(await handledErrorResponse.json(), {
    success: false,
    error: "Internal server error.",
  });

  const validationErrorResponse = createApiErrorResponse({
    status: 422,
    message: "sensitive validation details",
  });
  assert.equal(validationErrorResponse.status, 422);
  assert.equal(validationErrorResponse.headers.get("X-SolarDream-Error"), "handled");
  assert.deepEqual(await validationErrorResponse.json(), {
    success: false,
    error: "Request validation failed.",
  });

  const thrownErrorApp = new Elysia({ name: "solardream-error-smoke" })
    .error("global", ({ error }) => createApiErrorResponse(error))
    .get("/__verification_error__", () => {
      throw new Error("intentional route failure");
    });
  const thrownErrorResponse = await thrownErrorApp.handle(
    new Request("http://localhost/__verification_error__"),
  );
  assert.equal(thrownErrorResponse.status, 500);
  assert.equal(thrownErrorResponse.headers.get("X-SolarDream-Error"), "handled");
  assert.deepEqual(await thrownErrorResponse.json(), {
    success: false,
    error: "Internal server error.",
  });

  process.env.SOLARDREAM_RUNTIME_ROLE = "public";
  const misroutedResponse = await app.handle(
    new Request("https://admin.solar-dream.org/api/does-not-exist"),
  );
  assert.equal(misroutedResponse.status, 421);
  process.env.SOLARDREAM_RUNTIME_ROLE = "all";

  console.log(`Elysia smoke test passed for ${apiRouteCount} API registrations.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
