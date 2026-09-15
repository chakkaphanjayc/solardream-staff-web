import { Elysia } from "elysia";

import { createApiErrorResponse } from "./error-response";
import {
  createRuntimeMismatchResponse,
  isRuntimeRequestAllowed,
} from "./request-policy";
import { apiRoutes } from "./routes";

const isCloudflareWorker =
  typeof globalThis !== "undefined" && "WebSocketPair" in globalThis;

export const app = new Elysia({
  name: "solardream-api",
  // API paths are canonical. Rejecting the alternate trailing-slash form
  // avoids duplicate cache/log keys and removes a route-matching fallback.
  strictPath: true,
  // Warm the compiled route dispatcher in production so the first request is
  // not responsible for JIT compilation. Development and tests keep startup
  // inexpensive and compile on demand.
  precompile: process.env.NODE_ENV === "production" && !isCloudflareWorker,
  abortSignal: true,
})
  .request(({ request }) =>
    isRuntimeRequestAllowed(request.headers)
      ? undefined
      : createRuntimeMismatchResponse(),
  )
  .error("global", ({ error }) => createApiErrorResponse(error))
  .use(apiRoutes);

export type App = typeof app;
