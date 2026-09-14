"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import area from "@turf/area";
import bbox from "@turf/bbox";
import bearing from "@turf/bearing";
import buffer from "@turf/buffer";
import centroid from "@turf/centroid";
import distance from "@turf/distance";
import { point, polygon } from "@turf/helpers";
import { MapPin, Maximize, Undo2, Trash2 } from "@/components/ui/icons";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Map, MapGeoJSON, useMap } from "@/components/ui/map";
import { DEFAULT_MAP_CENTER, ROOF_SELECTION_ZOOM, SATELLITE_MAP_STYLE } from "@/lib/map-styles";

type LngLat = [number, number];

interface MapRoofSelectorProps {
  onPolygonCompleted: (data: {
    area: number;
    width: number;
    height: number;
    orientationDegrees: number;
    polygonPoints: { x: number; y: number }[];
    setbackPolygonPoints: { x: number; y: number }[];
    obstacles: { x: number; y: number }[][];
    latitude: number;
    longitude: number;
    bounds?: [[number, number], [number, number]];
  }) => void;
  address?: string;
  setbackMargin?: number;
}

function RoofPointCapture({ enabled, onPoint }: { enabled: boolean; onPoint: (point: LngLat) => void }) {
  const { isLoaded, map } = useMap();
  useEffect(() => {
    if (!map || !isLoaded || !enabled) return;
    const handleClick = (event: { lngLat: { lng: number; lat: number } }) => onPoint([event.lngLat.lng, event.lngLat.lat]);
    map.getCanvas().style.cursor = "crosshair";
    map.on("click", handleClick);
    return () => {
      map.off("click", handleClick);
      map.getCanvas().style.cursor = "";
    };
  }, [enabled, isLoaded, map, onPoint]);
  return null;
}

