"use client";

import React, { useMemo, useState } from "react";
import { Copy, Check, ExternalLink, MapPin, Navigation } from "@/components/ui/icons";
import { Map, MapMarker, MarkerContent } from "@/components/ui/map";
import { STREET_MAP_STYLE } from "@/lib/map-styles";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface SiteLocationMapProps {
  latitude?: number | string | null;
  longitude?: number | string | null;
  address?: string | null;
  displayName?: string | null;
  className?: string;
  heightClass?: string;
}

export default function SiteLocationMap({
  latitude,
  longitude,
  address,
  displayName,
  className,
  heightClass = "h-[220px]",
}: SiteLocationMapProps) {
  const [copied, setCopied] = useState(false);

  const position = useMemo<[number, number] | null>(() => {
    if (
      latitude === null ||
      longitude === null ||
      latitude === undefined ||
      longitude === undefined
    ) {
      return null;
    }
    const lat = typeof latitude === "string" ? parseFloat(latitude) : latitude;
    const lng = typeof longitude === "string" ? parseFloat(longitude) : longitude;

    if (isNaN(lat) || isNaN(lng)) return null;
    return [lat, lng];
  }, [latitude, longitude]);

  const displayAddress = displayName || address || null;

  const handleCopyCoordinates = () => {
    if (!position) return;
    const text = `${position[0].toFixed(6)}, ${position[1].toFixed(6)}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("คัดลอกพิกัด GPS แล้ว (Coordinates copied)");
    setTimeout(() => setCopied(false), 2000);
  };

  if (!position) {
    if (displayAddress) {
      const googleSearchUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        displayAddress
      )}`;
      return (
        <div
          className={cn(
            "rounded-xl border border-slate-800 bg-[#0B1121] p-4 text-xs space-y-3",
            className
          )}
        >
          <div className="flex items-start gap-2.5 text-slate-300">
            <MapPin className="h-4 w-4 text-[#B7D1EA] shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="font-bold text-white text-xs leading-relaxed">
                {displayAddress}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                ไม่มีพิกัด GPS เจาะจง (No exact GPS coordinates)
              </p>
            </div>
          </div>
          <a
            href={googleSearchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs font-bold hover:bg-sky-500/20 transition-colors"
          >
            <Navigation className="w-3.5 h-3.5" />
            <span>Search in Google Maps</span>
            <ExternalLink className="w-3 h-3 ml-0.5 opacity-70" />
          </a>
        </div>
      );
    }

    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-xl bg-[#0B1121] border border-slate-800 text-xs font-bold text-slate-400 p-6 text-center",
          heightClass,
          className
        )}
      >
        <MapPin className="mr-2 h-4 w-4 text-slate-500 shrink-0" />
        <span>ไม่พบข้อมูลพิกัดสถานที่ติดตั้ง (No coordinates found)</span>
      </div>
    );
  }

  const [lat, lng] = position;
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  const osmUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;

  return (
    <div
      className={cn(
        "rounded-xl border border-slate-800 bg-[#0B1121] overflow-hidden space-y-0",
        className
      )}
    >
      {/* Map Header / Location text & Controls */}
      <div className="p-3.5 border-b border-slate-800 bg-[#0F172A]/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200 truncate">
            <MapPin className="w-3.5 h-3.5 text-[#B7D1EA] shrink-0" />
            <span className="truncate">{displayAddress || "Pinned Customer Location"}</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <button
              type="button"
              onClick={handleCopyCoordinates}
              className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-400 hover:text-white bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700/80 transition-colors cursor-pointer"
              title="Click to copy coordinates"
            >
              {copied ? (
                <Check className="w-3 h-3 text-emerald-400" />
              ) : (
                <Copy className="w-3 h-3 text-slate-400" />
              )}
              <span>
                {lat.toFixed(6)}, {lng.toFixed(6)}
              </span>
            </button>
          </div>
        </div>

        {/* Navigation Quick Links */}
        <div className="flex items-center gap-2 shrink-0">
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs font-bold hover:bg-sky-500/20 transition-colors"
          >
            <Navigation className="w-3.5 h-3.5" />
            <span>Google Maps</span>
            <ExternalLink className="w-3 h-3 opacity-60" />
          </a>
          <a
            href={osmUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-medium hover:text-white hover:bg-slate-700 transition-colors"
          >
            <span>OSM</span>
            <ExternalLink className="w-3 h-3 opacity-60" />
          </a>
        </div>
      </div>

      {/* Embedded Map Canvas */}
      <div className={cn("relative w-full overflow-hidden bg-[#070C16]", heightClass)}>
        <Map
          center={[lng, lat]}
          zoom={16}
          dragPan={false}
          doubleClickZoom={false}
          keyboard={false}
          boxZoom={false}
          attributionControl={false}
          styles={{ light: STREET_MAP_STYLE, dark: STREET_MAP_STYLE }}
          className="z-0 pointer-events-none w-full h-full"
        >
          <MapMarker longitude={lng} latitude={lat}>
            <MarkerContent>
              <div className="relative group">
                <span
                  className="block h-7 w-7 -translate-y-1/2 rotate-45 rounded-full rounded-br-sm border-4 border-white bg-[#0369a1] shadow-lg"
                  aria-hidden="true"
                />
              </div>
            </MarkerContent>
          </MapMarker>
        </Map>
      </div>
    </div>
  );
}
