const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

const HANDLED_ERROR_HEADERS = {
  ...NO_STORE_HEADERS,
  "X-SolarDream-Error": "handled",
};

function getErrorStatus(error: unknown) {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return undefined;
  }

  const status = error.status;
  return typeof status === "number" && Number.isInteger(status) && status >= 400 && status < 500
    ? status
    : undefined;
}

function getClientErrorMessage(status: number) {
  switch (status) {
    case 400:
      return "Invalid request.";
    case 401:
      return "Authentication required.";
    case 403:
      return "Forbidden.";
    case 404:
      return "API route not found.";
    case 405:
      return "Method not allowed.";
    case 409:
      return "Request conflicts with the current state.";
    case 413:
      return "Request payload is too large.";
    case 415:
      return "Unsupported request format.";
    case 422:
      return "Request validation failed.";
    case 429:
      return "Too many requests.";
    default:
      return "Request could not be completed.";
  }
}

export function createApiErrorResponse(error: unknown): Response {
  if (error instanceof Response) {
    return error;
  }

  const errorStatus = getErrorStatus(error);
  if (errorStatus !== undefined) {
    return Response.json(
      { success: false, error: getClientErrorMessage(errorStatus) },
      { status: errorStatus, headers: HANDLED_ERROR_HEADERS },
    );
  }

  // Do not serialize the complete error object. Database and provider errors
  // can contain SQL parameters, request payloads, URLs, or credentials. Keep
  // detailed diagnostics in local development while production logs receive
  // only a stable error class.
  const errorName = error instanceof Error ? error.name : typeof error;
  if (process.env.NODE_ENV === "production") {
    console.error("[elysia] unhandled API error", { name: errorName });
  } else {
    const errorMessage = error instanceof Error ? error.message.slice(0, 500) : "Non-error thrown";
    console.error("[elysia] unhandled API error", {
      name: errorName,
      message: errorMessage,
    });
  }

  return Response.json(
    { success: false, error: "Internal server error." },
    { status: 500, headers: HANDLED_ERROR_HEADERS },
  );
}
