import "server-only";

import { createHash } from "node:crypto";
import { unstable_cache } from "next/cache";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export async function reserveNominatimRequestSlot() {
  const key = createHash("sha256").update("nominatim-strict-global-lease").digest("hex");
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('nominatim-strict-global-lease'))`);
    const rows = await tx.execute<{ elapsed_ms: number }>(sql`SELECT EXTRACT(EPOCH FROM (now()-updated_at))*1000 AS elapsed_ms FROM portal_rate_limits WHERE key=${key} FOR UPDATE`);
    if (rows[0] && Number(rows[0].elapsed_ms) < 1000) return false;
    await tx.execute(sql`INSERT INTO portal_rate_limits(key,window_started_at,request_count,expires_at,updated_at) VALUES(${key},now(),1,now()+interval '1 second',now()) ON CONFLICT(key) DO UPDATE SET window_started_at=now(),request_count=1,expires_at=now()+interval '1 second',updated_at=now()`);
    return true;
  });
}

export const searchNominatim = unstable_cache(async (query: string) => {
  const url = new URL("https://nominatim.openstreetmap.org/search"); url.searchParams.set("q", query); url.searchParams.set("format", "jsonv2"); url.searchParams.set("limit", "5"); url.searchParams.set("addressdetails", "1");
  const response = await fetch(url, { headers: { "User-Agent": process.env.NOMINATIM_USER_AGENT?.trim() || "SolarDream-ServiceLocation/1.0 (support@solar-dream.org)", "From": process.env.NOMINATIM_CONTACT_EMAIL?.trim() || "support@solar-dream.org", "Accept-Language": "th,en;q=0.8" }, signal: AbortSignal.timeout(8000) }); if (!response.ok) throw new Error("Geocoder unavailable.");
  const data = await response.json() as unknown; if (!Array.isArray(data)) return [];
  return data.slice(0, 5).flatMap((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return [];
    const item = row as Record<string, unknown>;
    const latitude = Number(item.lat);
    const longitude = Number(item.lon);
    const displayName =
      typeof item.display_name === "string" ? item.display_name.slice(0, 500) : "";
    const rawAddress =
      item.address && typeof item.address === "object" && !Array.isArray(item.address)
        ? (item.address as Record<string, unknown>)
        : {};
    const part = (...keys: string[]) => {
      for (const key of keys) {
        if (typeof rawAddress[key] === "string" && rawAddress[key]) {
          return String(rawAddress[key]).slice(0, 200);
        }
      }
      return undefined;
    };
    const address = {
      road: part("road", "pedestrian", "footway"),
      suburb: part("suburb", "neighbourhood", "quarter"),
      city: part("city", "town", "village", "municipality"),
      state: part("state", "province"),
      postcode: part("postcode")?.slice(0, 32),
      country: part("country"),
      countryCode: part("country_code")?.toLowerCase().slice(0, 2),
    };
    return Number.isFinite(latitude) &&
      latitude >= -90 &&
      latitude <= 90 &&
      Number.isFinite(longitude) &&
      longitude >= -180 &&
      longitude <= 180 &&
      displayName
      ? [
          {
            latitude,
            longitude,
            displayName,
            attribution: "© OpenStreetMap contributors" as const,
            address,
          },
        ]
      : [];
  });
}, ["nominatim-explicit-search-v1"], { revalidate: 86400 });

export const reverseNominatim = unstable_cache(async (latitude: number, longitude: number) => {
  const url = new URL("https://nominatim.openstreetmap.org/reverse"); url.searchParams.set("lat", String(latitude)); url.searchParams.set("lon", String(longitude)); url.searchParams.set("format", "jsonv2"); url.searchParams.set("zoom", "18"); url.searchParams.set("addressdetails", "1");
  const response = await fetch(url, { headers: { "User-Agent": process.env.NOMINATIM_USER_AGENT?.trim() || "SolarDream-ServiceLocation/1.0 (support@solar-dream.org)", "From": process.env.NOMINATIM_CONTACT_EMAIL?.trim() || "support@solar-dream.org", "Accept-Language": "th,en;q=0.8" }, signal: AbortSignal.timeout(8000) }); if (!response.ok) throw new Error("Reverse geocoder unavailable.");
  const data = await response.json() as unknown; if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Reverse geocoder returned an invalid response."); const item = data as Record<string, unknown>; const resolvedLatitude = Number(item.lat); const resolvedLongitude = Number(item.lon); const displayName = typeof item.display_name === "string" ? item.display_name.slice(0, 500) : "";
  if (!Number.isFinite(resolvedLatitude) || resolvedLatitude < -90 || resolvedLatitude > 90 || !Number.isFinite(resolvedLongitude) || resolvedLongitude < -180 || resolvedLongitude > 180 || !displayName) throw new Error("Reverse geocoder returned an invalid location.");
  const rawAddress = item.address && typeof item.address === "object" && !Array.isArray(item.address) ? item.address as Record<string, unknown> : {}; const part = (...keys: string[]) => { for (const key of keys) if (typeof rawAddress[key] === "string" && rawAddress[key]) return String(rawAddress[key]).slice(0, 200); return undefined; };
  const address = { road: part("road", "pedestrian", "footway"), suburb: part("suburb", "neighbourhood", "quarter"), city: part("city", "town", "village", "municipality"), state: part("state", "province"), postcode: part("postcode")?.slice(0, 32), country: part("country"), countryCode: part("country_code")?.toLowerCase().slice(0, 2) };
  return { latitude: resolvedLatitude, longitude: resolvedLongitude, displayName, attribution: "© OpenStreetMap contributors" as const, address };
}, ["nominatim-reverse-geocode-v1"], { revalidate: 86400 });
