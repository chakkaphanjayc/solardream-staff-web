import type { NextRequest } from "next/server";

export async function readBoundedRequestBody(request: NextRequest, maxBytes: number, expectedBytes: number) {
  if (!request.body) throw new Error("Webhook body is missing.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("Webhook body is too large.");
    }
    chunks.push(value);
  }

  if (total !== expectedBytes) throw new Error("Webhook Content-Length does not match the body.");
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
