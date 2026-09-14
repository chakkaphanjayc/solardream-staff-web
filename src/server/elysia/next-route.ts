import { isSurfaceRequestAllowed, type ApiSurface, createSurfaceMismatchResponse } from "./surface-policy";

const MAX_MATERIALIZED_BODY_BYTES = 192 * 1024 * 1024;

class RequestBodyLimitError extends Error {
  constructor() {
    super("Request payload is too large.");
    this.name = "RequestBodyLimitError";
  }
}

type NodeRequestInit = RequestInit & { duplex?: "half" };

type PlainRequest = {
  method: string;
  url: string;
  headers: Headers;
  body: ReadableStream<Uint8Array> | null;
  signal: AbortSignal;
  arrayBuffer(): Promise<ArrayBuffer>;
  formData(): Promise<FormData>;
  json(): Promise<unknown>;
  text(): Promise<string>;
  clone(): PlainRequest;
};

type ApiApp = { fetch(request: Request): Response | Promise<Response> };

function createBodyStream(body: ArrayBuffer) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(body));
      controller.close();
    },
  });
}

function createNativeRequest(url: string, method: string, headers: Headers, body: ArrayBuffer | null) {
  const init: NodeRequestInit = { method, headers: new Headers(headers) };
  if (body !== null && method !== "GET" && method !== "HEAD") {
    init.body = body;
    init.duplex = "half";
  }
  return new Request(url, init);
}

function createPlainRequest(
  url: string,
  method: string,
  headers: Headers,
  signal: AbortSignal,
  body: ArrayBuffer | null,
): PlainRequest {
  return {
    method,
    url,
    headers: new Headers(headers),
    body: body === null ? null : createBodyStream(body),
    signal,
    arrayBuffer: async () => body?.slice(0) ?? new ArrayBuffer(0),
    formData: () => createNativeRequest(url, method, headers, body).formData(),
    json: () => createNativeRequest(url, method, headers, body).json(),
    text: () => createNativeRequest(url, method, headers, body).text(),
    clone: () => createPlainRequest(url, method, headers, signal, body),
  };
}

function getDeclaredBodyLength(headers: Headers) {
  const raw = headers.get("content-length")?.trim();
  if (!raw || !/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
}

async function readUnknownLengthBody(request: Request): Promise<ArrayBuffer> {
  if (!request.body) return new ArrayBuffer(0);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_MATERIALIZED_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new RequestBodyLimitError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged.buffer;
}

async function toPlainRequest(request: Request, headers: Headers): Promise<PlainRequest> {
  const method = request.method;
  const hasBody = method !== "GET" && method !== "HEAD" && request.body !== null;
  let body: ArrayBuffer | null = null;

  if (hasBody) {
    const declaredLength = getDeclaredBodyLength(headers);
    if (declaredLength !== null && declaredLength > MAX_MATERIALIZED_BODY_BYTES) {
      throw new RequestBodyLimitError();
    }
    body = declaredLength === null ? await readUnknownLengthBody(request) : await request.arrayBuffer();
    if (body.byteLength > MAX_MATERIALIZED_BODY_BYTES) throw new RequestBodyLimitError();
  }

  return createPlainRequest(request.url, method, headers, request.signal, body);
}

export function createNextRouteHandlers(app: ApiApp, surface: ApiSurface) {
  const handle = async (request: Request) => {
    if (!isSurfaceRequestAllowed(request, surface)) return createSurfaceMismatchResponse(surface);

    const requestHeaders = new Headers(Object.fromEntries(request.headers.entries()));
    try {
      const plainRequest = await toPlainRequest(request, requestHeaders);
      return await app.fetch(plainRequest as Request);
    } catch (error) {
      if (error instanceof RequestBodyLimitError) {
        return Response.json(
          { success: false, error: "Request payload is too large." },
          { status: 413, headers: { "Cache-Control": "no-store", "X-SolarDream-Error": "handled" } },
        );
      }

      return Response.json(
        { success: false, error: "Invalid request body." },
        { status: 400, headers: { "Cache-Control": "no-store", "X-SolarDream-Error": "handled" } },
      );
    }
  };

  return { GET: handle, POST: handle, PUT: handle, PATCH: handle, DELETE: handle };
}
