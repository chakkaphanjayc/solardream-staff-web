import { Elysia } from "elysia";

import { createApiErrorResponse } from "./error-response";
import { createSurfaceMismatchResponse, isSurfaceRequestAllowed } from "./surface-policy";
import { customerApiRoutes } from "./customer-routes";

const isCloudflareWorker =
  typeof globalThis !== "undefined" && "WebSocketPair" in globalThis;

export const customerApiApp = new Elysia({
  name: "solardream-customer-api",
  strictPath: true,
  precompile: process.env.NODE_ENV === "production" && !isCloudflareWorker,
  abortSignal: true,
})
  .request(({ request }) =>
    isSurfaceRequestAllowed(request, "customer")
      ? undefined
      : createSurfaceMismatchResponse("customer"),
  )
  .error("global", ({ error }) => createApiErrorResponse(error))
  .use(customerApiRoutes);

export type CustomerApiApp = typeof customerApiApp;
