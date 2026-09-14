"use client";

import { useEffect, useId, useMemo, useState } from "react";
import {
  Expand,
  LocateFixed,
  Lock,
  MapPin,
  Search,
  ShieldCheck,
  X,
} from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Map, MapMarker, MarkerContent, useMap } from "@/components/ui/map";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { STREET_MAP_STYLE } from "@/lib/map-styles";
import {
  readCachedLocation,
  writeCachedLocation,
} from "@/lib/clientLocationCache";
import { cn } from "@/lib/utils";
import type { ResolvedMapLocation } from "@/types/map";

export type ServiceLocation = ResolvedMapLocation;

const ATTRIBUTION = "© OpenStreetMap contributors" as const;
const DEFAULT_CENTER: [number, number] = [13.7563, 100.5018];

function Recenter({ location }: { location: ServiceLocation | null }) {
  const { map } = useMap();
  useEffect(() => {
    if (location && map)
      map.flyTo({
        center: [location.longitude, location.latitude],
        zoom: Math.max(map.getZoom(), 16),
      });
  }, [location, map]);
  return null;
}

function ResizeMap({ expanded }: { expanded: boolean }) {
  const { map } = useMap();
  useEffect(() => {
    window.setTimeout(() => {
      map?.resize();
    }, 0);
  }, [expanded, map]);
  return null;
}

function MapEvents({
  onCoordinates,
}: {
  onCoordinates: (latitude: number, longitude: number) => void;
}) {
  const { isLoaded, map } = useMap();
  useEffect(() => {
    if (!map || !isLoaded) return;
    const handleClick = (event: { lngLat: { lat: number; lng: number } }) =>
      onCoordinates(event.lngLat.lat, event.lngLat.lng);
    map.on("click", handleClick);
    return () => {
      map.off("click", handleClick);
    };
  }, [isLoaded, map, onCoordinates]);
  return null;
}

interface ServiceLocationPickerProps {
  locale: string;
  value: ServiceLocation | null;
  onChange: (location: ServiceLocation) => void;
  requirePdpa?: boolean;
  initialPdpaConsent?: boolean;
  onPdpaConsentChange?: (consented: boolean) => void;
}

