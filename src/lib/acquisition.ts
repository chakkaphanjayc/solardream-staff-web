export const TRAFFIC_SOURCES = ["Facebook", "Google", "Line", "Direct", "Other"] as const;

export type TrafficSource = (typeof TRAFFIC_SOURCES)[number];

export type AcquisitionData = {
  source: TrafficSource;
  referrer: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  ref: string | null;
  landingPage: string;
  sessionId: string;
  anonymousId: string;
};

function normalize(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

export function parseTrafficSource(
  referrer: string | null | undefined,
  utmSource: string | null | undefined,
): TrafficSource {
  const normalizedReferrer = normalize(referrer);
  const normalizedUtmSource = normalize(utmSource);

  if (
    normalizedUtmSource.includes("facebook") ||
    normalizedReferrer.includes("facebook.com") ||
    normalizedReferrer.includes("l.facebook.com")
  ) {
    return "Facebook";
  }

  if (normalizedUtmSource.includes("google") || normalizedReferrer.includes("google")) {
    return "Google";
  }

  if (
    normalizedUtmSource === "line" ||
    normalizedUtmSource.includes("line.me") ||
    normalizedReferrer.includes("line.me")
  ) {
    return "Line";
  }

  if (!normalizedReferrer && !normalizedUtmSource) {
    return "Direct";
  }

  return "Other";
}
