import { NextRequest } from "next/server";

type LegacyParams = Record<string, string>;

type LegacyRouteContext = {
  params: Promise<LegacyParams>;
};

type LegacyRouteHandler = (
  request: NextRequest,
  context: LegacyRouteContext,
) => unknown | Promise<unknown>;

type LegacyMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type ElysiaRequestContext = {
  request: Request;
  params: unknown;
};

type LegacyRouteModule = Record<string, unknown>;

type CompatibleRequestInit = {
  method: string;
  headers: Record<string, string>;
  body?: ArrayBuffer;
  duplex?: "half";
};

function normalizeParams(value: unknown): LegacyParams {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const entries = Object.entries(value).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  );

  return Object.fromEntries(entries);
}

function toResponse(value: unknown): Response {
  if (value instanceof Response) {
    return value;
  }

  if (value === undefined) {
    return new Response(null, { status: 204 });
  }

  return Response.json(value);
}

/**
 * Keeps the existing route business logic intact while moving HTTP dispatch
 * to Elysia. This is intentionally a short-lived compatibility boundary:
 * route modules receive the same NextRequest/params contract they had before,
 * but no longer participate in Next's file-system API routing.
 */
export function adaptLegacyHandler(
  loader: () => Promise<unknown>,
  method: LegacyMethod,
) {
  // Dynamic imports are already cached by Node, but caching the validated
  // handler promise also avoids repeating module-shape checks on every
  // request. The promise stays lazy so importing the Elysia app does not
  // initialize every database or integration module at startup.
  let handlerPromise: Promise<LegacyRouteHandler> | undefined;
  let auditModulePromise: Promise<typeof import("@/lib/auditLog")> | undefined;

  const loadHandler = () => {
    handlerPromise ??= loader().then((moduleValue) => {
      if (
        moduleValue === null ||
        typeof moduleValue !== "object" ||
        !Object.prototype.hasOwnProperty.call(moduleValue, method)
      ) {
        throw new TypeError(`Missing ${method} handler in Elysia route module.`);
      }

      const handler = (moduleValue as LegacyRouteModule)[method];
      if (typeof handler !== "function") {
        throw new TypeError(`Invalid ${method} handler in Elysia route module.`);
      }

      return handler as LegacyRouteHandler;
    });

    return handlerPromise;
  };

  const recordAudit = async (
    request: Request,
    response: Response | null,
    error?: unknown,
  ) => {
    auditModulePromise ??= import("@/lib/auditLog");
    const { recordApiAuditEvent } = await auditModulePromise;
    await recordApiAuditEvent(request, response, error);
  };

  return async ({ request, params }: ElysiaRequestContext): Promise<Response> => {
    const handler = await loadHandler();

    // Elysia and Next can resolve different Web Request implementations in a
    // standalone production bundle. Passing Elysia's Request directly to
    // NextRequest then makes undici read private state from the wrong class.
    // Copy the primitive request data across the boundary instead.
    const requestInit: CompatibleRequestInit = {
      method: request.method,
      headers: Object.fromEntries(request.headers),
    };

    if (
      request.method !== "GET" &&
      request.method !== "HEAD" &&
      request.body !== null
    ) {
      requestInit.body = await request.arrayBuffer();
      requestInit.duplex = "half";
    }

    const nextRequest = new NextRequest(request.url, requestInit);
    try {
      const response = await (handler as LegacyRouteHandler)(nextRequest, {
        params: Promise.resolve(normalizeParams(params)),
      });
      const normalizedResponse = toResponse(response);

      if (method !== "GET") {
        await recordAudit(request, normalizedResponse);
      }

      return normalizedResponse;
    } catch (error) {
      if (method !== "GET") {
        await recordAudit(request, null, error);
      }
      throw error;
    }
  };
}