export default function ServiceLocationPicker({
  locale,
  value,
  onChange,
  requirePdpa = true,
  initialPdpaConsent,
  onPdpaConsentChange,
}: ServiceLocationPickerProps) {
  const th = locale === "th";
  const [pdpaConsent, setPdpaConsent] = useState<boolean>(() => {
    if (typeof initialPdpaConsent === "boolean") return initialPdpaConsent;
    return Boolean(value); // If a location was already chosen, consent was previously given
  });
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ServiceLocation[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const searchInputId = useId();
  const searchResultsId = useId();

  const center = useMemo<[number, number]>(
    () => (value ? [value.latitude, value.longitude] : DEFAULT_CENTER),
    [value],
  );

  const handlePdpaConsentToggle = (checked: boolean) => {
    setPdpaConsent(checked);
    onPdpaConsentChange?.(checked);
  };

  const reverseGeocode = async (latitude: number, longitude: number) => {
    // 1. Check 2-Hour client cache
    const cached = readCachedLocation(latitude, longitude);
    if (cached?.displayName) {
      onChange({
        latitude,
        longitude,
        displayName: cached.displayName,
        attribution: ATTRIBUTION,
        address: cached.rawAddress,
      });
      return;
    }

    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/services/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latitude, longitude }),
      });
      const data = (await response.json()) as {
        success?: boolean;
        location?: ServiceLocation;
        result?: ServiceLocation;
        error?: string;
      };
      const resolved = data.location || data.result;
      if (!response.ok || !data.success || !resolved)
        throw new Error(
          data.error ||
            (th
              ? "ระบุที่อยู่ของหมุดไม่ได้"
              : "We could not identify this pin's address."),
        );
      writeCachedLocation(
        latitude,
        longitude,
        resolved.displayName,
        resolved.address,
      );
      onChange(resolved);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : th
            ? "ระบุที่อยู่ของหมุดไม่ได้"
            : "We could not identify this pin's address.",
      );
    } finally {
      setBusy(false);
    }
  };

  const search = async () => {
    if (query.trim().length < 3) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/services/location/search?q=${encodeURIComponent(query.trim())}`,
        { cache: "no-store" },
      );
      const data = (await response.json()) as {
        success?: boolean;
        results?: ServiceLocation[];
        error?: string;
      };
      if (!response.ok || !data.success)
        throw new Error(
          data.error || (th ? "ค้นหาสถานที่ไม่ได้" : "Location search failed."),
        );
      setResults(data.results || []);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : th
            ? "ค้นหาสถานที่ไม่ได้"
            : "Location search failed.",
      );
    } finally {
      setBusy(false);
    }
  };

  const locate = () => {
    setError("");
    if (!navigator.geolocation) {
      setError(
        th
          ? "อุปกรณ์นี้ไม่รองรับตำแหน่งปัจจุบัน"
          : "Current location is unavailable on this device.",
      );
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => void reverseGeocode(coords.latitude, coords.longitude),
      () =>
        setError(
          th
            ? "ไม่สามารถเข้าถึงตำแหน่งปัจจุบัน"
            : "We could not access your current location.",
        ),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const isGated = requirePdpa && !pdpaConsent;

  const pickerContent = (
    <section
      className={
        expanded
          ? "flex h-full flex-col overflow-hidden bg-white"
          : "overflow-hidden rounded-xl border border-slate-200 bg-white"
      }
      aria-label={th ? "เลือกตำแหน่งบริการ" : "Choose service location"}
    >
      <div className="space-y-3 p-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-black text-slate-950 flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-[#0369a1]" />
              <span>{th ? "ตำแหน่งติดตั้ง" : "Installation location"}</span>
            </h3>
            <p className="mt-0.5 text-xs font-semibold text-slate-500">
              {th
                ? "ไม่บังคับ ระบุเพื่อให้เจ้าหน้าที่สำรวจและประเมินหน้างานแม่นยำขึ้น"
                : "Optional, helps staff perform a sharper site feasibility review."}
            </p>
          </div>
          {!isGated && (
            <Button
              type="button"
              onClick={() => setExpanded((current) => !current)}
              variant="outline"
              size="icon"
              className="shrink-0 text-[#2C486A]"
              aria-label={
                expanded
                  ? th
                    ? "ย่อแผนที่"
                    : "Close full-screen map"
                  : th
                    ? "ขยายแผนที่เต็มจอ"
                    : "Expand map full screen"
              }
            >
              {expanded ? (
                <X className="h-5 w-5" />
              ) : (
                <Expand className="h-5 w-5" />
              )}
            </Button>
          )}
        </div>

        {/* PDPA Agreement Banner */}
        {requirePdpa && (
          <div
            className={cn(
              "rounded-lg border p-4 transition-colors",
              pdpaConsent
                ? "bg-emerald-50/80 border-emerald-200 text-emerald-950"
                : "bg-[#F8FAFC] border-slate-200 text-slate-800",
            )}
          >
            <label className="group flex min-h-11 cursor-pointer select-none items-start gap-3">
              <div className="mt-0.5 shrink-0">
                <input
                  type="checkbox"
                  checked={pdpaConsent}
                  onChange={(e) => handlePdpaConsentToggle(e.target.checked)}
                  className="h-5 w-5 rounded border-slate-300 text-[#0369a1] accent-[#0369a1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA] focus-visible:ring-offset-2"
                />
              </div>
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                  <ShieldCheck className="w-4 h-4 text-[#0369a1] shrink-0" />
                  <span>
                    {th
                      ? "ยินยอมให้เปิดเผยและแชร์ตำแหน่งที่ตั้งแก่เจ้าหน้าที่ (PDPA Consent)"
                      : "Consent to share location with staff (PDPA Consent)"}
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-600">
                  {th
                    ? "ข้าพเจ้ายินยอมให้ SolarDream และเจ้าหน้าที่เข้าถึงและประมวลผลข้อมูลตำแหน่งพิกัดนี้ เพื่อใช้ในการสำรวจหน้างาน ออกแบบระบบ และประเมินราคาตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล"
                    : "I consent to SolarDream and technical staff accessing and processing this location data for site survey, system engineering, and quotation preparation in accordance with PDPA."}
                </p>
              </div>
            </label>
          </div>
        )}

        {/* If PDPA Gated, show Locked State Notice */}
        {isGated ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center space-y-2">
            <div className="mx-auto w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-slate-600">
              <Lock className="w-4 h-4" />
            </div>
            <p className="text-xs font-bold text-slate-700">
              {th
                ? "กรุณากดยินยอมแชร์ตำแหน่งที่ตั้งด้านบน เพื่อเปิดใช้งานแผนที่และการปักหมุด"
                : "Please agree to the PDPA location sharing consent above to unlock map pinning."}
            </p>
            <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
              {th
                ? "ระบบจะแสดงแผนที่และช่องค้นหาสถานที่ทันทีหลังจากคุณให้ความยินยอม"
                : "The map and address search will be unlocked immediately upon your consent."}
            </p>
          </div>
        ) : (
          <>
            {/* Search controls and portalled results */}
            <Popover
              open={results.length > 0}
              onOpenChange={(open) => {
                if (!open) setResults([]);
              }}
            >
              <PopoverAnchor asChild>
                <form
                  className="flex gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void search();
                  }}
                >
                  <label
                    className="relative min-w-0 flex-1"
                    htmlFor={searchInputId}
                  >
                    <span className="sr-only">
                      {th ? "ค้นหาที่อยู่" : "Search address"}
                    </span>
                    <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                    <Input
                      id={searchInputId}
                      value={query}
                      onChange={(event) => {
                        setQuery(event.target.value);
                        setResults([]);
                      }}
                      aria-expanded={results.length > 0}
                      aria-haspopup="dialog"
                      aria-controls={
                        results.length ? searchResultsId : undefined
                      }
                      autoComplete="street-address"
                      placeholder={
                        th
                          ? "ค้นหาสถานที่ หรือที่อยู่"
                          : "Search a place or address"
                      }
                      className="bg-white pl-10 font-semibold"
                    />
                  </label>
                  <Button
                    type="submit"
                    disabled={busy || query.trim().length < 3}
                    className="shrink-0 bg-[#2C486A] hover:bg-[#1E334D]"
                  >
                    {busy ? "…" : th ? "ค้นหา" : "Search"}
                  </Button>
                  <Button
                    type="button"
                    onClick={locate}
                    variant="outline"
                    size="icon"
                    className="shrink-0 bg-white text-[#2C486A]"
                    aria-label={
                      th ? "ใช้ตำแหน่งปัจจุบัน" : "Use current location"
                    }
                    title={th ? "ใช้ตำแหน่งปัจจุบัน" : "Use current location"}
                  >
                    <LocateFixed className="h-5 w-5" />
                  </Button>
                </form>
              </PopoverAnchor>
              <PopoverContent
                align="start"
                sideOffset={6}
                onOpenAutoFocus={(event) => event.preventDefault()}
                id={searchResultsId}
                aria-label={th ? "ผลการค้นหา" : "Search results"}
                aria-labelledby={searchInputId}
                className="w-[var(--radix-popover-anchor-width)] bg-white p-1"
              >
                <ul
                  className="max-h-60 space-y-1 overflow-y-auto"
                  aria-label={th ? "ผลการค้นหา" : "Search results"}
                >
                  {results.map((result) => (
                    <li key={`${result.latitude}-${result.longitude}`}>
                      <button
                        type="button"
                        onClick={() => {
                          onChange(result);
                          setResults([]);
                          setQuery(result.displayName);
                        }}
                        className="flex min-h-11 w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-[#B7D1EA]/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B7D1EA]"
                      >
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#0D9488]" />
                        <span className="line-clamp-2">
                          {result.displayName}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </PopoverContent>
            </Popover>

            {error ? (
              <p role="alert" className="text-sm font-bold text-rose-700">
                {error}
              </p>
            ) : null}
          </>
        )}
      </div>

      {/* Map Display when not gated */}
      {!isGated && (
        <>
          <div className={expanded ? "min-h-0 flex-1" : "h-72 w-full"}>
            <Map
              center={[center[1], center[0]]}
              zoom={value ? 16 : 10}
              scrollZoom
              styles={{ light: STREET_MAP_STYLE, dark: STREET_MAP_STYLE }}
            >
              <Recenter location={value} />
              <ResizeMap expanded={expanded} />
              <MapEvents
                onCoordinates={(latitude, longitude) =>
                  void reverseGeocode(latitude, longitude)
                }
              />
              {value ? (
                <MapMarker
                  longitude={value.longitude}
                  latitude={value.latitude}
                  draggable
                  onDragEnd={({ lat, lng }) => void reverseGeocode(lat, lng)}
                >
                  <MarkerContent>
                    <span
                      className="block h-7 w-7 -translate-y-1/2 rotate-45 rounded-full rounded-br-sm border-4 border-white bg-windbreeze"
                      aria-hidden="true"
                    />
                  </MarkerContent>
                </MapMarker>
              ) : null}
            </Map>
          </div>
          <p className="border-t border-slate-200 px-4 py-2 text-xs font-semibold text-slate-500">
            {ATTRIBUTION}
          </p>
        </>
      )}
    </section>
  );

  if (expanded && !isGated) {
    return (
      <Dialog
        isOpen
        onClose={() => setExpanded(false)}
        size="full"
        tone="light"
        ariaLabel={th ? "เลือกตำแหน่งบริการ" : "Choose service location"}
        closeLabel={th ? "ปิดแผนที่เต็มจอ" : "Close full-screen map"}
        className="h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-none bg-white sm:h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100vw-2rem)]"
      >
        <DialogContent>{pickerContent}</DialogContent>
      </Dialog>
    );
  }

  return pickerContent;
}
