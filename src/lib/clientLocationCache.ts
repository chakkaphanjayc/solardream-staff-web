/**
 * Client-side Location & Geocoding Cache with 2-Hour TTL
 * Reduces redundant /api/services/geocode calls and prevents 429 Too Many Requests.
 */

export interface CachedLocationRecord {
  displayName: string;
  latitude: number;
  longitude: number;
  timestamp: number;
  rawAddress?: Record<string, string | undefined>;
}

export const LOCATION_CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 Hours in milliseconds

const memoryLocationCache = new Map<string, CachedLocationRecord>();

export function getCoordCacheKey(latitude: number, longitude: number): string {
  // Round coordinates to 3 decimal places (~110 meters precision)
  return `${latitude.toFixed(3)}_${longitude.toFixed(3)}`;
}

export function readCachedLocation(
  latitude: number,
  longitude: number,
  ttlMs = LOCATION_CACHE_TTL_MS,
): CachedLocationRecord | null {
  const key = getCoordCacheKey(latitude, longitude);
  const now = Date.now();

  // 1. In-memory cache check
  const memHit = memoryLocationCache.get(key);
  if (memHit && now - memHit.timestamp < ttlMs) {
    return memHit;
  }

  // 2. localStorage check
  if (typeof window !== "undefined") {
    try {
      const storageKey = `solardream_loc_cache_${key}`;
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as CachedLocationRecord;
        if (
          parsed &&
          typeof parsed.displayName === "string" &&
          typeof parsed.timestamp === "number" &&
          now - parsed.timestamp < ttlMs
        ) {
          memoryLocationCache.set(key, parsed);
          return parsed;
        }
      }
    } catch {
      // Storage may be disabled or in private browsing
    }
  }

  return null;
}

export function writeCachedLocation(
  latitude: number,
  longitude: number,
  displayName: string,
  rawAddress?: Record<string, string | undefined>,
): CachedLocationRecord {
  const key = getCoordCacheKey(latitude, longitude);
  const record: CachedLocationRecord = {
    displayName,
    latitude,
    longitude,
    timestamp: Date.now(),
    rawAddress,
  };

  memoryLocationCache.set(key, record);

  if (typeof window !== "undefined") {
    try {
      const storageKey = `solardream_loc_cache_${key}`;
      localStorage.setItem(storageKey, JSON.stringify(record));
    } catch {
      // Storage quota or restriction
    }
  }

  return record;
}

export function getRegionalFallbackLocationName(
  latitude: number,
  longitude: number,
  fallback = "",
): string {
  if (latitude >= 13.0 && latitude <= 14.5 && longitude >= 99.5 && longitude <= 101.5) {
    return "Bangkok, Thailand";
  }
  if (latitude >= 18.0 && latitude <= 20.0 && longitude >= 98.0 && longitude <= 99.5) {
    return "Chiang Mai, TH";
  }
  if (latitude >= 7.0 && latitude <= 9.0 && longitude >= 98.0 && longitude <= 100.5) {
    return "Phuket / Southern Thailand";
  }
  if (latitude >= 14.5 && latitude <= 17.5 && longitude >= 101.0 && longitude <= 105.0) {
    return "Nakhon Ratchasima / Isan, TH";
  }
  return fallback.trim() || `${latitude.toFixed(2)}°N, ${longitude.toFixed(2)}°E`;
}
