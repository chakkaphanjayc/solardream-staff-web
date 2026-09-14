const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);

function hostnameOf(value: string): string {
  const trimmed = value.trim().replace(/^\.+/, "").toLowerCase();
  if (!trimmed) return "";

  try {
    return new URL(trimmed.includes("://") ? trimmed : `http://${trimmed}`).hostname.toLowerCase();
  } catch {
    return trimmed.split("/")[0]?.split(":")[0] ?? "";
  }
}

export function getSharedCookieDomain(host: string, configuredDomain = ".solar-dream.org"): string | undefined {
  const hostname = hostnameOf(host);
  const domain = hostnameOf(configuredDomain);
  const isLocalHost =
    LOCAL_HOSTNAMES.has(hostname) ||
    hostname.endsWith(".localhost") ||
    /^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname);

  if (!hostname || !domain || isLocalHost) {
    return undefined;
  }

  if (hostname !== domain && !hostname.endsWith(`.${domain}`)) {
    return undefined;
  }

  return `.${domain}`;
}
