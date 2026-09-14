import type { StyleSpecification } from "maplibre-gl";

const ESRI_SATELLITE_ATTRIBUTION =
  "Tiles © Esri, Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community";

export const DEFAULT_MAP_CENTER: [number, number] = [100.5018, 13.7563];
export const DEFAULT_LOCATION_ZOOM = 15;
export const ROOF_SELECTION_ZOOM = 19;

// OpenFreeMap provides a browser-friendly, keyless vector style. The public
// OSM raster server actively rejects this application's tile traffic.
export const STREET_MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

export const SATELLITE_MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    esriSatellite: {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: ESRI_SATELLITE_ATTRIBUTION,
    },
    esriLabels: {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: ESRI_SATELLITE_ATTRIBUTION,
    },
  },
  layers: [
    {
      id: "esri-satellite",
      type: "raster",
      source: "esriSatellite",
    },
    {
      id: "esri-labels",
      type: "raster",
      source: "esriLabels",
    },
  ],
};

export const mapStyles = {
  street: STREET_MAP_STYLE,
  satellite: SATELLITE_MAP_STYLE,
} as const;
