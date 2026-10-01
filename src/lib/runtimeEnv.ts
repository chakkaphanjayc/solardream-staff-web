import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";

export function hasCloudflareRuntimeContext() {
  try {
    getCloudflareContext();
    return true;
  } catch {
    return false;
  }
}

export function getRuntimeEnvValue(key: string) {
  try {
    const { env } = getCloudflareContext();
    const value = (env as Record<string, unknown>)[key];
    if (typeof value === "string" && value.trim()) return value;
  } catch {
    // Local Next.js and unit-test processes do not have a Cloudflare context.
  }

  return process.env[key];
}
