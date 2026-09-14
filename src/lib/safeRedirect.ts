const INTERNAL_ORIGIN = "https://solar-dream.local";

function decodePathCandidate(value: string) {
  let decoded = value.trim();

  for (let index = 0; index < 2; index += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }

  return decoded.replace(/\\/g, "/");
}

export function getSafeInternalPath(
  rawPath: string | null | undefined,
  fallback = "/",
) {
  if (!rawPath) return fallback;

  const candidate = decodePathCandidate(rawPath);

  if (
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    /[\u0000-\u001F\u007F]/.test(candidate)
  ) {
    return fallback;
  }

  try {
    const url = new URL(candidate, INTERNAL_ORIGIN);
    if (url.origin !== INTERNAL_ORIGIN) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
