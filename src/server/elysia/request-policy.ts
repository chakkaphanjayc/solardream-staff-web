import { getRequestHostHeader } from "@/lib/siteUrl";
import { getRuntimeRole, isRuntimeRoleHostAllowed } from "@/lib/runtimeRole";

const RUNTIME_MISMATCH_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

export function isRuntimeRequestAllowed(headers: Headers) {
  const role = getRuntimeRole();
  return isRuntimeRoleHostAllowed(role, getRequestHostHeader(headers));
}

export function createRuntimeMismatchResponse() {
  return Response.json(
    {
      success: false,
      error: "This host belongs to another SolarDream deployment.",
    },
    {
      status: 421,
      headers: RUNTIME_MISMATCH_HEADERS,
    },
  );
}
