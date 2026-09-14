import "server-only";

import { CompactEncrypt, compactDecrypt } from "jose";

type JwePayload = Record<string, unknown>;

function getJweKey() {
  const configuredSecret = process.env.JWE_SECRET_KEY?.trim() || "";
  if (!configuredSecret) {
    throw new Error("JWE_SECRET_KEY must be configured for encrypted application payloads.");
  }

  const key = configuredSecret.startsWith("base64:")
    ? Buffer.from(configuredSecret.slice("base64:".length), "base64")
    : Buffer.from(configuredSecret, "utf8");
  if (key.byteLength !== 32) {
    throw new Error("JWE_SECRET_KEY must be exactly 32 bytes (or base64: encoded 32 bytes).");
  }
  return new Uint8Array(key);
}

export async function encryptJWE(payload: JwePayload): Promise<string> {
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  return new CompactEncrypt(plaintext)
    .setProtectedHeader({ alg: "dir", enc: "A256GCM", typ: "JWE" })
    .encrypt(getJweKey());
}

export async function decryptJWE(token: string): Promise<JwePayload> {
  const { plaintext, protectedHeader } = await compactDecrypt(token, getJweKey());
  if (protectedHeader.alg !== "dir" || protectedHeader.enc !== "A256GCM") {
    throw new Error("Unsupported JWE algorithm.");
  }

  const decoded = JSON.parse(new TextDecoder().decode(plaintext)) as unknown;
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
    throw new Error("Decrypted JWE payload must be an object.");
  }
  return decoded as JwePayload;
}
