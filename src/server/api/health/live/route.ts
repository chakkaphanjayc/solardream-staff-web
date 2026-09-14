import { NextResponse } from "next/server";
import { getRuntimeRole } from "@/lib/runtimeRole";

type ApplicationSurface = "customer" | "staff" | "all";

// Split containers set this explicitly. The role fallback keeps the legacy
// single-image deployment observable until its final retirement.
function getApplicationSurface(): ApplicationSurface {
  const configuredSurface = process.env.SOLARDREAM_APP_SURFACE?.trim().toLowerCase();
  if (configuredSurface === "customer" || configuredSurface === "staff") return configuredSurface;

  const runtimeRole = getRuntimeRole();
  if (runtimeRole === "public") return "customer";
  if (runtimeRole === "admin") return "staff";
  return "all";
}

/**
 * Liveness is intentionally independent of the database and third-party
 * services. Container orchestration should restart the process only when the
 * Node/Next server itself is unavailable; dependency readiness is reported by
 * /api/health separately.
 */
export async function GET() {
  const surface = getApplicationSurface();
  const role = surface === "customer" ? "public" : surface === "staff" ? "admin" : getRuntimeRole();

  return NextResponse.json(
    { status: "ok", role, surface },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "X-SolarDream-Runtime-Role": role,
        "X-SolarDream-App-Surface": surface,
        Pragma: "no-cache",
        Expires: "0",
      },
    },
  );
}
