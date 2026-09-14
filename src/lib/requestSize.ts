export function getRequestContentLength(headers: Headers): number | null {
  const value = headers.get("content-length");
  if (!value) return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function isRequestContentLengthExceeded(headers: Headers, maxBytes: number): boolean {
  const contentLength = getRequestContentLength(headers);
  return contentLength !== null && contentLength > maxBytes;
}