export default function MapRoofSelector({ onPolygonCompleted, address = "", setbackMargin = 0.5 }: MapRoofSelectorProps) {
  const t = useTranslations("MapRoofSelector");
  const mapRef = useRef<MapLibreMap | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [searchValue, setSearchValue] = useState(address);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [vertices, setVertices] = useState<LngLat[]>([]);

  const geometry = useMemo(() => vertices.length >= 3 ? polygon([[...vertices, vertices[0]]]) : null, [vertices]);

  const calculateMetrics = useCallback((roof: GeoJSON.Feature<GeoJSON.Polygon> | null) => {
    if (!roof) return;
    const roofArea = area(roof);
    const bounds = bbox(roof);
    const outerRing = roof.geometry.coordinates[0].slice(0, -1);
    const [minLng, minLat, maxLng, maxLat] = bounds;
    const width = distance(point([minLng, minLat]), point([maxLng, minLat]), { units: "meters" });
    const height = distance(point([minLng, minLat]), point([minLng, maxLat]), { units: "meters" });
    let longestEdge = 0;
    let orientation = 0;
    for (let index = 0; index < outerRing.length; index += 1) {
      const start = outerRing[index];
      const end = outerRing[(index + 1) % outerRing.length];
      const edgeDistance = distance(point(start), point(end), { units: "meters" });
      if (edgeDistance > longestEdge) {
        longestEdge = edgeDistance;
        orientation = (bearing(point(start), point(end)) + 360) % 360;
      }
    }
    const projectTo2D = ([lng, lat]: number[]) => ({
      x: distance(point([minLng, minLat]), point([lng, minLat]), { units: "meters" }),
      y: height - distance(point([minLng, minLat]), point([minLng, lat]), { units: "meters" }),
    });
    const inset = buffer(roof, -setbackMargin, { units: "meters" });
    const setbackRing = inset?.geometry.type === "Polygon" ? inset.geometry.coordinates[0].slice(0, -1) : [];
    const center = centroid(roof).geometry.coordinates;
    onPolygonCompleted({
      area: Math.round(roofArea * 100) / 100,
      width: Math.round(width * 100) / 100,
      height: Math.round(height * 100) / 100,
      orientationDegrees: Math.round(orientation),
      polygonPoints: outerRing.map(projectTo2D),
      setbackPolygonPoints: setbackRing.map(projectTo2D),
      obstacles: [],
      latitude: center[1],
      longitude: center[0],
      bounds: [[minLat, minLng], [maxLat, maxLng]],
    });
  }, [onPolygonCompleted, setbackMargin]);

  const finishDrawing = () => {
    if (!geometry) {
      toast.error(t("toast.drawFirst"));
      return;
    }
    setIsDrawing(false);
    calculateMetrics(geometry);
  };

  const search = async () => {
    if (!searchValue.trim()) return;
    setIsGeocoding(true);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(searchValue.trim())}`, { headers: { "Accept-Language": "th,en" } });
      const data = (await response.json()) as Array<{ lat: string; lon: string }>;
      const result = data[0];
      if (!result) throw new Error("not found");
      mapRef.current?.flyTo({ center: [Number(result.lon), Number(result.lat)], zoom: ROOF_SELECTION_ZOOM });
    } catch {
      toast.error(t("search.notFound"));
    } finally {
      setIsGeocoding(false);
    }
  };

  return (
    <div className="space-y-4 w-full">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:max-w-md">
          <MapPin className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={searchValue} onChange={(event) => setSearchValue(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void search()} placeholder={t("search.placeholder")} className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-24 text-xs font-bold outline-none focus:border-windbreeze focus:ring-2 focus:ring-windbreeze/50" />
          <button type="button" onClick={() => void search()} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-slate-900 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white">{isGeocoding ? "…" : t("search.action")}</button>
        </div>
        <div className="grid w-full grid-cols-3 gap-2 md:w-auto">
          <button type="button" onClick={() => { setVertices([]); setIsDrawing(true); }} className="min-h-11 rounded-xl bg-windbreeze px-4 text-[10px] font-black uppercase tracking-wider text-slate-900">{t("actions.drawRoof")}</button>
          <button type="button" onClick={() => setVertices((current) => current.slice(0, -1))} disabled={!vertices.length} className="grid min-h-11 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 disabled:opacity-40" aria-label="Undo roof point"><Undo2 className="h-4 w-4" /></button>
          <button type="button" onClick={() => { setVertices([]); setIsDrawing(false); }} className="grid min-h-11 place-items-center rounded-xl border border-rose-100 bg-rose-50 text-rose-600" aria-label={t("actions.clear")}><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>
      <p className="text-xs font-semibold text-slate-600">{isDrawing ? "Click each roof corner, then confirm the footprint." : geometry ? "Review the roof footprint, then adjust by starting a new outline if needed." : "Draw the roof footprint directly over the satellite image."}</p>
      <div ref={wrapperRef} className="relative h-[min(450px,62dvh)] min-h-[300px] w-full overflow-hidden rounded-3xl border border-slate-200 bg-slate-100 sm:min-h-[420px]">
        <button type="button" onClick={() => void wrapperRef.current?.requestFullscreen()} className="absolute right-3 top-3 z-10 grid h-11 w-11 place-items-center rounded-xl bg-white text-slate-700 shadow-sm" aria-label={t("actions.fullscreen")}><Maximize className="h-4 w-4" /></button>
        <Map ref={mapRef} center={DEFAULT_MAP_CENTER} zoom={ROOF_SELECTION_ZOOM} styles={{ light: SATELLITE_MAP_STYLE, dark: SATELLITE_MAP_STYLE }}>
          <RoofPointCapture enabled={isDrawing} onPoint={(next) => setVertices((current) => [...current, next])} />
          {geometry ? <MapGeoJSON data={geometry} fillPaint={{ "fill-color": "#B7D1EA", "fill-opacity": 0.38 }} linePaint={{ "line-color": "#0F172A", "line-width": 2 }} /> : null}
        </Map>
      </div>
      {isDrawing && <button type="button" onClick={finishDrawing} disabled={vertices.length < 3} className="min-h-11 rounded-xl bg-slate-900 px-5 text-sm font-bold text-white disabled:opacity-40">Confirm roof footprint</button>}
    </div>
  );
}
