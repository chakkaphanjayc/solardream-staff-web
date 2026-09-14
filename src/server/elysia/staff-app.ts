import { Elysia } from "elysia";

import { createApiErrorResponse } from "./error-response";
import { createSurfaceMismatchResponse, isSurfaceRequestAllowed } from "./surface-policy";
import { staffApiRoutes } from "./staff-routes";

export const staffApiApp = new Elysia({
  name: "solardream-staff-api",
  strictPath: true,
  precompile: process.env.NODE_ENV === "production",
  abortSignal: true,
})
  .request(({ request }) =>
    isSurfaceRequestAllowed(request, "staff")
      ? undefined
      : createSurfaceMismatchResponse("staff"),
  )
  .error("global", ({ error }) => createApiErrorResponse(error))
  .use(staffApiRoutes);

export type StaffApiApp = typeof staffApiApp;
