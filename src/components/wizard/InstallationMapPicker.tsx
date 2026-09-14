"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { Search, MapPin, Map } from "@/components/ui/icons";
import { toast } from "sonner";
import { GsapSpinner } from "@/components/ui/GsapMotion";
import { Map as MapCn, MapMarker, MarkerContent, useMap } from "@/components/ui/map";
import { DEFAULT_LOCATION_ZOOM, SATELLITE_MAP_STYLE, STREET_MAP_STYLE } from "@/lib/map-styles";

interface InstallationMapPickerProps {
  latitude: number | null;
  longitude: number | null;
  address: string;
  notes: string;
  onChange: (data: { latitude: number; longitude: number; address: string }) => void;
  onNotesChange: (notes: string) => void;
}

function MapClickHandler({ onMapClick }: { onMapClick: (latitude: number, longitude: number) => void }) {
  const { isLoaded, map } = useMap();
  useEffect(() => {
    if (!map || !isLoaded) return;
    const handleClick = (event: { lngLat: { lat: number; lng: number } }) => onMapClick(event.lngLat.lat, event.lngLat.lng);
    map.on("click", handleClick);
    return () => {
      map.off("click", handleClick);
    };
  }, [isLoaded, map, onMapClick]);
  return null;
}

export default function InstallationMapPicker({
  latitude,
  longitude,
  address,
  notes,
  onChange,
  onNotesChange,
}: InstallationMapPickerProps) {
  const mapRef = useRef<MapLibreMap | null>(null);
  const [searchValue, setSearchValue] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [isSatellite, setIsSatellite] = useState(false);
  const defaultCenter: [number, number] = [100.5018, 13.7563];

  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
        { headers: { "Accept-Language": "th,en" } }
      );
      const data = await res.json();
      if (data && data.display_name) {
        onChange({ latitude: lat, longitude: lng, address: data.display_name });
      } else {
        onChange({ latitude: lat, longitude: lng, address: `${lat.toFixed(6)}, ${lng.toFixed(6)}` });
      }
    } catch (err) {
      console.error("Reverse geocoding failed:", err);
      onChange({ latitude: lat, longitude: lng, address: `${lat.toFixed(6)}, ${lng.toFixed(6)}` });
    }
  }, [onChange]);

  // Geolocation on mount if no latitude/longitude provided
  useEffect(() => {
    if (latitude === null && longitude === null && navigator.geolocation && mapRef.current) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          mapRef.current?.flyTo({ center: [lng, lat], zoom: 17 });
          void reverseGeocode(lat, lng);
        },
        (error) => {
          console.warn("Geolocation denied or failed on mount:", error);
        }
      );
    }
  }, [latitude, longitude, reverseGeocode]);

  const handleSearch = async () => {
    if (!searchValue || !mapRef.current) return;

    setIsSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(searchValue)}`,
        { headers: { "Accept-Language": "th,en" } }
      );
      const data = await res.json();
      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lon = parseFloat(data[0].lon);
        mapRef.current?.flyTo({ center: [lon, lat], zoom: 17 });
        onChange({ latitude: lat, longitude: lon, address: data[0].display_name });
      } else {
        toast.error("ไม่พบสถานที่ดังกล่าว (Location not found)");
      }
    } catch (err) {
      console.error("Nominatim search failed:", err);
      toast.error("เกิดข้อผิดพลาดในการค้นหา (Search error)");
    } finally {
      setIsSearching(false);
    }
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error("เบราว์เซอร์ของคุณไม่รองรับการทำงานนี้");
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setIsLocating(false);

        mapRef.current?.flyTo({ center: [lng, lat], zoom: 17 });
        void reverseGeocode(lat, lng);
        toast.success("ปักหมุดตำแหน่งปัจจุบันของคุณสำเร็จแล้ว");
      },
      (error) => {
        setIsLocating(false);
        console.warn("Geolocation permission error:", error);
        toast.error("สิทธิ์เข้าถึงพิกัดถูกปฏิเสธ กรุณาเปิดสิทธิ์เข้าถึงตำแหน่งที่ตั้งในตั้งค่าของเบราว์เซอร์");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleMapClick = (lat: number, lng: number) => {
    void reverseGeocode(lat, lng);
  };

  const markerPosition = useMemo<{ latitude: number; longitude: number } | null>(() => {
    if (latitude !== null && longitude !== null) {
      return { latitude, longitude };
    }
    return null;
  }, [latitude, longitude]);

  return (
    <div className="w-full space-y-4">
      <div className="space-y-2">
        <label className="text-[10px] font-bold uppercase tracking-widest text-[#4E4B44]">
          ค้นหาที่ตั้งของคุณบนแผนที่ (Search Installation Location)
        </label>
        
        <div className="relative">
          <input
            type="text"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="ค้นหาชื่อหมู่บ้าน, ถนน, หรือสถานที่ใกล้เคียง..."
            className="w-full rounded-t-xl rounded-b-none border-b-2 border-[#8E8B83] bg-[#F7F6F3] py-3.5 pl-10 pr-28 text-xs font-semibold text-[#2E2C27] outline-none transition-all placeholder:text-[#4E4B44] focus:border-[#7CA8D0] focus:bg-[#F0EEE9]"
          />
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4E4B44]" />
          <button
            type="button"
            onClick={handleSearch}
            disabled={isSearching}
            className="absolute right-2 top-1/2 min-h-9 -translate-y-1/2 flex items-center gap-1.5 rounded-full bg-[#B7D1EA] px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm transition-all hover:bg-[#A5C2DE] active:scale-95 disabled:opacity-50"
          >
            {isSearching && <GsapSpinner className="h-3 w-3 text-white" />}
            <span>ค้นหา</span>
          </button>
        </div>

        <div className="pt-1">
          <button
            type="button"
            onClick={handleUseCurrentLocation}
            disabled={isLocating}
            className="inline-flex items-center gap-2 rounded-full border border-[#CBC7BE] bg-[#F0EEE9] px-4 py-2 text-[11px] font-bold text-[#2E2C27] shadow-sm transition-all hover:bg-[#DCE8F5] active:scale-95 disabled:opacity-60"
          >
            {isLocating ? (
              <GsapSpinner className="h-3.5 w-3.5 text-[#4F7FA8]" />
            ) : (
              <MapPin className="h-3.5 w-3.5 text-[#4F7FA8]" />
            )}
            <span>{isLocating ? "กำลังขอสิทธิ์เข้าถึงพิกัด..." : "📍 ค้นหาตำแหน่งปัจจุบันของฉัน"}</span>
          </button>
        </div>
      </div>

      <div className="relative h-[300px] w-full overflow-hidden rounded-[24px] border border-[#F7F6F3] bg-[#E6E3DC] shadow-sm">
        {/* Floating Satellite View Toggle Button */}
        <button
          type="button"
          onClick={() => setIsSatellite(!isSatellite)}
          className="absolute right-3.5 top-3.5 z-10 flex items-center gap-1.5 rounded-full border border-[#CBC7BE] bg-[#F0EEE9]/90 px-3.5 py-2 text-[10px] font-bold text-[#2E2C27] shadow-sm backdrop-blur-md transition-colors hover:bg-[#DCE8F5]"
        >
          <Map className="h-3.5 w-3.5 text-[#4F7FA8]" />
          <span>{isSatellite ? "แผนที่ถนนปกติ" : "สลับแผนที่ดาวเทียม (Satellite View)"}</span>
        </button>

        <MapCn
          ref={mapRef}
          center={markerPosition ? [markerPosition.longitude, markerPosition.latitude] : defaultCenter}
          zoom={DEFAULT_LOCATION_ZOOM}
          styles={{ light: isSatellite ? SATELLITE_MAP_STYLE : STREET_MAP_STYLE, dark: isSatellite ? SATELLITE_MAP_STYLE : STREET_MAP_STYLE }}
          className="z-0"
        >
          {markerPosition && (
            <MapMarker
              longitude={markerPosition.longitude}
              latitude={markerPosition.latitude}
              draggable={true}
              onDragEnd={({ lat, lng }) => void reverseGeocode(lat, lng)}
            >
              <MarkerContent>
                <span className="block h-7 w-7 -translate-y-1/2 rotate-45 rounded-full rounded-br-sm border-2 border-white bg-[#B7D1EA] shadow-lg" aria-hidden="true" />
              </MarkerContent>
            </MapMarker>
          )}
          <MapClickHandler onMapClick={handleMapClick} />
        </MapCn>
      </div>

      {address && (
        <div className="flex items-start gap-3 rounded-[20px] border border-[#F7F6F3] bg-[#E6E3DC] p-4 shadow-sm">
          <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[#4F7FA8]" />
          <div>
            <span className="block text-[10px] font-bold uppercase tracking-widest text-[#4E4B44]">
              พิกัดการติดตั้ง (Installation Address)
            </span>
            <span className="mt-0.5 block text-xs font-semibold leading-relaxed text-[#2E2C27]">
              {address}
            </span>
            {markerPosition && (
              <span className="mt-0.5 block font-mono text-[10px] text-[#4E4B44]">
                Lat: {markerPosition.latitude.toFixed(6)}, Lng: {markerPosition.longitude.toFixed(6)}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <label className="block text-[10px] font-bold uppercase tracking-widest text-[#4E4B44]">
          คำแนะนำเพิ่มเติมสำหรับทีมช่าง (Installation Notes)
        </label>
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="ระบุคำแนะนำเพิ่มเติม เช่น ลักษณะหลังคา, ทางเข้าบ้าน, หรือข้อมูลที่ทีมช่างควรทราบก่อนเข้าสำรวจ..."
          className="w-full rounded-t-xl rounded-b-none border-b-2 border-[#8E8B83] bg-[#F7F6F3] px-4 py-3 text-xs font-semibold text-[#2E2C27] outline-none transition-all placeholder:text-[#4E4B44] focus:border-[#7CA8D0] focus:bg-[#F0EEE9]"
        />
      </div>
    </div>
  );
}
