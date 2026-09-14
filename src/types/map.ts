export type MapCoordinate = {
  latitude: number;
  longitude: number;
};

export type MapViewport = MapCoordinate & {
  zoom: number;
  bearing: number;
  pitch: number;
};

export type MapAddress = {
  road?: string;
  suburb?: string;
  city?: string;
  state?: string;
  postcode?: string;
  country?: string;
  countryCode?: string;
};

export type ResolvedMapLocation = MapCoordinate & {
  displayName: string;
  attribution: "© OpenStreetMap contributors";
  address?: MapAddress;
};

export type MapStyleName = "street" | "satellite";

export type RoofGeometry = GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;

export type RoofSelection = {
  geometry: RoofGeometry;
  areaSquareMeters: number;
  widthMeters: number;
  heightMeters: number;
  orientationDegrees: number;
  polygonPoints: Array<{ x: number; y: number }>;
  setbackPolygonPoints: Array<{ x: number; y: number }>;
  obstacles: Array<Array<{ x: number; y: number }>>;
  centroid: MapCoordinate;
  bounds?: [[number, number], [number, number]];
};
